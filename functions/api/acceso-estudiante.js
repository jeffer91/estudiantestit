import { requestClaves, runService } from '../_lib/claves.js';
import {
  corsHeaders,
  jsonReply,
  readJson,
  rejectUnknownOrigin,
  text
} from '../_lib/http.js';

const DIRECT_STUDENT_TIMEOUT_MS = 15000;
const TITLES_TIMEOUT_MS = 25000;
const SNAPSHOT_TTL_MS = 10 * 60 * 1000;
const STUDENT_TTL_MS = 10 * 60 * 1000;
const NOT_FOUND_TTL_MS = 30 * 1000;
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
    const variants = [
      tables[name],
      tables[name.toLowerCase()],
      root[name],
      root[name.toLowerCase()],
      resultNode[name],
      resultNode[name.toLowerCase()],
      dataNode[name],
      dataNode[name.toLowerCase()]
    ];
    const found = variants.find(Array.isArray);
    if (found) return found;
  }
  return [];
}

function collectObjects(value, output = [], seen = new Set(), depth = 0) {
  if (!value || typeof value !== 'object' || depth > 6 || seen.has(value)) return output;
  seen.add(value);
  if (!Array.isArray(value)) output.push(value);
  const entries = Array.isArray(value) ? value : Object.values(value);
  for (const entry of entries) collectObjects(entry, output, seen, depth + 1);
  return output;
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

function recordPeriod(item) {
  return text(flexible(item || {}, [
    'periodoId',
    'periodId',
    'periodoCanonicoId',
    'periodoLabel',
    'periodoCanonicoLabel',
    'PeriodoLabel',
    'periodo',
    'Período'
  ]));
}

function recordTimestamp(item, kind) {
  const dateValue = kind === 'resolution'
    ? flexible(item || {}, ['fechaResolucion', 'fechaServidor', 'fechaRevision', 'fecha'])
    : flexible(item || {}, ['fechaEnvio', 'fechaServidor', 'fechaCliente', 'fecha']);
  const parsed = Date.parse(text(dateValue));
  if (Number.isFinite(parsed)) return parsed;
  const row = Number(flexible(item || {}, ['__fila', 'fila', 'rowNumber']));
  if (Number.isFinite(row)) return row;
  const id = text(flexible(item || {}, ['idResolucion', 'resolucionId', 'idRegistro', 'envioId', 'id']));
  const numbers = id.match(/(\d{10,})/g);
  return numbers && numbers.length ? Number(numbers[numbers.length - 1]) : 0;
}

function latest(items, kind) {
  return (Array.isArray(items) ? items : [])
    .slice()
    .sort((a, b) => recordTimestamp(b, kind) - recordTimestamp(a, kind))[0] || null;
}

function looksLikeEnvio(value) {
  return Boolean(value && typeof value === 'object' && flexible(value, [
    'titulo1',
    'titulo2',
    'titulo3',
    'propuestas',
    'propuestasEnviadas',
    'idRegistro',
    'envioId',
    'tituloId',
    'telegram',
    'preferido',
    'tituloPreferidoNumero'
  ]) !== undefined);
}

function looksLikeResolution(value) {
  if (!value || typeof value !== 'object') return false;
  const state = text(flexible(value, ['estadoFinal', 'estadoResolucion']));
  const evidence = flexible(value, [
    'fechaResolucion',
    'coordinador',
    'observacion',
    'comentarioCoordinador',
    'tituloElegido',
    'tituloCorregido',
    'idResolucion',
    'resolucionId',
    'permitirReenvio'
  ]);
  return Boolean(state && evidence !== undefined);
}

function candidates(result, predicate) {
  return collectObjects(unwrap(result)).filter(predicate);
}

function selectRecord(result, predicate, cedula, academicPeriod, kind) {
  let list = candidates(result, predicate);
  if (!list.length) return null;

  const identificables = list.filter((item) => rawCedula(flexible(item || {}, [
    'cedula',
    'numeroIdentificacion',
    'NumeroIdentificacion',
    'identificacion',
    'Cédula'
  ])));

  if (identificables.length) {
    const exactCedula = identificables.filter((item) => sameCedula(item, cedula));
    if (!exactCedula.length) return null;
    list = exactCedula;
  }

  const target = normalizePeriod(academicPeriod);
  if (target) {
    const exactPeriod = list.filter((item) => normalizePeriod(recordPeriod(item)) === target);
    if (exactPeriod.length) return latest(exactPeriod, kind);

    const conPeriodo = list.filter((item) => normalizePeriod(recordPeriod(item)));
    if (conPeriodo.length > 1) return null;
  }

  if (list.length === 1) return list[0];
  return latest(list, kind);
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
    return recordPeriod(b).localeCompare(recordPeriod(a), 'es', { sensitivity: 'base' });
  });
  return list[0] || null;
}

function normalizeStudent(base, enrollment, cedula, requestedPeriod) {
  const merged = mergeNonEmpty(base, enrollment);
  const canonical = normalizeCedula(cedula);
  const periodId = text(flexible(merged, [
    'periodoId', 'periodId', 'periodoCanonicoId', 'ultimoPeriodoId'
  ]) || requestedPeriod);
  const periodLabel = text(flexible(merged, [
    'periodoLabel', 'periodoCanonicoLabel', 'PeriodoLabel', 'periodo'
  ]) || periodId);
  const names = text(flexible(merged, [
    'Nombres', 'nombres', 'nombreCompleto', 'NombreCompleto', 'nombre', 'Nombre'
  ]));
  const career = text(flexible(merged, [
    'NombreCarrera', 'nombreCarrera', 'carrera', 'Carrera'
  ]));

  return {
    ...merged,
    id: text(flexible(merged, ['id', '_id', 'studentId']) || (periodId ? periodId + '__' + canonical : canonical)),
    cedula: canonical,
    numeroIdentificacion: canonical,
    Nombres: names,
    nombres: names,
    NombreCarrera: career,
    nombreCarrera: career,
    carrera: career,
    CodigoCarrera: text(flexible(merged, ['CodigoCarrera', 'codigoCarrera'])),
    codigoCarrera: text(flexible(merged, ['codigoCarrera', 'CodigoCarrera'])),
    periodoId: periodId,
    periodId,
    periodoLabel: periodLabel,
    Sede: text(flexible(merged, ['Sede', 'sede'])),
    sede: text(flexible(merged, ['sede', 'Sede'])),
    estadoMatricula: text(flexible(merged, ['estadoMatricula', 'EstadoMatricula']) || 'ACTIVO'),
    source: 'consulta_acceso_paralela'
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
    snapshotCache = { value, expiresAt: Date.now() + SNAPSHOT_TTL_MS };
    return value;
  }).finally(() => {
    snapshotInflight = null;
  });
  return snapshotInflight;
}

async function fallbackStudent(env, cedula, requestedPeriod) {
  const pulled = await snapshot(env);
  const students = table(pulled, ['Estudiantes', 'BaseEstudiantes']);
  const enrollments = table(pulled, ['MatriculasPeriodo', 'Matriculas', 'EstudiantesPeriodo']);
  const baseRows = students.filter((item) => sameCedula(item, cedula));
  let enrollmentRows = enrollments.filter((item) => sameCedula(item, cedula));

  if (requestedPeriod) {
    const exact = enrollmentRows.filter((item) => normalizePeriod(recordPeriod(item)) === normalizePeriod(requestedPeriod));
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

  const task = requestClaves(env, 'CONSULTAR_ESTUDIANTE_REQUISITOS', {
    cedula,
    numeroIdentificacion: cedula,
    periodoId: requestedPeriod,
    modo: 'IDENTIDAD_RAPIDA'
  }, DIRECT_STUDENT_TIMEOUT_MS)
    .then(async (direct) => studentFound(direct) ? direct : fallbackStudent(env, cedula, requestedPeriod))
    .catch(() => fallbackStudent(env, cedula, requestedPeriod))
    .then((result) => setCached(key, result))
    .finally(() => studentInflight.delete(key));

  studentInflight.set(key, task);
  return task;
}

async function queryTitles(env, action, cedula) {
  const result = await runService(
    env,
    'TITULOS',
    action,
    'GET',
    { cedula, numeroIdentificacion: cedula, periodo: '', periodoId: '', periodoLabel: '' },
    'student',
    TITLES_TIMEOUT_MS
  );
  const unwrapped = unwrap(result);
  if (unwrapped && unwrapped.ok === false) {
    throw new Error(unwrapped.mensaje || unwrapped.error || 'La consulta de Títulos no fue completada.');
  }
  return unwrapped;
}

function normalizeState(value) {
  const state = text(value).toUpperCase();
  if (state === 'ENVIADO' || state === 'PENDIENTE_SYNC') return 'PENDIENTE_REVISION';
  return state;
}

function effectiveState(envio, resolucion) {
  const resolutionState = normalizeState(flexible(resolucion || {}, ['estadoFinal', 'estadoResolucion', 'estado']));
  if (resolutionState) return { estado: resolutionState, origen: 'RESOLUCIONES' };
  const envioState = normalizeState(flexible(envio || {}, ['estado', 'estadoProceso', 'estadoGoogleSheets'])) || 'PENDIENTE_REVISION';
  if (envio) return { estado: envioState, origen: 'ENVIOS' };
  return { estado: 'SIN_ENVIO', origen: 'REQUISITOS' };
}

function sourceError(settled, label) {
  if (settled.status === 'fulfilled') return null;
  return {
    fuente: label,
    mensaje: text(settled.reason && settled.reason.message) || 'Consulta no disponible.'
  };
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
    const cedula = normalizeCedula(data.cedula || data.numeroIdentificacion || data.identificacion);
    const requestedPeriod = text(data.periodoId || data.periodo || data.periodoLabel);

    if (!cedula) throw new Error('No se recibió una cédula válida.');

    const [academicResult, envioResult, resolutionResult] = await Promise.allSettled([
      lookupStudent(env, cedula, requestedPeriod),
      queryTitles(env, 'VERIFICAR_ENVIO', cedula),
      queryTitles(env, 'CONSULTAR_ENVIO_CEDULA', cedula)
    ]);

    const sourceErrors = [
      sourceError(academicResult, 'REQUISITOS'),
      sourceError(envioResult, 'ENVIOS'),
      sourceError(resolutionResult, 'RESOLUCIONES')
    ].filter(Boolean);

    if (sourceErrors.length) {
      return jsonReply(request, {
        ok: false,
        consultaCompleta: false,
        fuentesFallidas: sourceErrors,
        mensaje: 'No pudimos comprobar completamente tus datos, envíos y resoluciones. Intenta nuevamente.',
        duracionMs: Date.now() - startedAt
      }, 502);
    }

    const academic = academicResult.value;
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
      academic.periodoLabel ||
      academic.periodoId ||
      requestedPeriod
    );

    const envio = selectRecord(envioResult.value, looksLikeEnvio, cedula, academicPeriod, 'envio') ||
      selectRecord(resolutionResult.value, looksLikeEnvio, cedula, academicPeriod, 'envio');
    const resolucion = selectRecord(resolutionResult.value, looksLikeResolution, cedula, academicPeriod, 'resolution') ||
      selectRecord(envioResult.value, looksLikeResolution, cedula, academicPeriod, 'resolution');

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
      consultas: { requisitos: 'ok', envios: 'ok', resoluciones: 'ok' },
      fuente: academic.fuente || 'CONSULTA_ACCESO_PARALELA',
      fuenteEnvio: 'RESPALDO_TITULOS_APP_ENVÍOS',
      fuenteResolucion: 'RESPALDO_TITULOS_APP_RESOLUCIONES',
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
      mensaje: error.message || String(error),
      duracionMs: Date.now() - startedAt
    }, 502);
  }
}
