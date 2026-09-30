import { getPublicStatus, requestClaves, runService } from '../_lib/claves.js';
import {
  corsHeaders,
  jsonReply,
  normalizeAction,
  readJson,
  rejectUnknownOrigin,
  text
} from '../_lib/http.js';

const ALLOWED = new Set([
  'CONFIGURACION_PUBLICA',
  'PING',
  'LISTAR_PERIODOS_TITULACION',
  'LISTAR_PERIODOS_PUBLICOS',
  'CONSULTAR_ESTUDIANTE',
  'CONSULTAR_ESTUDIANTE_TITULACION',
  'LISTAR_CARRERAS_PERIODO'
]);

const STUDENT_CACHE_TTL_MS = 5 * 60 * 1000;
const STUDENT_NOT_FOUND_TTL_MS = 60 * 1000;
const STUDENT_CACHE_LIMIT = 300;
const studentCache = new Map();
const studentInflight = new Map();

function normalizeCedula(value) {
  const digits = text(value).replace(/\D/g, '');
  if (digits.length === 9) return '0' + digits;
  return digits.length === 10 ? digits : '';
}

function unwrap(result) {
  return result && (result.respuesta || result.data) || result || {};
}

function table(result, name) {
  const root = unwrap(result);
  const tables = root.tables || root.result && root.result.tables || root.data && root.data.tables || {};
  if (Array.isArray(tables[name])) return tables[name];
  if (Array.isArray(root[name])) return root[name];
  if (Array.isArray(root[name.toLowerCase()])) return root[name.toLowerCase()];
  return [];
}

function normalizePeriods(result) {
  const root = unwrap(result);
  const source = root.periodos || root.periods ||
    root.result && (root.result.periodos || root.result.periods) ||
    root.tables && root.tables.Periodos || [];
  const map = new Map();

  (Array.isArray(source) ? source : []).forEach((item) => {
    item = item || {};
    const id = text(item.periodoId || item.periodoCanonicoId || item.id || item.value || item.key);
    const label = text(item.periodoLabel || item.periodoCanonicoLabel || item.label || item.nombre || id);
    const inactive = text(item.estado || 'ACTIVO').toUpperCase() === 'INACTIVO';
    if (!id || inactive || map.has(id)) return;
    map.set(id, {
      id,
      periodoId: id,
      label: label || id,
      periodoLabel: label || id,
      activo: true,
      principal: item.principal === true
    });
  });

  const raw = [...map.values()];
  let principalIndex = raw.findIndex((item) => item.principal);
  if (principalIndex < 0 && raw.length) principalIndex = 0;
  const periodos = raw.map((item, index) => ({
    ...item,
    principal: index === principalIndex
  }));

  return {
    periodos,
    principal: principalIndex >= 0 ? periodos[principalIndex] : null
  };
}

function normalizeStudent(item, fallbackPeriod) {
  item = item || {};
  const id = normalizeCedula(
    item.cedula || item.numeroIdentificacion || item.NumeroIdentificacion || item.Cedula || item['Cédula']
  );
  const periodId = text(item.periodoId || item.periodoCanonicoId || item.periodId || fallbackPeriod);
  const career = text(item.NombreCarrera || item.nombreCarrera || item.carrera || item.Carrera);
  const names = text(item.Nombres || item.nombres || item.nombre || item.Nombre);

  return {
    ...item,
    id: text(item.id || item._id || item.studentId || id),
    cedula: id,
    numeroIdentificacion: id,
    Nombres: names,
    nombres: names,
    CodigoCarrera: text(item.CodigoCarrera || item.codigoCarrera),
    codigoCarrera: text(item.CodigoCarrera || item.codigoCarrera),
    NombreCarrera: career,
    nombreCarrera: career,
    carrera: career,
    Sede: text(item.Sede || item.sede),
    sede: text(item.Sede || item.sede),
    HorarioComplexivo: text(item.HorarioComplexivo || item.horarioComplexivo),
    horarioComplexivo: text(item.HorarioComplexivo || item.horarioComplexivo),
    estadoMatricula: text(item.estadoMatricula || item.EstadoMatricula || 'ACTIVO'),
    division: text(item.division || item.Division),
    periodoId: periodId,
    periodoLabel: text(item.periodoLabel || item.periodoCanonicoLabel || item.PeriodoLabel || periodId),
    CorreoInstitucional: text(item.CorreoInstitucional || item.correoInstitucional),
    correoInstitucional: text(item.CorreoInstitucional || item.correoInstitucional),
    CorreoPersonal: text(item.CorreoPersonal || item.correoPersonal),
    correoPersonal: text(item.CorreoPersonal || item.correoPersonal),
    Celular: text(item.Celular || item.celular),
    celular: text(item.Celular || item.celular)
  };
}

function cacheKey(id, periodId) {
  return id + '|' + periodId;
}

function getCached(key) {
  const item = studentCache.get(key);
  if (!item) return null;
  if (item.expiresAt <= Date.now()) {
    studentCache.delete(key);
    return null;
  }
  return { ...item.value, cache: 'worker' };
}

function setCached(key, value) {
  if (studentCache.size >= STUDENT_CACHE_LIMIT) {
    const oldest = studentCache.keys().next().value;
    if (oldest) studentCache.delete(oldest);
  }
  const ttl = value && value.encontrado === true
    ? STUDENT_CACHE_TTL_MS
    : STUDENT_NOT_FOUND_TTL_MS;
  studentCache.set(key, { value, expiresAt: Date.now() + ttl });
}

function normalizeDirectResult(result, id, requestedPeriod) {
  const raw = result && (result.estudiante || result.registro || result.data);
  const found = Boolean(result && (result.encontrado === true || result.existe === true) && raw);

  if (!found) {
    return {
      ok: true,
      encontrado: false,
      existe: false,
      cedula: id,
      periodoId: requestedPeriod,
      fuente: 'REQUISITOS_BDLOCAL_SYNC',
      lecturaDirecta: true,
      duracionMs: Number(result && result.duracionMs || 0),
      mensaje: result && result.mensaje ||
        'No encontramos un estudiante con esa cédula en REQUISITOS_BDLOCAL_SYNC.'
    };
  }

  const student = normalizeStudent(raw, requestedPeriod);
  return {
    ok: true,
    encontrado: true,
    existe: true,
    estudiante: student,
    registro: student,
    periodoId: student.periodoId,
    periodoLabel: student.periodoLabel,
    coincidencias: Number(result.coincidencias || 1),
    fuente: 'REQUISITOS_BDLOCAL_SYNC',
    lecturaDirecta: true,
    duracionMs: Number(result.duracionMs || 0),
    mensaje: result.mensaje || 'Estudiante encontrado correctamente.'
  };
}

async function callService(env, action, payload, timeoutMs = 30000) {
  return runService(env, 'REQUISITOS', action, 'POST', payload || {}, 'consulta', timeoutMs);
}

async function listPeriods(env) {
  const data = normalizePeriods(
    await callService(env, 'pull_bl2', { scope: 'periods', includeData: false }, 45000)
  );
  return {
    ok: true,
    tipo: 'LISTAR_PERIODOS_TITULACION',
    ...data,
    total: data.periodos.length,
    fuente: 'REQUISITOS_BDLOCAL_SYNC'
  };
}

async function consultStudent(env, data) {
  const id = normalizeCedula(data.cedula || data.numeroIdentificacion || data.identificacion);
  if (!id) throw new Error('No se recibió una cédula válida.');

  const requestedPeriod = text(data.periodoId || data.periodo || data.periodoLabel);
  const key = cacheKey(id, requestedPeriod);
  const cached = getCached(key);
  if (cached) return cached;
  if (studentInflight.has(key)) return studentInflight.get(key);

  const task = requestClaves(env, 'CONSULTAR_ESTUDIANTE_REQUISITOS', {
    cedula: id,
    numeroIdentificacion: id,
    periodoId: requestedPeriod,
    modo: 'IDENTIDAD_RAPIDA'
  }, 15000)
    .then((result) => normalizeDirectResult(result, id, requestedPeriod))
    .then((result) => {
      setCached(key, result);
      return result;
    })
    .catch((error) => {
      const message = text(error && error.message);
      if (/Acción no reconocida/i.test(message)) {
        throw new Error(
          'Claves Central no tiene publicada la consulta rápida. Actualiza la implementación web de Claves Central.'
        );
      }
      throw error;
    })
    .finally(() => {
      studentInflight.delete(key);
    });

  studentInflight.set(key, task);
  return task;
}

function publicService(status, key) {
  const list = Array.isArray(status.servicios) ? status.servicios : [];
  return list.find((item) => String(item.clave || item.key || '').toUpperCase() === key) || null;
}

export async function onRequest({ request, env }) {
  const badOrigin = rejectUnknownOrigin(request);
  if (badOrigin) return badOrigin;

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(request) });
  }
  if (request.method !== 'POST') {
    return jsonReply(request, { ok: false, mensaje: 'Método no permitido.' }, 405);
  }

  try {
    const input = await readJson(request);
    const action = normalizeAction(input.accion || input.action || input.tipo);
    const data = input.datos && typeof input.datos === 'object'
      ? { ...input, ...input.datos }
      : { ...input };

    if (!ALLOWED.has(action)) {
      return jsonReply(request, {
        ok: false,
        mensaje: 'REQUISITOS_BDLOCAL_SYNC es de solo consulta.'
      }, 403);
    }

    if (action === 'CONFIGURACION_PUBLICA') {
      const item = publicService(await getPublicStatus(env), 'REQUISITOS');
      if (!item) throw new Error('REQUISITOS no está configurado en Claves.');
      return jsonReply(request, {
        ok: true,
        activo: item.activo === true,
        nombre: item.nombre || 'REQUISITOS_BDLOCAL_SYNC',
        version: item.version || '',
        estado: item.estado || '',
        mensaje: item.mensaje || '',
        soloLectura: true,
        origenConfig: 'claves'
      });
    }

    if (action === 'PING') {
      const ping = await callService(env, 'ping', {}, 30000);
      return jsonReply(request, unwrap(ping));
    }

    if (action === 'LISTAR_PERIODOS_TITULACION' || action === 'LISTAR_PERIODOS_PUBLICOS') {
      return jsonReply(request, await listPeriods(env));
    }

    if (action === 'CONSULTAR_ESTUDIANTE' || action === 'CONSULTAR_ESTUDIANTE_TITULACION') {
      return jsonReply(request, await consultStudent(env, data));
    }

    if (action === 'LISTAR_CARRERAS_PERIODO') {
      const periodId = text(data.periodoId || data.periodo || data.periodoLabel);
      const result = await callService(env, 'pull_bl2', {
        scope: periodId ? 'period' : 'all',
        periodoId: periodId,
        includeData: true
      }, 60000);
      const careers = table(result, 'Carreras');
      return jsonReply(request, {
        ok: true,
        carreras: careers,
        registros: careers,
        total: careers.length,
        periodoId: periodId,
        fuente: 'REQUISITOS_BDLOCAL_SYNC'
      });
    }

    throw new Error('Acción no implementada.');
  } catch (error) {
    return jsonReply(request, {
      ok: false,
      servicio: 'REQUISITOS',
      mensaje: error.message || String(error)
    }, 502);
  }
}
