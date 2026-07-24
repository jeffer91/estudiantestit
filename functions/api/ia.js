import { generateAi, listAiProviders, saveAiProvider, toggleAiProvider } from '../_lib/claves.js';
import { corsHeaders, jsonReply, originAllowed, requestOrigin, role, text } from '../_lib/http.js';

const PROVIDERS_CACHE_MS = 30000;
let providersCache = [];
let providersCacheExpiresAt = 0;
let providersPending = null;

function providerId(value) {
  return text(value).toLowerCase().replace(/[^a-z0-9_-]/g, '');
}

function clearProvidersCache() {
  providersCache = [];
  providersCacheExpiresAt = 0;
  providersPending = null;
}

function admin(request) {
  return role(request) === 'admin';
}

function adminProvider(provider) {
  provider = provider || {};
  const id = providerId(provider.id || provider.proveedor || provider.nombre);
  return {
    id,
    proveedor: id,
    nombre: text(provider.nombre || provider.name || id),
    tipo: text(provider.tipo || 'openai-compatible'),
    activo: provider.activo === true,
    prioridad: Number(provider.prioridad || 999),
    endpointConfigurado: Boolean(provider.endpointConfigurado || provider.endpoint),
    modelo: text(provider.modelo || provider.model),
    model: text(provider.model || provider.modelo),
    timeoutMs: Number(provider.timeoutMs || 45000),
    maxTokens: Number(provider.maxTokens || 3000),
    temperatura: Number(provider.temperatura || 0.3),
    descripcion: text(provider.descripcion),
    apiKeyConfigurada: provider.apiKeyConfigurada === true,
    ultimaPruebaOk: provider.ultimaPruebaOk === true,
    ultimaPruebaEn: text(provider.ultimaPruebaEn),
    ultimaLatenciaMs: Number(provider.ultimaLatenciaMs || 0),
    ultimoError: text(provider.ultimoError)
  };
}

function publicMotor(provider, index) {
  provider = provider || {};
  return {
    id: `motor_${index + 1}`,
    proveedor: `motor_${index + 1}`,
    nombre: `Motor interno ${index + 1}`,
    tipo: 'interno',
    activo: true,
    prioridad: index + 1,
    timeoutMs: Number(provider.timeoutMs || 45000),
    maxTokens: Number(provider.maxTokens || 3000),
    temperatura: Number(provider.temperatura || 0.3),
    descripcion: 'Motor interno de IA de Titulación.'
  };
}

async function activeProviders(env, force = false) {
  const now = Date.now();

  if (!force && providersCache.length && providersCacheExpiresAt > now) {
    return providersCache.slice();
  }
  if (!force && providersPending) {
    return providersPending.then((providers) => providers.slice());
  }

  providersPending = listAiProviders(env, false)
    .then((list) => {
      const providers = (Array.isArray(list) ? list : [])
        .filter((provider) => provider && provider.activo === true && providerId(provider.id || provider.proveedor));
      providers.sort((a, b) => Number(a.prioridad || 999) - Number(b.prioridad || 999));
      providersCache = providers;
      providersCacheExpiresAt = Date.now() + PROVIDERS_CACHE_MS;
      return providers;
    })
    .finally(() => {
      providersPending = null;
    });

  return providersPending.then((providers) => providers.slice());
}

function motorIndex(data, total) {
  const raw = text(data.motorId || data.providerId || data.provider || 'motor_1').toLowerCase();
  const match = raw.match(/(?:motor[_-]?)?(\d+)/);
  const explicit = Number(data.motorIndex);
  let index = Number.isFinite(explicit) && explicit >= 0
    ? explicit
    : match
      ? Number(match[1]) - 1
      : 0;
  if (!Number.isFinite(index) || index < 0) index = 0;
  return total > 0 ? index % total : 0;
}

function publicError(error) {
  const message = text(error && error.message || error).toLowerCase();
  if (/tiempo|timeout|abort/.test(message)) {
    return 'El servicio de IA superó el tiempo máximo. Intenta nuevamente.';
  }
  if (/429|cuota|quota|rate|límite|limit/.test(message)) {
    return 'El servicio de IA alcanzó temporalmente su límite. Intenta nuevamente en unos minutos.';
  }
  if (/json|formato|sin texto|respuesta vacía/.test(message)) {
    return 'El servicio de IA respondió, pero la respuesta no pudo procesarse correctamente.';
  }
  if (/credencial|api.?key|token|401|403/.test(message)) {
    return 'El servicio de IA no está disponible en este momento.';
  }
  return 'No fue posible completar la solicitud de IA. Intenta nuevamente.';
}

async function generatePublic(env, data) {
  const providers = await activeProviders(env, false);
  if (!providers.length) throw new Error('No hay motores de IA activos.');

  const index = motorIndex(data, providers.length);
  const provider = providers[index];
  const prompt = text(data.prompt);
  if (!prompt) throw new Error('No se recibió el contenido de la solicitud.');

  try {
    const result = await generateAi(
      env,
      providerId(provider.id || provider.proveedor),
      prompt,
      data.options || {}
    );
    const output = text(result.text || result.respuesta);
    if (!output) throw new Error('Respuesta vacía del servicio de IA.');

    return {
      ok: true,
      motorId: `motor_${index + 1}`,
      text: output,
      latencyMs: Number(result.latencyMs || 0)
    };
  } catch (error) {
    throw new Error(publicError(error));
  }
}

async function input(request) {
  if (request.method === 'GET') {
    const url = new URL(request.url);
    return {
      action: url.searchParams.get('action') || 'list',
      providerId: url.searchParams.get('providerId') || ''
    };
  }
  if (!text(request.headers.get('Content-Type')).toLowerCase().includes('application/json')) {
    throw new Error('Se esperaba application/json.');
  }
  return request.json();
}

export async function onRequest({ request, env }) {
  const origin = requestOrigin(request);
  if (origin && !originAllowed(origin)) {
    return jsonReply(request, { ok: false, mensaje: 'Origen no permitido.' }, 403);
  }
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(request) });
  }
  if (!['GET', 'POST'].includes(request.method)) {
    return jsonReply(request, { ok: false, mensaje: 'Método no permitido.' }, 405);
  }

  try {
    const data = await input(request);
    const action = text(data.action || data.accion).toLowerCase();

    if (action === 'list') {
      const providers = await activeProviders(env, false);
      return jsonReply(request, {
        ok: true,
        activo: providers.length > 0,
        totalActivos: providers.length,
        motoresDisponibles: providers.length,
        proveedores: providers.map(publicMotor),
        cacheMs: PROVIDERS_CACHE_MS
      });
    }

    if (action.startsWith('admin-')) {
      if (!admin(request)) {
        return jsonReply(request, { ok: false, mensaje: 'Acción no permitida.' }, 403);
      }
      if (action === 'admin-list') {
        clearProvidersCache();
        return jsonReply(request, {
          ok: true,
          proveedores: (await listAiProviders(env, true)).map(adminProvider)
        });
      }
      if (action === 'admin-toggle') {
        await toggleAiProvider(env, data.providerId, data.activo === true);
        clearProvidersCache();
        return jsonReply(request, { ok: true, providerId: providerId(data.providerId) });
      }
      if (action === 'admin-save') {
        const result = await saveAiProvider(env, data.provider || {});
        clearProvidersCache();
        return jsonReply(request, {
          ok: true,
          proveedor: adminProvider(result.proveedor || result.data || data.provider || {})
        });
      }
      if (action === 'admin-test') {
        const result = await generateAi(
          env,
          data.providerId,
          text(data.prompt) || 'Responde con una prueba breve.',
          data.options || {}
        );
        return jsonReply(request, {
          ok: true,
          provider: providerId(data.providerId),
          text: result.text || result.respuesta || '',
          latencyMs: Number(result.latencyMs || 0)
        });
      }
      return jsonReply(request, { ok: false, mensaje: 'Acción administrativa desconocida.' }, 400);
    }

    return jsonReply(request, await generatePublic(env, data));
  } catch (error) {
    const message = admin(request)
      ? text(error && error.message || error)
      : publicError(error);
    return jsonReply(request, { ok: false, error: message, mensaje: message }, 502);
  }
}
