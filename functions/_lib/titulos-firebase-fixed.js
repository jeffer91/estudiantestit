/* Fachada de Firebase Títulos con lectura correcta de períodos históricos. */
import {
  executeTitulosAction as executeBase,
  publicTitleConfiguration as publicBase
} from './titulos-firebase.js';
import {
  commitDocuments,
  deleteDocument,
  latestBy,
  listCollection,
  normalizeCedula,
  nowIso,
  pingProject,
  queryEqual,
  samePeriod,
  text
} from './firestore-fixed.js';
import { listTitleCareers, listTitlePeriods } from './requisitos-firebase-fixed.js';

const RESOLUTION_STATES = new Set(['APROBADO', 'REEMPLAZADO', 'DEVUELTO']);

function normalizeStatus(value, fallback = 'PENDIENTE_REVISION') {
  const normalized = text(value).toUpperCase().replace(/[^A-Z0-9]+/g, '_');
  if (!normalized) return fallback;
  if (normalized.includes('DEVUEL')) return 'DEVUELTO';
  if (normalized.includes('REEMPLAZ')) return 'REEMPLAZADO';
  if (normalized.includes('APROBAD')) return 'APROBADO';
  if (normalized.includes('PENDIENT')) return 'PENDIENTE_REVISION';
  if (normalized.includes('INACTIVO')) return 'INACTIVO';
  if (normalized.includes('ACTIVO')) return 'ACTIVO';
  return normalized;
}

function cleanTitle(value) {
  let output = text(value).replace(/\s+/g, ' ');
  while (output.length >= 2 && (
    (output.startsWith('"') && output.endsWith('"')) ||
    (output.startsWith("'") && output.endsWith("'"))
  )) output = output.slice(1, -1).trim();
  return output;
}

function splitList(value) {
  if (Array.isArray(value)) return value.map(text).filter(Boolean);
  return text(value).split(/[,;|\n]+/).map(text).filter(Boolean);
}

function periodValue(row) {
  return text(row && (
    row.periodoNombre || row.periodoLabel || row.periodoCanonicoLabel || row.periodo ||
    row.periodoId || row.periodId
  ));
}

function publicEnvio(row) {
  row = row || {};
  const id = text(row.id || row._docId || row._id);
  const cedula = normalizeCedula(row.cedula || row.numeroIdentificacion);
  const names = text(row.nombres || row.estudiante || row.Nombres);
  const career = text(row.carreraNombre || row.nombreCarrera || row.carrera);
  const periodLabel = text(row.periodoNombre || row.periodoLabel || row.periodo || row.periodoId);
  const periodId = text(row.periodoId || row.periodId || periodLabel);
  const titles = [cleanTitle(row.titulo1), cleanTitle(row.titulo2), cleanTitle(row.titulo3)];
  const preferred = Number(row.tituloPreferidoNumero || row.preferido || 0);
  const status = normalizeStatus(row.estado || row.estadoFinal);
  const finalTitle = cleanTitle(row.tituloFinal || row.tituloCorregido || row.tituloElegido);
  const observation = text(row.observacion || row.comentarioCoordinador || row.comentario);

  return {
    ...row,
    id,
    _id: id,
    _clave: id,
    idRegistro: id,
    envioId: id,
    cedula,
    numeroIdentificacion: cedula,
    nombres: names,
    estudiante: names,
    carrera: career,
    nombreCarrera: career,
    periodoId: periodId,
    periodo: periodLabel,
    periodoLabel: periodLabel,
    titulo1: titles[0],
    titulo2: titles[1],
    titulo3: titles[2],
    preferido: preferred,
    tituloPreferidoNumero: preferred,
    tituloPreferidoTexto: preferred ? titles[preferred - 1] : '',
    estado: status,
    estadoFinal: status,
    estadoProceso: status,
    tituloAprobado: finalTitle,
    tituloFinal: finalTitle,
    comentarioCoordinador: observation,
    observacion: observation,
    fechaRevision: text(row.fechaResolucion),
    permitirReenvio: status === 'DEVUELTO'
  };
}

async function queryUnique(collectionName, field, values, limit, env) {
  const rows = [];
  const seen = new Set();
  for (const value of values) {
    if (value === '' || value === null || value === undefined) continue;
    const found = await queryEqual('TITULOS', collectionName, field, value, limit, env);
    for (const row of found) {
      if (seen.has(row.id)) continue;
      seen.add(row.id);
      rows.push(row);
    }
  }
  return rows;
}

async function findEnviosByCedula(value, env) {
  const cedula = normalizeCedula(value);
  if (!cedula) return [];
  const variants = cedula.startsWith('0') ? [cedula, cedula.slice(1)] : [cedula];
  const [byCedula, byIdentification] = await Promise.all([
    queryUnique('envios', 'cedula', variants, 100, env),
    queryUnique('envios', 'numeroIdentificacion', variants, 100, env)
  ]);
  return [...new Map([...byCedula, ...byIdentification].map((row) => [row.id, row])).values()];
}

async function findEnvio(cedula, requestedPeriod, env) {
  const rows = await findEnviosByCedula(cedula, env);
  if (!rows.length) return null;
  const requested = text(requestedPeriod);
  const candidates = requested
    ? rows.filter((row) => samePeriod(periodValue(row), requested))
    : rows;
  if (!candidates.length) return null;
  return latestBy(candidates, ['versionActual'], [
    'fechaResolucion', 'fechaEnvio', 'actualizadoEn', '_updateTime'
  ]);
}

async function related(collectionName, envioId, env) {
  return envioId ? queryEqual('TITULOS', collectionName, 'envioId', envioId, 1000, env) : [];
}

async function listEnvios(payload = {}, env) {
  let rows = await listCollection('TITULOS', 'envios', { maxDocuments: 10000 }, env);
  const careerFilters = splitList(payload.carreras || payload.carrera || payload.nombreCarrera)
    .map((item) => item.toLowerCase());
  const period = text(payload.periodoId || payload.periodoLabel || payload.periodo);
  const status = text(payload.estado) ? normalizeStatus(payload.estado, '') : '';

  if (careerFilters.length) {
    rows = rows.filter((row) => {
      const career = text(row.carreraNombre || row.nombreCarrera || row.carrera).toLowerCase();
      const careerId = text(row.carreraId || row.carreraCodigo).toLowerCase();
      return careerFilters.some((filter) => career === filter || careerId === filter || career.includes(filter));
    });
  }
  if (period) rows = rows.filter((row) => samePeriod(periodValue(row), period));
  if (status) rows = rows.filter((row) => normalizeStatus(row.estado) === status);

  rows.sort((a, b) => {
    const dateA = Date.parse(a.fechaEnvio || a.actualizadoEn || a._updateTime || '') || 0;
    const dateB = Date.parse(b.fechaEnvio || b.actualizadoEn || b._updateTime || '') || 0;
    return dateB - dateA;
  });
  return rows.map(publicEnvio);
}

async function consultEnvio(payload = {}, env) {
  const cedula = normalizeCedula(payload.cedula || payload.numeroIdentificacion || payload.identificacion);
  const period = text(payload.periodoId || payload.periodoLabel || payload.periodo);
  const row = await findEnvio(cedula, period, env);
  if (!row) return { ok: true, existe: false, encontrado: false, tieneEnvio: false, cedula };
  const envio = publicEnvio(row);
  return {
    ok: true,
    existe: true,
    encontrado: true,
    tieneEnvio: envio.estado !== 'DEVUELTO',
    encontradoEnvio: true,
    permiteReenvio: envio.estado === 'DEVUELTO',
    estado: envio.estado,
    estadoFinal: envio.estado,
    envio,
    registro: envio,
    mensaje: envio.estado === 'DEVUELTO'
      ? 'El registro fue devuelto y puede corregirse.'
      : 'Envío encontrado correctamente en Firebase Títulos.'
  };
}

function uniqueEventId(prefix) {
  const random = typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID().replace(/-/g, '').slice(0, 12)
    : Math.random().toString(36).slice(2, 14);
  return `${prefix}__${Date.now()}__${random}`;
}

async function saveResolution(payload = {}, env) {
  const cedula = normalizeCedula(payload.cedula || payload.numeroIdentificacion);
  if (!cedula) throw new Error('No se recibió una cédula válida.');
  const period = text(payload.periodoId || payload.periodoLabel || payload.periodo);
  const envio = await findEnvio(cedula, period, env);
  if (!envio) throw new Error('No se encontró el envío del estudiante en el período indicado.');

  const status = normalizeStatus(payload.estadoFinal || payload.estado, 'APROBADO');
  if (!RESOLUTION_STATES.has(status)) {
    throw new Error('La resolución debe ser APROBADO, REEMPLAZADO o DEVUELTO.');
  }
  const selected = cleanTitle(payload.tituloElegido || payload.preferido || envio.titulo1);
  const corrected = cleanTitle(payload.tituloCorregido);
  const finalTitle = corrected || selected;
  const observation = text(payload.observacion || payload.comentario || payload.comentarioCoordinador);
  if (status === 'DEVUELTO' && observation.length < 4) {
    throw new Error('La devolución necesita un comentario de al menos 4 caracteres.');
  }
  if (status !== 'DEVUELTO' && !finalTitle) throw new Error('La aprobación necesita un título final.');

  const resolutions = await related('resoluciones', envio.id, env);
  const number = resolutions.reduce((max, item) => Math.max(max, Number(item.numeroResolucion || 0)), 0) + 1;
  const resolutionId = uniqueEventId(`${envio.id}__r${String(number).padStart(3, '0')}`);
  const coordinator = text(payload.coordinador || payload.nombreCoordinador);
  const date = text(payload.fechaResolucion) || nowIso();

  await commitDocuments('TITULOS', [
    {
      collection: 'resoluciones', id: resolutionId,
      data: {
        envioId: envio.id, numeroResolucion: number, coordinador, estado: status,
        tituloElegido: selected, tituloCorregido: corrected,
        observacion: observation, fechaResolucion: date
      },
      merge: false, exists: false
    },
    {
      collection: 'envios', id: envio.id,
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
    envioId: envio.id,
    resolucionId: resolutionId,
    estado: status,
    estadoFinal: status,
    tituloFinal: status === 'DEVUELTO' ? '' : finalTitle,
    mensaje: status === 'DEVUELTO'
      ? 'Propuestas devueltas correctamente en Firebase Títulos.'
      : 'Resolución guardada correctamente en Firebase Títulos.'
  };
}

async function deleteEnvio(payload = {}, env) {
  const envio = await findEnvio(
    payload.cedula || payload.numeroIdentificacion,
    payload.periodoId || payload.periodoLabel || payload.periodo,
    env
  );
  if (!envio) return { ok: true, eliminado: false, mensaje: 'El envío ya no existe.' };
  const [versions, resolutions] = await Promise.all([
    related('versiones_envio', envio.id, env),
    related('resoluciones', envio.id, env)
  ]);
  await Promise.all([
    ...versions.map((item) => deleteDocument('TITULOS', 'versiones_envio', item.id, env)),
    ...resolutions.map((item) => deleteDocument('TITULOS', 'resoluciones', item.id, env))
  ]);
  await deleteDocument('TITULOS', 'envios', envio.id, env);
  return { ok: true, eliminado: true, envioId: envio.id, mensaje: 'Envío eliminado correctamente.' };
}

async function summaryAdmin(env) {
  const envios = await listEnvios({}, env);
  const counts = envios.reduce((output, item) => {
    output[item.estado] = (output[item.estado] || 0) + 1;
    return output;
  }, {});
  return {
    ok: true,
    total: envios.length,
    envios,
    estados: counts,
    pendientes: counts.PENDIENTE_REVISION || 0,
    aprobados: counts.APROBADO || 0,
    reemplazados: counts.REEMPLAZADO || 0,
    devueltos: counts.DEVUELTO || 0,
    fuente: 'FIREBASE_TITULOS'
  };
}

export async function executeTitulosAction(action, payload = {}, userRole = 'student', env) {
  const normalized = text(action).toUpperCase();
  if (normalized === 'PING') return pingProject('TITULOS', env);
  if (normalized === 'LISTAR_ENVIOS_COORDINADOR' || normalized === 'LISTAR_ENVIOS_POR_CARRERA') {
    const envios = await listEnvios(payload, env);
    return { ok: true, envios, registros: envios, filas: envios, total: envios.length };
  }
  if (['CONSULTAR_ENVIO_BASE_CEDULA', 'CONSULTAR_ENVIO_CEDULA', 'VERIFICAR_ENVIO'].includes(normalized)) {
    return consultEnvio(payload, env);
  }
  if (normalized === 'CONSULTAR_RESOLUCION_CEDULA') {
    const envio = await findEnvio(
      payload.cedula || payload.numeroIdentificacion,
      payload.periodoId || payload.periodoLabel || payload.periodo,
      env
    );
    if (!envio) return { ok: true, encontrado: false, existe: false };
    const resolutions = await related('resoluciones', envio.id, env);
    const resolution = latestBy(resolutions, ['numeroResolucion'], ['fechaResolucion', '_updateTime']);
    return { ok: true, encontrado: Boolean(resolution), existe: Boolean(resolution), resolucion: resolution, registro: resolution };
  }
  if ([
    'APROBAR_ENVIO_COORDINADOR', 'DEVOLVER_ENVIO_COORDINADOR',
    'GUARDAR_REVISION_COORDINADOR', 'GUARDAR_RESOLUCION',
    'MOVER_DEVUELTO_COORDINADOR', 'ADMIN_DEVOLVER_TITULOS'
  ].includes(normalized)) return saveResolution(payload, env);
  if (normalized === 'ADMIN_ELIMINAR_TITULOS') return deleteEnvio(payload, env);
  if (normalized === 'RESUMEN_ADMINISTRADOR') return summaryAdmin(env);
  return executeBase(action, payload, userRole, env);
}

export async function publicTitleConfiguration(env) {
  return publicBase(env);
}

export async function titlePeriodsAndCareers(env) {
  const [periods, careers] = await Promise.all([
    listTitlePeriods(env),
    listTitleCareers('', env)
  ]);
  return { periods, careers };
}
