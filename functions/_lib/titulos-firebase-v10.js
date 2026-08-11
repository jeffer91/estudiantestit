/* Compatibilidad adicional para listados históricos de Trabajo de Titulación.
 * Algunos registros migrados solo conservan tituloFinal/tituloElegido y por eso
 * no entraban en los listados que exigían titulo1/titulo2/titulo3.
 */
import {
  executeTitulosAction as executePrevious,
  publicTitleConfiguration
} from './titulos-firebase-v9.js';
import { queryEqual, text } from './firestore-fixed.js';
import {
  TIPO_TRABAJO_TITULACION,
  coincidePeriodoTrabajo,
  esTrabajoTitulacion
} from './trabajo-titulacion-unificado.js';

const LIST_ACTIONS = new Set([
  'LISTAR_ENVIOS_COORDINADOR',
  'LISTAR_ENVIOS_POR_CARRERA'
]);

function normalize(value) {
  return text(value).toLowerCase().normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function careerKey(value) {
  return normalize(value).replace(/\s+/g, '_');
}

function splitList(value) {
  if (Array.isArray(value)) return value.map(text).filter(Boolean);
  return text(value).split(/[,;|\n]+/).map(text).filter(Boolean);
}

function rowId(row, index = 0) {
  row = row || {};
  return text(row.id || row._id || row._docId || row.envioId || row.idRegistro) ||
    [text(row.periodoId), text(row.cedula || row.numeroIdentificacion), String(index)].join('__');
}

function normalizeStatus(value) {
  const status = text(value).toUpperCase().replace(/[^A-Z0-9]+/g, '_');
  if (status.includes('DEVUEL')) return 'DEVUELTO';
  if (status.includes('REEMPLAZ')) return 'REEMPLAZADO';
  if (status.includes('APROBAD')) return 'APROBADO';
  if (status.includes('PENDIENT') || status === 'ENVIADO') return 'PENDIENTE_REVISION';
  return status;
}

function hasAnyTitle(row) {
  row = row || {};
  return Boolean(
    text(row.titulo1) || text(row.titulo2) || text(row.titulo3) ||
    text(row.tituloFinal) || text(row.tituloElegido) ||
    text(row.tituloAprobado) || text(row.tituloCorregido) ||
    (Array.isArray(row.propuestasDetalle) && row.propuestasDetalle.length) ||
    (Array.isArray(row.propuestas) && row.propuestas.length)
  );
}

function rowCareerValues(row) {
  row = row || {};
  return [
    row.carreraNombre, row.nombreCarrera, row.carrera,
    row.carreraClave, row.carreraId, row.carreraCodigo, row.codigoCarrera
  ].map(normalize).filter(Boolean);
}

function matchesCareer(row, careers) {
  if (!careers.length) return true;
  const values = rowCareerValues(row);
  return careers.some((career) => {
    const requested = normalize(career);
    const requestedKey = normalize(careerKey(career));
    return values.some((value) => value === requested || value === requestedKey);
  });
}

function requestedPeriods(payload) {
  return [payload.periodoId, payload.periodoLabel, payload.periodo]
    .flatMap((value) => Array.isArray(value) ? value : [value])
    .map(text)
    .filter(Boolean);
}

function decorate(row) {
  if (!row || typeof row !== 'object') return row;
  return {
    ...row,
    tipoTrabajo: TIPO_TRABAJO_TITULACION,
    tipoTrabajoLabel: 'Trabajo de Titulación'
  };
}

function extractRows(result) {
  if (!result || typeof result !== 'object') return [];
  for (const field of ['envios', 'registros', 'filas', 'rows', 'items']) {
    if (Array.isArray(result[field])) return result[field];
  }
  return [];
}

function mergeRows(...groups) {
  const map = new Map();
  groups.flat().forEach((row, index) => {
    if (!row || typeof row !== 'object') return;
    const key = rowId(row, index);
    map.set(key, map.has(key) ? { ...map.get(key), ...row } : row);
  });
  return [...map.values()];
}

async function historicalWorkRows(payload, env) {
  const careers = splitList(payload.carreras || payload.carrera || payload.nombreCarrera);
  if (!careers.length) return [];

  const queries = [];
  for (const career of careers) {
    const key = careerKey(career);
    for (const field of ['carreraNombre', 'nombreCarrera', 'carrera']) {
      queries.push(queryEqual('TITULOS', 'envios', field, career, 1000, env));
    }
    if (key) queries.push(queryEqual('TITULOS', 'envios', 'carreraClave', key, 1000, env));
  }

  const settled = await Promise.allSettled(queries);
  const map = new Map();
  settled.forEach((result) => {
    if (result.status !== 'fulfilled') return;
    result.value.forEach((row, index) => map.set(rowId(row, index), row));
  });

  const periods = requestedPeriods(payload);
  const requestedState = normalizeStatus(payload.estado);

  return [...map.values()].filter((row) => {
    if (!esTrabajoTitulacion(row) || !hasAnyTitle(row)) return false;
    if (!matchesCareer(row, careers)) return false;
    if (periods.length && !coincidePeriodoTrabajo(row, periods)) return false;
    if (requestedState && normalizeStatus(row.estado || row.estadoFinal) !== requestedState) return false;
    return true;
  }).map(decorate);
}

async function recoverHistoricalWorkList(result, payload, env) {
  const type = text(payload.tipoTrabajo).toUpperCase();
  if (type !== TIPO_TRABAJO_TITULACION) return result;

  const historical = await historicalWorkRows(payload, env);
  if (!historical.length) return result;

  const merged = mergeRows(extractRows(result), historical)
    .map(decorate)
    .sort((left, right) => {
      const a = Date.parse(left.fechaResolucion || left.fechaEnvio || left._updateTime || '') || 0;
      const b = Date.parse(right.fechaResolucion || right.fechaEnvio || right._updateTime || '') || 0;
      return b - a;
    });

  return {
    ...(result || {}),
    ok: result && result.ok === false ? false : true,
    envios: merged,
    registros: merged,
    filas: merged,
    total: merged.length,
    recuperacionTitulosHistoricos: true,
    recuperadosConTituloFinal: historical.length
  };
}

export async function executeTitulosAction(action, payload = {}, userRole = 'student', env) {
  const normalized = text(action).toUpperCase();
  const result = await executePrevious(action, payload, userRole, env);
  if (LIST_ACTIONS.has(normalized)) {
    return recoverHistoricalWorkList(result, payload, env);
  }
  return result;
}

export { publicTitleConfiguration };
