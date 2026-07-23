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

function yes(value) {
  return value === true || ['SI', 'SÍ', 'TRUE', '1', 'YES'].includes(text(value).toUpperCase());
}

function decodeJsonLayers(value, maxDepth = 6) {
  let current = value;
  for (let depth = 0; depth < maxDepth && typeof current === 'string'; depth += 1) {
    const raw = current.trim();
    if (!raw) return {};
    if (!raw.startsWith('{') && !raw.startsWith('[') && !raw.startsWith('"')) break;
    try {
      current = JSON.parse(raw);
    } catch (_error) {
      break;
    }
  }
  return current;
}

function decodeNestedJson(value, depth = 0) {
  const decoded = decodeJsonLayers(value);
  if (depth > 8 || !decoded || typeof decoded !== 'object') return decoded;
  if (Array.isArray(decoded)) {
    return decoded.map((item) => decodeNestedJson(item, depth + 1));
  }
  return Object.keys(decoded).reduce((output, key) => {
    output[key] = decodeNestedJson(decoded[key], depth + 1);
    return output;
  }, {});
}

function unwrap(result) {
  let current = decodeNestedJson(result) || {};
  for (let depth = 0; depth < 6 && current && typeof current === 'object'; depth += 1) {
    const next = current.respuesta || current.data || current.resultado || current.result;
    if (!next || typeof next !== 'object') break;
    current = next;
  }
  return current || {};
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
  const decoded = decodeJsonLayers(value);
  if (!decoded || typeof decoded !== 'object' || depth > 8 || seen.has(decoded)) return output;
  seen.add(decoded);
  if (!Array.isArray(decoded)) output.push(decoded);
  const entries = Array.isArray(decoded) ? decoded : Object.values(decoded);
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
    ? flexible(item || {}, [
      'fechaResolucion', 'Fecha resolución', 'fechaServidor', 'Fecha servidor',
      'fechaRevision', 'fecha'
    ])
    : flexible(item || {}, [
      'fechaEnvio', 'Fecha envío', 'fechaServidor', 'Fecha servidor',
      'fechaCliente', 'fecha'
    ]);
  const parsed = Date.parse(text(dateValue));
  if (Number.isFinite(parsed)) return parsed;
  const row = Number(flexible(item || {}, ['__fila', 'fila', 'rowNumber']));
  if (Number.isFinite(row)) return row;
  const id = text(flexible(item || {}, [
    'idResolucion', 'resolucionId', 'idRegistro', 'envioId', 'id'
  ]));
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
    'Título 1',
    'Título 2',
    'Título 3',
    'propuestas',
    'propuestasEnviadas',
    'titulosEnviados',
    'propuesta1',
    'propuesta2',
    'propuesta3',
    'idRegistro',
    'envioId',
    'tituloId',
    'telegram',
    'preferido',
    'tituloPreferido',
    'tituloPreferidoNumero'
  ]) !== undefined);
}

function looksLikeResolution(value) {
  if (!value || typeof value !== 'object') return false;
  const state = text(flexible(value, [
    'estadoFinal', 'Estado final', 'estadoResolucion', 'estado'
  ]));
  const evidence = flexible(value, [
    'fechaResolucion',
    'Fecha resolución',
    'coordinador',
    'observacion',
    'observaciones',
    'Observación',
    'comentarioCoordinador',
    'tituloElegido',
    'Título elegido',
    'tituloCorregido',
    'Título corregido',
    'idResolucion',
    'resolucionId',
    'permitirReenvio'
  ]);
  return Boolean(state && evidence !== undefined);
}

function candidates(result, predicate) {
  return collectObjects(decodeNestedJson(result)).filter(predicate);
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
    if (conPeriodo.length) return null;
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

function serviceFailure(result) {
  const decoded = decodeNestedJson(result);
  const nodes = collectObjects(decoded);
  return nodes.find((item) => item && item.ok === false) || null;
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
  const failure = serviceFailure(decoded);
  if (failure) {
    throw new Error(text(failure.mensaje || failure.error) || 'La consulta de Títulos no fue completada.');
  }
  return decoded;
}

async function queryTitlesCompatible(env, primaryAction, fallbackAction, cedula, period = '') {
  try {
    return await queryTitles(env, primaryAction, cedula, period);
  } catch (primaryError) {
    if (!fallbackAction || fallbackAction === primaryAction) throw primaryError;
    const fallback = await queryTitles(env, fallbackAction, cedula, period);
    return {
      ...fallback,
      accionSolicitada: primaryAction,
      accionCompatibilidad: fallbackAction
    };
  }
}

function normalizeState(value) {
  const state = text(value).toUpperCase();
  if (state === 'ENVIADO' || state === 'PENDIENTE_SYNC' || state === 'RESPALDADO') {
    return 'PENDIENTE_REVISION';
  }
  return state;
}

function effectiveState(envio, resolucion) {
  const resolutionState = normalizeState(flexible(resolucion || {}, [
    'estadoFinal', 'Estado final', 'estadoResolucion', 'estado'
  ]));
  if (resolutionState) return { estado: resolutionState, origen: 'RESOLUCIONES' };

  const envioState = normalizeState(flexible(envio || {}, [
    'estado', 'estadoFinal', 'estadoProceso', 'estadoGoogleSheets'
  ])) || 'PENDIENTE_REVISION';
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
      Las tres fuentes comienzan al mismo tiempo. La decisión final se toma
      después, con la jerarquía Resoluciones > Envíos > Requisitos.
    */
    const [academicResult, envioResult, resolutionResult] = await Promise.allSettled([
      lookupStudent(env, cedula, requestedPeriod),
      queryTitlesCompatible(env, 'CONSULTAR_ENVIO_BASE_CEDULA', 'CONSULTAR_ENVIO_CEDULA', cedula),
      queryTitlesCompatible(env, 'CONSULTAR_RESOLUCION_CEDULA', 'CONSULTAR_ENVIO_CEDULA', cedula)
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

    const titleSources = [envioResult.value, resolutionResult.value];
    let envio = selectRecord(titleSources, looksLikeEnvio, cedula, academicPeriod, 'envio');
    let resolucion = selectRecord(titleSources, looksLikeResolution, cedula, academicPeriod, 'resolution');
    let consultaPeriodoReforzada = false;

    /*
      La consulta inicial es paralela y solo usa cédula. Si el Apps Script
      necesita también el período o hay varios períodos, se refuerzan únicamente
      las fuentes faltantes, sin repetir Requisitos.
    */
    if (academicPeriod && (!envio || !resolucion)) {
      consultaPeriodoReforzada = true;
      const [envioPorPeriodo, resolucionPorPeriodo] = await Promise.allSettled([
        !envio
          ? queryTitlesCompatible(env, 'CONSULTAR_ENVIO_BASE_CEDULA', 'CONSULTAR_ENVIO_CEDULA', cedula, academicPeriod)
          : Promise.resolve(null),
        !resolucion
          ? queryTitlesCompatible(env, 'CONSULTAR_RESOLUCION_CEDULA', 'CONSULTAR_ENVIO_CEDULA', cedula, academicPeriod)
          : Promise.resolve(null)
      ]);

      if (envioPorPeriodo.status === 'rejected' || resolucionPorPeriodo.status === 'rejected') {
        const failures = [
          sourceError(envioPorPeriodo, 'ENVIOS'),
          sourceError(resolucionPorPeriodo, 'RESOLUCIONES')
        ].filter(Boolean);
        return jsonReply(request, {
          ok: false,
          consultaCompleta: false,
          fuentesFallidas: failures,
          mensaje: 'No pudimos confirmar el envío y la resolución del período académico. Intenta nuevamente.',
          duracionMs: Date.now() - startedAt
        }, 502);
      }

      if (envioPorPeriodo.value) titleSources.push(envioPorPeriodo.value);
      if (resolucionPorPeriodo.value) titleSources.push(resolucionPorPeriodo.value);

      envio = selectRecord(titleSources, looksLikeEnvio, cedula, academicPeriod, 'envio');
      resolucion = selectRecord(titleSources, looksLikeResolution, cedula, academicPeriod, 'resolution');
    }

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
      consultaPeriodoReforzada,
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
