/* Proveedores de IA almacenados en Firebase Títulos.
   Las credenciales nuevas se guardan en Google Secret Manager.
   Firestore conserva únicamente configuración y el nombre del secreto. */

import { SecretManagerServiceClient } from '@google-cloud/secret-manager';
import { listCollection, nowIso, setDocument, slug, text } from './firestore.js';

const secretClient = new SecretManagerServiceClient();

function active(provider) {
  return provider && provider.activo !== false && text(provider.estado || 'ACTIVO').toUpperCase() !== 'INACTIVO';
}

function providerId(value) {
  return slug(value).replace(/[^a-z0-9_-]/g, '');
}

function projectId() {
  if (text(process.env.GCLOUD_PROJECT)) return text(process.env.GCLOUD_PROJECT);
  if (text(process.env.GOOGLE_CLOUD_PROJECT)) return text(process.env.GOOGLE_CLOUD_PROJECT);
  try {
    const config = JSON.parse(process.env.FIREBASE_CONFIG || '{}');
    if (text(config.projectId)) return text(config.projectId);
  } catch (_error) {}
  return 'titulos-ec2fa';
}

function providerSecretId(idValue) {
  const id = providerId(idValue);
  if (!id) throw new Error('Proveedor de IA inválido.');
  return ('titulos-ia-' + id).replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 250);
}

function secretResource(secretId) {
  return `projects/${projectId()}/secrets/${secretId}`;
}

async function ensureSecret(secretId) {
  try {
    await secretClient.getSecret({ name: secretResource(secretId) });
  } catch (error) {
    const code = Number(error && error.code);
    if (code !== 5) throw error;
    await secretClient.createSecret({
      parent: `projects/${projectId()}`,
      secretId,
      secret: { replication: { automatic: {} } }
    });
  }
  return secretId;
}

async function saveCredentialSecret(id, credential) {
  const value = text(credential);
  if (!value) return '';
  const secretId = providerSecretId(id);
  await ensureSecret(secretId);
  await secretClient.addSecretVersion({
    parent: secretResource(secretId),
    payload: { data: Buffer.from(value, 'utf8') }
  });
  return secretId;
}

async function readCredentialSecret(secretId) {
  const id = text(secretId);
  if (!id) return '';
  const [version] = await secretClient.accessSecretVersion({
    name: secretResource(id) + '/versions/latest'
  });
  return text(version && version.payload && version.payload.data
    ? Buffer.from(version.payload.data).toString('utf8')
    : '');
}

export async function listProviders(includeInactive = false, env) {
  const rows = await listCollection('TITULOS', 'ia', { maxDocuments: 500 }, env);
  const providers = rows
    .map((row) => {
      const id = providerId(row.id || row.proveedor || row.nombre);
      const legacyCredential = text(row.credencial || row.apiKey || row.token);
      const secretId = text(row.secretId || row.secretName || row.secretoId);
      return {
        ...row,
        id,
        proveedor: id,
        nombre: text(row.nombre || row.name || row.id),
        tipo: text(row.tipo || 'openai-compatible'),
        activo: active(row),
        estado: active(row) ? 'ACTIVO' : 'INACTIVO',
        prioridad: Number(row.prioridad || 999),
        endpoint: text(row.endpoint),
        modelo: text(row.modelo || row.model),
        model: text(row.model || row.modelo),
        credencial: legacyCredential,
        secretId,
        timeoutMs: Number(row.timeoutMs || 45000),
        maxTokens: Number(row.maxTokens || 3000),
        temperatura: Number(row.temperatura ?? 0.3),
        descripcion: text(row.descripcion),
        apiKeyConfigurada: Boolean(secretId || legacyCredential),
        endpointConfigurado: Boolean(text(row.endpoint)),
        ultimaPruebaOk: row.ultimaPruebaOk === true,
        ultimaPruebaEn: text(row.ultimaPruebaEn),
        ultimaLatenciaMs: Number(row.ultimaLatenciaMs || 0),
        ultimoError: text(row.ultimoError)
      };
    })
    .filter((provider) => provider.id && (includeInactive || provider.activo));

  providers.sort((a, b) => a.prioridad - b.prioridad || a.nombre.localeCompare(b.nombre, 'es'));
  return providers;
}

export async function saveProvider(provider = {}, env) {
  const id = providerId(provider.id || provider.proveedor || provider.nombre);
  if (!id) throw new Error('El proveedor de IA necesita un identificador.');

  const current = (await listProviders(true, env)).find((item) => item.id === id) || {};
  const incomingCredential = text(provider.credencial || provider.apiKey || provider.token);
  const credentialToStore = incomingCredential || (!text(current.secretId) ? text(current.credencial) : '');
  let secretId = text(current.secretId);

  if (credentialToStore) {
    secretId = await saveCredentialSecret(id, credentialToStore);
  }

  const activeValue = provider.activo === false || text(provider.estado).toUpperCase() === 'INACTIVO'
    ? false
    : true;

  const saved = await setDocument('TITULOS', 'ia', id, {
    nombre: text(provider.nombre || provider.name || current.nombre || id),
    tipo: text(provider.tipo || current.tipo || 'openai-compatible'),
    endpoint: text(provider.endpoint || current.endpoint),
    modelo: text(provider.modelo || provider.model || current.modelo),
    secretId,
    credencial: null,
    apiKey: null,
    token: null,
    estado: activeValue ? 'ACTIVO' : 'INACTIVO',
    activo: activeValue,
    prioridad: Number(provider.prioridad || current.prioridad || 999),
    timeoutMs: Number(provider.timeoutMs || current.timeoutMs || 45000),
    maxTokens: Number(provider.maxTokens || current.maxTokens || 3000),
    temperatura: Number(provider.temperatura ?? current.temperatura ?? 0.3),
    descripcion: text(provider.descripcion || current.descripcion),
    actualizadoEn: nowIso()
  }, { merge: true }, env);

  return { ...saved, id, secretId, apiKeyConfigurada: Boolean(secretId) };
}

export async function migrateProviderSecrets(env) {
  const providers = await listProviders(true, env);
  let migrated = 0;
  let cleaned = 0;

  for (const provider of providers) {
    const legacy = text(provider.credencial);
    let secretId = text(provider.secretId);

    if (legacy) {
      if (!secretId) {
        secretId = await saveCredentialSecret(provider.id, legacy);
        migrated += 1;
      }
      await setDocument('TITULOS', 'ia', provider.id, {
        secretId,
        credencial: null,
        apiKey: null,
        token: null,
        actualizadoEn: nowIso()
      }, { merge: true }, env);
      cleaned += 1;
    }
  }

  return {
    ok: true,
    total: providers.length,
    migrados: migrated,
    limpiadosFirestore: cleaned,
    mensaje: migrated
      ? `Se migraron ${migrated} credenciales de IA a Secret Manager.`
      : 'No quedaron credenciales de IA pendientes de migrar.'
  };
}

export async function toggleProvider(idValue, activeValue, env) {
  const id = providerId(idValue);
  if (!id) throw new Error('Proveedor de IA inválido.');
  return setDocument('TITULOS', 'ia', id, {
    estado: activeValue === true ? 'ACTIVO' : 'INACTIVO',
    activo: activeValue === true,
    actualizadoEn: nowIso()
  }, { merge: true }, env);
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
      'HTTP-Referer': 'https://jeffer91.github.io/estudiantestit',
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

export async function generateWithProvider(providerIdValue, promptValue, options = {}, env) {
  const id = providerId(providerIdValue);
  const providers = await listProviders(true, env);
  const provider = providers.find((item) => item.id === id);
  if (!provider) throw new Error('No se encontró el proveedor de IA.');
  if (!provider.activo && options.allowInactive !== true) throw new Error('El proveedor de IA está inactivo.');

  const prompt = text(promptValue);
  if (!prompt) throw new Error('No se recibió el contenido de la solicitud.');

  const credential = text(provider.secretId)
    ? await readCredentialSecret(provider.secretId)
    : text(provider.credencial);
  const runtimeProvider = { ...provider, credencial: credential };
  const started = Date.now();

  try {
    const signature = `${runtimeProvider.tipo} ${runtimeProvider.endpoint} ${runtimeProvider.nombre}`.toLowerCase();
    const output = /gemini|generativelanguage/.test(signature)
      ? await callGemini(runtimeProvider, prompt, options)
      : await callOpenAiCompatible(runtimeProvider, prompt, options);
    const latencyMs = Date.now() - started;
    await setDocument('TITULOS', 'ia', provider.id, {
      ultimaPruebaOk: true,
      ultimaPruebaEn: nowIso(),
      ultimaLatenciaMs: latencyMs,
      ultimoError: ''
    }, { merge: true }, env);
    return { ok: true, text: output, respuesta: output, latencyMs, providerId: provider.id };
  } catch (error) {
    await setDocument('TITULOS', 'ia', provider.id, {
      ultimaPruebaOk: false,
      ultimaPruebaEn: nowIso(),
      ultimaLatenciaMs: Date.now() - started,
      ultimoError: text(error && error.message || error)
    }, { merge: true }, env);
    throw error;
  }
}
