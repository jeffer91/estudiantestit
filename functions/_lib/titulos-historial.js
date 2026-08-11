import {
  getDocument,
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

function normalizeStatus(value) {
  const normalized = text(value).toUpperCase().replace(/[^A-Z0-9]+/g, '_');
  if (!normalized) return 'PENDIENTE_REVISION';
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

function rowId(row) {
  row = row || {};
  return text(row.id || row._id || row._docId || row.envioId || row.idRegistro);
}

function rowType(row) {
  return esTrabajoTitulacion(row) ? TIPO_TRABAJO_TITULACION : 'ARTICULO_ACADEMICO';
}

function eventTime(row, fields) {
  for (const field of fields) {
    const raw = row && row[field];
    if (raw && typeof raw === 'object') continue;
    const value = Date.parse(raw || '');
    if (Number.isFinite(value)) return value;
  }
  return 0;
}

function cedulaVariants(value) {
  const canonical = normalizeCedula(value);
  if (!canonical) return [];
  return canonical.startsWith('0') ? [canonical, canonical.slice(1)] : [canonical];
}

function dedupe(rows) {
  const map = new Map();
  (Array.isArray(rows) ? rows : []).forEach((row, index) => {
    if (!row || typeof row !== 'object') return;
    const id = rowId(row) || `fila_${index}`;
    if (!map.has(id)) map.set(id, row);
    else map.set(id, { ...map.get(id), ...row });
  });
  return [...map.values()];
}

async function queryEnviosByCedula(variants, env) {
  const results = [];
  for (const value of variants) {
    const settled = await Promise.allSettled([
      queryEqual('TITULOS', 'envios', 'cedula', value, 100, env),
      queryEqual('TITULOS', 'envios', 'numeroIdentificacion', value, 100, env)
    ]);
    settled.forEach((result) => {
      if (result.status === 'fulfilled') results.push(...result.value);
    });
  }
  return dedupe(results);
}

async function findEnvio(payload, env) {
  const requestedId = text(payload.envioId || payload.idRegistro || payload.tituloId || payload.id);
  if (requestedId) {
    const direct = await getDocument('TITULOS', 'envios', requestedId, env);
    if (direct) return direct;
  }

  const variants = cedulaVariants(
    payload.cedula || payload.numeroIdentificacion || payload.identificacion
  );
  if (!variants.length) return null;

  const requestedPeriods = [
    payload.periodoId,
    payload.periodId,
    payload.periodoCanonicoId,
    payload.periodoLabel,
    payload.periodoNombre,
    payload.periodo
  ].map(text).filter(Boolean);
  const requestedType = text(payload.tipoTrabajo).toUpperCase();
  const typed = (await queryEnviosByCedula(variants, env))
    .filter((row) => !requestedType || rowType(row) === requestedType);

  let candidates = requestedPeriods.length
    ? typed.filter((row) => coincidePeriodoTrabajo(row, requestedPeriods))
    : typed;

  /* Algunos registros migrados solo conservan un código de período antiguo.
     Si para la cédula y el tipo existe un único registro histórico, es más
     seguro reutilizarlo que declarar que no existe y crear un duplicado. */
  if (!candidates.length && requestedPeriods.length && typed.length === 1) {
    candidates = typed;
  }

  candidates.sort((left, right) => {
    const a = eventTime(left, ['fechaResolucion', 'fechaEnvio', 'actualizadoEn', '_updateTime']);
    const b = eventTime(right, ['fechaResolucion', 'fechaEnvio', 'actualizadoEn', '_updateTime']);
    return b - a;
  });
  return candidates[0] || null;
}

function publicVersion(value, index) {
  value = value || {};
  const number = Math.max(1, Number(value.numeroVersion || value.version || index + 1));
  const preferred = Number(value.tituloPreferidoNumero || value.preferido || 0);
  return {
    id: rowId(value),
    envioId: text(value.envioId),
    numeroVersion: number,
    estado: normalizeStatus(value.estado),
    fechaEnvio: text(value.fechaEnvio || value.actualizadoEn || value._createTime),
    titulo1: cleanTitle(value.titulo1),
    titulo2: cleanTitle(value.titulo2),
    titulo3: cleanTitle(value.titulo3),
    tituloPreferidoNumero: preferred,
    legado: value.legado === true,
    recuperadoDesdeEnvio: value.recuperadoDesdeEnvio === true
  };
}

function publicResolution(value, index) {
  value = value || {};
  const observation = text(
    value.observacion || value.comentarioCoordinador || value.comentario || value.motivo
  );
  return {
    id: rowId(value),
    envioId: text(value.envioId || value.idEnvio || value.registroId),
    numeroResolucion: Math.max(1, Number(value.numeroResolucion || value.numeroRevision || index + 1)),
    estado: normalizeStatus(value.estado || value.estadoFinal),
    coordinador: text(value.coordinador || value.nombreCoordinador),
    comentario: observation,
    observacion: observation,
    fechaResolucion: text(value.fechaResolucion || value.fechaRevision || value.actualizadoEn || value._updateTime),
    tituloElegido: cleanTitle(value.tituloElegido),
    tituloCorregido: cleanTitle(value.tituloCorregido || value.tituloFinal),
    legado: value.legado === true,
    recuperadoDesdeEnvio: value.recuperadoDesdeEnvio === true
  };
}

function legacyVersion(envio) {
  if (!envio || (!text(envio.titulo1) && !text(envio.titulo2) && !text(envio.titulo3))) return null;
  return publicVersion({
    id: text(envio.versionActualId) || `${rowId(envio)}__legacy_v1`,
    envioId: rowId(envio),
    numeroVersion: Number(envio.versionActual || 1),
    estado: envio.estado,
    fechaEnvio: envio.fechaEnvio || envio.actualizadoEn || envio._createTime,
    titulo1: envio.titulo1,
    titulo2: envio.titulo2,
    titulo3: envio.titulo3,
    tituloPreferidoNumero: envio.tituloPreferidoNumero || envio.preferido,
    legado: true
  }, 0);
}

function legacyResolution(envio) {
  if (!envio) return null;
  const currentStatus = normalizeStatus(envio.estado || envio.estadoFinal);
  const historicalId = text(envio.ultimaResolucionId);
  const historicalObservation = text(envio.ultimoComentario);
  const historicalCoordinator = text(envio.ultimoCoordinador);
  const historicalDate = text(envio.ultimaFechaRevision);
  const historicalStatusRaw = text(envio.ultimoEstadoRevision || envio.estadoUltimaRevision);
  const hasHistoricalSummary = Boolean(
    historicalId || historicalObservation || historicalCoordinator || historicalDate
  );
  const status = hasHistoricalSummary && currentStatus === 'PENDIENTE_REVISION'
    ? (historicalStatusRaw ? normalizeStatus(historicalStatusRaw) : 'DEVUELTO')
    : currentStatus;
  const observation = text(
    envio.observacion || envio.comentarioCoordinador || envio.comentario || historicalObservation
  );
  const coordinator = text(
    envio.coordinador || envio.nombreCoordinador || historicalCoordinator
  );
  const date = text(envio.fechaResolucion || envio.fechaRevision || historicalDate);
  if (status === 'PENDIENTE_REVISION' && !observation && !coordinator && !date) return null;
  return publicResolution({
    id: text(envio.resolucionActualId || envio.ultimaResolucionId) || `${rowId(envio)}__legacy_r1`,
    envioId: rowId(envio),
    numeroResolucion: Number(envio.numeroRevisiones || 1),
    estado: status,
    coordinador: coordinator,
    observacion: observation,
    fechaResolucion: date,
    tituloElegido: envio.tituloPreferidoTexto || envio.tituloElegido,
    tituloCorregido: envio.tituloFinal || envio.tituloAprobado,
    legado: true
  }, 0);
}

function sortVersions(rows) {
  return rows.slice().sort((left, right) => {
    const number = Number(left.numeroVersion || 0) - Number(right.numeroVersion || 0);
    if (number) return number;
    return eventTime(left, ['fechaEnvio']) - eventTime(right, ['fechaEnvio']);
  });
}

function sortResolutions(rows) {
  return rows.slice().sort((left, right) => {
    const number = Number(left.numeroResolucion || 0) - Number(right.numeroResolucion || 0);
    if (number) return number;
    return eventTime(left, ['fechaResolucion']) - eventTime(right, ['fechaResolucion']);
  });
}

function sameVersionContent(left, right) {
  return Number(left.numeroVersion || 0) === Number(right.numeroVersion || 0) &&
    cleanTitle(left.titulo1) === cleanTitle(right.titulo1) &&
    cleanTitle(left.titulo2) === cleanTitle(right.titulo2) &&
    cleanTitle(left.titulo3) === cleanTitle(right.titulo3);
}

function sameResolutionContent(left, right) {
  return Number(left.numeroResolucion || 0) === Number(right.numeroResolucion || 0) &&
    normalizeStatus(left.estado) === normalizeStatus(right.estado) &&
    text(left.coordinador) === text(right.coordinador) &&
    text(left.comentario || left.observacion) === text(right.comentario || right.observacion) &&
    text(left.fechaResolucion) === text(right.fechaResolucion);
}

function ensureCurrentVersion(versions, envio) {
  const current = legacyVersion(envio);
  if (!current) return sortVersions(versions);

  const explicitId = text(envio.versionActualId);
  const currentNumber = Math.max(1, Number(envio.versionActual || current.numeroVersion || 1));
  const normalizedCurrent = {
    ...current,
    id: explicitId || current.id,
    numeroVersion: currentNumber,
    recuperadoDesdeEnvio: true
  };

  const exists = explicitId
    ? versions.some((item) => text(item.id) === explicitId)
    : versions.some((item) => sameVersionContent(item, normalizedCurrent));
  return sortVersions(exists ? versions : [...versions, normalizedCurrent]);
}

function ensureCurrentResolution(resolutions, envio) {
  const current = legacyResolution(envio);
  if (!current) return sortResolutions(resolutions);

  const explicitId = text(envio.resolucionActualId || envio.ultimaResolucionId);
  const maxExisting = resolutions.reduce(
    (max, item) => Math.max(max, Number(item.numeroResolucion || 0)),
    0
  );
  const hinted = Number(envio.numeroRevisiones || current.numeroResolucion || 0);
  const currentNumber = explicitId
    ? Math.max(1, hinted, maxExisting + 1)
    : Math.max(1, hinted);
  const normalizedCurrent = {
    ...current,
    id: explicitId || current.id,
    numeroResolucion: currentNumber,
    recuperadoDesdeEnvio: true
  };

  const exists = explicitId
    ? resolutions.some((item) => text(item.id) === explicitId)
    : resolutions.some((item) => sameResolutionContent(item, normalizedCurrent));
  return sortResolutions(exists ? resolutions : [...resolutions, normalizedCurrent]);
}

async function persistSummary(envio, summary, env) {
  const id = rowId(envio);
  if (!id) return;
  const latest = summary.ultimaRevision || {};
  const desired = {
    numeroEnvios: summary.numeroEnvios,
    numeroReenvios: summary.numeroReenvios,
    numeroRevisiones: summary.numeroRevisiones,
    versionActual: summary.versionActual,
    ultimaResolucionId: text(latest.id),
    ultimoEstadoRevision: text(latest.estado),
    ultimoComentario: text(latest.comentario),
    ultimoCoordinador: text(latest.coordinador),
    ultimaFechaRevision: text(latest.fechaResolucion)
  };
  const changed = Object.entries(desired).some(([key, value]) => text(envio[key]) !== text(value));
  if (!changed) return;
  try {
    await setDocument('TITULOS', 'envios', id, desired, { merge: true }, env);
  } catch (_error) {
    /* La consulta sigue siendo válida aunque el resumen no pueda actualizarse. */
  }
}

export async function consultarHistorialTitulos(payload = {}, env) {
  const envio = await findEnvio(payload, env);
  if (!envio) {
    return {
      ok: true,
      encontrado: false,
      existe: false,
      numeroEnvios: 0,
      numeroReenvios: 0,
      numeroRevisiones: 0,
      versiones: [],
      revisiones: []
    };
  }

  const id = rowId(envio);
  const settled = await Promise.allSettled([
    queryEqual('TITULOS', 'versiones_envio', 'envioId', id, 1000, env),
    queryEqual('TITULOS', 'resoluciones', 'envioId', id, 1000, env)
  ]);
  const versionRows = settled[0].status === 'fulfilled' ? settled[0].value : [];
  const resolutionRows = settled[1].status === 'fulfilled' ? settled[1].value : [];

  let versions = sortVersions(dedupe(versionRows).map(publicVersion));
  let resolutions = sortResolutions(dedupe(resolutionRows).map(publicResolution));

  /* Aunque una colección auxiliar esté incompleta, el documento principal de
     envios contiene suficiente información para reconstruir el estado actual. */
  versions = ensureCurrentVersion(versions, envio);
  resolutions = ensureCurrentResolution(resolutions, envio);

  const maxVersion = versions.reduce(
    (max, item) => Math.max(max, Number(item.numeroVersion || 0)),
    Number(envio.versionActual || 0)
  );
  const maxResolution = resolutions.reduce(
    (max, item) => Math.max(max, Number(item.numeroResolucion || 0)),
    Number(envio.numeroRevisiones || 0)
  );
  const numeroEnvios = Math.max(maxVersion, versions.length, 1);
  const numeroRevisiones = Math.max(maxResolution, resolutions.length);
  const summary = {
    envioId: id,
    tipoTrabajo: rowType(envio),
    versionActual: numeroEnvios,
    numeroEnvios,
    numeroReenvios: Math.max(0, numeroEnvios - 1),
    numeroRevisiones,
    ultimaRevision: resolutions[resolutions.length - 1] || null
  };

  await persistSummary(envio, summary, env);

  return {
    ok: true,
    encontrado: true,
    existe: true,
    ...summary,
    versiones: versions,
    revisiones: resolutions,
    historialDisponible: versions.length > 0 || resolutions.length > 0,
    historialParcial: settled.some((item) => item.status === 'rejected'),
    registroLegado: versions.some((item) => item.legado) || resolutions.some((item) => item.legado),
    historialRecuperado: versions.some((item) => item.recuperadoDesdeEnvio) ||
      resolutions.some((item) => item.recuperadoDesdeEnvio)
  };
}
