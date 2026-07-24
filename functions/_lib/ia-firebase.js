/* Proveedores de IA almacenados en Firebase Títulos. */

import { listCollection, nowIso, setDocument, slug, text } from './firestore.js';

function active(provider) {
  return provider && provider.activo !== false && text(provider.estado || 'ACTIVO').toUpperCase() !== 'INACTIVO';
}

function providerId(value) {
  return slug(value).replace(/[^a-z0-9_-]/g, '');
}

export async function listProviders(includeInactive = false) {
  const rows = await listCollection('TITULOS', 'ia', { maxDocuments: 500 });
  const providers = rows
    .map((row) => ({
      ...row,
      id: providerId(row.id || row.proveedor || row.nombre),
      proveedor: providerId(row.id || row.proveedor || row.nombre),
      nombre: text(row.nombre || row.name || row.id),
      tipo: text(row.tipo || 'openai-compatible'),
      activo: active(row),
      estado: active(row) ? 'ACTIVO' : 'INACTIVO',
      prioridad: Number(row.prioridad || 999),
      endpoint: text(row.endpoint),
      modelo: text(row.modelo || row.model),
      model: text(row.model || row.modelo),
      credencial: text(row.credencial || row.apiKey || row.token),
      timeoutMs: Number(row.timeoutMs || 45000),
      maxTokens: Number(row.maxTokens || 3000),
      temperatura: Number(row.temperatura ?? 0.3),
      descripcion: text(row.descripcion),
      apiKeyConfigurada: Boolean(text(row.credencial || row.apiKey || row.token)),
      endpointConfigurado: Boolean(text(row.endpoint)),
      ultimaPruebaOk: row.ultimaPruebaOk === true,
      ultimaPruebaEn: text(row.ultimaPruebaEn),
      ultimaLatenciaMs: Number(row.ultimaLatenciaMs || 0),
      ultimoError: text(row.ultimoError)
    }))
    .filter((provider) => provider.id && (includeInactive || provider.activo));

  providers.sort((a, b) => a.prioridad - b.prioridad || a.nombre.localeCompare(b.nombre, 'es'));
  return providers;
}

export async function saveProvider(provider = {}) {
  const id = providerId(provider.id || provider.proveedor || provider.nombre);
  if (!id) throw new Error('El proveedor de IA necesita un identificador.');
  const current = (await listProviders(true)).find((item) => item.id === id) || {};
  const credential = text(provider.credencial || provider.apiKey || provider.token) || current.credencial || '';
  const activeValue = provider.activo === false || text(provider.estado).toUpperCase() === 'INACTIVO' ? false : true;

  const saved = await setDocument('TITULOS', 'ia', id, {
    nombre: text(provider.nombre || provider.name || current.nombre || id),
    tipo: text(provider.tipo || current.tipo || 'openai-compatible'),
    endpoint: text(provider.endpoint || current.endpoint),
    modelo: text(provider.modelo || provider.model || current.modelo),
    credencial: credential,
    estado: activeValue ? 'ACTIVO' : 'INACTIVO',
    activo: activeValue,
    prioridad: Number(provider.prioridad || current.prioridad || 999),
    timeoutMs: Number(provider.timeoutMs || current.timeoutMs || 45000),
    maxTokens: Number(provider.maxTokens || current.maxTokens || 3000),
    temperatura: Number(provider.temperatura ?? current.temperatura ?? 0.3),
    descripcion: text(provider.descripcion || current.descripcion),
    actualizadoEn: nowIso()
  });
  return { ...saved, id };
}

export async function toggleProvider(idValue, activeValue) {
  const id = providerId(idValue);
  if (!id) throw new Error('Proveedor de IA inválido.');
  return setDocument('TITULOS', 'ia', id, {
    estado: activeValue === true ? 'ACTIVO' : 'INACTIVO',
    activo: activeValue === true,
    actualizadoEn: nowIso()
  });
}

async function fetchTimed(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.min(120000, Math.max(5000, Number(timeoutMs || 45000))));
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (error && error.name === 'AbortError') throw new Error('El proveedor de IA superó el tiempo máximo.');
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function readJson(response, providerName) {
  const raw = await response.text();
  let data;
  try {
    data = raw ? JSON.parse(raw) : {};
  } catch (_error) {
    throw new Error(`${providerName} respondió en un formato no válido.`);
  }
  if (!response.ok) {
    const message = data && data.error && (data.error.message || data.error.status)
      || data && data.message
      || `Error HTTP ${response.status}`;
    throw new Error(`${providerName}: ${message}`);
  }
  return data;
}

async function callGemini(provider, prompt, options) {
  const model = text(provider.modelo || provider.model || 'gemini-2.0-flash');
  let endpoint = text(provider.endpoint);
  if (!endpoint) {
    endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  } else if (!/:generateContent(?:\?|$)/.test(endpoint)) {
    endpoint = endpoint.replace(/\/$/, '') + `/models/${encodeURIComponent(model)}:generateContent`;
  }
  const url = new URL(endpoint);
  if (provider.credencial && !url.searchParams.get('key')) url.searchParams.set('key', provider.credencial);
  const response = await fetchTimed(url.toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: Number(options.temperatura ?? options.temperature ?? provider.temperatura ?? 0.3),
        maxOutputTokens: Number(options.maxTokens || options.max_tokens || provider.maxTokens || 3000)
      }
    })
  }, options.timeoutMs || provider.timeoutMs);
  const data = await readJson(response, provider.nombre);
  const output = text(
    data.candidates && data.candidates[0] && data.candidates[0].content &&
    data.candidates[0].content.parts && data.candidates[0].content.parts.map((part) => part.text || '').join('\n')
  );
  if (!output) throw new Error(`${provider.nombre} respondió sin texto.`);
  return output;
}

async function callOpenAiCompatible(provider, prompt, options) {
  const endpoint = text(provider.endpoint);
  if (!endpoint) throw new Error(`${provider.nombre} no tiene endpoint configurado.`);
  if (!provider.credencial) throw new Error(`${provider.nombre} no tiene credencial configurada.`);
  const response = await fetchTimed(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${provider.credencial}`,
      'HTTP-Referer': 'https://titulos.pages.dev',
      'X-Title': 'IA de Titulación'
    },
    body: JSON.stringify({
      model: text(provider.modelo || provider.model),
      messages: [{ role: 'user', content: prompt }],
      temperature: Number(options.temperatura ?? options.temperature ?? provider.temperatura ?? 0.3),
      max_tokens: Number(options.maxTokens || options.max_tokens || provider.maxTokens || 3000)
    })
  }, options.timeoutMs || provider.timeoutMs);
  const data = await readJson(response, provider.nombre);
  const output = text(
    data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content
    || data.choices && data.choices[0] && data.choices[0].text
    || data.response
    || data.result
    || data.text
  );
  if (!output) throw new Error(`${provider.nombre} respondió sin texto.`);
  return output;
}

export async function generateWithProvider(providerIdValue, promptValue, options = {}) {
  const id = providerId(providerIdValue);
  const providers = await listProviders(true);
  const provider = providers.find((item) => item.id === id);
  if (!provider) throw new Error('No se encontró el proveedor de IA.');
  if (!provider.activo && options.allowInactive !== true) throw new Error('El proveedor de IA está inactivo.');
  const prompt = text(promptValue);
  if (!prompt) throw new Error('No se recibió el contenido de la solicitud.');
  const started = Date.now();

  try {
    const signature = `${provider.tipo} ${provider.endpoint} ${provider.nombre}`.toLowerCase();
    const output = /gemini|generativelanguage/.test(signature)
      ? await callGemini(provider, prompt, options)
      : await callOpenAiCompatible(provider, prompt, options);
    const latencyMs = Date.now() - started;
    await setDocument('TITULOS', 'ia', provider.id, {
      ultimaPruebaOk: true,
      ultimaPruebaEn: nowIso(),
      ultimaLatenciaMs: latencyMs,
      ultimoError: ''
    });
    return { ok: true, text: output, respuesta: output, latencyMs, providerId: provider.id };
  } catch (error) {
    await setDocument('TITULOS', 'ia', provider.id, {
      ultimaPruebaOk: false,
      ultimaPruebaEn: nowIso(),
      ultimaLatenciaMs: Date.now() - started,
      ultimoError: text(error && error.message || error)
    });
    throw error;
  }
}
