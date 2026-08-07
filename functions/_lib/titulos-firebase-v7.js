/* Historial bajo demanda y recuperación robusta por carrera para Coordinadores. */
import {
  executeTitulosAction as executePrevious,
  publicTitleConfiguration
} from './titulos-firebase-v7-core.js';
import {
  getDocument,
  listCollection,
  normalizeCedula,
  queryEqual,
  setDocument,
  text
} from './firestore-fixed.js';
import {
  TIPO_TRABAJO_TITULACION,
  coincidePeriodoTrabajo,
  esTrabajoTitulacion
} from './trabajo-titulacion-unificado.js';

const CONSULT_ACTIONS = new Set([
  'CONSULTAR_ENVIO_BASE_CEDULA',
  'CONSULTAR_ENVIO_CEDULA',
  'VERIFICAR_ENVIO'
]);
const LIST_ACTIONS = new Set([
  'LISTAR_ENVIOS_COORDINADOR',
  'LISTAR_ENVIOS_POR_CARRERA'
]);
const STOPWORDS_CARRERA = new Set([
  'EN', 'DE', 'DEL', 'LA', 'EL', 'Y', 'ONLINE', 'LINEA',
  'TECNOLOGIA', 'TECNOLOGO', 'SUPERIOR', 'UNIVERSITARIA', 'UNIVERSITARIO', 'TSU'
]);

function normalizeStatus(value) {
  const normalized = text(value).toUpperCase().replace(/[^A-Z0-9]+/g, '_');
  if (normalized.includes('NO_ENVIADO')) return 'NO_ENVIADO';
  if (normalized.includes('DEVUEL')) return 'DEVUELTO';
  if (normalized.includes('REEMPLAZ')) return 'REEMPLAZADO';
  if (normalized.includes('APROBAD')) return 'APROBADO';
  if (normalized.includes('PENDIENT')) return 'PENDIENTE_REVISION';
  return normalized;
}

function normalizeCareer(value) {
  return text(value).toUpperCase().normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function careerKey(value) {
  return normalizeCareer(value).toLowerCase().replace(/\s+/g, '_');
}

function splitList(value) {
  if (Array.isArray(value)) return value.map(text).filter(Boolean);
  return text(value).split(/[,;|\n]+/).map(text).filter(Boolean);
}

function careerTokens(value) {
  return normalizeCareer(value).split(' ')
    .filter((token) => token.length >= 3 && !STOPWORDS_CARRERA.has(token));
}

function careerEquivalent(left, right) {
  const a = normalizeCareer(left);
  const b = normalizeCareer(right);
  if (!a || !b) return false;
  if (a === b || a.includes(b) || b.includes(a)) return true;

  const tokensA = careerTokens(a);
  const tokensB = careerTokens(b);
  if (!tokensA.length || !tokensB.length) return false;
  const common = tokensA.filter((token) => tokensB.includes(token));
  const base = Math.min(tokensA.length, tokensB.length);
  return common.length >= 2 && common.length / base >= 0.7;
}

function rowCareerValues(row) {
  row = row || {};
  return [
    row.carreraClave,
    row.carreraNombre,
    row.nombreCarrera,
    row.carrera,
    row.carreraId,
    row.carreraCodigo,
    row.codigoCarrera
  ].map(text).filter(Boolean);
}

function rowMatchesCareer(row, filters) {
  if (!filters.length) return true;
  const values = rowCareerValues(row);
  return filters.some((filter) => values.some((value) => careerEquivalent(value, filter)));
}

function rowHasTitles(row) {
  return Boolean(row && (text(row.titulo1) || text(row.titulo2) || text(row.titulo3)));
}

function rowType(row) {
  return esTrabajoTitulacion(row) ? TIPO_TRABAJO_TITULACION : 'ARTICULO_ACADEMICO';
}

function rowId(row, index = 0) {
  row = row || {};
  return text(row.id || row._id || row._docId || row.envioId || row.idRegistro) || [
    text(row.periodoId || row.periodoLabel || row.periodo),
    normalizeCedula(row.cedula || row.numeroIdentificacion),
    rowType(row),
    String(index)
  ].join('__');
}

function extractRows(result) {
  if (!result || typeof result !== 'object') return [];
  const variants = [result.envios, result.registros, result.filas, result.rows, result.items];
  return variants.find(Array.isArray) || [];
}

function mergeRows(...groups) {
  const map = new Map();
  groups.flat().forEach((row, index) => {
    if (!row || typeof row !== 'object') return;
    const key = rowId(row, index);
    if (!map.has(key)) map.set(key, row);
    else map.set(key, { ...map.get(key), ...row });
  });
  return [...map.values()];
}

function requestedCareers(payload) {
  return splitList(payload.carreras || payload.carrera || payload.nombreCarrera);
}

function rowMatchesPayload(row, payload, careers = requestedCareers(payload)) {
  if (!rowMatchesCareer(row, careers)) return false;
  if (!rowHasTitles(row)) return false;

  const periods = [payload.periodoId, payload.periodoLabel, payload.periodo]
    .map(text).filter(Boolean);
  if (periods.length && !coincidePeriodoTrabajo(row, periods)) return false;

  const status = text(payload.estado) ? normalizeStatus(payload.estado) : '';
  if (status && normalizeStatus(row.estado || row.estadoFinal) !== status) return false;

  const type = text(payload.tipoTrabajo).toUpperCase();
  if (type && rowType(row) !== type) return false;
  return true;
}

function sortRows(rows) {
  return rows.slice().sort((left, right) => {
    const a = Date.parse(
      left.fechaResolucion || left.fechaEnvio || left.actualizadoEn || left._updateTime || ''
    ) || 0;
    const b = Date.parse(
      right.fechaResolucion || right.fechaEnvio || right.actualizadoEn || right._updateTime || ''
    ) || 0;
    return b - a;
  });
}

async function queryRowsByCareerKey(careers, env) {
  const map = new Map();
  const keys = [...new Set(careers.map(careerKey).filter(Boolean))];
  for (const key of keys) {
    const rows = await queryEqual('TITULOS', 'envios', 'carreraClave', key, 1000, env);
    rows.forEach((row, index) => map.set(rowId(row, index), row));
  }
  return [...map.values()];
}

async function backfillCareerKeys(rows, env) {
  const pending = [];
  const seen = new Set();
  for (const row of rows) {
    const id = rowId(row);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const name = text(row.carreraNombre || row.nombreCarrera || row.carrera);
    const key = careerKey(name || row.carreraCodigo || row.codigoCarrera || row.carreraId);
    if (!key || text(row.carreraClave) === key) continue;
    pending.push({ id, key });
    if (pending.length >= 200) break;
  }

  for (let index = 0; index < pending.length; index += 10) {
    const batch = pending.slice(index, index + 10);
    await Promise.allSettled(batch.map((item) => setDocument(
      'TITULOS',
      'envios',
      item.id,
      { carreraClave: item.key },
      { merge: true },
      env
    )));
  }
}

async function recoverCareerList(result, payload, env) {
  const careers = requestedCareers(payload);
  if (!careers.length) return result;

  const exactRows = extractRows(result);
  const keyedRows = await queryRowsByCareerKey(careers, env);
  let combined = mergeRows(exactRows, keyedRows)
    .filter((row) => rowMatchesPayload(row, payload, careers));

  const missing = careers.filter(
    (career) => !combined.some((row) => rowMatchesCareer(row, [career]))
  );

  let compatibilityRows = [];
  if (missing.length) {
    const allRows = await listCollection('TITULOS', 'envios', { maxDocuments: 5000 }, env);
    compatibilityRows = allRows.filter(
      (row) => rowMatchesPayload(row, { ...payload, carreras: missing }, missing)
    );
    combined = mergeRows(combined, compatibilityRows)
      .filter((row) => rowMatchesPayload(row, payload, careers));
  }

  combined = sortRows(combined);
  await backfillCareerKeys(combined, env);

  return {
    ...(result || {}),
    ok: result && result.ok === false ? false : true,
    envios: combined,
    registros: combined,
    filas: combined,
    total: combined.length,
    consultaFiltrada: true,
    consultaCarreraNormalizada: true,
    recuperadosPorClave: keyedRows.length,
    recuperadosCompatibilidad: compatibilityRows.length,
    carrerasSinCoincidenciaExacta: missing
  };
}

async function ensureSubmissionCareerKey(result, env) {
  const id = text(result && (
    result.envioId || result.idRegistro || result.tituloId || result.id
  ));
  if (!id) return;

  try {
    const row = await getDocument('TITULOS', 'envios', id, env);
    if (!row) return;
    const name = text(row.carreraNombre || row.nombreCarrera || row.carrera);
    const key = careerKey(name || row.carreraCodigo || row.codigoCarrera || row.carreraId);
    if (!key || text(row.carreraClave) === key) return;
    await setDocument(
      'TITULOS',
      'envios',
      id,
      { carreraClave: key },
      { merge: true },
      env
    );
  } catch (_error) {
    /* El envío ya quedó guardado; la compatibilidad de lectura cubre este caso. */
  }
}

function envioId(value) {
  value = value || {};
  return text(value.envioId || value.id || value.idRegistro || value._id || value._docId);
}

function resolutionDate(value) {
  value = value || {};
  return Date.parse(value.fechaResolucion || value.actualizadoEn || value._updateTime || '') || 0;
}

function isLaterResolution(candidate, current) {
  if (!current) return true;
  const candidateNumber = Number(candidate.numeroResolucion || 0);
  const currentNumber = Number(current.numeroResolucion || 0);
  if (candidateNumber !== currentNumber) return candidateNumber > currentNumber;
  return resolutionDate(candidate) > resolutionDate(current);
}

function publicPreviousResolution(value) {
  value = value || {};
  const observation = text(
    value.observacion || value.comentarioCoordinador || value.comentario || value.motivo
  );
  return {
    id: text(value.id || value._id || value._docId),
    envioId: text(value.envioId || value.idEnvio || value.registroId),
    numeroResolucion: Number(value.numeroResolucion || 0),
    estado: normalizeStatus(value.estado || value.estadoFinal),
    coordinador: text(value.coordinador || value.nombreCoordinador),
    observacion: observation,
    comentarioCoordinador: observation,
    fechaResolucion: text(value.fechaResolucion || value.actualizadoEn || value._updateTime),
    tituloElegido: text(value.tituloElegido),
    tituloCorregido: text(value.tituloCorregido || value.tituloFinal)
  };
}

function decorateEnvio(value, resolution) {
  if (!value || typeof value !== 'object' || !resolution) return value;
  const status = normalizeStatus(value.estado || value.estadoFinal || value.estadoProceso);

  /* Solo se muestra como revisión anterior cuando el estudiante ya reenvió y
     el documento volvió a PENDIENTE_REVISION. */
  if (status !== 'PENDIENTE_REVISION') return value;

  const previous = publicPreviousResolution(resolution);
  if (!previous.observacion && !previous.coordinador && !previous.fechaResolucion) return value;

  return {
    ...value,
    revisionAnterior: previous,
    comentarioRevisionAnterior: previous.observacion,
    coordinadorRevisionAnterior: previous.coordinador,
    fechaRevisionAnterior: previous.fechaResolucion,
    estadoRevisionAnterior: previous.estado,
    numeroRevisionAnterior: previous.numeroResolucion
  };
}

async function latestResolutionForEnvio(value, env) {
  const id = envioId(value);
  if (!id) return null;
  const rows = await queryEqual('TITULOS', 'resoluciones', 'envioId', id, 50, env);
  return (Array.isArray(rows) ? rows : []).reduce(
    (latest, item) => isLaterResolution(item, latest) ? item : latest,
    null
  );
}

async function decorateConsultResult(result, env) {
  if (!result || typeof result !== 'object') return result;
  const current = result.envio || result.registro;
  if (!current) return result;
  const resolution = await latestResolutionForEnvio(current, env);
  if (!resolution) return result;
  const decorated = decorateEnvio(current, resolution);
  return {
    ...result,
    envio: decorated,
    registro: decorated,
    revisionAnterior: decorated.revisionAnterior || null
  };
}

export async function executeTitulosAction(action, payload = {}, userRole = 'student', env) {
  const normalized = text(action).toUpperCase();
  const role = text(userRole || 'student').toLowerCase();
  const result = await executePrevious(action, payload, userRole, env);

  if (LIST_ACTIONS.has(normalized)) {
    return recoverCareerList(result, payload, env);
  }

  if (normalized === 'ENVIO_ESTUDIANTE' && result && result.ok !== false) {
    await ensureSubmissionCareerKey(result, env);
  }

  /* Las listas ya no leen la colección completa de resoluciones. El historial
     se consulta únicamente al abrir un envío específico. */
  if (role !== 'student' && CONSULT_ACTIONS.has(normalized)) {
    return decorateConsultResult(result, env);
  }
  return result;
}

export { publicTitleConfiguration };
