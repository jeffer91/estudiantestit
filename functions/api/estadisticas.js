import {
  assignCareerCoordinator,
  buildAdminGlobalList,
  buildAdminStatistics,
  listAdminCareers,
  listAdminPeriodsCatalog,
  saveAdminPeriod
} from '../_lib/estadisticas-admin.js';
import { jsonReply, readJson, rejectUnknownOrigin, role, text } from '../_lib/http.js';

export async function onRequestOptions(context) {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-Titulos-App',
      'Access-Control-Max-Age': '86400'
    }
  });
}

async function execute(action, data, env) {
  const normalized = text(action || 'ADMIN_ESTADISTICAS_TITULOS').toUpperCase();
  if (normalized === 'ADMIN_LISTA_GLOBAL_TITULOS') return buildAdminGlobalList(data, env);
  if (normalized === 'ADMIN_ESTADISTICAS_TITULOS') return buildAdminStatistics(data, env);
  if (normalized === 'ADMIN_LISTAR_PERIODOS') return listAdminPeriodsCatalog(env);
  if (normalized === 'ADMIN_GUARDAR_PERIODO') return saveAdminPeriod(data, env);
  if (normalized === 'ADMIN_LISTAR_CARRERAS') return listAdminCareers(env);
  if (normalized === 'ADMIN_ASIGNAR_CARRERA_COORDINADOR') return assignCareerCoordinator(data, env);
  throw new Error('Acción administrativa no implementada: ' + action);
}

export async function onRequestGet(context) {
  const rejected = rejectUnknownOrigin(context.request);
  if (rejected) return rejected;
  if (role(context.request) !== 'admin') {
    return jsonReply(context.request, { ok: false, mensaje: 'Acceso exclusivo del administrador.' }, 403);
  }

  try {
    const url = new URL(context.request.url);
    const action = url.searchParams.get('action') || 'ADMIN_ESTADISTICAS_TITULOS';
    const result = await execute(action, {
      periodo: url.searchParams.get('periodo') || '',
      periodoId: url.searchParams.get('periodoId') || '',
      carrera: url.searchParams.get('carrera') || ''
    }, context.env);
    return jsonReply(context.request, result);
  } catch (error) {
    return jsonReply(context.request, {
      ok: false,
      mensaje: error && error.message ? error.message : 'No se pudo completar la operación administrativa.'
    }, 500);
  }
}

export async function onRequestPost(context) {
  const rejected = rejectUnknownOrigin(context.request);
  if (rejected) return rejected;
  if (role(context.request) !== 'admin') {
    return jsonReply(context.request, { ok: false, mensaje: 'Acceso exclusivo del administrador.' }, 403);
  }

  try {
    const body = await readJson(context.request);
    const action = body && (body.accion || body.action || body.tipo) || 'ADMIN_ESTADISTICAS_TITULOS';
    const data = body && (body.datos || body.data || body) || {};
    const result = await execute(action, data, context.env);
    return jsonReply(context.request, result);
  } catch (error) {
    return jsonReply(context.request, {
      ok: false,
      mensaje: error && error.message ? error.message : 'No se pudo completar la operación administrativa.'
    }, 500);
  }
}
