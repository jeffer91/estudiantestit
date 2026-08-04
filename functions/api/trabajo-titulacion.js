import {
  getDocument,
  nowIso,
  queryEqual,
  samePeriod,
  setDocument,
  text
} from '../_lib/firestore-fixed.js';
import { getStudentBasic } from '../_lib/requisitos-firebase-fixed.js';
import {
  COLECCION_ENVIOS,
  COLECCION_RESOLUCIONES,
  COLECCION_VERSIONES,
  TIPO_TRABAJO_TITULACION,
  cedulaEstricta,
  esTrabajoTitulacion,
  idTrabajoTitulacion,
  listarTrabajosTitulacionUnificados,
  migrarTrabajosTitulacionLegados,
  periodoTrabajo
} from '../_lib/trabajo-titulacion-unificado.js';
import {
  corsHeaders,
  jsonReply,
  normalizeAction,
  readJson,
  rejectUnknownOrigin,
  role
} from '../_lib/http.js';

const TIPO = TIPO_TRABAJO_TITULACION;
const ESTADOS_RESOLUCION = new Set(['APROBADO', 'REEMPLAZADO', 'DEVUELTO']);

function estado(value, fallback = 'PENDIENTE_REVISION') {
  const normalized = text(value).toUpperCase().replace(/[^A-Z0-9]+/g, '_');
  if (!normalized) return fallback;
  if (normalized.includes('DEVUEL')) return 'DEVUELTO';
  if (normalized.includes('REEMPLAZ')) return 'REEMPLAZADO';
  if (normalized.includes('APROBAD')) return 'APROBADO';
  if (normalized.includes('PENDIENT')) return 'PENDIENTE_REVISION';
  return normalized;
}

function limpiarTitulo(value) {
  let output = text(value).replace(/\s+/g, ' ');
  while (output.length >= 2 && (
    (output.startsWith('"') && output.endsWith('"')) ||
    (output.startsWith("'") && output.endsWith("'"))
  )) output = output.slice(1, -1).trim();
  return output;
}

function eventoId(prefix) {
  const random = typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID().replace(/-/g, '').slice(0, 12)
    : Math.random().toString(36).slice(2, 14);
  return `${prefix}__${Date.now()}__${random}`;
}

function normalizarPropuesta(value, numero) {
  if (typeof value === 'string') return { numero, tituloFinal: limpiarTitulo(value) };
  const item = value && typeof value === 'object' ? value : {};
  return { numero, tituloFinal: limpiarTitulo(item.tituloFinal || item.titulo || item.tituloMejorado) };
}

function propuestasDesdePayload(payload) {
  const input = Array.isArray(payload.propuestasDetalle)
    ? payload.propuestasDetalle
    : Array.isArray(payload.propuestas) ? payload.propuestas : [];
  return [1, 2, 3].map((numero, index) => {
    const propuesta = normalizarPropuesta(input[index], numero);
    propuesta.tituloFinal = limpiarTitulo(payload[`titulo${numero}`] || propuesta.tituloFinal);
    return propuesta;
  });
}

function validarPropuestas(propuestas) {
  propuestas.forEach((propuesta, index) => {
    if (!propuesta.tituloFinal) throw new Error(`Escribe el título propuesto ${index + 1}.`);
    if (propuesta.tituloFinal.length < 8) throw new Error(`El título propuesto ${index + 1} es demasiado corto.`);
  });
  const titulos = propuestas.map((item) => item.tituloFinal.toLowerCase());
  if (new Set(titulos).size !== 3) throw new Error('Los tres títulos propuestos deben ser diferentes.');
}

function publico(row) {
  row = row || {};
  const id = text(row.id || row._docId || row._id || row.envioId);
  const input = Array.isArray(row.propuestasDetalle)
    ? row.propuestasDetalle
    : [row.titulo1, row.titulo2, row.titulo3];
  const propuestas = [1, 2, 3].map((numero, index) => {
    const item = normalizarPropuesta(input[index], numero);
    item.tituloFinal = limpiarTitulo(row[`titulo${numero}`] || item.tituloFinal);
    return item;
  });
  const preferido = Number(row.tituloPreferidoNumero || row.preferido || 0);
  const status = estado(row.estado || row.estadoFinal);
  const cedula = cedulaEstricta(row.cedula || row.numeroIdentificacion);
  return {
    ...row,
    id,
    _id: id,
    _clave: id,
    idRegistro: id,
    envioId: id,
    tipoTrabajo: TIPO,
    tipoTrabajoLabel: 'Trabajo de Titulación',
    cedula,
    numeroIdentificacion: cedula,
    nombres: text(row.nombres || row.estudiante),
    estudiante: text(row.nombres || row.estudiante),
    carrera: text(row.carreraNombre || row.carrera || row.nombreCarrera),
    nombreCarrera: text(row.carreraNombre || row.carrera || row.nombreCarrera),
    periodoId: text(row.periodoId),
    periodo: text(row.periodoNombre || row.periodoLabel || row.periodoId),
    periodoLabel: text(row.periodoNombre || row.periodoLabel || row.periodoId),
    titulo1: propuestas[0].tituloFinal,
    titulo2: propuestas[1].tituloFinal,
    titulo3: propuestas[2].tituloFinal,
    propuestasDetalle: propuestas,
    tituloPreferidoNumero: preferido,
    preferido,
    tituloPreferidoTexto: preferido >= 1 && preferido <= 3 ? propuestas[preferido - 1].tituloFinal : '',
    estado: status,
    estadoFinal: status,
    tituloFinal: limpiarTitulo(row.tituloFinal),
    tituloAprobado: limpiarTitulo(row.tituloFinal),
    comentarioCoordinador: text(row.observacion || row.comentarioCoordinador),
    observacion: text(row.observacion || row.comentarioCoordinador),
    fechaRevision: text(row.fechaResolucion),
    permitirReenvio: status === 'DEVUELTO'
  };
}

async function buscarPorCedula(cedulaValue, periodoValue, env) {
  const cedula = cedulaEstricta(cedulaValue);
  if (!cedula) return null;
  await migrarTrabajosTitulacionLegados(env);
  const [porCedula, porNumero] = await Promise.all([
    queryEqual('TITULOS', COLECCION_ENVIOS, 'cedula', cedula, 100, env),
    queryEqual('TITULOS', COLECCION_ENVIOS, 'numeroIdentificacion', cedula, 100, env)
  ]);
  const rows = [...new Map([...porCedula, ...porNumero].map((row) => [row.id, row])).values()]
    .filter(esTrabajoTitulacion);
  const periodo = text(periodoValue);
  const candidatos = periodo
    ? rows.filter((row) => samePeriod(row.periodoNombre || row.periodoLabel || row.periodoId, periodo))
    : rows;
  candidatos.sort((a, b) => {
    const dateA = Date.parse(a.fechaResolucion || a.fechaEnvio || a.actualizadoEn || a._updateTime || '') || 0;
    const dateB = Date.parse(b.fechaResolucion || b.fechaEnvio || b.actualizadoEn || b._updateTime || '') || 0;
    return dateB - dateA;
  });
  return candidatos[0] || null;
}

async function buscarPorId(id, env) {
  if (!text(id)) return null;
  await migrarTrabajosTitulacionLegados(env);
  const row = await getDocument('TITULOS', COLECCION_ENVIOS, text(id), env);
  return row && esTrabajoTitulacion(row) ? row : null;
}

async function consultar(payload, env) {
  const cedula = cedulaEstricta(payload.cedula || payload.numeroIdentificacion);
  if (!cedula) throw new Error('La cédula debe contener exactamente 10 dígitos.');
  const row = payload.envioId
    ? await buscarPorId(payload.envioId, env)
    : await buscarPorCedula(cedula, payload.periodoId || payload.periodoLabel || payload.periodo, env);
  if (!row) return { ok: true, encontrado: false, existe: false, tieneEnvio: false, tipoTrabajo: TIPO };
  const envio = publico(row);
  return {
    ok: true,
    encontrado: true,
    existe: true,
    tieneEnvio: envio.estado !== 'DEVUELTO',
    permiteReenvio: envio.estado === 'DEVUELTO',
    estado: envio.estado,
    envio,
    registro: envio,
    mensaje: envio.estado === 'DEVUELTO'
      ? 'El Trabajo de Titulación fue devuelto y puede corregirse.'
      : 'Trabajo de Titulación encontrado correctamente.'
  };
}

async function guardarHistorialSeguro(collection, id, data, env) {
  try {
    await setDocument('TITULOS', collection, id, data, { merge: false }, env);
    return true;
  } catch (error) {
    console.warn('[Trabajo de Titulación] No se pudo guardar el historial:', error);
    return false;
  }
}

async function guardarEnvio(payload, env) {
  const cedula = cedulaEstricta(payload.cedula || payload.numeroIdentificacion);
  if (!cedula) throw new Error('La cédula debe contener exactamente 10 dígitos.');
  const propuestas = propuestasDesdePayload(payload);
  validarPropuestas(propuestas);

  const basic = await getStudentBasic(cedula, {
    periodoId: payload.periodoId || payload.periodo || payload.periodoLabel
  }, env);
  if (basic.encontrado !== true || !basic.estudiante) {
    throw new Error('La cédula no corresponde a un estudiante habilitado.');
  }

  const student = basic.estudiante;
  const periodoId = periodoTrabajo(student.periodoId || payload.periodoId || payload.periodo || payload.periodoLabel);
  const periodoNombre = text(student.periodoLabel || payload.periodoLabel || payload.periodo || periodoId);
  if (!periodoId) throw new Error('No se pudo determinar el período del estudiante.');

  const previous = await buscarPorCedula(cedula, periodoId, env);
  if (previous && estado(previous.estado) !== 'DEVUELTO') {
    const error = new Error('Tus títulos de Trabajo de Titulación ya fueron enviados y están siendo revisados.');
    error.duplicado = true;
    throw error;
  }

  const id = previous && previous.id || idTrabajoTitulacion(periodoId, cedula);
  const versiones = await queryEqual('TITULOS', COLECCION_VERSIONES, 'envioId', id, 1000, env);
  const numeroVersion = versiones.reduce((max, item) => Math.max(max, Number(item.numeroVersion || 0)), 0) + 1;
  const versionId = eventoId(`${id}__v${String(numeroVersion).padStart(3, '0')}`);
  const preferido = Number(payload.tituloPreferidoNumero || payload.preferido || 1);
  const favorito = [1, 2, 3].includes(preferido) ? preferido : 1;
  const fecha = nowIso();
  const nombres = text(student.nombres || student.Nombres || payload.nombres || payload.estudiante);
  const carrera = text(student.carrera || student.NombreCarrera || payload.carrera || payload.nombreCarrera);

  const envioData = {
    tipoTrabajo: TIPO,
    tipoTrabajoLabel: 'Trabajo de Titulación',
    cedula,
    numeroIdentificacion: cedula,
    nombres,
    carreraNombre: carrera,
    carreraCodigo: text(student.codigoCarrera || student.CodigoCarrera || payload.codigoCarrera),
    periodoId,
    periodoNombre: periodoNombre || periodoId,
    telegram: text(payload.telegram || payload.telegramUser),
    titulo1: propuestas[0].tituloFinal,
    titulo2: propuestas[1].tituloFinal,
    titulo3: propuestas[2].tituloFinal,
    propuestasDetalle: propuestas,
    tituloPreferidoNumero: favorito,
    tituloFinal: null,
    estado: 'PENDIENTE_REVISION',
    observacion: null,
    coordinador: null,
    fechaEnvio: fecha,
    fechaResolucion: null,
    versionActual: numeroVersion,
    versionActualId: versionId,
    resolucionActualId: null,
    requiereRevision: false,
    actualizadoEn: fecha
  };

  await setDocument('TITULOS', COLECCION_ENVIOS, id, envioData, { merge: false }, env);
  await guardarHistorialSeguro(COLECCION_VERSIONES, versionId, {
    envioId: id,
    tipoTrabajo: TIPO,
    numeroVersion,
    titulo1: propuestas[0].tituloFinal,
    titulo2: propuestas[1].tituloFinal,
    titulo3: propuestas[2].tituloFinal,
    propuestasDetalle: propuestas,
    tituloPreferidoNumero: favorito,
    estado: 'PENDIENTE_REVISION',
    observacion: '',
    fechaEnvio: fecha
  }, env);

  return {
    ok: true,
    envioId: id,
    idRegistro: id,
    versionId,
    numeroVersion,
    estado: 'PENDIENTE_REVISION',
    tipoTrabajo: TIPO,
    mensaje: 'Títulos de Trabajo de Titulación enviados correctamente para revisión.'
  };
}

async function listar(payload, env) {
  let rows = await listarTrabajosTitulacionUnificados(env);
  const requestedStatus = text(payload.estado) ? estado(payload.estado, '') : '';
  if (requestedStatus) rows = rows.filter((row) => estado(row.estado) === requestedStatus);
  rows.sort((a, b) => {
    const dateA = Date.parse(a.fechaResolucion || a.fechaEnvio || a.actualizadoEn || a._updateTime || '') || 0;
    const dateB = Date.parse(b.fechaResolucion || b.fechaEnvio || b.actualizadoEn || b._updateTime || '') || 0;
    return dateB - dateA;
  });
  return { ok: true, envios: rows.map(publico), tipoTrabajo: TIPO, total: rows.length };
}

async function guardarResolucion(payload, env) {
  const cedula = cedulaEstricta(payload.cedula || payload.numeroIdentificacion);
  if (!cedula && !payload.envioId) throw new Error('La cédula debe contener exactamente 10 dígitos.');
  const envio = payload.envioId
    ? await buscarPorId(payload.envioId, env)
    : await buscarPorCedula(cedula, payload.periodoId || payload.periodoLabel || payload.periodo, env);
  if (!envio) throw new Error('No se encontró el Trabajo de Titulación indicado.');

  const status = estado(payload.estadoFinal || payload.estado, 'APROBADO');
  if (!ESTADOS_RESOLUCION.has(status)) throw new Error('La resolución debe ser APROBADO, REEMPLAZADO o DEVUELTO.');
  const selected = limpiarTitulo(payload.tituloElegido || payload.preferido || envio.titulo1);
  const corrected = limpiarTitulo(payload.tituloCorregido || payload.tituloFinal);
  const finalTitle = corrected || selected;
  const observation = text(payload.observacion || payload.comentario || payload.comentarioCoordinador);
  if (status === 'DEVUELTO' && observation.length < 4) throw new Error('La devolución necesita un comentario de al menos 4 caracteres.');
  if (status !== 'DEVUELTO' && !finalTitle) throw new Error('La aprobación necesita un título final.');

  const resoluciones = await queryEqual('TITULOS', COLECCION_RESOLUCIONES, 'envioId', envio.id, 1000, env);
  const numeroResolucion = resoluciones.reduce((max, item) => Math.max(max, Number(item.numeroResolucion || 0)), 0) + 1;
  const resolucionId = eventoId(`${envio.id}__r${String(numeroResolucion).padStart(3, '0')}`);
  const coordinador = text(payload.coordinador || payload.nombreCoordinador);
  const fecha = text(payload.fechaResolucion) || nowIso();

  await setDocument('TITULOS', COLECCION_ENVIOS, envio.id, {
    estado: status,
    tituloFinal: status === 'DEVUELTO' ? null : finalTitle,
    observacion: observation,
    coordinador,
    fechaResolucion: fecha,
    resolucionActualId: resolucionId,
    requiereRevision: status === 'DEVUELTO',
    actualizadoEn: fecha
  }, { merge: true }, env);

  await guardarHistorialSeguro(COLECCION_RESOLUCIONES, resolucionId, {
    envioId: envio.id,
    tipoTrabajo: TIPO,
    numeroResolucion,
    coordinador,
    estado: status,
    tituloElegido: selected,
    tituloCorregido: corrected,
    observacion: observation,
    fechaResolucion: fecha
  }, env);

  return {
    ok: true,
    envioId: envio.id,
    resolucionId,
    estado: status,
    tituloFinal: status === 'DEVUELTO' ? '' : finalTitle,
    mensaje: status === 'DEVUELTO'
      ? 'Trabajo de Titulación devuelto correctamente.'
      : 'Trabajo de Titulación aprobado correctamente.'
  };
}

async function processRequest(context) {
  const { request, env } = context;
  const originError = rejectUnknownOrigin(request);
  if (originError) return originError;
  let body;
  try {
    body = await readJson(request);
  } catch (error) {
    return jsonReply(request, { ok: false, mensaje: error.message }, 400);
  }

  const action = normalizeAction(body.accion || body.action);
  const payload = body.datos || body.data || {};
  const userRole = role(request);
  const coordinatorOnly = new Set([
    'LISTAR_ENVIOS_TRABAJO_TITULACION',
    'GUARDAR_RESOLUCION_TRABAJO_TITULACION',
    'MIGRAR_TRABAJOS_TITULACION'
  ]);
  if (coordinatorOnly.has(action) && !['coordinator', 'admin'].includes(userRole)) {
    return jsonReply(request, { ok: false, mensaje: 'Acción no autorizada.' }, 403);
  }

  try {
    if (action === 'PING') return jsonReply(request, { ok: true, servicio: 'trabajo-titulacion', coleccion: COLECCION_ENVIOS });
    if (action === 'MIGRAR_TRABAJOS_TITULACION') return jsonReply(request, await migrarTrabajosTitulacionLegados(env));
    if (action === 'CONSULTAR_ENVIO_TRABAJO_TITULACION') return jsonReply(request, await consultar(payload, env));
    if (action === 'ENVIO_TRABAJO_TITULACION') return jsonReply(request, await guardarEnvio(payload, env));
    if (action === 'LISTAR_ENVIOS_TRABAJO_TITULACION') return jsonReply(request, await listar(payload, env));
    if (action === 'GUARDAR_RESOLUCION_TRABAJO_TITULACION') return jsonReply(request, await guardarResolucion(payload, env));
    return jsonReply(request, { ok: false, mensaje: 'Acción no reconocida.' }, 400);
  } catch (error) {
    return jsonReply(request, {
      ok: false,
      mensaje: error && error.message ? error.message : 'No se pudo completar la operación.'
    }, error && error.duplicado ? 409 : 500);
  }
}

export function onRequestOptions(context) {
  return new Response(null, { status: 204, headers: corsHeaders(context.request) });
}

export function onRequestPost(context) {
  return processRequest(context);
}
