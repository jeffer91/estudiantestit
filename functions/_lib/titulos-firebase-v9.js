/* Compatibilidad de tipo de trabajo para clientes de Coordinadores y estudiante.
 * Los registros históricos pueden no tener `tipoTrabajo` persistido.
 * El backend ya sabe inferirlos; esta capa hace explícito ese resultado en la
 * respuesta para que los frontends no vuelvan a clasificarlos como artículos.
 */
import {
  executeTitulosAction as executePrevious,
  publicTitleConfiguration
} from './titulos-firebase-v8.js';
import { text } from './firestore-fixed.js';
import {
  TIPO_TRABAJO_TITULACION,
  esTrabajoTitulacion
} from './trabajo-titulacion-unificado.js';

const TIPO_ARTICULO = 'ARTICULO_ACADEMICO';

function tipoExplicito(row) {
  const value = text(row && row.tipoTrabajo).toUpperCase();
  if (value === TIPO_TRABAJO_TITULACION || value === TIPO_ARTICULO) return value;
  return '';
}

function decorarRegistro(row) {
  if (!row || typeof row !== 'object' || Array.isArray(row)) return row;
  const explicit = tipoExplicito(row);
  const tipo = explicit || (esTrabajoTitulacion(row) ? TIPO_TRABAJO_TITULACION : TIPO_ARTICULO);
  return {
    ...row,
    tipoTrabajo: tipo,
    tipoTrabajoLabel: tipo === TIPO_TRABAJO_TITULACION
      ? 'Trabajo de Titulación'
      : 'Artículo académico'
  };
}

function decorarResultado(result) {
  if (!result || typeof result !== 'object') return result;
  const output = { ...result };

  for (const field of ['envio', 'registro']) {
    if (output[field] && typeof output[field] === 'object') {
      output[field] = decorarRegistro(output[field]);
    }
  }

  for (const field of ['envios', 'registros', 'filas', 'rows', 'items']) {
    if (Array.isArray(output[field])) {
      output[field] = output[field].map(decorarRegistro);
    }
  }

  return output;
}

export async function executeTitulosAction(action, payload = {}, userRole = 'student', env) {
  const result = await executePrevious(action, payload, userRole, env);
  return decorarResultado(result);
}

export { publicTitleConfiguration };
