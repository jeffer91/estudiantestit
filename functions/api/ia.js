import { generateAi, listAiProviders, saveAiProvider, toggleAiProvider } from '../_lib/claves.js';
import { ALLOWED_ORIGINS, appId, corsHeaders, jsonReply, requestOrigin, text } from '../_lib/http.js';

function providerId(value) {
  return text(value).toLowerCase().replace(/[^a-z0-9_-]/g, '');
}

function admin(request) {
  const origin = requestOrigin(request).toLowerCase();
  if (origin.includes('titulos-administrador.pages.dev')) return true;
  if (origin === 'null' || origin.includes('localhost') || origin.includes('127.0.0.1')) {
    const app = appId(request);
    return app === 'administrador' || app === 'admin';
  }
  return false;
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

async function activeProviders(env) {
  const providers = (await listAiProviders(env, false))
    .filter((provider) => provider && provider.activo === true && providerId(provider.id || provider.proveedor));
  providers.sort((a, b) => Number(a.prioridad || 999) - Number(b.prioridad || 999));
  return providers;
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
  const providers = await activeProviders(env);
  if (!providers.length) throw new Error('No hay motores de IA activos.');

  const start = motorIndex(data, providers.length);
  const prompt = text(data.prompt);
  if (!prompt) throw new Error('No se recibió el contenido de la solicitud.');

  let lastError = null;
  for (let offset = 0; offset < providers.length; offset += 1) {
    const provider = providers[(start + offset) % providers.length];
    try {
      const result = await generateAi(env, providerId(provider.id || provider.proveedor), prompt, data.options || {});
      const output = text(result.text || result.respuesta);
      if (!output) throw new Error('Respuesta vacía del servicio de IA.');
      return {
        ok: true,
        text: output,
        latencyMs: Number(result.latencyMs || 0)
      };
    } catch (error) {
      lastError = error;
    }
  }

  throw new Error(publicError(lastError));
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
  if (origin && !ALLOWED_ORIGINS.has(origin)) {
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
      const providers = await activeProviders(env);
      return jsonReply(request, {
        ok: true,
        activo: providers.length > 0,
        totalActivos: providers.length,
        motoresDisponibles: providers.length,
        proveedores: providers.map(publicMotor)
      });
    }

    if (action.startsWith('admin-')) {
      if (!admin(request)) {
        return jsonReply(request, { ok: false, mensaje: 'Acción no permitida.' }, 403);
      }
      if (action === 'admin-list') {
        return jsonReply(request, {
          ok: true,
          proveedores: (await listAiProviders(env, true)).map(adminProvider)
        });
      }
      if (action === 'admin-toggle') {
        await toggleAiProvider(env, data.providerId, data.activo === true);
        return jsonReply(request, { ok: true, providerId: providerId(data.providerId) });
      }
      if (action === 'admin-save') {
        const result = await saveAiProvider(env, data.provider || {});
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
