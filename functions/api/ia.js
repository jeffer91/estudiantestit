import { generateAi, listAiProviders, saveAiProvider, toggleAiProvider } from '../_lib/claves.js';
import { corsHeaders, jsonReply, originAllowed, requestOrigin, role, text } from '../_lib/http.js';

const PROVIDERS_CACHE_MS = 30000;
let providersCache = [];
let providersCacheExpiresAt = 0;
let providersPending = null;

const CATALOGO_IA_15 = [
  {
    id: 'cerebras',
    nombre: 'Cerebras',
    tipo: 'openai-compatible',
    prioridad: 1,
    endpoint: 'https://api.cerebras.ai/v1/chat/completions',
    modelo: 'gpt-oss-120b',
    descripcion: 'Motor principal de alta capacidad.'
  },
  {
    id: 'groq',
    nombre: 'Groq',
    tipo: 'openai-compatible',
    prioridad: 2,
    endpoint: 'https://api.groq.com/openai/v1/chat/completions',
    modelo: 'openai/gpt-oss-20b',
    descripcion: 'Motor rápido de respaldo prioritario.'
  },
  {
    id: 'mistral',
    nombre: 'Mistral AI',
    tipo: 'openai-compatible',
    prioridad: 3,
    endpoint: 'https://api.mistral.ai/v1/chat/completions',
    modelo: 'mistral-small-latest',
    descripcion: 'Motor general de titulación.'
  },
  {
    id: 'gemini',
    nombre: 'Gemini',
    tipo: 'gemini',
    prioridad: 4,
    endpoint: '',
    modelo: 'gemini-3.5-flash',
    descripcion: 'Motor Gemini para generación académica.'
  },
  {
    id: 'cohere',
    nombre: 'Cohere',
    tipo: 'openai-compatible',
    prioridad: 5,
    endpoint: 'https://api.cohere.ai/compatibility/v1/chat/completions',
    modelo: 'command-a-plus-05-2026',
    descripcion: 'Motor Cohere mediante API compatible con OpenAI.'
  },
  {
    id: 'cloudflare',
    nombre: 'Cloudflare Workers AI',
    tipo: 'openai-compatible',
    prioridad: 6,
    endpoint: '',
    modelo: '@cf/meta/llama-3.2-3b-instruct',
    descripcion: 'Requiere endpoint con Account ID de Cloudflare Workers AI.'
  },
  {
    id: 'scaleway',
    nombre: 'Scaleway Generative APIs',
    tipo: 'openai-compatible',
    prioridad: 7,
    endpoint: 'https://api.scaleway.ai/v1/chat/completions',
    modelo: 'gpt-oss-120b',
    descripcion: 'Motor europeo compatible con OpenAI.'
  },
  {
    id: 'openrouter',
    nombre: 'OpenRouter',
    tipo: 'openai-compatible',
    prioridad: 8,
    endpoint: 'https://openrouter.ai/api/v1/chat/completions',
    modelo: 'openrouter/free',
    descripcion: 'Router gratuito de respaldo.'
  },
  {
    id: 'nvidia',
    nombre: 'NVIDIA NIM',
    tipo: 'openai-compatible',
    prioridad: 9,
    endpoint: 'https://integrate.api.nvidia.com/v1/chat/completions',
    modelo: 'meta/llama-3.3-70b-instruct',
    descripcion: 'Motor NVIDIA NIM de respaldo.'
  },
  {
    id: 'sambanova',
    nombre: 'SambaNova Cloud',
    tipo: 'openai-compatible',
    prioridad: 10,
    endpoint: 'https://api.sambanova.ai/v1/chat/completions',
    modelo: 'Meta-Llama-3.3-70B-Instruct',
    descripcion: 'Motor SambaNova de respaldo.'
  },
  {
    id: 'ovhcloud',
    nombre: 'OVHcloud AI Endpoints',
    tipo: 'openai-compatible',
    prioridad: 11,
    endpoint: 'https://oai.endpoints.kepler.ai.cloud.ovh.net/v1/chat/completions',
    modelo: 'gpt-oss-20b',
    descripcion: 'Motor OVHcloud compatible con OpenAI.'
  },
  {
    id: 'fireworks',
    nombre: 'Fireworks AI',
    tipo: 'openai-compatible',
    prioridad: 12,
    endpoint: 'https://api.fireworks.ai/inference/v1/chat/completions',
    modelo: 'accounts/fireworks/models/gpt-oss-120b',
    descripcion: 'Motor Fireworks AI de respaldo.'
  },
  {
    id: 'hyperbolic',
    nombre: 'Hyperbolic',
    tipo: 'openai-compatible',
    prioridad: 13,
    endpoint: 'https://api.hyperbolic.xyz/v1/chat/completions',
    modelo: 'meta-llama/Meta-Llama-3.1-70B-Instruct',
    descripcion: 'Motor Hyperbolic de respaldo.'
  },
  {
    id: 'baseten',
    nombre: 'Baseten',
    tipo: 'openai-compatible',
    prioridad: 14,
    endpoint: 'https://inference.baseten.co/v1/chat/completions',
    modelo: 'zai-org/GLM-5',
    descripcion: 'Motor Baseten Model APIs de respaldo.'
  },
  {
    id: 'huggingface',
    nombre: 'Hugging Face',
    tipo: 'openai-compatible',
    prioridad: 15,
    endpoint: 'https://router.huggingface.co/v1/chat/completions',
    modelo: 'openai/gpt-oss-120b:cheapest',
    descripcion: 'Último motor de respaldo mediante Inference Providers.'
  }
];

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

  for (const desired of CATALOGO_IA_15) {
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
  return {
    proveedores: await listAiProviders(env, true),
    created,
    updated,
    totalCatalogo: CATALOGO_IA_15.length
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
