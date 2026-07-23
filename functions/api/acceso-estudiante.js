import { requestClaves, runService } from '../_lib/claves.js';
import {
  corsHeaders,
  jsonReply,
  readJson,
  rejectUnknownOrigin,
  text
} from '../_lib/http.js';

const DIRECT_STUDENT_TIMEOUT_MS = 18000;
const TITLES_TIMEOUT_MS = 22000;
const STUDENT_TTL_MS = 10 * 60 * 1000;
const NOT_FOUND_TTL_MS = 30 * 1000;
const CACHE_LIMIT = 400;

const studentCache = new Map();
const studentInflight = new Map();

function normalizeCedula(value) {
  const digits = text(value).replace(/\D/g, '');
  if (digits.length === 9) return '0' + digits;
  return digits.length === 10 ? digits : '';
}

function rawCedula(value) {
  const digits = text(value).replace(/\D/g, '');
  return digits.length === 9 || digits.length === 10 ? digits : '';
}

function cedulaVariants(value) {
  const canonical = normalizeCedula(value);
  if (!canonical) return [];
  return canonical.startsWith('0') ? [canonical, canonical.slice(1)] : [canonical];
}

function normalizedKey(value) {
  return text(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

function normalizePeriod(value) {
  return text(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function flexible(object, names) {
  if (!object || typeof object !== 'object') return undefined;
  const map = Object.keys(object).reduce((output, key) => {
    output[normalizedKey(key)] = key;
    return output;
  }, {});
  for (const name of names) {
    const key = map[normalizedKey(name)];
    if (key !== undefined && object[key] !== undefined && object[key] !== null) {
      return object[key];
    }
  }
  return undefined;
}

function decodeNestedJson(value, maxDepth = 6) {
  let current = value;
  for (let depth = 0; depth < maxDepth && typeof current === 'string'; depth += 1) {
    const raw = current.trim();
    if (!raw) return {};
    try {
      current = JSON.parse(raw);
    } catch (_error) {
      break;
    }
  }
  if (Array.isArray(current)) return current.map((item) => decodeNestedJson(item, maxDepth));
  if (!current || typeof current !== 'object') return current;
  const output = {};
  for (const [key, item] of Object.entries(current)) {
    output[key] = decodeNestedJson(item, maxDepth);
  }
  return output;
}

function collectObjects(value, output = [], seen = new Set(), depth = 0) {
  const decoded = decodeNestedJson(value);
  if (!decoded || typeof decoded !== 'object' || depth > 10 || seen.has(decoded)) return output;
  seen.add(decoded);
  if (!Array.isArray(decoded)) output.push(decoded);
  const values = Array.isArray(decoded) ? decoded : Object.values(decoded);
  values.forEach((item) => collectObjects(item, output, seen, depth + 1));
  return output;
}

function sameCedula(item, cedula) {
  const value = rawCedula(flexible(item || {}, [
    'cedula', 'numeroIdentificacion', 'NumeroIdentificacion', 'identificacion', 'Cédula'
  ]));
  return value && cedulaVariants(cedula).includes(value);
}

function recordPeriod(item) {
  return text(flexible(item || {}, [
    'periodoLabel', 'periodo', 'Periodo', 'periodoId', 'periodId'
  ]));
}

function looksLikeEnvio(item) {
  if (!item || typeof item !== 'object') return false;
  const direct = flexible(item, ['titulo1', 'titulo2', 'titulo3', 'fechaEnvio', 'telegram', 'usuarioTelegram']);
  return Boolean(direct);
}

function looksLikeResolution(item) {
  if (!item || typeof item !== 'object') return false;
  const state = flexible(item, ['estadoFinal', 'estadoResolucion']);
  const evidence = flexible(item, [
    'resolucionId', 'fechaResolucion', 'coordinador', 'comentarioCoordinador', 'tituloCorregido'
  ]);
  return Boolean(state && evidence);
}

function timestamp(item, kind) {
  const names = kind === 'resolution'
    ? ['fechaResolucion', 'fechaRevision', 'fechaServidor', 'updatedAt']
    : ['fechaEnvio', 'fechaServidor', 'updatedAt'];
  const raw = flexible(item || {}, names);
  const parsed = Date.parse(text(raw));
  if (Number.isFinite(parsed)) return parsed;
  const id = text(flexible(item || {}, ['resolucionId', 'idRegistro', 'id']));
  const match = id.match(/(\d{10,})$/);
  return match ? Number(match[1]) : Number(flexible(item || {}, ['fila']) || 0);
}

function latest(list, kind) {
  return list.slice().sort((a, b) => timestamp(b, kind) - timestamp(a, kind))[0] || null;
}

function candidates(result, predicate) {
  const list = collectObjects(result).filter(predicate);
  const unique = [];
  const seen = new Set();
  list.forEach((item) => {
    const signature = JSON.stringify(item);
    if (seen.has(signature)) return;
    seen.add(signature);
    unique.push(item);
  });
  return unique;
}

function selectRecord(result, predicate, cedula, academicPeriod, kind) {
  let list = candidates(result, predicate);
  if (!list.length) return null;

  const identifiable = list.filter((item) => rawCedula(flexible(item || {}, [
    'cedula', 'numeroIdentificacion', 'NumeroIdentificacion', 'identificacion', 'Cédula'
  ])));
  if (identifiable.length) {
    const byCedula = identifiable.filter((item) => sameCedula(item, cedula));
    if (!byCedula.length) return null;
    list = byCedula;
  }

  const target = normalizePeriod(academicPeriod);
  if (target) {
    const exact = list.filter((item) => normalizePeriod(recordPeriod(item)) === target);
    if (exact.length) return latest(exact, kind);
    const withPeriod = list.filter((item) => normalizePeriod(recordPeriod(item)));
    if (withPeriod.length > 1) return null;
  }

  return latest(list, kind);
}

function mergeNonEmpty(base, extra) {
  const output = { ...(base || {}) };
  Object.entries(extra || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && text(value) !== '') output[key] = value;
  });
  return output;
}

function normalizeState(value) {
  const state = text(value).toUpperCase();
  if (['ENVIADO', 'PENDIENTE_SYNC', 'RESPALDADO'].includes(state)) return 'PENDIENTE_REVISION';
  return state;
}

function effectiveState(envio, resolucion) {
  const resolutionState = normalizeState(flexible(resolucion || {}, [
    'estadoFinal', 'Estado final', 'estadoResolucion', 'estado'
  ]));
  if (resolutionState) return { estado: resolutionState, origen: 'RESOLUCIONES' };
  if (envio) {
    const envioState = normalizeState(flexible(envio, [
      'estado', 'estadoFinal', 'estadoProceso', 'estadoGoogleSheets'
    ])) || 'PENDIENTE_REVISION';
    return { estado: envioState, origen: 'ENVIOS' };
  }
  return { estado: 'SIN_ENVIO', origen: 'REQUISITOS' };
}

function studentFound(result) {
  const decoded = decodeNestedJson(result);
  return Boolean(decoded && (
    decoded.encontrado === true || decoded.existe === true || decoded.estudiante || decoded.registro
  ));
}

function cacheKey(cedula, period) {
  return cedula + '|' + text(period);
}

function getCached(key) {
  const item = studentCache.get(key);
  if (!item) return null;
  if (item.expiresAt <= Date.now()) {
    studentCache.delete(key);
    return null;
  }
  return item.value;
}

function setCached(key, value) {
  while (studentCache.size >= CACHE_LIMIT) {
    const first = studentCache.keys().next().value;
    if (first === undefined) break;
    studentCache.delete(first);
  }
  const ttl = studentFound(value) ? STUDENT_TTL_MS : NOT_FOUND_TTL_MS;
  studentCache.set(key, { value, expiresAt: Date.now() + ttl });
  return value;
}

async function lookupStudent(env, cedula, requestedPeriod) {
  const key = cacheKey(cedula, requestedPeriod);
  const cached = getCached(key);
  if (cached) return cached;
  if (studentInflight.has(key)) return studentInflight.get(key);

  const task = requestClaves(env, 'CONSULTAR_ESTUDIANTE_REQUISITOS', {
    cedula,
    numeroIdentificacion: cedula,
    periodoId: requestedPeriod,
    modo: 'IDENTIDAD_RAPIDA'
  }, DIRECT_STUDENT_TIMEOUT_MS)
    .then(decodeNestedJson)
    .then((result) => setCached(key, result))
    .finally(() => studentInflight.delete(key));

  studentInflight.set(key, task);
  return task;
}

async function queryTitles(env, action, cedula, period = '') {
  const result = await runService(
    env,
    'TITULOS',
    action,
    'GET',
    {
      cedula,
      numeroIdentificacion: cedula,
      periodo: period,
      periodoId: period,
      periodoLabel: period,
      scope: 'all',
      incluirHistorico: true
    },
    'student',
    TITLES_TIMEOUT_MS
  );
  const decoded = decodeNestedJson(result);
  const failure = collectObjects(decoded).find((item) => item && item.ok === false);
  if (failure) {
    throw new Error(text(failure.mensaje || failure.error) || 'La consulta de Títulos no fue completada.');
  }
  return decoded;
}

function querySourceWithCompatibility(primaryPromise, legacyPromise, predicate, cedula, period, kind) {
  const promises = [primaryPromise, legacyPromise];
  return new Promise((resolve, reject) => {
    const fulfilled = [];
    const errors = [];
    let pending = promises.length;

    promises.forEach((promise) => {
      Promise.resolve(promise).then((value) => {
        fulfilled.push(value);
        if (selectRecord(value, predicate, cedula, period, kind)) {
          resolve(fulfilled.slice());
          return;
        }
        pending -= 1;
        if (pending === 0) {
          if (fulfilled.length) resolve(fulfilled);
          else reject(errors[0] || new Error('Consulta no disponible.'));
        }
      }).catch((error) => {
        errors.push(error);
        pending -= 1;
        if (pending === 0) {
          if (fulfilled.length) resolve(fulfilled);
          else reject(errors[0] || new Error('Consulta no disponible.'));
        }
      });
    });
  });
}

function normalizeStudentResult(academic, cedula, requestedPeriod) {
  const decoded = decodeNestedJson(academic);
  if (!studentFound(decoded)) return decoded;
  const raw = decoded.estudiante || decoded.registro || {};
  const names = text(flexible(raw, ['Nombres', 'nombres', 'nombreCompleto', 'nombre']));
  const career = text(flexible(raw, ['NombreCarrera', 'nombreCarrera', 'carrera']));
  const periodId = text(flexible(raw, ['periodoId', 'periodId', 'periodoCanonicoId']) || requestedPeriod);
  const periodLabel = text(flexible(raw, ['periodoLabel', 'periodoCanonicoLabel', 'periodo']) || periodId);
  const student = {
    ...raw,
    cedula,
    numeroIdentificacion: cedula,
    Nombres: names,
    nombres: names,
    NombreCarrera: career,
    nombreCarrera: career,
    carrera: career,
    periodoId: periodId,
    periodId,
    periodoLabel: periodLabel
  };
  return {
    ...decoded,
    ok: true,
    encontrado: true,
    existe: true,
    estudiante: student,
    registro: student,
    periodoId,
    periodoLabel
  };
}

export const __test = Object.freeze({
  decodeNestedJson,
  looksLikeEnvio,
  looksLikeResolution,
  selectRecord,
  effectiveState
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
    const requestedPeriod = text(data.periodoId || data.periodo || data.periodoLabel);
    if (!cedula) throw new Error('No se recibió una cédula válida.');

    /*
      Tres consultas lógicas simultáneas. La compatibilidad antigua se comparte
      entre Envíos y Resoluciones para no agregar una segunda espera secuencial.
    */
    const legacyPromise = queryTitles(env, 'CONSULTAR_ENVIO_CEDULA', cedula, requestedPeriod);
    const envioTask = querySourceWithCompatibility(
      queryTitles(env, 'CONSULTAR_ENVIO_BASE_CEDULA', cedula, requestedPeriod),
      legacyPromise,
      looksLikeEnvio,
      cedula,
      requestedPeriod,
      'envio'
    );
    const resolutionTask = querySourceWithCompatibility(
      queryTitles(env, 'CONSULTAR_RESOLUCION_CEDULA', cedula, requestedPeriod),
      legacyPromise,
      looksLikeResolution,
      cedula,
      requestedPeriod,
      'resolution'
    );

    const [academicSettled, envioSettled, resolutionSettled] = await Promise.allSettled([
      lookupStudent(env, cedula, requestedPeriod),
      envioTask,
      resolutionTask
    ]);

    const failures = [];
    if (academicSettled.status === 'rejected') {
      failures.push({
        fuente: 'REQUISITOS',
        mensaje: text(academicSettled.reason && academicSettled.reason.message) || 'Consulta no disponible.'
      });
    }
    if (envioSettled.status === 'rejected') {
      failures.push({ fuente: 'ENVIOS', mensaje: 'No fue posible consultar los envíos.' });
    }
    if (resolutionSettled.status === 'rejected') {
      failures.push({ fuente: 'RESOLUCIONES', mensaje: 'No fue posible consultar las resoluciones.' });
    }

    const envioSources = envioSettled.status === 'fulfilled' && Array.isArray(envioSettled.value)
      ? envioSettled.value
      : [];
    const resolutionSources = resolutionSettled.status === 'fulfilled' && Array.isArray(resolutionSettled.value)
      ? resolutionSettled.value
      : [];

    if (failures.length) {
      return jsonReply(request, {
        ok: false,
        consultaCompleta: false,
        fuentesFallidas: failures,
        mensaje: 'No fue posible verificar completamente tu registro. Intenta nuevamente.',
        duracionMs: Date.now() - startedAt
      }, 502);
    }

    const academic = normalizeStudentResult(academicSettled.value, cedula, requestedPeriod);
    if (!studentFound(academic)) {
      return jsonReply(request, {
        ...academic,
        ok: true,
        consultaCompleta: true,
        consultas: { requisitos: 'ok', envios: 'ok', resoluciones: 'ok' },
        duracionMs: Date.now() - startedAt
      });
    }

    const student = academic.estudiante || academic.registro;
    const academicPeriod = text(
      flexible(student, ['periodoLabel', 'periodoId', 'periodo']) ||
      academic.periodoLabel || academic.periodoId || requestedPeriod
    );

    const envio = selectRecord(envioSources, looksLikeEnvio, cedula, academicPeriod, 'envio');
    const resolucion = selectRecord(resolutionSources, looksLikeResolution, cedula, academicPeriod, 'resolution');
    const decision = effectiveState(envio, resolucion);
    const permiteReenvio = decision.estado === 'DEVUELTO';
    const tieneEnvio = Boolean(envio);
    const tieneResolucion = Boolean(resolucion);
    const envioCombinado = envio ? mergeNonEmpty(envio, resolucion || {}) : null;

    return jsonReply(request, {
      ...academic,
      ok: true,
      encontrado: true,
      existe: true,
      estudiante: student,
      registro: student,
      envio: envioCombinado,
      envioOriginal: envio,
      resolucion,
      tieneEnvio,
      encontradoEnvio: tieneEnvio,
      tieneResolucion,
      estadoEfectivo: decision.estado,
      estadoEnvio: decision.estado,
      origenDecision: decision.origen,
      permiteReenvio,
      consultaCompleta: true,
      consultaPeriodoReforzada: false,
      consultas: { requisitos: 'ok', envios: 'ok', resoluciones: 'ok' },
      fuente: academic.fuente || 'CONSULTA_ACCESO_PARALELA',
      fuenteEnvio: 'RESPALDO_TITULOS_APP_ENVÍOS',
      fuenteResolucion: 'RESPALDO_TITULOS_APP_RESOLUCIONES',
      compatibilidadTitulos: true,
      mensaje: permiteReenvio
        ? 'Tus propuestas fueron devueltas y pueden corregirse.'
        : decision.estado === 'APROBADO' || decision.estado === 'REEMPLAZADO'
          ? 'Tu tema de titulación fue aprobado por coordinación.'
          : tieneEnvio
            ? 'Tus propuestas ya fueron enviadas y están siendo revisadas.'
            : 'Estudiante encontrado. No registra envíos anteriores.',
      duracionMs: Date.now() - startedAt
    });
  } catch (error) {
    return jsonReply(request, {
      ok: false,
      consultaCompleta: false,
      mensaje: error && error.message || 'No fue posible verificar tu registro.',
      duracionMs: Date.now() - startedAt
    }, 502);
  }
}
