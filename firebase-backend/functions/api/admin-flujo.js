import { commitDocuments, getDocument, nowIso } from '../_lib/firestore-fixed.js';
import { corsHeaders, jsonReply, normalizeAction, readJson, rejectUnknownOrigin, role, text } from '../_lib/http.js';

const ACTIONS = new Set([
  'PING',
  'ADMIN_DEVOLVER_COORDINADOR',
  'ADMIN_DEVOLVER_INVESTIGADOR',
  'ADMIN_APROBAR_DIRECTO'
]);

function digits(value) {
  return text(value).replace(/\D/g, '');
}

function normalizeTitle(value) {
  return text(value).replace(/\s+/g, ' ').trim();
}

function validateReason(value) {
  const reason = text(value).replace(/\s+/g, ' ').trim();
  if (reason.length < 4) throw new Error('Escribe un motivo de al menos 4 caracteres.');
  return reason;
}

function workflowEventId(envioId, action) {
  const random = typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID().replace(/-/g, '').slice(0, 12)
    : Math.random().toString(36).slice(2, 14);
  return (text(envioId) + '__admin__' + action.toLowerCase() + '__' + Date.now() + '__' + random).replace(/\//g, '__');
}

function investigationLockId(envioId) {
  return text(envioId).replace(/\//g, '__');
}

function currentTitle(envio = {}) {
  return normalizeTitle(
    envio.tituloFinal ||
    envio.tituloFinalInvestigacion ||
    envio.tituloCoordinador ||
    envio.tituloValidadoCoordinador ||
    envio.tituloAprobado ||
    envio.tituloPreferidoTexto ||
    envio.titulo1
  );
}

function coordinatorTitle(envio = {}) {
  return normalizeTitle(envio.tituloCoordinador || envio.tituloValidadoCoordinador);
}

function proposalTitle(envio = {}, number) {
  const n = Number(number || 0);
  if (![1, 2, 3].includes(n)) throw new Error('Selecciona uno de los tres títulos antes de aprobar.');
  const title = normalizeTitle(envio['titulo' + n]);
  if (!title) throw new Error('El título seleccionado no está registrado en el envío.');
  return { number: n, title };
}

async function loadSubmission(payload, env) {
  const envioId = text(payload.envioId || payload.idRegistro);
  if (!envioId) throw new Error('No se indicó el envío que se va a modificar.');
  const envio = await getDocument('TITULOS', 'envios', envioId, env);
  if (!envio) throw new Error('El envío ya no existe. Actualiza la lista e inténtalo nuevamente.');
  const requestedCedula = digits(payload.cedula || payload.numeroIdentificacion);
  const actualCedula = digits(envio.cedula || envio.numeroIdentificacion);
  if (requestedCedula && actualCedula && requestedCedula !== actualCedula) {
    throw new Error('El envío no corresponde al estudiante seleccionado.');
  }
  return { envioId, envio };
}

async function appendLockRelease(operations, envioId, fecha, env) {
  const id = investigationLockId(envioId);
  const lock = await getDocument('TITULOS', 'investigacion_bloqueos', id, env);
  if (!lock) return;
  operations.push({
    collection: 'investigacion_bloqueos',
    id,
    data: {
      bloqueoHasta: new Date(0).toISOString(),
      liberadoEn: fecha,
      liberadoPor: 'ADMINISTRADOR'
    },
    merge: true,
    ...(lock._updateTime ? { updateTime: lock._updateTime } : {})
  });
}

function eventOperation(envioId, envio, action, result, before, after, reason, fecha) {
  return {
    collection: 'workflow_eventos',
    id: workflowEventId(envioId, action),
    data: {
      envioId,
      rol: 'ADMINISTRADOR',
      revisorId: 'ADMIN',
      revisorNombre: 'Administrador de Titulación',
      accion: action,
      resultado: result,
      estadoAnterior: text(envio.estadoProceso || envio.estado),
      estadoNuevo: result,
      tituloAntes: before,
      tituloDespues: after,
      observacion: reason,
      fecha
    },
    merge: false,
    exists: false
  };
}

async function returnToCoordinator(payload, env) {
  const reason = validateReason(payload.motivo || payload.observacion);
  const { envioId, envio } = await loadSubmission(payload, env);
  const fecha = nowIso();
  const before = currentTitle(envio);
  const operations = [
    {
      collection: 'envios',
      id: envioId,
      data: {
        estado: 'PENDIENTE_REVISION',
        estadoFinal: 'PENDIENTE_COORDINADOR',
        estadoProceso: 'PENDIENTE_COORDINADOR',
        requiereAccionDe: 'COORDINACION',
        permitirReenvio: false,
        devueltoPor: '',
        validadoCoordinador: false,
        resultadoAdministrativo: 'DEVUELTO_COORDINADOR',
        motivoAccionAdministrativa: reason,
        fechaAccionAdministrativa: fecha,
        tituloFinal: null,
        tituloFinalInvestigacion: null,
        tituloAprobado: null,
        tituloSeleccionadoNumero: null,
        resultadoInvestigacion: null,
        observacionInvestigacion: null,
        fechaResolucionInvestigacion: null,
        investigacionRevisionId: null,
        aprobadoPor: null,
        aprobadoPorRol: null,
        fechaAprobacionAdministrativa: null,
        actualizadoEn: fecha
      },
      merge: true,
      ...(envio._updateTime ? { updateTime: envio._updateTime } : {})
    },
    eventOperation(envioId, envio, 'DEVOLVER_COORDINADOR', 'PENDIENTE_COORDINADOR', before, before, reason, fecha)
  ];
  await appendLockRelease(operations, envioId, fecha, env);
  await commitDocuments('TITULOS', operations, env);
  return {
    ok: true,
    estado: 'PENDIENTE_COORDINADOR',
    mensaje: 'El título fue devuelto a Coordinación y quedó nuevamente disponible para revisión.'
  };
}

async function returnToInvestigator(payload, env) {
  const reason = validateReason(payload.motivo || payload.observacion);
  const { envioId, envio } = await loadSubmission(payload, env);
  const validatedTitle = coordinatorTitle(envio);
  if (!validatedTitle) {
    throw new Error('No existe un título validado por Coordinación. Primero debe pasar por Coordinación.');
  }
  const fecha = nowIso();
  const before = currentTitle(envio);
  const operations = [
    {
      collection: 'envios',
      id: envioId,
      data: {
        estado: 'PENDIENTE_INVESTIGADOR',
        estadoFinal: 'PENDIENTE_INVESTIGADOR',
        estadoProceso: 'PENDIENTE_INVESTIGADOR',
        requiereAccionDe: 'INVESTIGACION',
        permitirReenvio: false,
        devueltoPor: '',
        validadoCoordinador: true,
        tituloCoordinador: validatedTitle,
        resultadoAdministrativo: 'DEVUELTO_INVESTIGADOR',
        motivoAccionAdministrativa: reason,
        fechaAccionAdministrativa: fecha,
        tituloFinal: null,
        tituloFinalInvestigacion: null,
        tituloAprobado: null,
        tituloSeleccionadoNumero: null,
        resultadoInvestigacion: null,
        observacionInvestigacion: null,
        fechaResolucionInvestigacion: null,
        investigacionRevisionId: null,
        aprobadoPor: null,
        aprobadoPorRol: null,
        fechaAprobacionAdministrativa: null,
        actualizadoEn: fecha
      },
      merge: true,
      ...(envio._updateTime ? { updateTime: envio._updateTime } : {})
    },
    eventOperation(envioId, envio, 'DEVOLVER_INVESTIGADOR', 'PENDIENTE_INVESTIGADOR', before, validatedTitle, reason, fecha)
  ];
  await appendLockRelease(operations, envioId, fecha, env);
  await commitDocuments('TITULOS', operations, env);
  return {
    ok: true,
    estado: 'PENDIENTE_INVESTIGADOR',
    tituloCoordinador: validatedTitle,
    mensaje: 'El título fue devuelto a Investigación y quedó disponible para una nueva revisión.'
  };
}

async function approveDirectly(payload, env) {
  const reason = validateReason(payload.motivo || payload.observacion);
  const { envioId, envio } = await loadSubmission(payload, env);
  if (text(envio.estadoProceso || envio.estado).toUpperCase() === 'APROBADO_FINAL') {
    throw new Error('Este título ya tiene aprobación final. Usa la corrección administrativa si necesitas modificarlo.');
  }
  const selected = proposalTitle(envio, payload.tituloNumero);
  const fecha = nowIso();
  const before = currentTitle(envio);
  const operations = [
    {
      collection: 'envios',
      id: envioId,
      data: {
        estado: 'APROBADO_FINAL',
        estadoFinal: 'APROBADO_FINAL',
        estadoProceso: 'APROBADO_FINAL',
        requiereAccionDe: '',
        permitirReenvio: false,
        devueltoPor: '',
        tituloFinal: selected.title,
        tituloAprobado: selected.title,
        tituloSeleccionadoNumero: selected.number,
        tituloFinalInvestigacion: null,
        resultadoInvestigacion: null,
        observacionInvestigacion: null,
        fechaResolucionInvestigacion: null,
        investigacionRevisionId: null,
        resultadoAdministrativo: 'APROBADO_DIRECTO',
        aprobadoPor: 'Administrador de Titulación',
        aprobadoPorRol: 'ADMINISTRADOR',
        motivoAprobacionAdministrativa: reason,
        fechaAprobacionAdministrativa: fecha,
        fechaAccionAdministrativa: fecha,
        actualizadoEn: fecha
      },
      merge: true,
      ...(envio._updateTime ? { updateTime: envio._updateTime } : {})
    },
    eventOperation(envioId, envio, 'APROBAR_DIRECTO', 'APROBADO_FINAL', before, selected.title, reason, fecha)
  ];
  await appendLockRelease(operations, envioId, fecha, env);
  await commitDocuments('TITULOS', operations, env);
  return {
    ok: true,
    estado: 'APROBADO_FINAL',
    tituloNumero: selected.number,
    tituloFinal: selected.title,
    aprobadoPorRol: 'ADMINISTRADOR',
    mensaje: 'Título aprobado directamente por Administración. La acción quedó registrada en el historial.'
  };
}

async function execute(action, payload, env) {
  if (!ACTIONS.has(action)) throw new Error('Acción administrativa no reconocida.');
  if (action === 'PING') return { ok: true, modulo: 'admin-flujo', version: '1.0.0' };
  if (action === 'ADMIN_DEVOLVER_COORDINADOR') return returnToCoordinator(payload, env);
  if (action === 'ADMIN_DEVOLVER_INVESTIGADOR') return returnToInvestigator(payload, env);
  if (action === 'ADMIN_APROBAR_DIRECTO') return approveDirectly(payload, env);
  throw new Error('Acción administrativa no reconocida.');
}

export async function onRequest({ request, env }) {
  const bad = rejectUnknownOrigin(request);
  if (bad) return bad;
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(request) });
  }
  if (request.method !== 'POST') {
    return jsonReply(request, { ok: false, mensaje: 'Método no permitido.' }, 405);
  }
  if (role(request) !== 'admin') {
    return jsonReply(request, { ok: false, mensaje: 'Acceso exclusivo del Administrador.' }, 403);
  }

  try {
    const input = await readJson(request);
    const action = normalizeAction(input.accion || input.action);
    const payload = input.datos && typeof input.datos === 'object' ? input.datos : input;
    return jsonReply(request, await execute(action, payload, env));
  } catch (error) {
    return jsonReply(request, {
      ok: false,
      mensaje: error && error.message ? error.message : 'No se pudo completar la acción administrativa.'
    }, 400);
  }
}
