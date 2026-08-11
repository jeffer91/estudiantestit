/* Compatibilidad final de Firebase Títulos para estudiantes.
 * - El estado efectivo proviene del envío actual.
 * - Los reenvíos reutilizan el envioId histórico aunque cambie el formato del período.
 * - Los títulos históricos con serialización antigua se limpian al responder.
 */
import {
  executeTitulosAction as executePrevious,
  publicTitleConfiguration
} from './titulos-firebase-v7.js';
import {
  commitDocuments,
  latestBy,
  normalizeCedula,
  nowIso,
  periodSignature,
  queryEqual,
  text
} from './firestore-fixed.js';
import { getStudentBasic } from './requisitos-firebase-fixed.js';
import {
  coincidePeriodoTrabajo,
  esTrabajoTitulacion
} from './trabajo-titulacion-unificado.js';

const CONSULT_ACTIONS = new Set([
  'CONSULTAR_ENVIO_BASE_CEDULA',
  'CONSULTAR_ENVIO_CEDULA',
  'VERIFICAR_ENVIO'
]);
const TITLE_FIELDS = [
  'titulo1', 'titulo2', 'titulo3', 'tituloFinal', 'tituloElegido',
  'tituloCorregido', 'tituloAprobado', 'tituloPreferidoTexto'
];

function normalizeStatus(value) {
  const normalized = text(value).toUpperCase().replace(/[^A-Z0-9]+/g, '_');
  if (!normalized) return '';
  if (normalized.includes('DEVUEL')) return 'DEVUELTO';
  if (normalized.includes('REEMPLAZ')) return 'REEMPLAZADO';
  if (normalized.includes('APROBAD')) return 'APROBADO';
  if (normalized.includes('PENDIENT') || normalized === 'ENVIADO') return 'PENDIENTE_REVISION';
  return normalized;
}

function cleanTitle(value) {
  let output = text(value).replace(/\s+/g, ' ');
  if (!output) return '';
  const jsonish = output.match(/^(?:["']?titulo["']?)\s*:\s*["']([\s\S]*?)["']$/i);
  if (jsonish) output = text(jsonish[1]);
  while (
    output.length >= 2 &&
    ((output.startsWith('"') && output.endsWith('"')) ||
      (output.startsWith("'") && output.endsWith("'")))
  ) output = output.slice(1, -1).trim();
  return output;
}

function sanitizeRow(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const output = { ...value };
  TITLE_FIELDS.forEach((field) => {
    if (output[field] !== undefined && output[field] !== null) output[field] = cleanTitle(output[field]);
  });
  return output;
}

function sanitizeResult(result) {
  if (!result || typeof result !== 'object') return result;
  const output = { ...result };
  ['envio', 'registro', 'resolucion'].forEach((field) => {
    if (output[field] && typeof output[field] === 'object') output[field] = sanitizeRow(output[field]);
  });
  ['envios', 'registros', 'filas'].forEach((field) => {
    if (Array.isArray(output[field])) output[field] = output[field].map(sanitizeRow);
  });
  TITLE_FIELDS.forEach((field) => {
    if (output[field] !== undefined && output[field] !== null) output[field] = cleanTitle(output[field]);
  });
  return output;
}

function synchronizeStudentState(result) {
  result = sanitizeResult(result);
  if (!result || typeof result !== 'object') return result;
  const current = result.envio || result.registro;
  if (!current || typeof current !== 'object') return result;

  const state = normalizeStatus(
    current.estado || current.estadoFinal || current.estadoProceso ||
    result.estadoEfectivo || result.estadoEnvio || result.estado || result.estadoFinal
  );
  if (!state) return result;

  const envio = {
    ...sanitizeRow(current),
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

function proposalTitle(value) {
  if (typeof value === 'string') return cleanTitle(value);
  const item = value && typeof value === 'object' ? value : {};
  return cleanTitle(item.tituloFinal || item.titulo || item.tituloMejorado || item.texto || item.title);
}

function titlesFromPayload(payload) {
  const proposals = Array.isArray(payload.propuestas)
    ? payload.propuestas
    : Array.isArray(payload.titulosEnviados)
      ? payload.titulosEnviados
      : [];
  return [1, 2, 3].map((number, index) => cleanTitle(
    payload[`titulo${number}`] || proposalTitle(proposals[index])
  ));
}

function preferredFromPayload(payload, titles) {
  const raw = Number(payload.tituloPreferidoNumero || payload.preferido || payload.favorito || 0);
  if ([1, 2, 3].includes(raw) && titles[raw - 1]) return raw;
  const preferredText = cleanTitle(payload.tituloPreferido || payload.tituloPreferidoTexto);
  const index = titles.findIndex((title) => title && title === preferredText);
  return index >= 0 ? index + 1 : 1;
}

function rowId(row) {
  return text(row && (row.id || row._id || row._docId || row.envioId || row.idRegistro));
}

async function queryRowsByCedula(cedula, env) {
  const variants = cedula.startsWith('0') ? [cedula, cedula.slice(1)] : [cedula];
  const map = new Map();
  for (const value of variants) {
    const settled = await Promise.allSettled([
      queryEqual('TITULOS', 'envios', 'cedula', value, 100, env),
      queryEqual('TITULOS', 'envios', 'numeroIdentificacion', value, 100, env)
    ]);
    settled.forEach((result) => {
      if (result.status !== 'fulfilled') return;
      result.value.forEach((row) => {
        const id = rowId(row);
        if (id) map.set(id, row);
      });
    });
  }
  return [...map.values()];
}

async function findCompatibleArticle(cedula, periodValues, env) {
  const rows = await queryRowsByCedula(cedula, env);
  const candidates = rows
    .filter((row) => !esTrabajoTitulacion(row))
    .filter((row) => !periodValues.length || coincidePeriodoTrabajo(row, periodValues));
  return latestBy(candidates, ['versionActual', 'numeroVersion'], [
    'fechaResolucion', 'fechaEnvio', 'actualizadoEn', '_updateTime'
  ]);
}

function newArticleId(periodId, cedula) {
  const canonical = text(periodSignature(periodId) || periodId).replace(/\//g, '-');
  return `${canonical || 'sin_periodo'}__${cedula}`;
}

async function relatedRows(collection, envioId, env) {
  if (!envioId) return [];
  try {
    return await queryEqual('TITULOS', collection, 'envioId', envioId, 1000, env);
  } catch (_error) {
    return [];
  }
}

async function saveCompatibleStudentSubmission(payload = {}, env) {
  const cedula = normalizeCedula(payload.cedula || payload.numeroIdentificacion);
  if (!cedula) throw new Error('No se recibió una cédula válida.');

  const titles = titlesFromPayload(payload);
  if (titles.some((title) => !title)) throw new Error('Debes enviar los tres títulos completos.');
  if (new Set(titles.map((title) => title.toLowerCase())).size !== 3) {
    throw new Error('Los tres títulos deben ser diferentes.');
  }

  const basic = await getStudentBasic(cedula, {
    periodoId: payload.periodoId || payload.periodo || payload.periodoLabel
  }, env);
  if (basic.encontrado !== true || !basic.estudiante) {
    throw new Error('La cédula no corresponde a un estudiante habilitado en Firebase UTET.');
  }

  const student = basic.estudiante;
  const currentPeriodId = text(
    student.periodoId || payload.periodoId || payload.periodo || payload.periodoLabel
  );
  const currentPeriodLabel = text(
    student.periodoLabel || payload.periodoLabel || payload.periodo || currentPeriodId
  );
  const periodValues = [
    currentPeriodId,
    currentPeriodLabel,
    payload.periodoId,
    payload.periodoLabel,
    payload.periodo
  ].map(text).filter(Boolean);
  if (!periodValues.length) throw new Error('No se pudo determinar el período del estudiante.');

  const previous = await findCompatibleArticle(cedula, periodValues, env);
  const previousState = normalizeStatus(previous && (previous.estado || previous.estadoFinal));
  if (previous && previousState !== 'DEVUELTO') {
    const error = new Error('Tus propuestas ya fueron enviadas y están siendo revisadas por coordinación.');
    error.duplicado = true;
    throw error;
  }

  const id = rowId(previous) || newArticleId(currentPeriodId || currentPeriodLabel, cedula);
  const [versions, resolutions] = await Promise.all([
    relatedRows('versiones_envio', id, env),
    relatedRows('resoluciones', id, env)
  ]);
  const knownVersion = Math.max(
    Number(previous && (previous.versionActual || previous.numeroEnvios) || 0),
    versions.reduce((max, item) => Math.max(max, Number(item.numeroVersion || item.version || 0)), 0),
    previous ? 1 : 0
  );
  const versionNumber = knownVersion + 1;
  const reviews = Math.max(
    Number(previous && previous.numeroRevisiones || 0),
    resolutions.reduce((max, item) => Math.max(max, Number(item.numeroResolucion || item.numeroRevision || 0)), 0)
  );
  const date = nowIso();
  const versionId = `${id}__v${String(versionNumber).padStart(3, '0')}__${Date.now()}`;
  const preferred = preferredFromPayload(payload, titles);
  const names = text(student.nombres || payload.nombres || payload.estudiante);
  const career = text(student.carrera || student.nombreCarrera || payload.carrera || payload.nombreCarrera);
  const careerCode = text(
    student.codigoCarrera || payload.codigoCarrera || previous && (previous.carreraCodigo || previous.codigoCarrera)
  );
  const storedPeriodId = text(previous && (previous.periodoId || previous.periodId)) || currentPeriodId;
  const canonicalPeriod = text(periodSignature(currentPeriodLabel || currentPeriodId));
  const previousResolutionId = text(previous && (previous.resolucionActualId || previous.ultimaResolucionId));
  const previousObservation = text(previous && (
    previous.observacion || previous.comentarioCoordinador || previous.comentario || previous.ultimoComentario
  ));
  const previousCoordinator = text(previous && (
    previous.coordinador || previous.nombreCoordinador || previous.ultimoCoordinador
  ));
  const previousResolutionDate = text(previous && (
    previous.fechaResolucion || previous.fechaRevision || previous.ultimaFechaRevision
  ));

  await commitDocuments('TITULOS', [
    {
      collection: 'versiones_envio',
      id: versionId,
      data: {
        envioId: id,
        numeroVersion: versionNumber,
        titulo1: titles[0],
        titulo2: titles[1],
        titulo3: titles[2],
        tituloPreferidoNumero: preferred,
        estado: 'PENDIENTE_REVISION',
        observacion: '',
        fechaEnvio: date,
        tipoTrabajo: 'ARTICULO_ACADEMICO'
      },
      merge: false,
      exists: false
    },
    {
      collection: 'envios',
      id,
      data: {
        cedula,
        numeroIdentificacion: cedula,
        nombres: names,
        carreraNombre: career,
        carreraId: text(payload.carreraId || previous && previous.carreraId),
        carreraCodigo: careerCode,
        periodoId: storedPeriodId,
        periodoNombre: currentPeriodLabel || storedPeriodId,
        periodoCanonicoId: canonicalPeriod || text(previous && previous.periodoCanonicoId),
        telegram: text(payload.telegram || payload.telegramUser || previous && previous.telegram),
        titulo1: titles[0],
        titulo2: titles[1],
        titulo3: titles[2],
        tituloPreferidoNumero: preferred,
        tituloFinal: null,
        estado: 'PENDIENTE_REVISION',
        observacion: null,
        coordinador: null,
        fechaEnvio: date,
        fechaResolucion: null,
        versionActual: versionNumber,
        versionActualId: versionId,
        numeroEnvios: versionNumber,
        numeroReenvios: Math.max(0, versionNumber - 1),
        numeroRevisiones: reviews,
        ultimaResolucionId: previousResolutionId,
        ultimoEstadoRevision: previousState || text(previous && previous.ultimoEstadoRevision),
        ultimoComentario: previousObservation,
        ultimoCoordinador: previousCoordinator,
        ultimaFechaRevision: previousResolutionDate,
        resolucionActualId: null,
        requiereRevision: false,
        actualizadoEn: date,
        tipoTrabajo: 'ARTICULO_ACADEMICO',
        tipoTrabajoLabel: 'Artículo académico'
      },
      merge: true,
      ...(previous && previous._updateTime
        ? { updateTime: previous._updateTime }
        : previous
          ? {}
          : { exists: false })
    }
  ], env);

  return {
    ok: true,
    idRegistro: id,
    tituloId: id,
    envioId: id,
    versionId,
    numeroVersion: versionNumber,
    numeroEnvios: versionNumber,
    numeroReenvios: Math.max(0, versionNumber - 1),
    estado: 'PENDIENTE_REVISION',
    reutilizoEnvioHistorico: Boolean(previous),
    mensaje: previous
      ? 'Correcciones reenviadas correctamente conservando el registro histórico.'
      : 'Propuestas enviadas correctamente a Firebase Títulos.'
  };
}

export async function executeTitulosAction(action, payload = {}, userRole = 'student', env) {
  const normalized = text(action).toUpperCase();
  const role = text(userRole || 'student').toLowerCase();

  if (role === 'student' && normalized === 'ENVIO_ESTUDIANTE') {
    return saveCompatibleStudentSubmission(payload, env);
  }

  const result = sanitizeResult(await executePrevious(action, payload, userRole, env));
  if (role === 'student' && CONSULT_ACTIONS.has(normalized)) {
    return synchronizeStudentState(result);
  }
  return result;
}

export { publicTitleConfiguration };
