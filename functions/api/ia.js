import { generateAi, listAiProviders, saveAiProvider, toggleAiProvider } from '../_lib/claves.js';
import { corsHeaders, jsonReply, originAllowed, requestOrigin, role, text } from '../_lib/http.js';

const PROVIDERS_CACHE_MS = 30000;
let providersCache = [];
let providersCacheExpiresAt = 0;
let providersPending = null;

const CATALOGO_IA_GRATUITA = [
  {
    id: 'groq',
    nombre: 'Groq',
    tipo: 'openai-compatible',
    prioridad: 1,
    endpoint: 'https://api.groq.com/openai/v1/chat/completions',
    modelo: 'openai/gpt-oss-20b',
    descripcion: 'Motor gratuito prioritario para Titulación.'
  },
  {
    id: 'gemini',
    nombre: 'Gemini',
    tipo: 'gemini',
    prioridad: 2,
    endpoint: '',
    modelo: 'gemini-3.5-flash',
    descripcion: 'Motor gratuito de respaldo para Titulación.'
  },
  {
    id: 'openrouter',
    nombre: 'OpenRouter Free',
    tipo: 'openai-compatible',
    prioridad: 3,
    endpoint: 'https://openrouter.ai/api/v1/chat/completions',
    modelo: 'openrouter/free',
    descripcion: 'Router de modelos gratuitos.'
  },
  {
    id: 'mistral',
    nombre: 'Mistral AI',
    tipo: 'openai-compatible',
    prioridad: 4,
    endpoint: 'https://api.mistral.ai/v1/chat/completions',
    modelo: 'mistral-small-latest',
    descripcion: 'Proveedor con modalidad gratuita limitada.'
  },
  {
    id: 'cohere',
    nombre: 'Cohere',
    tipo: 'cohere',
    prioridad: 5,
    endpoint: 'https://api.cohere.com/v2/chat',
    modelo: 'command-a-03-2025',
    descripcion: 'Proveedor de evaluación gratuita limitada.'
  }
];

const PROVEEDORES_IA_GRATUITOS = new Set(
  CATALOGO_IA_GRATUITA.map((provider) => provider.id)
);

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
    ultimoError: text(provider.ultimoError),
    gratis: PROVEEDORES_IA_GRATUITOS.has(id)
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

function catalogNeedsSync(current, desired) {
  if (!current) return true;
  if (text(current.nombre) !== text(desired.nombre)) return true;
  if (text(current.tipo || 'openai-compatible') !== text(desired.tipo || 'openai-compatible')) return true;
  if (Number(current.prioridad || 999) !== Number(desired.prioridad || 999)) return true;
  if (text(current.modelo || current.model) !== text(desired.modelo || desired.model)) return true;
  if (text(desired.endpoint) && text(current.endpoint) !== text(desired.endpoint)) return true;
  if (text(desired.descripcion) && text(current.descripcion) !== text(desired.descripcion)) return true;
  return false;
}

async function ensureCatalog(env) {
  const current = await listAiProviders(env, true);
  const byId = new Map(
    current.map((provider) => [providerId(provider.id || provider.proveedor || provider.nombre), provider])
  );
  let created = 0;
  let updated = 0;
  let deactivated = 0;

  for (const provider of current) {
    const id = providerId(provider.id || provider.proveedor || provider.nombre);
    if (!id || PROVEEDORES_IA_GRATUITOS.has(id) || provider.activo !== true) continue;
    await toggleAiProvider(env, id, false);
    deactivated += 1;
  }

  for (const desired of CATALOGO_IA_GRATUITA) {
    const existing = byId.get(desired.id);
    if (!catalogNeedsSync(existing, desired)) continue;

    await saveAiProvider(env, {
      ...desired,
      activo: existing ? existing.activo === true : false,
      timeoutMs: Number((existing && existing.timeoutMs) || 45000),
      maxTokens: Number((existing && existing.maxTokens) || 3000),
      temperatura: Number((existing && existing.temperatura) ?? 0.3)
    });

    if (existing) updated += 1;
    else created += 1;
  }

  clearProvidersCache();

  const providers = (await listAiProviders(env, true))
    .filter((provider) => PROVEEDORES_IA_GRATUITOS.has(
      providerId(provider.id || provider.proveedor || provider.nombre)
    ));

  return {
    proveedores: providers,
    created,
    updated,
    deactivated,
    totalCatalogo: CATALOGO_IA_GRATUITA.length
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
        .filter((provider) => {
          const id = providerId(provider && (provider.id || provider.proveedor));
          return provider && provider.activo === true && PROVEEDORES_IA_GRATUITOS.has(id);
        });
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
  const match = raw.match(/(?:motor[_-]?)(\d+)/);
  const explicit = Number(data.motorIndex);
  let index = Number.isFinite(explicit) && explicit >= 0
    ? explicit
    : match
      ? Number(match[1]) - 1
      : 0;
  if (!Number.isFinite(index) || index < 0) index = 0;
  return total > 0 ? index % total : 0;
}

function requierePago(error) {
  const message = text(error && error.message || error).toLowerCase();
  return /payment required|billing|insufficient balance|insufficient credit|add credits|purchase credits|upgrade.*plan/.test(message);
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
        const catalog = await ensureCatalog(env);
        return jsonReply(request, {
          ok: true,
          proveedores: catalog.proveedores.map(adminProvider),
          catalogo: {
            total: catalog.totalCatalogo,
            creados: catalog.created,
            actualizados: catalog.updated
          }
        });
      }
      if (action === 'admin-toggle') {
        const id = providerId(data.providerId);
        if (!PROVEEDORES_IA_GRATUITOS.has(id)) {
          return jsonReply(request, {
            ok: false,
            mensaje: 'Este proveedor no forma parte del catálogo gratuito permitido.'
          }, 400);
        }
        await toggleAiProvider(env, id, data.activo === true);
        clearProvidersCache();
        return jsonReply(request, { ok: true, providerId: id });
      }
      if (action === 'admin-save') {
        const provider = data.provider || {};
        const id = providerId(provider.id || provider.proveedor || provider.nombre);
        if (!PROVEEDORES_IA_GRATUITOS.has(id)) {
          return jsonReply(request, {
            ok: false,
            mensaje: 'Solo se permiten proveedores con modalidad gratuita aprobada.'
          }, 400);
        }
        const result = await saveAiProvider(env, provider);
        clearProvidersCache();
        return jsonReply(request, {
          ok: true,
          proveedor: adminProvider(result.proveedor || result.data || provider)
        });
      }
      if (action === 'admin-test') {
        try {
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
        } catch (error) {
          const id = providerId(data.providerId);
          const message = text(error && error.message || error) || 'La prueba del proveedor no pudo completarse.';
          let desactivado = false;

          if (requierePago(error) && id) {
            try {
              await toggleAiProvider(env, id, false);
              clearProvidersCache();
              desactivado = true;
            } catch (_toggleError) {
              desactivado = false;
            }
          }

          return jsonReply(request, {
            ok: false,
            provider: id,
            error: message,
            mensaje: message,
            diagnostico: true,
            requierePago: requierePago(error),
            desactivado
          }, 200);
        }
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
