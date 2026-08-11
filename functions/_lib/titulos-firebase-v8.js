/* Corrige la consulta pública para que el estado efectivo provenga del envío
   actual en Firebase Títulos y no de un valor superior desactualizado. */
import {
  executeTitulosAction as executePrevious,
  publicTitleConfiguration
} from './titulos-firebase-v7.js';
import { text } from './firestore-fixed.js';

const CONSULT_ACTIONS = new Set([
  'CONSULTAR_ENVIO_BASE_CEDULA',
  'CONSULTAR_ENVIO_CEDULA',
  'VERIFICAR_ENVIO'
]);

function normalizeStatus(value) {
  const normalized = text(value).toUpperCase().replace(/[^A-Z0-9]+/g, '_');
  if (!normalized) return '';
  if (normalized.includes('DEVUEL')) return 'DEVUELTO';
  if (normalized.includes('REEMPLAZ')) return 'REEMPLAZADO';
  if (normalized.includes('APROBAD')) return 'APROBADO';
  if (normalized.includes('PENDIENT') || normalized === 'ENVIADO') return 'PENDIENTE_REVISION';
  return normalized;
}

function synchronizeStudentState(result) {
  if (!result || typeof result !== 'object') return result;
  const current = result.envio || result.registro;
  if (!current || typeof current !== 'object') return result;

  const state = normalizeStatus(
    current.estado || current.estadoFinal || current.estadoProceso ||
    result.estadoEfectivo || result.estadoEnvio || result.estado || result.estadoFinal
  );
  if (!state) return result;

  const envio = {
    ...current,
    estado: state,
    estadoFinal: state,
    estadoProceso: state,
    permitirReenvio: state === 'DEVUELTO'
  };

  return {
    ...result,
    existe: true,
    encontrado: true,
    encontradoEnvio: true,
    tieneEnvio: state !== 'DEVUELTO',
    permiteReenvio: state === 'DEVUELTO',
    estado: state,
    estadoFinal: state,
    estadoEnvio: state,
    estadoEfectivo: state,
    envio,
    registro: envio,
    mensaje: state === 'DEVUELTO'
      ? 'El registro fue devuelto y puede corregirse.'
      : result.mensaje
  };
}

export async function executeTitulosAction(action, payload = {}, userRole = 'student', env) {
  const normalized = text(action).toUpperCase();
  const role = text(userRole || 'student').toLowerCase();
  const result = await executePrevious(action, payload, userRole, env);

  if (role === 'student' && CONSULT_ACTIONS.has(normalized)) {
    return synchronizeStudentState(result);
  }
  return result;
}

export { publicTitleConfiguration };
