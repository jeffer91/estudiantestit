import { requestClaves, runService } from '../_lib/claves.js';
import { corsHeaders, jsonReply, readJson, rejectUnknownOrigin, text } from '../_lib/http.js';

const STUDENT_TIMEOUT_MS = 18000;
const TITLES_TIMEOUT_MS = 24000;
const CACHE_TTL_MS = 10 * 60 * 1000;
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

function normalizeKey(value) {
  return text(value).toLowerCase().normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
}

function normalizePeriod(value) {
  return text(value).toLowerCase().normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ').trim();
}

const MONTHS = Object.freeze({
  enero: '01', febrero: '02', marzo: '03', abril: '04', mayo: '05', junio: '06',
  julio: '07', agosto: '08', septiembre: '09', setiembre: '09', octubre: '10',
  noviembre: '11', diciembre: '12'
});

function periodSignature(value) {
  const normalized = normalizePeriod(value);
  if (!normalized) return '';
  const numeric = Array.from(normalized.matchAll(/\b(20\d{2})\s+(0?[1-9]|1[0-2])\b/g))
    .map((match) => match[1] + '-' + String(match[2]).padStart(2, '0'));
  if (numeric.length >= 2) return numeric[0] + '__' + numeric[1];
  const named = Array.from(normalized.matchAll(/\b(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)\s+(20\d{2})\b/g))
    .map((match) => match[2] + '-' + MONTHS[match[1]]);
  return named.length >= 2 ? named[0] + '__' + named[1] : '';
}

function periodEquivalent(left, right) {
  const a = normalizePeriod(left);
  const b = normalizePeriod(right);
  if (!a || !b) return false;
  if (a === b) return true;
  const signatureA = periodSignature(a);
  const signatureB = periodSignature(b);
  return Boolean(signatureA && signatureB && signatureA === signatureB);
}

function flexible(object, names) {
  if (!object || typeof object !== 'object') return undefined;
  const map = Object.keys(object).reduce((output, key) => {
    output[normalizeKey(key)] = key;
    return output;
  }, {});
  for (const name of names) {
    const key = map[normalizeKey(name)];
    if (key !== undefined && object[key] !== undefined && object[key] !== null) return object[key];
  }
  return undefined;
}

function decodeNestedJson(value, maxDepth = 8) {
  let current = value;
  for (let depth = 0; depth < maxDepth && typeof current === 'string'; depth += 1) {
    const raw = current.trim();
    if (!raw) return {};
    try { current = JSON.parse(raw); } catch (_error) { break; }
  }
  if (Array.isArray(current)) return current.map((item) => decodeNestedJson(item, maxDepth));
  if (!current || typeof current !== 'object') return current;
  return Object.fromEntries(Object.entries(current).map(([key, item]) => [key, decodeNestedJson(item, maxDepth)]));
}

function collectObjects(value, output = [], seen = new Set(), depth = 0) {
  const decoded = decodeNestedJson(value);
  if (!decoded || typeof decoded !== 'object' || depth > 12 || seen.has(decoded)) return output;
  seen.add(decoded);
  if (!Array.isArray(decoded)) output.push(decoded);
  (Array.isArray(decoded) ? decoded : Object.values(decoded))
    .forEach((item) => collectObjects(item, output, seen, depth + 1));
  return output;
}

function sameCedula(item, cedula) {
  const value = rawCedula(flexible(item || {}, [
    'cedula', 'numeroIdentificacion', 'NumeroIdentificacion', 'identificacion', 'Cédula'
  ]));
  const canonical = normalizeCedula(cedula);
  return Boolean(value && canonical && (value === canonical || value === canonical.replace(/^0/, '')));
}

function recordPeriod(item) {
  return text(flexible(item || {}, ['periodoLabel', 'periodo', 'Periodo', 'periodoId', 'periodId']));
}

function looksLikeEnvio(item) {
  return Boolean(item && typeof item === 'object' && flexible(item, [
    'titulo1', 'titulo2', 'titulo3', 'propuestas', 'propuestasEnviadas',
    'fechaEnvio', 'telegram', 'usuarioTelegram'
  ]));
}

function looksLikeResolution(item) {
  if (!item || typeof item !== 'object') return false;
  const state = flexible(item, ['estadoFinal', 'Estado final', 'estadoResolucion']);
  const evidence = flexible(item, [
    'resolucionId', 'fechaResolucion', 'Fecha resolución', 'coordinador',
    'comentarioCoordinador', 'observacion', 'Observación', 'comentario',
    'tituloCorregido', 'tituloElegido', 'Título elegido'
  ]);
  return Boolean(state && evidence);
}

function timestamp(item, kind) {
  const names = kind === 'resolution'
    ? ['fechaResolucion', 'Fecha resolución', 'fechaRevision', 'fechaServidor', 'updatedAt']
    : ['fechaEnvio', 'fechaServidor', 'updatedAt'];
  const parsed = Date.parse(text(flexible(item || {}, names)));
  if (Number.isFinite(parsed)) return parsed;
  const match = text(flexible(item || {}, ['resolucionId', 'idRegistro', 'id'])).match(/(\d{10,})$/);
  return match ? Number(match[1]) : Number(flexible(item || {}, ['fila']) || 0);
}

function selectRecord(result, predicate, cedula, academicPeriod, kind) {
  let list = collectObjects(result).filter(predicate);
  if (!list.length) return null;
  const identifiable = list.filter((item) => rawCedula(flexible(item || {}, [
    'cedula', 'numeroIdentificacion', 'NumeroIdentificacion', 'identificacion', 'Cédula'
  ])));
  if (identifiable.length) {
    list = identifiable.filter((item) => sameCedula(item, cedula));
    if (!list.length) return null;
  }
  if (normalizePeriod(academicPeriod)) {
    const exact = list.filter((item) => periodEquivalent(recordPeriod(item), academicPeriod));
    if (exact.length) list = exact;
    else {
      const withoutPeriod = list.filter((item) => !normalizePeriod(recordPeriod(item)));
      if (withoutPeriod.length === 1 && list.length === 1) return withoutPeriod[0];
      return null;
    }
  }
  return list.slice().sort((a, b) => timestamp(b, kind) - timestamp(a, kind))[0] || null;
}

function normalizeState(value) {
  const state = text(value).toUpperCase();
  return ['ENVIADO', 'PENDIENTE_SYNC', 'RESPALDADO'].includes(state) ? 'PENDIENTE_REVISION' : state;
}

function effectiveState(envio, resolucion) {
  const resolutionState = normalizeState(flexible(resolucion || {}, [
    'estadoFinal', 'Estado final', 'estadoResolucion', 'estado'
  ]));
  if (resolutionState) return { estado: resolutionState, origen: 'RESOLUCIONES' };
  if (envio) {
    return {
      estado: normalizeState(flexible(envio, ['estado', 'estadoFinal', 'estadoProceso', 'estadoGoogleSheets'])) || 'PENDIENTE_REVISION',
      origen: 'ENVIOS'
    };
  }
  return { estado: 'SIN_ENVIO', origen: 'REQUISITOS' };
}

function findAcademicEnvelope(result, cedula) {
  const objects = collectObjects(result);
  return objects.find((item) => {
    const student = item && (item.estudiante || item.registro);
    return student && typeof student === 'object' && sameCedula(student, cedula);
  }) || objects.find((item) => sameCedula(item, cedula) && Boolean(flexible(item, [
    'Nombres', 'nombres', 'nombreCompleto', 'NombreCarrera', 'nombreCarrera', 'carrera'
  ]))) || null;
}

function cacheKey(cedula, period) { return cedula + '|' + text(period); }

function getCache(key) {
  const item = studentCache.get(key);
  if (!item) return null;
  if (item.expiresAt <= Date.now()) { studentCache.delete(key); return null; }
  return item.value;
}

function setCache(key, value, cedula) {
  while (studentCache.size >= CACHE_LIMIT) studentCache.delete(studentCache.keys().next().value);
  const ttl = findAcademicEnvelope(value, cedula) ? CACHE_TTL_MS : NOT_FOUND_TTL_MS;
  studentCache.set(key, { value, expiresAt: Date.now() + ttl });
  return value;
}

async function lookupStudent(env, cedula, requestedPeriod) {
  const key = cacheKey(cedula, requestedPeriod);
  const cached = getCache(key);
  if (cached) return cached;
  if (studentInflight.has(key)) return studentInflight.get(key);
  const task = requestClaves(env, 'CONSULTAR_ESTUDIANTE_REQUISITOS', {
    cedula,
    numeroIdentificacion: cedula,
    periodoId: requestedPeriod,
    modo: 'IDENTIDAD_RAPIDA'
  }, STUDENT_TIMEOUT_MS)
    .then(decodeNestedJson)
    .then((result) => setCache(key, result, cedula))
    .finally(() => studentInflight.delete(key));
  studentInflight.set(key, task);
  return task;
}

async function queryPublishedTitlesFlow(env, cedula, periodLabel, periodId) {
  const label = text(periodLabel || periodId);
  const id = text(periodId || periodLabel);
  const result = await runService(env, 'TITULOS', 'CONSULTAR_ENVIO_CEDULA', 'GET', {
    cedula,
    numeroIdentificacion: cedula,
    periodo: label || id,
    periodoId: id,
    periodoLabel: label,
    scope: 'all',
    incluirHistorico: true
  }, 'student', TITLES_TIMEOUT_MS);
  const decoded = decodeNestedJson(result);
  const failure = collectObjects(decoded).find((item) => item && item.ok === false);
  if (failure) throw new Error(text(failure.mensaje || failure.error) || 'La consulta de Títulos no fue completada.');
  return decoded;
}

function normalizeStudentResult(academic, cedula, requestedPeriod) {
  const decoded = decodeNestedJson(academic);
  const envelope = findAcademicEnvelope(decoded, cedula);
  if (!envelope) return { ok: true, encontrado: false, existe: false };
  const raw = envelope.estudiante || envelope.registro || envelope;
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
    periodId: periodId,
    periodoLabel: periodLabel
  };
  return { ...decoded, ...envelope, ok: true, encontrado: true, existe: true, estudiante: student, registro: student, periodoId: periodId, periodoLabel: periodLabel };
}

export const __test = Object.freeze({
  decodeNestedJson,
  looksLikeEnvio,
  looksLikeResolution,
  selectRecord,
  effectiveState,
  periodEquivalent
});

export async function onRequest({ request, env }) {
  const badOrigin = rejectUnknownOrigin(request);
  if (badOrigin) return badOrigin;
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(request) });
  if (request.method !== 'POST') return jsonReply(request, { ok: false, mensaje: 'Método no permitido.' }, 405);
  const startedAt = Date.now();
  try {
    const input = await readJson(request);
    const data = input.datos && typeof input.datos === 'object' ? { ...input, ...input.datos } : { ...input };
    const cedula = normalizeCedula(data.cedula || data.numeroIdentificacion || data.identificacion);
    const requestedPeriod = text(data.periodoId || data.periodo || data.periodoLabel);
    if (!cedula) throw new Error('No se recibió una cédula válida.');

    const [academicSettled, titlesSettled] = await Promise.allSettled([
      lookupStudent(env, cedula, requestedPeriod),
      queryPublishedTitlesFlow(env, cedula, requestedPeriod, requestedPeriod)
    ]);

    const failures = [];
    if (academicSettled.status === 'rejected') failures.push({
      fuente: 'FIREBASE_UTET',
      mensaje: text(academicSettled.reason && academicSettled.reason.message) || 'Consulta no disponible.'
    });
    if (titlesSettled.status === 'rejected') failures.push({
      fuente: 'FIREBASE_TITULOS',
      mensaje: text(titlesSettled.reason && titlesSettled.reason.message) || 'Consulta no disponible.'
    });
    if (failures.length) return jsonReply(request, {
      ok: false,
      consultaCompleta: false,
      fuentesFallidas: failures,
      mensaje: 'No fue posible verificar completamente tu registro. Intenta nuevamente.',
      duracionMs: Date.now() - startedAt
    }, 502);

    const academic = normalizeStudentResult(academicSettled.value, cedula, requestedPeriod);
    if (academic.encontrado !== true) return jsonReply(request, {
      ...academic,
      ok: true,
      consultaCompleta: true,
      consultas: { requisitos: 'ok', titulos: 'ok' },
      duracionMs: Date.now() - startedAt
    });

    const student = academic.estudiante || academic.registro;
    const academicPeriod = text(flexible(student, ['periodoLabel', 'periodoId', 'periodo']) || academic.periodoLabel || academic.periodoId || requestedPeriod);
    const titlesResult = titlesSettled.value;
    const envio = selectRecord(titlesResult, looksLikeEnvio, cedula, academicPeriod, 'envio');
    const resolucion = selectRecord(titlesResult, looksLikeResolution, cedula, academicPeriod, 'resolution');
    const decision = effectiveState(envio, resolucion);
    const permiteReenvio = decision.estado === 'DEVUELTO';
    const tieneEnvio = Boolean(envio);
    const tieneResolucion = Boolean(resolucion);
    const envioCombinado = envio ? { ...envio, ...(resolucion || {}) } : null;

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
      consultas: {
        requisitos: 'ok',
        titulos: 'ok',
        envios: tieneEnvio ? 'encontrado' : 'sin_registro',
        resoluciones: tieneResolucion ? 'encontrada' : 'sin_registro'
      },
      fuente: academic.fuente || 'FIREBASE_UTET',
      fuenteEnvio: 'FIREBASE_TITULOS',
      fuenteResolucion: 'FIREBASE_TITULOS',
      flujoTitulos: 'CONSULTAR_ENVIO_CEDULA',
      mensaje: permiteReenvio
        ? 'Tus propuestas fueron devueltas y pueden corregirse.'
        : decision.estado === 'APROBADO' || decision.estado === 'REEMPLAZADO'
          ? 'Tu tema de titulación fue aprobado por coordinación.'
          : tieneEnvio
            ? 'Tus propuestas ya fueron enviadas y están siendo revisadas.'
            : 'Estudiante encontrado. No registra envíos anteriores en este período.',
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
