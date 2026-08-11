/* Compatibilidad de consulta para estudiantes con artículos históricos devueltos.
 * - Conserva el estado DEVUELTO aunque una migración antigua no tenga titulo1/2/3.
 * - Recupera las propuestas desde versiones_envio cuando existen.
 * - Usa envios/resoluciones como respaldo sin inventar títulos inexistentes.
 */
import {
  executeTitulosAction as executePrevious,
  publicTitleConfiguration
} from './titulos-firebase-v10.js';
import { queryEqual, text } from './firestore-fixed.js';

const CONSULT_ACTIONS = new Set([
  'CONSULTAR_ENVIO_BASE_CEDULA',
  'CONSULTAR_ENVIO_CEDULA',
  'VERIFICAR_ENVIO'
]);

function normalizeStatus(value) {
  const status = text(value).toUpperCase().replace(/[^A-Z0-9]+/g, '_');
  if (!status) return '';
  if (status.includes('DEVUEL')) return 'DEVUELTO';
  if (status.includes('REEMPLAZ')) return 'REEMPLAZADO';
  if (status.includes('APROBAD')) return 'APROBADO';
  if (status.includes('PENDIENT') || status === 'ENVIADO') return 'PENDIENTE_REVISION';
  if (status.includes('NO_ENVIADO')) return 'NO_ENVIADO';
  return status;
}

function cleanTitle(value) {
  let output = text(value).replace(/\s+/g, ' ').trim();
  if (!output) return '';

  /* Algunos registros migrados guardaron literalmente: titulo\": \"Texto... */
  output = output.replace(/^(?:["']?titulo["']?)\s*:\s*["']?/i, '').trim();
  while (
    output.length >= 2 &&
    ((output.startsWith('"') && output.endsWith('"')) ||
      (output.startsWith("'") && output.endsWith("'")))
  ) output = output.slice(1, -1).trim();
  return output.replace(/["']\s*$/, '').trim();
}

function proposalTitle(value) {
  if (typeof value === 'string') return cleanTitle(value);
  const item = value && typeof value === 'object' ? value : {};
  return cleanTitle(
    item.tituloFinal || item.titulo || item.tituloMejorado ||
    item.texto || item.title || item.nombre
  );
}

function addUnique(list, seen, value) {
  const title = cleanTitle(value);
  const key = title.toLowerCase();
  if (!title || seen.has(key)) return;
  seen.add(key);
  list.push(title);
}

function titlesFromRow(row, includeHistoricalFallback = false) {
  row = row || {};
  const titles = [];
  const seen = new Set();

  addUnique(titles, seen, row.titulo1);
  addUnique(titles, seen, row.titulo2);
  addUnique(titles, seen, row.titulo3);

  for (const field of ['propuestasDetalle', 'propuestas', 'propuestasEnviadas', 'titulosEnviados']) {
    const values = Array.isArray(row[field]) ? row[field] : [];
    values.forEach((item) => addUnique(titles, seen, proposalTitle(item)));
  }

  if (includeHistoricalFallback) {
    addUnique(titles, seen, row.tituloElegido);
    addUnique(titles, seen, row.tituloFinal);
    addUnique(titles, seen, row.tituloAprobado);
    addUnique(titles, seen, row.tituloCorregido);
    addUnique(titles, seen, row.tituloPreferidoTexto);
  }

  return titles.slice(0, 3);
}

function rowId(row) {
  return text(row && (row.id || row._id || row._docId || row.envioId || row.idRegistro));
}

function numericVersion(row) {
  return Math.max(
    Number(row && (row.numeroVersion || row.version || row.versionActual) || 0),
    Number(row && row.numeroEnvios || 0)
  );
}

function rowDate(row) {
  row = row || {};
  return Math.max(
    Date.parse(typeof row.actualizadoEn === 'string' ? row.actualizadoEn : '') || 0,
    Date.parse(row.fechaResolucion || '') || 0,
    Date.parse(row.fechaEnvio || '') || 0,
    Date.parse(row._updateTime || '') || 0,
    Date.parse(row._createTime || '') || 0
  );
}

function laterVersion(candidate, current) {
  if (!current) return true;
  const a = numericVersion(candidate);
  const b = numericVersion(current);
  if (a !== b) return a > b;
  return rowDate(candidate) > rowDate(current);
}

function latestVersion(rows, current) {
  const list = Array.isArray(rows) ? rows : [];
  const currentVersionId = text(current && current.versionActualId);
  if (currentVersionId) {
    const exact = list.find((item) => rowId(item) === currentVersionId);
    if (exact) return exact;
  }

  const returned = list.filter((item) => normalizeStatus(item.estado || item.estadoFinal) === 'DEVUELTO');
  const source = returned.length ? returned : list;
  return source.reduce((latest, item) => laterVersion(item, latest) ? item : latest, null);
}

function laterResolution(candidate, current) {
  if (!current) return true;
  const a = Number(candidate && (candidate.numeroResolucion || candidate.numeroRevision) || 0);
  const b = Number(current && (current.numeroResolucion || current.numeroRevision) || 0);
  if (a !== b) return a > b;
  return rowDate(candidate) > rowDate(current);
}

function latestResolution(rows) {
  return (Array.isArray(rows) ? rows : []).reduce(
    (latest, item) => laterResolution(item, latest) ? item : latest,
    null
  );
}

function effectiveState(current, resolution) {
  const currentState = normalizeStatus(
    current && (current.estado || current.estadoFinal || current.estadoProceso)
  );

  /* Un reenvío moderno vuelve a PENDIENTE_REVISION. No debemos revivir una
     devolución anterior solo porque siga existiendo en resoluciones. */
  if (currentState && currentState !== 'NO_ENVIADO') return currentState;

  const resolutionState = normalizeStatus(resolution && (resolution.estado || resolution.estadoFinal));
  if (current && current.requiereRevision === true) return resolutionState || 'DEVUELTO';
  if (resolutionState === 'DEVUELTO') return 'DEVUELTO';
  return currentState;
}

function publicResolution(resolution, current, state) {
  const source = resolution && typeof resolution === 'object' ? resolution : {};
  const observation = text(
    source.observacion || source.comentarioCoordinador || source.comentario || source.motivo ||
    current && (current.observacion || current.comentarioCoordinador || current.comentario)
  );
  return {
    ...source,
    id: rowId(source) || text(current && current.resolucionActualId),
    envioId: text(source.envioId) || rowId(current),
    estado: normalizeStatus(source.estado || source.estadoFinal) || state,
    estadoFinal: normalizeStatus(source.estado || source.estadoFinal) || state,
    coordinador: text(source.coordinador || source.nombreCoordinador || current && current.coordinador),
    observacion: observation,
    comentarioCoordinador: observation,
    tituloElegido: cleanTitle(source.tituloElegido || current && current.tituloElegido),
    tituloCorregido: cleanTitle(source.tituloCorregido || source.tituloFinal || current && current.tituloCorregido),
    fechaResolucion: text(source.fechaResolucion || source.actualizadoEn || current && current.fechaResolucion)
  };
}

function restoredTitles(current, version, resolution) {
  const exactVersion = titlesFromRow(version, false);
  if (exactVersion.length) return { titles: exactVersion, source: 'VERSIONES_ENVIO', partial: exactVersion.length < 3 };

  const exactCurrent = titlesFromRow(current, false);
  if (exactCurrent.length) return { titles: exactCurrent, source: 'ENVIOS', partial: exactCurrent.length < 3 };

  const fallback = [];
  const seen = new Set();
  titlesFromRow(current, true).forEach((title) => addUnique(fallback, seen, title));
  titlesFromRow(resolution, true).forEach((title) => addUnique(fallback, seen, title));
  return { titles: fallback.slice(0, 3), source: 'ENVIO_RESOLUCION_HISTORICOS', partial: true };
}

function restoreReturnedEnvio(current, version, resolution) {
  const restored = restoredTitles(current, version, resolution);
  const titles = restored.titles;
  const preferredRaw = Number(
    version && (version.tituloPreferidoNumero || version.preferido) ||
    current && (current.tituloPreferidoNumero || current.preferido) || 0
  );
  const preferred = [1, 2, 3].includes(preferredRaw) && titles[preferredRaw - 1]
    ? preferredRaw
    : titles.length === 1 ? 1 : 0;
  const observation = text(
    resolution && (resolution.observacion || resolution.comentarioCoordinador || resolution.comentario) ||
    current && (current.observacion || current.comentarioCoordinador || current.comentario)
  );

  return {
    ...(current || {}),
    estado: 'DEVUELTO',
    estadoFinal: 'DEVUELTO',
    estadoProceso: 'DEVUELTO',
    permitirReenvio: true,
    requiereRevision: true,
    enviado: true,
    tieneTitulos: titles.length > 0,
    titulo1: titles[0] || '',
    titulo2: titles[1] || '',
    titulo3: titles[2] || '',
    tituloPreferidoNumero: preferred,
    preferido: preferred,
    tituloPreferidoTexto: preferred ? titles[preferred - 1] : '',
    propuestas: titles.map((title, index) => ({ numero: index + 1, tituloFinal: title })),
    propuestasDetalle: titles.map((title, index) => ({ numero: index + 1, tituloFinal: title })),
    observacion: observation,
    comentarioCoordinador: observation,
    tituloElegido: cleanTitle(current && current.tituloElegido || resolution && resolution.tituloElegido),
    tituloFinal: cleanTitle(current && current.tituloFinal),
    titulosHistoricosRecuperados: true,
    titulosHistoricosParciales: restored.partial,
    fuenteTitulosAnteriores: restored.source
  };
}

async function relatedRows(collection, envioId, env) {
  if (!envioId) return [];
  try {
    return await queryEqual('TITULOS', collection, 'envioId', envioId, 1000, env);
  } catch (_error) {
    return [];
  }
}

async function restoreStudentReturnedResult(result, env) {
  if (!result || typeof result !== 'object') return result;
  const current = result.envio || result.registro;
  if (!current || typeof current !== 'object') return result;

  const id = rowId(current);
  const [versions, resolutions] = await Promise.all([
    relatedRows('versiones_envio', id, env),
    relatedRows('resoluciones', id, env)
  ]);
  const resolution = latestResolution(resolutions);
  const state = effectiveState(current, resolution);
  if (state !== 'DEVUELTO') return result;

  const version = latestVersion(versions, current);
  const restoredEnvio = restoreReturnedEnvio(current, version, resolution);
  const restoredResolution = publicResolution(resolution, restoredEnvio, 'DEVUELTO');

  return {
    ...result,
    ok: result.ok === false ? false : true,
    existe: true,
    encontrado: true,
    encontradoEnvio: true,
    tieneEnvio: true,
    tieneResolucion: true,
    permiteReenvio: true,
    estado: 'DEVUELTO',
    estadoFinal: 'DEVUELTO',
    estadoEnvio: 'DEVUELTO',
    estadoEfectivo: 'DEVUELTO',
    envio: restoredEnvio,
    registro: restoredEnvio,
    resolucion: restoredResolution,
    mensaje: 'Tus propuestas fueron devueltas. Corrige los títulos según la observación y vuelve a enviarlos.'
  };
}

export const __test = Object.freeze({
  normalizeStatus,
  cleanTitle,
  titlesFromRow,
  effectiveState,
  restoredTitles,
  restoreReturnedEnvio
});

export async function executeTitulosAction(action, payload = {}, userRole = 'student', env) {
  const normalized = text(action).toUpperCase();
  const role = text(userRole || 'student').toLowerCase();
  const result = await executePrevious(action, payload, userRole, env);

  if (role === 'student' && CONSULT_ACTIONS.has(normalized)) {
    return restoreStudentReturnedResult(result, env);
  }
  return result;
}

export { publicTitleConfiguration };
