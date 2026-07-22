import { requestClaves, runService } from '../_lib/claves.js';
import {
  corsHeaders,
  jsonReply,
  readJson,
  rejectUnknownOrigin,
  text
} from '../_lib/http.js';

const STUDENT_TTL_MS = 10 * 60 * 1000;
const NOT_FOUND_TTL_MS = 30 * 1000;
const SNAPSHOT_TTL_MS = 10 * 60 * 1000;
const CACHE_LIMIT = 400;

const studentCache = new Map();
const studentInflight = new Map();
let snapshotCache = null;
let snapshotInflight = null;

function normalizeCedula(value) {
  const digits = text(value).replace(/\D/g, '');
  if (digits.length === 9) return '0' + digits;
  return digits.length === 10 ? digits : '';
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

function flexible(object, names) {
  if (!object || typeof object !== 'object') return undefined;
  const map = Object.keys(object).reduce((out, key) => {
    out[normalizedKey(key)] = key;
    return out;
  }, {});
  for (const name of names) {
    const key = map[normalizedKey(name)];
    if (key !== undefined && object[key] !== undefined && object[key] !== null) {
      return object[key];
    }
  }
  return undefined;
}

function yes(value) {
  return value === true || ['SI', 'SÍ', 'TRUE', '1', 'YES'].includes(text(value).toUpperCase());
}

function unwrap(result) {
  return result && (result.respuesta || result.data) || result || {};
}

function table(result, names) {
  const root = unwrap(result);
  const resultNode = root.result && typeof root.result === 'object' ? root.result : {};
  const dataNode = root.data && typeof root.data === 'object' ? root.data : {};
  const tables = root.tables || resultNode.tables || dataNode.tables || {};

  for (const name of names) {
    const candidates = [
      tables[name],
      tables[name.toLowerCase()],
      root[name],
      root[name.toLowerCase()],
      resultNode[name],
      resultNode[name.toLowerCase()],
      dataNode[name],
      dataNode[name.toLowerCase()]
    ];
    const found = candidates.find(Array.isArray);
    if (found) return found;
  }
  return [];
}

function sameCedula(item, cedula) {
  const variants = new Set(cedulaVariants(cedula));
  const found = text(flexible(item || {}, [
    'cedula',
    'numeroIdentificacion',
    'NumeroIdentificacion',
    'identificacion',
    'Cédula'
  ])).replace(/\D/g, '');
  return Boolean(found && variants.has(found));
}

function mergeNonEmpty(...sources) {
  const output = {};
  for (const source of sources) {
    if (!source || typeof source !== 'object') continue;
    for (const [key, value] of Object.entries(source)) {
      if (value !== undefined && value !== null && text(value) !== '') output[key] = value;
    }
  }
  return output;
}

function chooseEnrollment(items) {
  const list = (Array.isArray(items) ? items : []).slice();
  list.sort((a, b) => {
    const activeA = text(flexible(a, ['estadoMatricula', 'EstadoMatricula']) || 'ACTIVO').toUpperCase() === 'ACTIVO' ? 1 : 0;
    const activeB = text(flexible(b, ['estadoMatricula', 'EstadoMatricula']) || 'ACTIVO').toUpperCase() === 'ACTIVO' ? 1 : 0;
    if (activeA !== activeB) return activeB - activeA;
    const periodA = text(flexible(a, ['periodoId', 'periodId', 'ultimoPeriodoId', 'periodoLabel']));
    const periodB = text(flexible(b, ['periodoId', 'periodId', 'ultimoPeriodoId', 'periodoLabel']));
    return periodB.localeCompare(periodA, 'es', { sensitivity: 'base' });
  });
  return list[0] || null;
}

function normalizeStudent(base, enrollment, cedula, requestedPeriod) {
  const merged = mergeNonEmpty(base, enrollment);
  const canonical = normalizeCedula(cedula);
  const periodId = text(flexible(merged, [
    'periodoId',
    'periodId',
    'periodoCanonicoId',
    'ultimoPeriodoId'
  ]) || requestedPeriod);
  const periodLabel = text(flexible(merged, [
    'periodoLabel',
    'periodoCanonicoLabel',
    'PeriodoLabel',
    'periodo'
  ]) || periodId);
  const names = text(flexible(merged, [
    'Nombres',
    'nombres',
    'nombreCompleto',
    'NombreCompleto',
    'nombre',
    'Nombre'
  ]));
  const career = text(flexible(merged, [
    'NombreCarrera',
    'nombreCarrera',
    'carrera',
    'Carrera'
  ]));

  return {
    ...merged,
    id: text(flexible(merged, ['id', '_id', 'studentId']) || (periodId ? periodId + '__' + canonical : canonical)),
    _id: text(flexible(merged, ['_id', 'id', 'studentId']) || (periodId ? periodId + '__' + canonical : canonical)),
    studentId: text(flexible(merged, ['studentId', 'id', '_id']) || (periodId ? periodId + '__' + canonical : canonical)),
    cedula: canonical,
    numeroIdentificacion: canonical,
    NumeroIdentificacion: canonical,
    Nombres: names,
    nombres: names,
    NombreCarrera: career,
    nombreCarrera: career,
    carrera: career,
    CodigoCarrera: text(flexible(merged, ['CodigoCarrera', 'codigoCarrera'])),
    codigoCarrera: text(flexible(merged, ['codigoCarrera', 'CodigoCarrera'])),
    periodoId: periodId,
    periodId,
    periodoCanonicoId: periodId,
    periodoLabel: periodLabel,
    periodoCanonicoLabel: periodLabel,
    Sede: text(flexible(merged, ['Sede', 'sede'])),
    sede: text(flexible(merged, ['sede', 'Sede'])),
    estadoMatricula: text(flexible(merged, ['estadoMatricula', 'EstadoMatricula']) || 'ACTIVO'),
    source: 'consulta_acceso_optimizada'
  };
}

function studentFound(result) {
  return Boolean(result && (
    result.encontrado === true ||
    result.existe === true ||
    yes(result.encontrado) ||
    yes(result.existe) ||
    result.estudiante ||
    result.registro
  ));
}

function cacheKey(cedula, period) {
  return cedula + '|' + period;
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
  while (studentCache.size >= CACHE_LIMIT) {
    const first = studentCache.keys().next().value;
    if (first === undefined) break;
    studentCache.delete(first);
  }
  const ttl = studentFound(value) ? STUDENT_TTL_MS : NOT_FOUND_TTL_MS;
  studentCache.set(key, { value, expiresAt: Date.now() + ttl });
  return value;
}

async function directStudent(env, cedula, requestedPeriod) {
  return requestClaves(env, 'CONSULTAR_ESTUDIANTE_REQUISITOS', {
    cedula,
    numeroIdentificacion: cedula,
    periodoId: requestedPeriod,
    modo: 'IDENTIDAD_RAPIDA'
  }, 15000);
}

async function snapshot(env) {
  if (snapshotCache && snapshotCache.expiresAt > Date.now()) return snapshotCache.value;
  if (snapshotInflight) return snapshotInflight;

  snapshotInflight = runService(
    env,
    'REQUISITOS',
    'pull_bl2',
    'POST',
    { scope: 'all', includeData: true },
    'consulta',
    45000
  ).then((value) => {
    snapshotCache = {
      value,
      expiresAt: Date.now() + SNAPSHOT_TTL_MS
    };
    return value;
  }).finally(() => {
    snapshotInflight = null;
  });

  return snapshotInflight;
}

async function fallbackStudent(env, cedula, requestedPeriod) {
  const pulled = await snapshot(env);
  const students = table(pulled, ['Estudiantes', 'BaseEstudiantes']);
  const enrollments = table(pulled, [
    'MatriculasPeriodo',
    'Matriculas',
    'EstudiantesPeriodo'
  ]);
  const baseRows = students.filter((item) => sameCedula(item, cedula));
  let enrollmentRows = enrollments.filter((item) => sameCedula(item, cedula));

  if (requestedPeriod) {
    const exact = enrollmentRows.filter((item) => {
      const period = text(flexible(item, [
        'periodoId',
        'periodId',
        'periodoCanonicoId',
        'periodoLabel',
        'periodo'
      ]));
      return period === requestedPeriod;
    });
    if (exact.length) enrollmentRows = exact;
  }

  const base = baseRows[baseRows.length - 1] || null;
  const enrollment = chooseEnrollment(enrollmentRows);
  if (!base && !enrollment) {
    return {
      ok: true,
      encontrado: false,
      existe: false,
      cedula,
      periodoId: requestedPeriod,
      fuente: 'REQUISITOS_BDLOCAL_SYNC',
      fallback: true,
      mensaje: 'No encontramos un estudiante con esa cédula en el índice académico.'
    };
  }

  const student = normalizeStudent(base, enrollment, cedula, requestedPeriod);
  return {
    ok: true,
    encontrado: true,
    existe: true,
    estudiante: student,
    registro: student,
    cedula: student.cedula,
    periodoId: student.periodoId,
    periodoLabel: student.periodoLabel,
    fuente: 'REQUISITOS_BDLOCAL_SYNC',
    fallback: true,
    mensaje: 'Estudiante encontrado correctamente.'
  };
}

async function lookupStudent(env, cedula, requestedPeriod) {
  const key = cacheKey(cedula, requestedPeriod);
  const cached = getCached(key);
  if (cached) return cached;
  if (studentInflight.has(key)) return studentInflight.get(key);

  const task = directStudent(env, cedula, requestedPeriod)
    .then(async (direct) => {
      if (studentFound(direct)) return direct;
      return fallbackStudent(env, cedula, requestedPeriod);
    })
    .then((result) => setCached(key, result))
    .finally(() => studentInflight.delete(key));

  studentInflight.set(key, task);
  return task;
}

function looksLikeEnvio(value) {
  return Boolean(value && typeof value === 'object' && flexible(value, [
    'titulo1',
    'titulo2',
    'titulo3',
    'tituloAprobado',
    'tituloCorregido',
    'tituloElegido',
    'tituloFinalAprobado'
  ]) !== undefined);
}

function extractEnvio(result) {
  if (!result || typeof result !== 'object') return null;
  const candidates = [
    result.envio,
    result.registroEnvio,
    result.envioActual,
    result.data && result.data.envio,
    result.resultado && result.resultado.envio,
    result.respuesta && result.respuesta.envio,
    result.registro
  ];
  for (const candidate of candidates) {
    if (looksLikeEnvio(candidate)) return candidate;
  }
  return looksLikeEnvio(result) ? result : null;
}

function envioEstado(result) {
  const envio = extractEnvio(result) || {};
  return text(
    flexible(envio, ['estado', 'estadoFinal', 'estadoProceso', 'estadoGoogleSheets']) ||
    flexible(result, ['estado', 'estadoFinal'])
  ).toUpperCase();
}

function permiteReenvio(result) {
  const envio = extractEnvio(result) || {};
  const estado = envioEstado(result);
  const own = flexible(envio, ['permitirReenvio', 'permiteReenvio']);
  const value = own !== undefined
    ? own
    : flexible(result, ['permitirReenvio', 'permiteReenvio']);
  return estado === 'DEVUELTO' && (
    value === undefined || value === null || value === '' || yes(value)
  );
}

async function lookupEnvio(env, cedula, student) {
  const periodId = text(flexible(student || {}, ['periodoId', 'periodId']));
  const periodLabel = text(flexible(student || {}, ['periodoLabel', 'periodo']));
  const result = await runService(
    env,
    'TITULOS',
    'CONSULTAR_ENVIO_CEDULA',
    'GET',
    {
      cedula,
      numeroIdentificacion: cedula,
      periodo: periodLabel || periodId,
      periodoLabel,
      periodoId
    },
    'student',
    30000
  );
  return unwrap(result);
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

  const startedAt = Date.now();

  try {
    const input = await readJson(request);
    const data = input.datos && typeof input.datos === 'object'
      ? { ...input, ...input.datos }
      : { ...input };
    const cedula = normalizeCedula(
      data.cedula || data.numeroIdentificacion || data.identificacion
    );
    const requestedPeriod = text(
      data.periodoId || data.periodo || data.periodoLabel
    );

    if (!cedula) throw new Error('No se recibió una cédula válida.');

    const academic = await lookupStudent(env, cedula, requestedPeriod);
    if (!studentFound(academic)) {
      return jsonReply(request, {
        ...academic,
        duracionMs: Date.now() - startedAt
      });
    }

    const student = academic.estudiante || academic.registro;
    let envioResult = {};
    try {
      envioResult = await lookupEnvio(env, cedula, student);
    } catch (error) {
      envioResult = {
        ok: false,
        mensaje: text(error && error.message)
      };
    }

    const envio = extractEnvio(envioResult);
    const permitir = permiteReenvio(envioResult);
    const estado = envioEstado(envioResult);
    const encontradoEnvio = Boolean(envio);
    const aprobado = estado.includes('APROBADO') || estado === 'REEMPLAZADO';

    return jsonReply(request, {
      ...academic,
      ok: true,
      encontrado: true,
      existe: true,
      estudiante: student,
      registro: student,
      tieneEnvio: encontradoEnvio && !permitir,
      encontradoEnvio,
      permiteReenvio: permitir,
      envio,
      estadoEnvio: estado,
      consultaEnvioCompleta: true,
      fuente: academic.fuente || 'CONSULTA_ACCESO_OPTIMIZADA',
      fuenteEnvio: 'RESPALDO_TITULOS_APP',
      duracionMs: Date.now() - startedAt,
      mensaje: permitir
        ? 'El registro fue devuelto y puede corregirse.'
        : aprobado
          ? 'Tu tema de titulación fue aprobado por coordinación.'
          : encontradoEnvio
            ? 'Tus propuestas ya fueron enviadas y están siendo revisadas por coordinación.'
            : 'Estudiante encontrado correctamente.'
    });
  } catch (error) {
    return jsonReply(request, {
      ok: false,
      servicio: 'ACCESO_ESTUDIANTE',
      mensaje: error.message || String(error),
      duracionMs: Date.now() - startedAt
    }, 502);
  }
}
