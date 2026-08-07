import {
  commitDocuments,
  deleteDocument,
  getDocument,
  nowIso,
  text
} from '../_lib/firestore-fixed.js';
import {
  COLECCION_ENVIOS,
  COLECCION_RESOLUCIONES,
  TIPO_TRABAJO_TITULACION,
  esTrabajoTitulacion
} from '../_lib/trabajo-titulacion-unificado.js';
import {
  corsHeaders,
  jsonReply,
  normalizeAction,
  readJson,
  rejectUnknownOrigin,
  role
} from '../_lib/http.js';

function eventId(prefix) {
  const random = typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID().replace(/-/g, '').slice(0, 12)
    : Math.random().toString(36).slice(2, 14);
  return `${prefix}__${Date.now()}__${random}`;
}

function currentStatus(row) {
  const value = text(row && (row.estado || row.estadoFinal)).toUpperCase();
  if (value.includes('REEMPLAZ')) return 'REEMPLAZADO';
  if (value.includes('APROBAD')) return 'APROBADO';
  if (value.includes('DEVUEL')) return 'DEVUELTO';
  return 'PENDIENTE_REVISION';
}

async function getWork(payload, env) {
  const id = text(payload.envioId || payload.idRegistro || payload.id);
  if (!id) throw new Error('No se recibió el ID del Trabajo de Titulación.');
  const row = await getDocument('TITULOS', COLECCION_ENVIOS, id, env);
  if (!row || !esTrabajoTitulacion(row)) {
    throw new Error('No se encontró el Trabajo de Titulación indicado.');
  }
  return row;
}

function auditData(envio, action, reason, extra = {}) {
  return {
    envioId: envio.id,
    tipoTrabajo: TIPO_TRABAJO_TITULACION,
    accionAdministrativa: action,
    administrador: 'Administrador',
    estadoAnterior: currentStatus(envio),
    tituloFinalAnterior: text(envio.tituloFinal),
    comentarioAnterior: text(envio.observacion || envio.comentarioCoordinador),
    coordinadorAnterior: text(envio.coordinador),
    fechaResolucionAnterior: text(envio.fechaResolucion),
    motivo: text(reason),
    fechaAdministrativa: nowIso(),
    ...extra
  };
}

async function editComment(payload, env) {
  const envio = await getWork(payload, env);
  const comment = text(payload.comentario || payload.observacion || payload.comentarioCoordinador);
  if (!comment) throw new Error('Escribe el comentario que deseas guardar.');
  const fecha = nowIso();
  const auditId = eventId(`${envio.id}__admin_comentario`);

  await commitDocuments('TITULOS', [
    {
      collection: COLECCION_ENVIOS,
      id: envio.id,
      data: {
        observacion: comment,
        ultimoComentario: comment,
        comentarioEditadoPorAdmin: true,
        fechaEdicionComentarioAdmin: fecha,
        actualizadoEn: fecha
      },
      merge: true,
      ...(envio._updateTime ? { updateTime: envio._updateTime } : {})
    },
    {
      collection: COLECCION_RESOLUCIONES,
      id: auditId,
      data: auditData(envio, 'ADMIN_EDITAR_COMENTARIO', 'Edición administrativa de comentario', {
        estado: 'COMENTARIO_EDITADO_ADMIN',
        observacion: comment,
        fechaResolucion: fecha
      }),
      merge: false,
      exists: false
    }
  ], env);

  return { ok: true, envioId: envio.id, comentario: comment, mensaje: 'Comentario actualizado correctamente.' };
}

async function reopenReview(payload, env) {
  const envio = await getWork(payload, env);
  const status = currentStatus(envio);
  if (!['APROBADO', 'REEMPLAZADO'].includes(status)) {
    throw new Error('Solo se puede reabrir un Trabajo de Titulación aprobado o aprobado con corrección.');
  }
  const reason = text(payload.motivo || payload.observacion || payload.comentario);
  if (reason.length < 4) throw new Error('Escribe un motivo de al menos 4 caracteres para reabrir la revisión.');
  const fecha = nowIso();
  const auditId = eventId(`${envio.id}__admin_reapertura`);

  await commitDocuments('TITULOS', [
    {
      collection: COLECCION_ENVIOS,
      id: envio.id,
      data: {
        estado: 'PENDIENTE_REVISION',
        tituloFinal: null,
        observacion: null,
        coordinador: null,
        fechaResolucion: null,
        resolucionActualId: null,
        requiereRevision: true,
        reabiertoPorAdmin: true,
        motivoReapertura: reason,
        fechaReapertura: fecha,
        actualizadoEn: fecha
      },
      merge: true,
      ...(envio._updateTime ? { updateTime: envio._updateTime } : {})
    },
    {
      collection: COLECCION_RESOLUCIONES,
      id: auditId,
      data: auditData(envio, 'ADMIN_REABRIR_REVISION', reason, {
        estado: 'REABIERTO_POR_ADMIN',
        observacion: reason,
        fechaResolucion: fecha
      }),
      merge: false,
      exists: false
    }
  ], env);

  return {
    ok: true,
    envioId: envio.id,
    estado: 'PENDIENTE_REVISION',
    mensaje: 'Revisión reabierta. El coordinador puede volver a revisar, comentar, aprobar o devolver.'
  };
}

async function returnWork(payload, env) {
  const envio = await getWork(payload, env);
  const reason = text(payload.motivo || payload.observacion || payload.comentario);
  if (reason.length < 4) throw new Error('Escribe un motivo de al menos 4 caracteres para devolver.');
  const fecha = nowIso();
  const revisionNumber = Number(envio.numeroRevisiones || 0) + 1;
  const resolutionId = eventId(`${envio.id}__admin_devuelto`);

  await commitDocuments('TITULOS', [
    {
      collection: COLECCION_ENVIOS,
      id: envio.id,
      data: {
        estado: 'DEVUELTO',
        tituloFinal: null,
        observacion: reason,
        coordinador: 'Administrador',
        fechaResolucion: fecha,
        resolucionActualId: resolutionId,
        ultimaResolucionId: resolutionId,
        numeroRevisiones: revisionNumber,
        ultimoComentario: reason,
        ultimoCoordinador: 'Administrador',
        ultimaFechaRevision: fecha,
        requiereRevision: true,
        actualizadoEn: fecha
      },
      merge: true,
      ...(envio._updateTime ? { updateTime: envio._updateTime } : {})
    },
    {
      collection: COLECCION_RESOLUCIONES,
      id: resolutionId,
      data: auditData(envio, 'ADMIN_DEVOLVER_TRABAJO_TITULACION', reason, {
        numeroResolucion: revisionNumber,
        coordinador: 'Administrador',
        estado: 'DEVUELTO',
        observacion: reason,
        fechaResolucion: fecha
      }),
      merge: false,
      exists: false
    }
  ], env);

  return { ok: true, envioId: envio.id, estado: 'DEVUELTO', mensaje: 'Trabajo de Titulación devuelto correctamente.' };
}

async function removeWork(payload, env) {
  const envio = await getWork(payload, env);
  const reason = text(payload.motivo || payload.observacion || payload.comentario);
  if (reason.length < 4) throw new Error('Escribe un motivo de al menos 4 caracteres para quitar el envío.');
  const fecha = nowIso();
  const auditId = eventId(`${envio.id}__admin_quitado`);

  await commitDocuments('TITULOS', [{
    collection: COLECCION_RESOLUCIONES,
    id: auditId,
    data: auditData(envio, 'ADMIN_QUITAR_ENVIO_TRABAJO_TITULACION', reason, {
      estado: 'QUITADO_POR_ADMIN',
      observacion: reason,
      fechaResolucion: fecha,
      respaldoEnvio: {
        cedula: text(envio.cedula || envio.numeroIdentificacion),
        nombres: text(envio.nombres || envio.estudiante),
        carreraNombre: text(envio.carreraNombre || envio.carrera),
        periodoId: text(envio.periodoId),
        periodoNombre: text(envio.periodoNombre || envio.periodoLabel),
        titulo1: text(envio.titulo1),
        titulo2: text(envio.titulo2),
        titulo3: text(envio.titulo3),
        tituloPreferidoNumero: Number(envio.tituloPreferidoNumero || 0),
        tituloFinal: text(envio.tituloFinal),
        estado: currentStatus(envio),
        observacion: text(envio.observacion),
        coordinador: text(envio.coordinador),
        fechaEnvio: text(envio.fechaEnvio),
        fechaResolucion: text(envio.fechaResolucion),
        versionActual: Number(envio.versionActual || 0),
        numeroRevisiones: Number(envio.numeroRevisiones || 0)
      }
    }),
    merge: false,
    exists: false
  }], env);

  await deleteDocument('TITULOS', COLECCION_ENVIOS, envio.id, env);
  return { ok: true, envioId: envio.id, estado: 'NO_ENVIADO', mensaje: 'Envío quitado. El estudiante puede registrar nuevamente sus propuestas.' };
}

async function processRequest(context) {
  const { request, env } = context;
  const originError = rejectUnknownOrigin(request);
  if (originError) return originError;
  if (role(request) !== 'admin') {
    return jsonReply(request, { ok: false, mensaje: 'Acceso exclusivo del administrador.' }, 403);
  }

  let body;
  try {
    body = await readJson(request);
  } catch (error) {
    return jsonReply(request, { ok: false, mensaje: error.message }, 400);
  }

  const action = normalizeAction(body.accion || body.action);
  const payload = body.datos || body.data || {};
  try {
    if (action === 'ADMIN_EDITAR_COMENTARIO_TRABAJO_TITULACION') return jsonReply(request, await editComment(payload, env));
    if (action === 'ADMIN_REABRIR_REVISION_TRABAJO_TITULACION') return jsonReply(request, await reopenReview(payload, env));
    if (action === 'ADMIN_DEVOLVER_TRABAJO_TITULACION') return jsonReply(request, await returnWork(payload, env));
    if (action === 'ADMIN_QUITAR_ENVIO_TRABAJO_TITULACION') return jsonReply(request, await removeWork(payload, env));
    return jsonReply(request, { ok: false, mensaje: 'Acción administrativa no reconocida.' }, 400);
  } catch (error) {
    return jsonReply(request, {
      ok: false,
      mensaje: error && error.message ? error.message : 'No se pudo completar la operación administrativa.'
    }, 500);
  }
}

export function onRequestOptions(context) {
  return new Response(null, { status: 204, headers: corsHeaders(context.request) });
}

export function onRequestPost(context) {
  return processRequest(context);
}
