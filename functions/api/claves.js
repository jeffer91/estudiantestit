import { requestClaves } from '../_lib/claves.js';
import {
  corsHeaders,
  jsonReply,
  readJson,
  rejectUnknownOrigin,
  role,
  text
} from '../_lib/http.js';

function isAdmin(request) {
  return role(request) === 'admin';
}

function safeAction(value) {
  return text(value).toLowerCase();
}

export async function onRequest({ request, env }) {
  const originError = rejectUnknownOrigin(request);
  if (originError) return originError;

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(request) });
  }

  if (!['GET', 'POST'].includes(request.method)) {
    return jsonReply(request, { ok: false, mensaje: 'Método no permitido.' }, 405);
  }

  try {
    let input = {};
    let action = '';

    if (request.method === 'GET') {
      const url = new URL(request.url);
      action = safeAction(url.searchParams.get('action') || 'public-status');
    } else {
      input = await readJson(request);
      action = safeAction(input.action || input.accion);
    }

    if (action === 'public-status') {
      return jsonReply(
        request,
        await requestClaves(env, 'LISTAR_SERVICIOS_PUBLICOS', {})
      );
    }

    if (!isAdmin(request)) {
      return jsonReply(request, { ok: false, mensaje: 'Acción no permitida.' }, 403);
    }

    if (action === 'admin-list') {
      return jsonReply(
        request,
        await requestClaves(env, 'LISTAR_SERVICIOS_ADMIN', {})
      );
    }

    if (action === 'admin-save') {
      const service = input.service || input.servicio || {};
      return jsonReply(
        request,
        await requestClaves(env, 'GUARDAR_SERVICIO', { servicio: service })
      );
    }

    return jsonReply(
      request,
      { ok: false, mensaje: 'Acción de configuración desconocida.' },
      400
    );
  } catch (error) {
    return jsonReply(
      request,
      { ok: false, mensaje: error.message || String(error) },
      502
    );
  }
}
