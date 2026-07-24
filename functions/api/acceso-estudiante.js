import { runService } from '../_lib/claves.js';
import { getStudentBasicFast } from '../_lib/requisitos-firebase-fast.js';
import { getStudentFromSheets } from '../_lib/requisitos-sheets-fallback.js';
import { corsHeaders, jsonReply, readJson, rejectUnknownOrigin, text } from '../_lib/http.js';

const TITLES_TIMEOUT_MS = 18000;
const CACHE_TTL_MS = 10 * 60 * 1000;
const NOT_FOUND_TTL_MS = 30 * 1000;
const CACHE_LIMIT = 400;
const academicCache = new Map();
const academicInflight = new Map();

function normalizeCedula(value) {
  const digits = text(value).replace(/\D/g, '');
  if (digits.length === 9) return '0' + digits;
  return digits.length === 10 ? digits : '';
}

function normalizedKey(value) {
  return text(value).toLowerCase().normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

function flexible(object, names) {
  if (!object || typeof object !== 'object') return undefined;
  const map = Object.keys(object).reduce((output, key) => {
    output[normalizedKey(key)] = key;
    return output;
  }, {});
  for (const name of names) {
    const key = map[normalizedKey(name)];
    if (key !== undefined && object[key] !== undefined && object[key] !== null) return object[key];
  }
  return undefined;
}

function normalizeState(value) {
  const state = text(value).toUpperCase().replace(/[^A-Z0-9]+/g, '_');
  if (!state) return 'SIN_ENVIO';
  if (['ENVIADO', 'PENDIENTE_SYNC', 'RESPALDADO', 'PENDIENTE'].includes(state)) {
    return 'PENDIENTE_REVISION';
  }
  if (state.includes('DEVUEL')) return 'DEVUELTO';
  if (state.includes('REEMPLAZ')) return 'REEMPLAZADO';
  if (state.includes('APROBAD')) return 'APROBADO';
  if (state.includes('PENDIENT')) return 'PENDIENTE_REVISION';
  return state;
}

function studentFrom(result) {
  return result && (result.estudiante || result.registro) || null;
}

function completeAcademic(result) {
  const student = studentFrom(result);
  if (!student || result.encontrado !== true) return false;
  return Boolean(
    text(flexible(student, ['Nombres', 'nombres', 'nombreCompleto'])) &&
    text(flexible(student, ['NombreCarrera', 'nombreCarrera', 'carrera'])) &&
    text(flexible(student, ['periodoId', 'periodId', 'periodoLabel', 'periodo']))
  );
}

function cacheKey(cedula) {
  return cedula;
}

function getCache(key) {
  const item = academicCache.get(key);
  if (!item) return null;
  if (item.expiresAt <= Date.now()) {
    academicCache.delete(key);
    return null;
  }
  return item.value;
}

function setCache(key, value) {
  while (academicCache.size >= CACHE_LIMIT) {
    academicCache.delete(academicCache.keys().next().value);
  }
  const ttl = value && value.encontrado === true ? CACHE_TTL_MS : NOT_FOUND_TTL_MS;
  academicCache.set(key, { value, expiresAt: Date.now() + ttl });
  return value;
}

async function lookupAcademic(env, cedula) {
  const key = cacheKey(cedula);
  const cached = getCache(key);
  if (cached) return cached;
  if (academicInflight.has(key)) return academicInflight.get(key);

  const task = (async () => {
    let firebaseResult = null;
    let firebaseError = null;
    try {
      firebaseResult = await getStudentBasicFast(cedula, {}, env);
    } catch (error) {
      firebaseError = error;
    }

    if (firebaseResult && completeAcademic(firebaseResult)) {
      return setCache(key, {
        ...firebaseResult,
        fuentePrincipal: 'FIREBASE_UTET',
        respaldoUtilizado: false,
        consultaFirebaseUtet: 'ok'
      });
    }

    let sheetsResult = null;
    let sheetsError = null;
    try {
      sheetsResult = await getStudentFromSheets(cedula, env);
    } catch (error) {
      sheetsError = error;
    }

    if (sheetsResult && completeAcademic(sheetsResult)) {
      return setCache(key, {
        ...sheetsResult,
        fuentePrincipal: 'GOOGLE_SHEETS_ESTUDIANTES',
        respaldoUtilizado: true,
        consultaFirebaseUtet: firebaseError ? 'error' : firebaseResult && firebaseResult.encontrado ? 'incompleto' : 'sin_registro',
        consultaGoogleSheets: 'ok'
      });
    }

    if (firebaseResult && firebaseResult.encontrado === true) {
      const error = new Error('Encontramos al estudiante, pero faltan la carrera o el período académico.');
      error.sources = [
        { fuente: 'FIREBASE_UTET', estado: 'incompleto' },
        { fuente: 'GOOGLE_SHEETS_ESTUDIANTES', estado: sheetsError ? 'error' : 'incompleto' }
      ];
      throw error;
    }

    if (firebaseError && sheetsError) {
      const error = new Error('No fue posible consultar los datos académicos en este momento.');
      error.sources = [
        { fuente: 'FIREBASE_UTET', estado: 'error', mensaje: text(firebaseError.message) },
        { fuente: 'GOOGLE_SHEETS_ESTUDIANTES', estado: 'error', mensaje: text(sheetsError.message) }
      ];
      throw error;
    }

    return setCache(key, {
      ok: true,
      encontrado: false,
      existe: false,
      cedula,
      numeroIdentificacion: cedula,
      fuentePrincipal: sheetsResult ? 'GOOGLE_SHEETS_ESTUDIANTES' : 'FIREBASE_UTET',
      respaldoUtilizado: Boolean(sheetsResult),
      mensaje: 'No encontramos un estudiante con esa cédula.'
    });
  })().finally(() => academicInflight.delete(key));

  academicInflight.set(key, task);
  return task;
}

async function queryTitles(env, cedula, student) {
  const periodoId = text(flexible(student, ['periodoId', 'periodId']));
  const periodoLabel = text(flexible(student, ['periodoLabel', 'periodo'])) || periodoId;
  const result = await runService(env, 'TITULOS', 'CONSULTAR_ENVIO_CEDULA', 'GET', {
    cedula,
    numeroIdentificacion: cedula,
    periodoId,
    periodoLabel,
    periodo: periodoLabel,
    scope: 'period'
  }, 'student', TITLES_TIMEOUT_MS);
  if (!result || result.ok === false) {
    throw new Error(text(result && (result.mensaje || result.error)) || 'Firebase Títulos no respondió correctamente.');
  }
  return result;
}

function normalizeTitles(result) {
  const envio = result && (result.envio || result.registro) || null;
  const found = Boolean(
    result && (result.tieneEnvio === true || result.encontradoEnvio === true || result.existe === true) && envio
  );
  const state = normalizeState(
    result && (result.estadoEfectivo || result.estadoEnvio || result.estado || result.estadoFinal) ||
    envio && (envio.estado || envio.estadoFinal)
  );
  const resolution = result && result.resolucion || (
    envio && (envio.resolucionActualId || envio.fechaResolucion || envio.coordinador)
      ? {
          id: text(envio.resolucionActualId),
          estado: state,
          coordinador: text(envio.coordinador),
          observacion: text(envio.observacion),
          tituloFinal: text(envio.tituloFinal),
          fechaResolucion: text(envio.fechaResolucion)
        }
      : null
  );
  return {
    envio: found ? envio : null,
    resolucion: resolution,
    tieneEnvio: found,
    tieneResolucion: Boolean(resolution),
    estado: found ? state : 'SIN_ENVIO',
    permiteReenvio: found && state === 'DEVUELTO'
  };
}

export const __test = Object.freeze({
  normalizeCedula,
  normalizeState,
  completeAcademic,
  normalizeTitles
});

export async function onRequest({ request, env }) {
  const badOrigin = rejectUnknownOrigin(request);
  if (badOrigin) return badOrigin;
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(request) });
  }
  if (request.method !== 'POST') {
    return jsonReply(request, { ok: false, mensaje: 'Método no permitido.' }, 405);
  }

  const startedAt = Date.now();
  try {
    const input = await readJson(request);
    const data = input.datos && typeof input.datos === 'object'
      ? { ...input, ...input.datos }
      : { ...input };
    const cedula = normalizeCedula(data.cedula || data.numeroIdentificacion || data.identificacion);
    if (!cedula) throw new Error('No se recibió una cédula válida.');

    const academic = await lookupAcademic(env, cedula);
    if (academic.encontrado !== true) {
      return jsonReply(request, {
        ...academic,
        ok: true,
        consultaCompleta: true,
        consultas: {
          requisitos: academic.fuentePrincipal === 'GOOGLE_SHEETS_ESTUDIANTES' ? 'respaldo_sin_registro' : 'sin_registro',
          titulos: 'no_consultado'
        },
        duracionMs: Date.now() - startedAt
      });
    }

    const student = studentFrom(academic);
    let titlesResult;
    try {
      titlesResult = await queryTitles(env, cedula, student);
    } catch (error) {
      return jsonReply(request, {
        ok: false,
        encontrado: true,
        existe: true,
        estudiante: student,
        registro: student,
        consultaCompleta: false,
        fuentesFallidas: [{
          fuente: 'FIREBASE_TITULOS',
          mensaje: text(error && error.message) || 'Consulta no disponible.'
        }],
        consultas: {
          requisitos: academic.respaldoUtilizado ? 'google_sheets_ok' : 'firebase_utet_ok',
          titulos: 'error'
        },
        mensaje: 'Tus datos fueron encontrados, pero no pudimos verificar el estado de tus propuestas. Intenta nuevamente.',
        duracionMs: Date.now() - startedAt
      }, 502);
    }

    const titles = normalizeTitles(titlesResult);
    const combined = titles.envio
      ? { ...titles.envio, ...(titles.resolucion || {}) }
      : null;

    return jsonReply(request, {
      ...academic,
      ok: true,
      encontrado: true,
      existe: true,
      estudiante: student,
      registro: student,
      envio: combined,
      envioOriginal: titles.envio,
      resolucion: titles.resolucion,
      tieneEnvio: titles.tieneEnvio,
      encontradoEnvio: titles.tieneEnvio,
      tieneResolucion: titles.tieneResolucion,
      estadoEfectivo: titles.estado,
      estadoEnvio: titles.estado,
      origenDecision: titles.tieneResolucion ? 'RESOLUCIONES' : titles.tieneEnvio ? 'ENVIOS' : 'SIN_ENVIO',
      permiteReenvio: titles.permiteReenvio,
      consultaCompleta: true,
      consultas: {
        requisitos: academic.respaldoUtilizado ? 'google_sheets_ok' : 'firebase_utet_ok',
        titulos: 'ok',
        envios: titles.tieneEnvio ? 'encontrado' : 'sin_registro',
        resoluciones: titles.tieneResolucion ? 'encontrada' : 'sin_registro'
      },
      fuente: academic.fuentePrincipal,
      fuenteEnvio: 'FIREBASE_TITULOS',
      fuenteResolucion: 'FIREBASE_TITULOS',
      flujoTitulos: 'CONSULTAR_ENVIO_CEDULA',
      mensaje: titles.permiteReenvio
        ? 'Tus propuestas fueron devueltas y pueden corregirse.'
        : titles.estado === 'APROBADO' || titles.estado === 'REEMPLAZADO'
          ? 'Tu tema de titulación fue aprobado por coordinación.'
          : titles.tieneEnvio
            ? 'Tus propuestas ya fueron enviadas y están siendo revisadas.'
            : academic.respaldoUtilizado
              ? 'Datos recuperados desde el respaldo institucional. No registras envíos anteriores en este período.'
              : 'Estudiante encontrado. No registras envíos anteriores en este período.',
      duracionMs: Date.now() - startedAt
    });
  } catch (error) {
    return jsonReply(request, {
      ok: false,
      consultaCompleta: false,
      fuentesFallidas: error && error.sources || undefined,
      mensaje: error && error.message || 'No fue posible verificar tu registro.',
      duracionMs: Date.now() - startedAt
    }, 502);
  }
}
