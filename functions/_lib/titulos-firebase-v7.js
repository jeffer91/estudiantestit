/* Corrección de guardado de resoluciones en Firebase Títulos. */
import {
  executeTitulosAction as executePrevious,
  publicTitleConfiguration
} from './titulos-firebase-v6.js';
import {
  commitDocuments,
  normalizeCedula,
  nowIso,
  queryEqual,
  text
} from './firestore-fixed.js';

const RESOLUTION_ACTIONS = new Set([
  'APROBAR_ENVIO_COORDINADOR',
  'DEVOLVER_ENVIO_COORDINADOR',
  'GUARDAR_REVISION_COORDINADOR',
  'GUARDAR_RESOLUCION',
  'MOVER_DEVUELTO_COORDINADOR',
  'ADMIN_DEVOLVER_TITULOS'
]);
const RESOLUTION_STATES = new Set(['APROBADO', 'REEMPLAZADO', 'DEVUELTO']);

function normalizeStatus(value, fallback = 'APROBADO') {
  const normalized = text(value).toUpperCase().replace(/[^A-Z0-9]+/g, '_');
  if (!normalized) return fallback;
  if (normalized.includes('DEVUEL')) return 'DEVUELTO';
  if (normalized.includes('REEMPLAZ')) return 'REEMPLAZADO';
  if (normalized.includes('APROBAD')) return 'APROBADO';
  return normalized;
}

function cleanTitle(value) {
  let output = text(value).replace(/\s+/g, ' ');
  while (
    output.length >= 2 &&
    ((output.startsWith('"') && output.endsWith('"')) ||
      (output.startsWith("'") && output.endsWith("'")))
  ) output = output.slice(1, -1).trim();
  return output;
}

function coordinatorName(value, fallback) {
  if (typeof value === 'string') return text(value);
  const item = value && typeof value === 'object' ? value : {};
  return text(item.nombre || item.coordinador || item.name || item.id || fallback);
}

function uniqueEventId(prefix) {
  const random = typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID().replace(/-/g, '').slice(0, 12)
    : Math.random().toString(36).slice(2, 14);
  return `${prefix}__${Date.now()}__${random}`;
}

async function currentEnvio(payload, env) {
  const cedula = normalizeCedula(payload.cedula || payload.numeroIdentificacion);
  const result = await executePrevious('VERIFICAR_ENVIO', {
    cedula,
    numeroIdentificacion: cedula,
    periodoId: payload.periodoId,
    periodoLabel: payload.periodoLabel,
    periodo: payload.periodo,
    tipoTrabajo: payload.tipoTrabajo
  }, 'coordinator', env);
  return result && (result.envio || result.registro) || null;
}

async function saveResolution(payload = {}, env) {
  const cedula = normalizeCedula(payload.cedula || payload.numeroIdentificacion);
  if (!cedula) throw new Error('No se recibió una cédula válida.');

  const envio = await currentEnvio(payload, env);
  if (!envio || !text(envio.id || envio.envioId)) throw new Error('No se encontró el envío del estudiante.');

  const envioId = text(envio.id || envio.envioId);
  const status = normalizeStatus(payload.estadoFinal || payload.estado, 'APROBADO');
  if (!RESOLUTION_STATES.has(status)) throw new Error('La resolución debe ser APROBADO, REEMPLAZADO o DEVUELTO.');

  const selected = cleanTitle(payload.tituloElegido || payload.preferido || envio.titulo1);
  const corrected = cleanTitle(payload.tituloCorregido);
  const finalTitle = corrected || selected;
  const observation = text(payload.observacion || payload.comentario || payload.comentarioCoordinador);
  const coordinador = coordinatorName(payload.coordinador, payload.nombreCoordinador);

  if (!coordinador) throw new Error('No se recibió el nombre del coordinador.');
  if (status === 'DEVUELTO' && observation.length < 4) throw new Error('La devolución necesita un comentario de al menos 4 caracteres.');
  if (status !== 'DEVUELTO' && !finalTitle) throw new Error('La aprobación necesita un título final.');

  const resolutions = await queryEqual('TITULOS', 'resoluciones', 'envioId', envioId, 1000, env);
  const number = resolutions.reduce((max, item) => Math.max(max, Number(item.numeroResolucion || 0)), 0) + 1;
  const resolutionId = uniqueEventId(`${envioId}__r${String(number).padStart(3, '0')}`);
  const date = text(payload.fechaResolucion) || nowIso();

  await commitDocuments('TITULOS', [
    {
      collection: 'resoluciones',
      id: resolutionId,
      data: {
        envioId,
        tipoTrabajo: text(payload.tipoTrabajo || envio.tipoTrabajo),
        numeroResolucion: number,
        coordinador,
        estado: status,
        tituloElegido: selected,
        tituloCorregido: corrected,
        observacion: observation,
        fechaResolucion: date
      },
      merge: false,
      exists: false
    },
    {
      collection: 'envios',
      id: envioId,
      data: {
        estado: status,
        tituloFinal: status === 'DEVUELTO' ? null : finalTitle,
        observacion: observation,
        coordinador,
        fechaResolucion: date,
        resolucionActualId: resolutionId,
        requiereRevision: status === 'DEVUELTO',
        actualizadoEn: date
      },
      merge: true,
      ...(envio._updateTime ? { updateTime: envio._updateTime } : {})
    }
  ], env);

  return {
    ok: true,
    envioId,
    resolucionId: resolutionId,
    coordinador,
    estado: status,
    estadoFinal: status,
    tituloFinal: status === 'DEVUELTO' ? '' : finalTitle,
    mensaje: status === 'DEVUELTO'
      ? 'Propuestas devueltas correctamente en Firebase Títulos.'
      : 'Resolución guardada correctamente en Firebase Títulos.'
  };
}

export async function executeTitulosAction(action, payload = {}, userRole = 'student', env) {
  const normalized = text(action).toUpperCase();
  if (RESOLUTION_ACTIONS.has(normalized)) return saveResolution(payload, env);
  return executePrevious(action, payload, userRole, env);
}

export { publicTitleConfiguration };
