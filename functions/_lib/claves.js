/* Acceso al Apps Script central Claves. Los secretos se usan dentro de Apps Script. */

export function text(value) {
  return String(value === null || value === undefined ? '' : value).trim();
}

function validateUrl(value) {
  const raw = text(value);
  if (!raw) throw new Error('No está configurada CLAVES_APPS_SCRIPT_URL.');
  const url = new URL(raw);
  if (
    url.protocol !== 'https:' ||
    !['script.google.com', 'script.googleusercontent.com'].includes(url.hostname) ||
    !url.pathname.endsWith('/exec')
  ) {
    throw new Error('CLAVES_APPS_SCRIPT_URL no es una URL válida terminada en /exec.');
  }
  return url.toString();
}

function timeoutValue(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : Number(fallback || 30000);
}

async function fetchTimed(url, options, timeoutMs) {
  const controller = new AbortController();
  const ms = Math.min(120000, Math.max(5000, timeoutValue(timeoutMs, 30000)));
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (error && error.name === 'AbortError') {
      throw new Error('La conexión con Claves superó el tiempo máximo.');
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function decodeJsonLayers(value, maxDepth = 4) {
  let current = value;
  for (let depth = 0; depth < maxDepth && typeof current === 'string'; depth += 1) {
    const raw = current.trim();
    if (!raw) return {};
    try {
      current = JSON.parse(raw);
    } catch (error) {
      break;
    }
  }
  return current;
}

function normalizeJsonResponse(value) {
  const decoded = decodeJsonLayers(value);
  if (!decoded || typeof decoded !== 'object') return decoded;

  const output = Array.isArray(decoded) ? decoded.slice() : { ...decoded };
  for (const key of ['respuesta', 'data', 'resultado', 'result']) {
    if (typeof output[key] === 'string') {
      output[key] = decodeJsonLayers(output[key]);
    }
  }
  return output;
}

export async function requestClaves(env, action, data = {}, timeoutMs) {
  const access = text(env.CLAVES_ACCESS_TOKEN);
  if (!access) throw new Error('No está configurado CLAVES_ACCESS_TOKEN.');

  const response = await fetchTimed(
    validateUrl(env.CLAVES_APPS_SCRIPT_URL),
    {
      method: 'POST',
      cache: 'no-store',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        accion: text(action).toUpperCase(),
        action: text(action).toUpperCase(),
        acceso: access,
        datos: data || {}
      })
    },
    timeoutMs || env.CLAVES_TIMEOUT_MS || 30000
  );

  const raw = await response.text();
  let result;
  try {
    result = normalizeJsonResponse(raw || '{}');
  } catch (error) {
    throw new Error('Claves respondió en un formato no válido.');
  }

  if (!result || typeof result !== 'object') {
    throw new Error('Claves respondió en un formato no válido.');
  }
  if (!response.ok || result.ok === false) {
    throw new Error(text(result.mensaje || result.error) || 'Claves devolvió un error.');
  }
  return result;
}

export function runService(env, service, action, method, payload, role, timeoutMs) {
  return requestClaves(env, 'EJECUTAR_SERVICIO', {
    servicio: text(service).toUpperCase(),
    accionServicio: text(action).toUpperCase(),
    metodo: text(method || 'POST').toUpperCase(),
    rol: text(role || 'student'),
    payload: payload || {}
  }, timeoutMs);
}

export function getPublicStatus(env) {
  return requestClaves(env, 'LISTAR_SERVICIOS_PUBLICOS', {});
}

export function listAiProviders(env, includeInactive = false) {
  return requestClaves(
    env,
    includeInactive ? 'LISTAR_PROVEEDORES_IA_ADMIN' : 'LISTAR_PROVEEDORES_IA_PUBLICOS',
    {}
  ).then((result) => Array.isArray(result.proveedores) ? result.proveedores : []);
}

export function generateAi(env, providerId, prompt, options) {
  return requestClaves(env, 'GENERAR_IA', {
    providerId: text(providerId),
    prompt: text(prompt),
    options: options || {}
  });
}

export function saveAiProvider(env, provider) {
  return requestClaves(env, 'GUARDAR_PROVEEDOR_IA', { proveedor: provider || {} });
}

export function toggleAiProvider(env, providerId, active) {
  return requestClaves(env, 'CAMBIAR_ESTADO_PROVEEDOR_IA', {
    providerId: text(providerId),
    activo: active === true
  });
}
