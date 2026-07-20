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
const STUDENT_CACHE_LIMIT = 200;
const studentCache = new Map();
const studentInflight = new Map();

function cedula(value) {
  const digits = text(value).replace(/\D/g, '');
  return digits.length === 9 ? '0' + digits : digits;
}

function unwrap(result) {
  return result && result.respuesta || result && result.data || result || {};
}

function table(result, name) {
  const root = unwrap(result);
  const tables = root.tables || root.result && root.result.tables || root.data && root.data.tables || {};
  if (Array.isArray(tables[name])) return tables[name];
  if (Array.isArray(root[name])) return root[name];
  if (Array.isArray(root[name.toLowerCase()])) return root[name.toLowerCase()];
  return [];
}

function periods(result) {
  const root = unwrap(result);
  const list = root.periodos || root.periods || root.result && (root.result.periodos || root.result.periods) || root.tables && root.tables.Periodos || [];
  const map = new Map();

  (Array.isArray(list) ? list : []).forEach((item) => {
    item = item || {};
    const id = text(item.periodoId || item.periodoCanonicoId || item.id || item.value || item.key);
    const label = text(item.periodoLabel || item.periodoCanonicoLabel || item.label || item.nombre || id);
    const inactive = text(item.estado || 'ACTIVO').toUpperCase() === 'INACTIVO';
    if (id && !inactive && !map.has(id)) {
      map.set(id, {
        id,
        periodoId: id,
        label: label || id,
        periodoLabel: label || id,
        activo: true,
        principal: item.principal === true
      });
    }
  });

  const rawPeriods = [...map.values()];
  const principalIndex = Math.max(0, rawPeriods.findIndex((item) => item.principal));
  const periodos = rawPeriods.map((item, index) => ({
    ...item,
    principal: rawPeriods.length > 0 && index === principalIndex
  }));

  return {
    periodos,
    principal: periodos[principalIndex] || null
  };
}

async function call(env, action, payload) {
  const configured = Number(env.CLAVES_TIMEOUT_MS || 0);
  const timeoutMs = Math.max(Number.isFinite(configured) ? configured : 0, 90000);
  return runService(env, 'REQUISITOS', action, 'POST', payload || {}, 'consulta', timeoutMs);
}

async function listPeriods(env) {
  const data = periods(await call(env, 'pull_bl2', { scope: 'periods', includeData: false }));
  return {
    ok: true,
    tipo: 'LISTAR_PERIODOS_TITULACION',
    ...data,
    total: data.periodos.length,
    fuente: 'REQUISITOS_BDLOCAL_SYNC'
  };
}

function student(item, fallbackPeriod) {
  item = item || {};
  const id = cedula(item.cedula || item.numeroIdentificacion || item.NumeroIdentificacion || item.Cedula || item['Cédula']);
  const periodId = text(item.periodoId || item.periodoCanonicoId || item.periodId || fallbackPeriod);
  const career = text(item.NombreCarrera || item.nombreCarrera || item.carrera || item.Carrera);
  const names = text(item.Nombres || item.nombres || item.nombre || item.Nombre);

  return {
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
    celular: text(item.Celular || item.celular),
    Academico: text(item.Academico || item['Académico']),
    Documentacion: text(item.Documentacion || item['Documentación']),
    Financiero: text(item.Financiero),
    Ingles: text(item.Ingles || item['Inglés']),
    Titulacion: text(item.Titulacion || item['Titulación']),
    Vinculacion: text(item.Vinculacion || item['Vinculación']),
    PracticasVinculacion: text(item.PracticasVinculacion || item['PrácticasVinculacion']),
    SeguimientoGraduados: text(item.SeguimientoGraduados),
    ActualizacionDatos: text(item.ActualizacionDatos || item['ActualizaciónDatos']),
    AprobacionTitulacion: text(item.AprobacionTitulacion || item['AprobaciónTitulacion']),
    AprobacionComplexivoProyecto: text(item.AprobacionComplexivoProyecto || item['AprobaciónComplexivoProyecto'])
  };
}

async function pull(env, periodId) {
  return call(env, 'pull_bl2', {
    scope: periodId ? 'period' : 'all',
    periodoId: periodId || '',
    includeData: true
  });
}

function preferStudent(matches, requestedPeriod, principalPeriod) {
  if (!matches.length) return null;
  if (requestedPeriod) {
    return matches.find((item) => item.periodoId === requestedPeriod || item.periodoLabel === requestedPeriod) || matches[0];
  }
  if (principalPeriod) {
    const principal = matches.find((item) => item.periodoId === principalPeriod || item.periodoLabel === principalPeriod);
    if (principal) return principal;
  }
  return matches[0];
}

function cacheKey(id, requestedPeriod) {
  return id + '|' + requestedPeriod;
}

function cacheGet(key) {
  const item = studentCache.get(key);
  if (!item) return null;
  if (item.expiresAt <= Date.now()) {
    studentCache.delete(key);
    return null;
  }
  return { ...item.value, cache: 'worker' };
}

function cachePut(key, value) {
  const ttl = value && value.encontrado === true
    ? STUDENT_CACHE_TTL_MS
    : STUDENT_NOT_FOUND_TTL_MS;

  if (studentCache.size >= STUDENT_CACHE_LIMIT) {
    const oldest = studentCache.keys().next().value;
    if (oldest) studentCache.delete(oldest);
  }

  studentCache.set(key, {
    value,
    expiresAt: Date.now() + ttl
  });
}

function normalizeDirectResult(result, id, requestedPeriod) {
  const raw = result && (result.estudiante || result.registro || result.data);
  const found = result && (result.encontrado === true || result.existe === true) && raw;

  if (!found) {
    return {
      ok: true,
      encontrado: false,
      existe: false,
      cedula: id,
      periodoId: requestedPeriod,
      fuente: 'REQUISITOS_BDLOCAL_SYNC',
      lecturaDirecta: true,
      mensaje: result && result.mensaje || 'No encontramos un estudiante con esa cédula en REQUISITOS_BDLOCAL_SYNC.'
    };
  }

  const normalized = student(raw, requestedPeriod);
  return {
    ok: true,
    encontrado: true,
    existe: true,
    estudiante: normalized,
    registro: normalized,
    periodoId: normalized.periodoId,
    periodoLabel: normalized.periodoLabel,
    coincidencias: Number(result.coincidencias || 1),
    fuente: 'REQUISITOS_BDLOCAL_SYNC',
    lecturaDirecta: true,
    duracionMs: Number(result.duracionMs || 0),
    mensaje: result.mensaje || 'Estudiante encontrado correctamente.'
  };
}

async function consultLegacy(env, id, requestedPeriod) {
  const result = await pull(env, requestedPeriod);
  const catalog = requestedPeriod ? { principal: null } : periods(result);
  const principalPeriod = catalog.principal && catalog.principal.id || '';
  const students = table(result, 'Estudiantes').map((item) => student(item, requestedPeriod));
  const matches = students.filter((item) => item.cedula === id);
  const found = preferStudent(matches, requestedPeriod, principalPeriod);

  if (!found) {
    return {
      ok: true,
      encontrado: false,
      existe: false,
      cedula: id,
      periodoId: requestedPeriod,
      mensaje: requestedPeriod
        ? 'No encontramos un estudiante con esa cédula en el período seleccionado.'
        : 'No encontramos un estudiante con esa cédula en ninguno de los períodos disponibles de REQUISITOS_BDLOCAL_SYNC.'
    };
  }

  return {
    ok: true,
    encontrado: true,
    existe: true,
    estudiante: found,
    registro: found,
    periodoId: found.periodoId,
    periodoLabel: found.periodoLabel,
    coincidencias: matches.length,
    fuente: 'REQUISITOS_BDLOCAL_SYNC',
    lecturaDirecta: false,
    mensaje: 'Estudiante encontrado correctamente.'
  };
}

async function consult(env, data) {
  const id = cedula(data.cedula || data.numeroIdentificacion || data.identificacion);
  if (!id) throw new Error('No se recibió una cédula válida.');

  const requestedPeriod = text(data.periodoId || data.periodo || data.periodoLabel);
  const key = cacheKey(id, requestedPeriod);
  const cached = cacheGet(key);
  if (cached) return cached;
  if (studentInflight.has(key)) return studentInflight.get(key);

  const task = requestClaves(env, 'CONSULTAR_ESTUDIANTE_REQUISITOS', {
    cedula: id,
    numeroIdentificacion: id,
    periodoId: requestedPeriod
  }, 30000)
    .then((result) => normalizeDirectResult(result, id, requestedPeriod))
    .catch((error) => {
      const message = text(error && error.message);
      if (/Acción no reconocida/i.test(message)) {
        return consultLegacy(env, id, requestedPeriod);
      }
      throw error;
    })
    .then((result) => {
      cachePut(key, result);
      return result;
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
      return jsonReply(request, { ok: false, mensaje: 'REQUISITOS_BDLOCAL_SYNC es de solo consulta.' }, 403);
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
      const ping = await call(env, 'ping', {});
      return jsonReply(request, ping.respuesta || ping.data || ping);
    }

    if (action === 'LISTAR_PERIODOS_TITULACION' || action === 'LISTAR_PERIODOS_PUBLICOS') {
      return jsonReply(request, await listPeriods(env));
    }

    if (action === 'CONSULTAR_ESTUDIANTE' || action === 'CONSULTAR_ESTUDIANTE_TITULACION') {
      return jsonReply(request, await consult(env, data));
    }

    if (action === 'LISTAR_CARRERAS_PERIODO') {
      const periodId = text(data.periodoId || data.periodo || data.periodoLabel);
      const careers = table(await pull(env, periodId), 'Carreras');
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
