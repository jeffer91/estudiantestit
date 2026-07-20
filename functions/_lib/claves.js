/* Acceso seguro a la hoja central Claves mediante su Apps Script. */

export function text(value) {
  return String(value === null || value === undefined ? '' : value).trim();
}

function number(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : Number(fallback || 0);
}

function validateAppsScriptUrl(value, label) {
  const raw = text(value);
  if (!raw) throw new Error('No está configurada ' + label + '.');
  const url = new URL(raw);
  if (
    url.protocol !== 'https:' ||
    !['script.google.com', 'script.googleusercontent.com'].includes(url.hostname) ||
    !url.pathname.endsWith('/exec')
  ) {
    throw new Error(label + ' no es una URL válida de Apps Script terminada en /exec.');
  }
  return url.toString();
}

async function fetchTimed(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    Math.min(60000, Math.max(5000, number(timeoutMs, 30000)))
  );

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

async function parseResponse(response, sourceName) {
  const raw = await response.text();
  let data;

  try {
    data = raw ? JSON.parse(raw) : {};
  } catch (error) {
    throw new Error(sourceName + ' respondió en un formato no válido.');
  }

  if (!response.ok || data.ok === false) {
    throw new Error(
      text(data.mensaje || data.message || data.error) ||
      sourceName + ' devolvió un error.'
    );
  }

  return data;
}

export async function requestClaves(env, action, data = {}) {
  const endpoint = validateAppsScriptUrl(
    env.CLAVES_APPS_SCRIPT_URL,
    'CLAVES_APPS_SCRIPT_URL'
  );
  const accessToken = text(env.CLAVES_ACCESS_TOKEN);

  if (!accessToken) {
    throw new Error('No está configurado CLAVES_ACCESS_TOKEN.');
  }

  const response = await fetchTimed(
    endpoint,
    {
      method: 'POST',
      cache: 'no-store',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        accion: text(action).toUpperCase(),
        action: text(action).toUpperCase(),
        token: accessToken,
        datos: data || {},
        ...data
      })
    },
    env.CLAVES_TIMEOUT_MS || 30000
  );

  return parseResponse(response, 'Claves');
}

function normalizeService(raw, key) {
  raw = raw || {};
  const endpoint = validateAppsScriptUrl(
    raw.endpoint || raw.url || raw.webAppUrl || raw.appsScriptUrl,
    'Endpoint del servicio ' + key
  );

  return {
    key: text(raw.clave || raw.key || key).toUpperCase(),
    nombre: text(raw.nombre || raw.name || key),
    tipo: text(raw.tipo || 'apps-script'),
    endpoint,
    token: text(raw.token || raw.accessToken || raw.apiToken),
    spreadsheetId: text(raw.spreadsheetId || raw.googleSheetsId),
    activo: raw.activo !== false && text(raw.estado || 'ACTIVO').toUpperCase() !== 'INACTIVO',
    estado: text(raw.estado || 'ACTIVO').toUpperCase(),
    timeoutMs: Math.min(60000, Math.max(5000, number(raw.timeoutMs, 45000))),
    version: text(raw.version),
    mensaje: text(raw.mensaje),
    actualizadoEn: text(raw.actualizadoEn)
  };
}

export async function getService(env, key) {
  const response = await requestClaves(env, 'OBTENER_SERVICIO', {
    clave: text(key).toUpperCase()
  });
  const raw = response.servicio || response.data || response;
  const service = normalizeService(raw, key);

  if (!service.activo) {
    throw new Error(
      service.mensaje || 'El servicio ' + service.nombre + ' está inactivo.'
    );
  }

  return service;
}

export async function getPublicStatus(env) {
  const response = await requestClaves(env, 'LISTAR_SERVICIOS_PUBLICOS', {});
  return {
    ok: true,
    servicios: Array.isArray(response.servicios) ? response.servicios : [],
    configuracion: response.configuracion || {},
    actualizadoEn: response.actualizadoEn || ''
  };
}

export async function listAiProviders(env, includeInactive = false) {
  const response = await requestClaves(
    env,
    includeInactive
      ? 'LISTAR_PROVEEDORES_IA_ADMIN'
      : 'LISTAR_PROVEEDORES_IA_PUBLICOS',
    {}
  );
  return Array.isArray(response.proveedores) ? response.proveedores : [];
}

export async function getAiProvider(env, providerId) {
  const response = await requestClaves(env, 'OBTENER_PROVEEDOR_IA', {
    providerId: text(providerId)
  });
  return response.proveedor || response.data || response;
}

export async function saveAiProvider(env, provider) {
  return requestClaves(env, 'GUARDAR_PROVEEDOR_IA', {
    proveedor: provider || {}
  });
}

export async function toggleAiProvider(env, providerId, active) {
  return requestClaves(env, 'CAMBIAR_ESTADO_PROVEEDOR_IA', {
    providerId: text(providerId),
    activo: active === true
  });
}

export async function saveAiTest(env, data) {
  return requestClaves(env, 'REGISTRAR_PRUEBA_IA', data || {});
}

export async function saveService(env, service) {
  return requestClaves(env, 'GUARDAR_SERVICIO', {
    servicio: service || {}
  });
}
