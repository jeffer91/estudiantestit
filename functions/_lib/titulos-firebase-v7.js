/* Historial de revisiones bajo demanda para Coordinadores. */
import {
  executeTitulosAction as executePrevious,
  publicTitleConfiguration
} from './titulos-firebase-v7-core.js';
import { queryEqual, text } from './firestore-fixed.js';

const CONSULT_ACTIONS = new Set([
  'CONSULTAR_ENVIO_BASE_CEDULA',
  'CONSULTAR_ENVIO_CEDULA',
  'VERIFICAR_ENVIO'
]);

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

  /* Las listas ya no leen la colección completa de resoluciones. El historial
     se consulta únicamente al abrir un envío específico. */
  if (role !== 'student' && CONSULT_ACTIONS.has(normalized)) {
    return decorateConsultResult(result, env);
  }
  return result;
}

export { publicTitleConfiguration };
