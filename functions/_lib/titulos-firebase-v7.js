/*
  Historial de revisiones para Coordinadores.
  Mantiene la implementación anterior y agrega la última resolución histórica
  a los envíos reenviados, sin alterar lo que ve la aplicación de Estudiantes.
*/
import {
  executeTitulosAction as executePrevious,
  publicTitleConfiguration
} from './titulos-firebase-v7-core.js';
import {
  listCollection,
  queryEqual,
  text
} from './firestore-fixed.js';

const LIST_ACTIONS = new Set([
  'LISTAR_ENVIOS_COORDINADOR',
  'LISTAR_ENVIOS_POR_CARRERA'
]);
const CONSULT_ACTIONS = new Set([
  'CONSULTAR_ENVIO_BASE_CEDULA',
  'CONSULTAR_ENVIO_CEDULA',
  'VERIFICAR_ENVIO'
]);
const WRITE_ACTIONS = new Set([
  'ENVIO_ESTUDIANTE',
  'APROBAR_ENVIO_COORDINADOR',
  'DEVOLVER_ENVIO_COORDINADOR',
  'GUARDAR_REVISION_COORDINADOR',
  'GUARDAR_RESOLUCION',
  'MOVER_DEVUELTO_COORDINADOR',
  'ADMIN_DEVOLVER_TITULOS',
  'ADMIN_ELIMINAR_TITULOS'
]);

const HISTORY_CACHE_MS = 30 * 1000;
let historyCache = null;
let historyCacheExpiresAt = 0;
let historyPending = null;

function normalizeStatus(value) {
  const normalized = text(value).toUpperCase().replace(/[^A-Z0-9]+/g, '_');
  if (normalized.includes('DEVUEL')) return 'DEVUELTO';
  if (normalized.includes('REEMPLAZ')) return 'REEMPLAZADO';
  if (normalized.includes('APROBAD')) return 'APROBADO';
  if (normalized.includes('PENDIENT')) return 'PENDIENTE_REVISION';
  return normalized;
}

function envioId(value) {
  value = value || {};
  return text(value.envioId || value.id || value.idRegistro || value._id || value._docId);
}

function resolutionEnvioId(value) {
  value = value || {};
  return text(value.envioId || value.idEnvio || value.registroId);
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
    envioId: resolutionEnvioId(value),
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

function clearHistoryCache() {
  historyCache = null;
  historyCacheExpiresAt = 0;
  historyPending = null;
}

async function historyMap(env) {
  if (historyCache && historyCacheExpiresAt > Date.now()) return historyCache;
  if (historyPending) return historyPending;

  historyPending = listCollection('TITULOS', 'resoluciones', { maxDocuments: 20000 }, env)
    .then((rows) => {
      const map = new Map();
      for (const row of Array.isArray(rows) ? rows : []) {
        const id = resolutionEnvioId(row);
        if (!id) continue;
        const current = map.get(id);
        if (isLaterResolution(row, current)) map.set(id, row);
      }
      historyCache = map;
      historyCacheExpiresAt = Date.now() + HISTORY_CACHE_MS;
      return map;
    })
    .finally(() => {
      historyPending = null;
    });

  return historyPending;
}

function decorateEnvio(value, resolution) {
  if (!value || typeof value !== 'object' || !resolution) return value;
  const status = normalizeStatus(value.estado || value.estadoFinal || value.estadoProceso);

  /* La revisión histórica se presenta únicamente cuando el estudiante ya
     reenvió y el registro volvió a PENDIENTE_REVISION. */
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

function firstArray(result) {
  if (!result || typeof result !== 'object') return [];
  for (const key of ['envios', 'registros', 'filas', 'estudiantes']) {
    if (Array.isArray(result[key])) return result[key];
  }
  return [];
}

function decorateListResult(result, map) {
  if (!result || typeof result !== 'object') return result;
  const source = firstArray(result);
  if (!source.length) return result;
  const decorated = source.map((item) => decorateEnvio(item, map.get(envioId(item))));
  return {
    ...result,
    envios: decorated,
    registros: decorated,
    filas: decorated,
    ...(Array.isArray(result.estudiantes) ? { estudiantes: decorated } : {}),
    historialRevisionesIncluido: true
  };
}

async function latestResolutionForEnvio(value, env) {
  const id = envioId(value);
  if (!id) return null;
  const rows = await queryEqual('TITULOS', 'resoluciones', 'envioId', id, 1000, env);
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

  if (WRITE_ACTIONS.has(normalized)) clearHistoryCache();
  if (role === 'student') return result;

  if (LIST_ACTIONS.has(normalized)) {
    return decorateListResult(result, await historyMap(env));
  }
  if (CONSULT_ACTIONS.has(normalized)) {
    return decorateConsultResult(result, env);
  }
  return result;
}

export { publicTitleConfiguration };
