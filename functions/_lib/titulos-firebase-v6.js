/* Lectura definitiva de Firebase Títulos con períodos canónicos. */
import {
  executeTitulosAction as executePrevious,
  publicTitleConfiguration
} from './titulos-firebase-fixed.js';
import {
  latestBy,
  listCollection,
  normalizeCedula,
  periodSignature,
  pingProject,
  queryEqual,
  samePeriod,
  text
} from './firestore-fixed.js';

function normalizeStatus(value, fallback = 'PENDIENTE_REVISION') {
  const normalized = text(value).toUpperCase().replace(/[^A-Z0-9]+/g, '_');
  if (!normalized) return fallback;
  if (normalized.includes('DEVUEL')) return 'DEVUELTO';
  if (normalized.includes('REEMPLAZ')) return 'REEMPLAZADO';
  if (normalized.includes('APROBAD')) return 'APROBADO';
  if (normalized.includes('PENDIENT')) return 'PENDIENTE_REVISION';
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

function periodLabel(row) {
  return text(row && (
    row.periodoNombre || row.periodoLabel || row.periodoCanonicoLabel || row.periodo ||
    row.periodoId || row.periodId
  ));
}

function periodId(row) {
  return periodSignature(periodLabel(row)) || periodSignature(row && (row.periodoId || row.periodId));
}

function normalizeEnvio(row) {
  row = row || {};
  const id = text(row.id || row._docId || row._id);
  const cedula = normalizeCedula(row.cedula || row.numeroIdentificacion);
  const names = text(row.nombres || row.estudiante || row.Nombres);
  const career = text(row.carreraNombre || row.nombreCarrera || row.carrera);
  const label = periodLabel(row);
  const canonicalPeriod = periodId(row) || text(row.periodoId || row.periodId || label);
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
    periodoId: canonicalPeriod,
    periodo: label || canonicalPeriod,
    periodoLabel: label || canonicalPeriod,
    titulo1: titles[0],
    titulo2: titles[1],
    titulo3: titles[2],
    preferido: preferred,
    tituloPreferidoNumero: preferred,
    tituloPreferidoTexto: preferred >= 1 && preferred <= 3 ? titles[preferred - 1] : '',
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

function careerMatches(row, filters) {
  if (!filters.length) return true;
  const name = text(row.carreraNombre || row.nombreCarrera || row.carrera).toLowerCase();
  const id = text(row.carreraId || row.carreraCodigo || row.codigoCarrera).toLowerCase();
  return filters.some((filter) => name === filter || id === filter || name.includes(filter));
}

async function listEnvios(payload = {}, env) {
  let rows = await listCollection('TITULOS', 'envios', { maxDocuments: 10000 }, env);
  const filters = splitList(payload.carreras || payload.carrera || payload.nombreCarrera)
    .map((item) => item.toLowerCase());
  const requestedPeriod = text(payload.periodoId || payload.periodoLabel || payload.periodo);
  const requestedStatus = text(payload.estado) ? normalizeStatus(payload.estado, '') : '';

  rows = rows.filter((row) => {
    if (!careerMatches(row, filters)) return false;
    if (requestedPeriod && !samePeriod(periodLabel(row), requestedPeriod)) return false;
    if (requestedStatus && normalizeStatus(row.estado || row.estadoFinal) !== requestedStatus) return false;
    return true;
  });

  rows.sort((left, right) => {
    const a = Date.parse(left.fechaResolucion || left.fechaEnvio || left.actualizadoEn || left._updateTime || '') || 0;
    const b = Date.parse(right.fechaResolucion || right.fechaEnvio || right.actualizadoEn || right._updateTime || '') || 0;
    return b - a;
  });
  return rows.map(normalizeEnvio);
}

async function queryUnique(field, values, env) {
  const map = new Map();
  for (const value of values) {
    if (!value) continue;
    const rows = await queryEqual('TITULOS', 'envios', field, value, 100, env);
    rows.forEach((row) => map.set(row.id, row));
  }
  return [...map.values()];
}

async function findEnvio(payload = {}, env) {
  const cedula = normalizeCedula(payload.cedula || payload.numeroIdentificacion || payload.identificacion);
  if (!cedula) return null;
  const variants = cedula.startsWith('0') ? [cedula, cedula.slice(1)] : [cedula];
  const [byCedula, byIdentification] = await Promise.all([
    queryUnique('cedula', variants, env),
    queryUnique('numeroIdentificacion', variants, env)
  ]);
  const requestedPeriod = text(payload.periodoId || payload.periodoLabel || payload.periodo);
  const rows = [...new Map([...byCedula, ...byIdentification].map((row) => [row.id, row])).values()]
    .filter((row) => !requestedPeriod || samePeriod(periodLabel(row), requestedPeriod));
  return latestBy(rows, ['versionActual'], [
    'fechaResolucion', 'fechaEnvio', 'actualizadoEn', '_updateTime'
  ]);
}

async function consultEnvio(payload, env) {
  const row = await findEnvio(payload, env);
  const cedula = normalizeCedula(payload.cedula || payload.numeroIdentificacion || payload.identificacion);
  if (!row) return { ok: true, existe: false, encontrado: false, tieneEnvio: false, cedula };
  const envio = normalizeEnvio(row);
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

async function summary(env) {
  const envios = await listEnvios({}, env);
  const estados = envios.reduce((output, item) => {
    output[item.estado] = (output[item.estado] || 0) + 1;
    return output;
  }, {});
  return {
    ok: true,
    total: envios.length,
    envios,
    estados,
    pendientes: estados.PENDIENTE_REVISION || 0,
    aprobados: estados.APROBADO || 0,
    reemplazados: estados.REEMPLAZADO || 0,
    devueltos: estados.DEVUELTO || 0,
    fuente: 'FIREBASE_TITULOS_DIRECTO'
  };
}

export async function executeTitulosAction(action, payload = {}, userRole = 'student', env) {
  const normalized = text(action).toUpperCase();
  if (normalized === 'PING') return pingProject('TITULOS', env);
  if (normalized === 'LISTAR_ENVIOS_COORDINADOR' || normalized === 'LISTAR_ENVIOS_POR_CARRERA') {
    const envios = await listEnvios(payload, env);
    return {
      ok: true,
      envios,
      registros: envios,
      filas: envios,
      total: envios.length,
      fuente: 'FIREBASE_TITULOS_DIRECTO'
    };
  }
  if (['CONSULTAR_ENVIO_BASE_CEDULA', 'CONSULTAR_ENVIO_CEDULA', 'VERIFICAR_ENVIO'].includes(normalized)) {
    return consultEnvio(payload, env);
  }
  if (normalized === 'RESUMEN_ADMINISTRADOR') return summary(env);
  return executePrevious(action, payload, userRole, env);
}

export { publicTitleConfiguration };
