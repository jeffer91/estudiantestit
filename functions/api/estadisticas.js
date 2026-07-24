import { buildAdminStatistics } from '../_lib/estadisticas-admin.js';
import { jsonReply, readJson, rejectUnknownOrigin, role } from '../_lib/http.js';

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

export async function onRequestGet(context) {
  const rejected = rejectUnknownOrigin(context.request);
  if (rejected) return rejected;
  if (role(context.request) !== 'admin') {
    return jsonReply(context.request, { ok: false, mensaje: 'Acceso exclusivo del administrador.' }, 403);
  }

  try {
    const url = new URL(context.request.url);
    const result = await buildAdminStatistics({
      periodo: url.searchParams.get('periodo') || '',
      periodoId: url.searchParams.get('periodoId') || '',
      carrera: url.searchParams.get('carrera') || ''
    }, context.env);
    return jsonReply(context.request, result);
  } catch (error) {
    return jsonReply(context.request, {
      ok: false,
      mensaje: error && error.message ? error.message : 'No se pudieron calcular las estadísticas.'
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
    const result = await buildAdminStatistics(body && (body.datos || body.data || body) || {}, context.env);
    return jsonReply(context.request, result);
  } catch (error) {
    return jsonReply(context.request, {
      ok: false,
      mensaje: error && error.message ? error.message : 'No se pudieron calcular las estadísticas.'
    }, 500);
  }
}
