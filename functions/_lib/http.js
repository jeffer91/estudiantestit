/* Utilidades HTTP compartidas para Pages Functions. */

export const ALLOWED_ORIGINS = new Set([
  'null',
  'https://titulos.pages.dev',
  'https://titulos-administrador.pages.dev',
  'https://titulos-coordinadores.pages.dev',
  'https://coordinadores.pages.dev',
  'http://127.0.0.1:5500',
  'http://localhost:5500',
  'http://127.0.0.1:8788',
  'http://localhost:8788'
]);

export function text(value) {
  return String(value === null || value === undefined ? '' : value).trim();
}

export function normalizeAction(value) {
  return text(value).toUpperCase().replace(/[^A-Z0-9_]/g, '');
}

export function requestOrigin(request) {
  return text(request.headers.get('Origin'));
}

export function requestHost(request) {
  try {
    return new URL(request.url).hostname.toLowerCase();
  } catch (_error) {
    return '';
  }
}

export function appId(request) {
  return text(request.headers.get('X-Titulos-App')).toLowerCase();
}

function isPagesHost(host, projectHost) {
  return host === projectHost || host.endsWith('.' + projectHost);
}

export function role(request) {
  const host = requestHost(request);

  if (isPagesHost(host, 'titulos-administrador.pages.dev')) return 'admin';
  if (
    isPagesHost(host, 'titulos-coordinadores.pages.dev') ||
    isPagesHost(host, 'coordinadores.pages.dev')
  ) {
    return 'coordinator';
  }
  if (isPagesHost(host, 'titulos.pages.dev')) return 'student';

  if (['localhost', '127.0.0.1', '0.0.0.0', '::1', '[::1]'].includes(host)) {
    const app = appId(request);
    if (app === 'administrador' || app === 'admin') return 'admin';
    if (app === 'coordinadores' || app === 'coordinador' || app === 'coordinator') {
      return 'coordinator';
    }
  }

  return 'student';
}

export function corsHeaders(request) {
  const origin = requestOrigin(request);
  const headers = {
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Titulos-App',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin'
  };

  if (origin && ALLOWED_ORIGINS.has(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
  }

  return headers;
}

export function jsonReply(request, data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      ...corsHeaders(request)
    }
  });
}

export function rejectUnknownOrigin(request) {
  const origin = requestOrigin(request);
  if (origin && !ALLOWED_ORIGINS.has(origin)) {
    return jsonReply(request, { ok: false, mensaje: 'Origen no permitido.' }, 403);
  }
  return null;
}

export async function readJson(request) {
  if (!text(request.headers.get('Content-Type')).toLowerCase().includes('application/json')) {
    throw new Error('Se esperaba application/json.');
  }
  return request.json();
}

export function numberValue(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : Number(fallback || 0);
}

export async function fetchTimed(url, options, timeoutMs, timeoutMessage) {
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    Math.min(60000, Math.max(5000, numberValue(timeoutMs, 45000)))
  );

  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (error && error.name === 'AbortError') {
      throw new Error(timeoutMessage || 'La conexión superó el tiempo máximo.');
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export async function parseUpstream(response, sourceName) {
  const raw = await response.text();
  let data;

  try {
    data = raw ? JSON.parse(raw) : {};
  } catch (error) {
    throw new Error((sourceName || 'El servicio') + ' respondió en un formato no válido.');
  }

  if (!response.ok || data.ok === false) {
    throw new Error(
      text(data.mensaje || data.message || data.error) ||
      (sourceName || 'El servicio') + ' devolvió un error.'
    );
  }

  return data;
}
