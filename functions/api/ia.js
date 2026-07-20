import {
  getAiProvider,
  listAiProviders,
  saveAiProvider,
  saveAiTest,
  toggleAiProvider
} from '../_lib/claves.js';
import {
  ALLOWED_ORIGINS,
  appId,
  corsHeaders,
  fetchTimed,
  jsonReply,
  numberValue,
  requestOrigin,
  text
} from '../_lib/http.js';

const HOSTS = new Set([
  'generativelanguage.googleapis.com',
  'api.groq.com',
  'api.cerebras.ai',
  'integrate.api.nvidia.com',
  'models.github.ai',
  'openrouter.ai',
  'router.huggingface.co',
  'api.cloudflare.com'
]);

function providerId(value) {
  return text(value).toLowerCase().replace(/[^a-z0-9_-]/g, '');
}

function isAdmin(request) {
  const origin = requestOrigin(request).toLowerCase();
  if (origin.includes('titulos-administrador.pages.dev')) return true;
  if (origin === 'null' || origin.includes('localhost') || origin.includes('127.0.0.1')) {
    const app = appId(request);
    return app === 'administrador' || app === 'admin';
  }
  return false;
}

function safeProvider(raw) {
  raw = raw || {};
  const id = providerId(raw.id || raw.proveedor || raw.providerId || raw.nombre);
  return {
    id,
    proveedor: id,
    nombre: text(raw.nombre || raw.name || id),
    tipo: text(raw.tipo || raw.protocol || 'openai-compatible'),
    activo: raw.activo === true,
    prioridad: numberValue(raw.prioridad, 999),
    endpointConfigurado: Boolean(text(raw.endpoint || raw.url)),
    modelo: text(raw.modelo || raw.model),
    model: text(raw.model || raw.modelo),
    timeoutMs: Math.max(5000, numberValue(raw.timeoutMs, 45000)),
    maxTokens: Math.max(100, numberValue(raw.maxTokens, 3000)),
    temperatura: numberValue(raw.temperatura, 0.3),
    descripcion: text(raw.descripcion),
    apiKeyConfigurada: Boolean(text(raw.apiKey || raw.key || raw.token || raw.apiKeyConfigurada)),
    ultimaPruebaOk: raw.ultimaPruebaOk === true,
    ultimaPruebaEn: text(raw.ultimaPruebaEn),
    ultimaLatenciaMs: numberValue(raw.ultimaLatenciaMs, 0),
    ultimoError: text(raw.ultimoError)
  };
}

function providerEndpoint(raw) {
  const id = providerId(raw.id || raw.proveedor || raw.nombre);
  const type = text(raw.tipo).toLowerCase();
  if (type === 'gemini' || id === 'gemini') {
    return 'https://generativelanguage.googleapis.com/v1beta/models/' +
      encodeURIComponent(text(raw.modelo || raw.model || 'gemini-2.0-flash')) +
      ':generateContent';
  }
  const value = text(raw.endpoint || raw.url);
  if (!value) throw new Error('El proveedor no tiene endpoint configurado.');
  const url = new URL(value);
  if (url.protocol !== 'https:' || !HOSTS.has(url.hostname)) {
    throw new Error('El endpoint del proveedor no está permitido.');
  }
  return url.toString();
}

function extractText(data, type) {
  if (type === 'gemini') {
    return text(data && data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts && data.candidates[0].content.parts[0] && data.candidates[0].content.parts[0].text);
  }
  return text(data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content || data && data.result && data.result.response);
}

async function generate(raw, prompt, options) {
  raw = raw || {};
  options = options || {};
  const key = text(raw.apiKey || raw.key || raw.token);
  if (!key) throw new Error('El proveedor no tiene clave privada configurada.');
  const id = providerId(raw.id || raw.proveedor || raw.nombre);
  const type = text(raw.tipo).toLowerCase() === 'gemini' || id === 'gemini' ? 'gemini' : 'openai-compatible';
  let url = providerEndpoint(raw);
  let body;
  const headers = { 'Content-Type': 'application/json' };

  if (type === 'gemini') {
    url += (url.includes('?') ? '&' : '?') + 'key=' + encodeURIComponent(key);
    body = {
      contents: [{ parts: [{ text: text(prompt) }] }],
      generationConfig: {
        temperature: numberValue(options.temperatura, raw.temperatura || 0.3),
        maxOutputTokens: numberValue(options.maxTokens, raw.maxTokens || 3000)
      }
    };
  } else {
    headers.Authorization = 'Bearer ' + key;
    body = {
      model: text(raw.modelo || raw.model),
      messages: [{ role: 'user', content: text(prompt) }],
      temperature: numberValue(options.temperatura, raw.temperatura || 0.3),
      max_tokens: numberValue(options.maxTokens, raw.maxTokens || 3000)
    };
  }

  const start = Date.now();
  const response = await fetchTimed(url, { method: 'POST', headers, body: JSON.stringify(body) }, options.timeoutMs || raw.timeoutMs || 45000, 'El proveedor IA superó el tiempo máximo.');
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(text(data.error && data.error.message || data.message || data.error) || 'El proveedor IA respondió con error.');
  const output = extractText(data, type);
  if (!output) throw new Error('El proveedor IA respondió sin texto utilizable.');
  return { text: output, latencyMs: Date.now() - start };
}

async function parseInput(request) {
  if (request.method === 'GET') {
    const url = new URL(request.url);
    return { action: url.searchParams.get('action') || 'list', providerId: url.searchParams.get('providerId') || '' };
  }
  if (!text(request.headers.get('Content-Type')).toLowerCase().includes('application/json')) throw new Error('Se esperaba application/json.');
  return request.json();
}

async function adminAction(request, env, input, action) {
  if (!isAdmin(request)) return jsonReply(request, { ok: false, mensaje: 'Acción no permitida.' }, 403);
  if (action === 'admin-list') return jsonReply(request, { ok: true, proveedores: (await listAiProviders(env, true)).map(safeProvider) });
  if (action === 'admin-read') return jsonReply(request, { ok: true, proveedor: safeProvider(await getAiProvider(env, input.providerId)) });
  if (action === 'admin-toggle') {
    await toggleAiProvider(env, input.providerId, input.activo === true);
    return jsonReply(request, { ok: true, providerId: providerId(input.providerId) });
  }
  if (action === 'admin-save') {
    const response = await saveAiProvider(env, input.provider || {});
    return jsonReply(request, { ok: true, proveedor: safeProvider(response.proveedor || response.data || input.provider || {}) });
  }
  if (action === 'admin-test') {
    const raw = await getAiProvider(env, input.providerId);
    const result = await generate(raw, text(input.prompt) || 'Responde con una prueba breve.', input.options || {});
    await saveAiTest(env, { providerId: providerId(input.providerId), ultimaPruebaOk: true, ultimaPruebaEn: new Date().toISOString(), ultimaLatenciaMs: result.latencyMs, ultimoError: '' });
    return jsonReply(request, { ok: true, providerId: providerId(input.providerId), ...result });
  }
  return jsonReply(request, { ok: false, mensaje: 'Acción administrativa desconocida.' }, 400);
}

export async function onRequest({ request, env }) {
  const origin = requestOrigin(request);
  if (origin && !ALLOWED_ORIGINS.has(origin)) return jsonReply(request, { ok: false, mensaje: 'Origen no permitido.' }, 403);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(request) });
  if (!['GET', 'POST'].includes(request.method)) return jsonReply(request, { ok: false, mensaje: 'Método no permitido.' }, 405);
  try {
    const input = await parseInput(request);
    const action = text(input.action || input.accion || '').toLowerCase();
    if (action === 'list') {
      const providers = await listAiProviders(env, false);
      return jsonReply(request, { ok: true, proveedores: providers.filter((provider) => provider.activo === true).map(safeProvider) });
    }
    if (action.startsWith('admin-')) return adminAction(request, env, input, action);
    const id = providerId(input.providerId || input.provider);
    if (!id) throw new Error('No se indicó el proveedor IA.');
    const raw = await getAiProvider(env, id);
    if (raw.activo !== true) throw new Error('El proveedor IA está inactivo.');
    return jsonReply(request, { ok: true, provider: id, ...(await generate(raw, text(input.prompt), input.options || {})) });
  } catch (error) {
    return jsonReply(request, { ok: false, error: error.message || String(error) }, 502);
  }
}
