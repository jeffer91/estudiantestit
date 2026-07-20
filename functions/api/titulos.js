import { getService } from '../_lib/claves.js';
import {
  corsHeaders,
  fetchTimed,
  jsonReply,
  normalizeAction,
  parseUpstream,
  readJson,
  rejectUnknownOrigin,
  role,
  text
} from '../_lib/http.js';

const STUDENT = new Set([
  'PING',
  'CONFIGURACION_PUBLICA',
  'CONSULTAR_ENVIO_CEDULA',
  'VERIFICAR_ENVIO',
  'ENVIO_ESTUDIANTE'
]);

const COORDINATOR = new Set([
  'PING',
  'CONFIGURACION_PUBLICA',
  'LISTAR_COORDINADORES',
  'LISTAR_ENVIOS_COORDINADOR',
  'LISTAR_ENVIOS_POR_CARRERA',
  'VERIFICAR_ENVIO',
  'CONSULTAR_ENVIO_CEDULA',
  'APROBAR_ENVIO_COORDINADOR',
  'DEVOLVER_ENVIO_COORDINADOR',
  'GUARDAR_REVISION_COORDINADOR',
  'GUARDAR_RESOLUCION',
  'MOVER_DEVUELTO_COORDINADOR',
  'GUARDAR_LOG'
]);

const ADMIN = new Set([
  ...STUDENT,
  ...COORDINATOR,
  'RESUMEN_ADMINISTRADOR',
  'LISTAR_BASE_ESTUDIANTES',
  'GUARDAR_COORDINADOR',
  'ACTUALIZAR_COORDINADOR',
  'CAMBIAR_ESTADO_COORDINADOR',
  'ASIGNAR_CARRERA',
  'SINCRONIZAR_COORDINADORES',
  'ADMIN_DEVOLVER_TITULOS',
  'ADMIN_ELIMINAR_TITULOS',
  'LISTAR_PENDIENTES_SYNC',
  'LISTAR_HISTORIAL_REPARACIONES',
  'LISTAR_LOGS',
  'ANALIZAR_GOOGLE_SHEETS',
  'CORREGIR_GOOGLE_SHEETS',
  'CONSULTAR_ESTUDIANTE'
]);

const READS = new Set([
  'PING',
  'LISTAR_COORDINADORES',
  'LISTAR_ENVIOS_COORDINADOR',
  'LISTAR_ENVIOS_POR_CARRERA',
  'VERIFICAR_ENVIO',
  'CONSULTAR_ENVIO_CEDULA',
  'RESUMEN_ADMINISTRADOR',
  'LISTAR_BASE_ESTUDIANTES',
  'LISTAR_PENDIENTES_SYNC',
  'LISTAR_HISTORIAL_REPARACIONES',
  'LISTAR_LOGS',
  'ANALIZAR_GOOGLE_SHEETS',
  'CONSULTAR_ESTUDIANTE'
]);

function allowed(userRole, action) {
  if (userRole === 'admin') return ADMIN.has(action);
  if (userRole === 'coordinator') return COORDINATOR.has(action);
  return STUDENT.has(action);
}

function serialize(value) {
  if (value === null || value === undefined) return '';
  if (Array.isArray(value)) return value.join(',');
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function buildGetUrl(service, action, payload, userRole) {
  const url = new URL(service.endpoint);
  url.searchParams.set('accion', action);
  url.searchParams.set('action', action);
  url.searchParams.set(
    'origen',
    userRole === 'admin'
      ? 'administrador'
      : userRole === 'coordinator'
        ? 'coordinadores-mvp'
        : 'estudiantes-mvp'
  );

  if (service.token) url.searchParams.set('token', service.token);
  if (service.spreadsheetId) {
    url.searchParams.set('spreadsheetId', service.spreadsheetId);
  }

  Object.keys(payload || {}).forEach((key) => {
    if (
      ['accion', 'action', 'tipo', 'datos', 'token', 'metodo'].includes(key)
    ) {
      return;
    }

    const value = serialize(payload[key]);
    if (value !== '') url.searchParams.set(key, value);
  });

  return url.toString();
}

function buildPostBody(service, action, payload, userRole) {
  const clean = { ...(payload || {}) };
  delete clean.accion;
  delete clean.action;
  delete clean.tipo;
  delete clean.datos;
  delete clean.metodo;
  delete clean.token;

  const body = {
    accion: action,
    action,
    tipo: action,
    origen:
      userRole === 'admin'
        ? 'administrador'
        : userRole === 'coordinator'
          ? 'coordinadores-mvp'
          : 'estudiantes-mvp',
    datos: { ...clean },
    ...clean
  };

  if (service.token) {
    body.token = service.token;
    body.datos.token = service.token;
  }

  if (service.spreadsheetId) {
    body.spreadsheetId = service.spreadsheetId;
    body.datos.spreadsheetId = service.spreadsheetId;
  }

  return body;
}

async function sendToTitulos(service, action, payload, method, userRole) {
  const useGet =
    READS.has(action) && text(method).toUpperCase() !== 'POST';

  let response;

  if (useGet) {
    response = await fetchTimed(
      buildGetUrl(service, action, payload, userRole),
      { method: 'GET', cache: 'no-store' },
      service.timeoutMs,
      'La conexión con RESPALDO TITULOS APP superó el tiempo máximo.'
    );
  } else {
    response = await fetchTimed(
      service.endpoint,
      {
        method: 'POST',
        cache: 'no-store',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(
          buildPostBody(service, action, payload, userRole)
        )
      },
      service.timeoutMs,
      'La conexión con RESPALDO TITULOS APP superó el tiempo máximo.'
    );
  }

  return parseUpstream(response, 'RESPALDO TITULOS APP');
}

export async function onRequest({ request, env }) {
  const originError = rejectUnknownOrigin(request);
  if (originError) return originError;

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(request) });
  }

  if (request.method !== 'POST') {
    return jsonReply(
      request,
      { ok: false, mensaje: 'Método no permitido.' },
      405
    );
  }

  try {
    const input = await readJson(request);
    const action = normalizeAction(
      input.accion || input.action || input.tipo
    );
    const userRole = role(request);

    if (!action) throw new Error('No se indicó una acción.');
    if (!allowed(userRole, action)) {
      return jsonReply(
        request,
        { ok: false, mensaje: 'Acción no permitida para esta pantalla.' },
        403
      );
    }

    const service = await getService(env, 'TITULOS');

    if (action === 'CONFIGURACION_PUBLICA') {
      return jsonReply(request, {
        ok: true,
        activo: service.activo,
        nombre: service.nombre || 'RESPALDO TITULOS APP',
        timeoutMs: service.timeoutMs,
        version: service.version,
        estado: service.estado,
        mensaje: service.mensaje,
        origenConfig: 'claves'
      });
    }

    const nested =
      input.datos && typeof input.datos === 'object' ? input.datos : {};
    const payload = { ...input, ...nested };
    delete payload.token;

    const data = await sendToTitulos(
      service,
      action,
      payload,
      input.metodo,
      userRole
    );

    return jsonReply(request, data);
  } catch (error) {
    return jsonReply(
      request,
      {
        ok: false,
        servicio: 'TITULOS',
        mensaje: error.message || String(error)
      },
      502
    );
  }
}
