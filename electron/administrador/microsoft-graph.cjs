'use strict';

const { PublicClientApplication, LogLevel } = require('@azure/msal-node');

const GRAPH_ROOT = 'https://graph.microsoft.com/v1.0';
const GRAPH_SCOPES = Object.freeze(['Mail.ReadWrite']);
const TOKEN_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_DRAFTS = 20;
const MAX_RECIPIENTS_PER_DRAFT = 50;
const MAX_TOTAL_RECIPIENTS = 1000;
const MAX_SUBJECT_LENGTH = 255;
const MAX_BODY_LENGTH = 100000;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const GUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TENANT_DOMAIN_PATTERN = /^[a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?$/i;

function text(value) {
  return String(value === null || value === undefined ? '' : value).trim();
}

function normalizeConfig(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const tenantId = text(source.tenantId).toLowerCase();
  const clientId = text(source.clientId).toLowerCase();

  if (!GUID_PATTERN.test(clientId)) {
    throw new Error('El Client ID de Microsoft no tiene un formato válido.');
  }
  if (!tenantId || ['common', 'consumers'].includes(tenantId)) {
    throw new Error('Ingresa el Tenant ID específico de la institución.');
  }
  if (!GUID_PATTERN.test(tenantId) && !TENANT_DOMAIN_PATTERN.test(tenantId)) {
    throw new Error('El Tenant ID de Microsoft no tiene un formato válido.');
  }

  return { tenantId, clientId };
}

function configKey(config) {
  return `${config.tenantId}|${config.clientId}`;
}

function tokenCacheKey(config) {
  return `electron:msgraph-token:${config.tenantId}:${config.clientId}`;
}

function sanitizeAccount(account) {
  if (!account || typeof account !== 'object') return null;
  return {
    username: text(account.username),
    name: text(account.name),
    tenantId: text(account.tenantId),
    homeAccountId: text(account.homeAccountId)
  };
}

function sanitizeDeviceCode(response) {
  const source = response && typeof response === 'object' ? response : {};
  return {
    userCode: text(source.userCode),
    verificationUri: text(source.verificationUri),
    verificationUriComplete: text(source.verificationUriComplete),
    message: text(source.message),
    expiresIn: Number(source.expiresIn || 0)
  };
}

function normalizeEmail(value) {
  const email = text(value).toLowerCase();
  return EMAIL_PATTERN.test(email) ? email : '';
}

function normalizeBatches(rawBatches) {
  if (!Array.isArray(rawBatches) || !rawBatches.length) {
    throw new Error('No hay destinatarios para crear los borradores.');
  }
  if (rawBatches.length > MAX_DRAFTS) {
    throw new Error(`Solo se pueden crear hasta ${MAX_DRAFTS} borradores por operación.`);
  }

  const seen = new Set();
  const batches = rawBatches.map((rawBatch, index) => {
    if (!Array.isArray(rawBatch)) throw new Error(`El lote ${index + 1} no es válido.`);
    const batch = [];
    rawBatch.forEach((value) => {
      const email = normalizeEmail(value);
      if (!email || seen.has(email)) return;
      seen.add(email);
      batch.push(email);
    });
    if (!batch.length) throw new Error(`El lote ${index + 1} no contiene correos válidos.`);
    if (batch.length > MAX_RECIPIENTS_PER_DRAFT) {
      throw new Error(`El lote ${index + 1} supera ${MAX_RECIPIENTS_PER_DRAFT} destinatarios.`);
    }
    return batch;
  });

  if (seen.size > MAX_TOTAL_RECIPIENTS) {
    throw new Error(`La operación supera ${MAX_TOTAL_RECIPIENTS} destinatarios.`);
  }
  return batches;
}

async function readJsonResponse(response) {
  const body = await response.text();
  let json = {};
  try { json = body ? JSON.parse(body) : {}; } catch (_error) {}
  if (!response.ok) {
    const message = text(json && json.error && json.error.message) || text(json && json.message) || `Error HTTP ${response.status}`;
    throw new Error(`Microsoft Graph: ${message}`);
  }
  return json;
}

class MicrosoftGraphDrafts {
  constructor(cacheStore) {
    if (!cacheStore) throw new Error('La caché segura del Administrador no está disponible.');
    this.cacheStore = cacheStore;
    this.client = null;
    this.clientKey = '';
  }

  cachePlugin(config) {
    const key = tokenCacheKey(config);
    return {
      beforeCacheAccess: async (context) => {
        const cached = this.cacheStore.get(key);
        if (cached.hit && typeof cached.value === 'string' && cached.value) {
          context.tokenCache.deserialize(cached.value);
        }
      },
      afterCacheAccess: async (context) => {
        if (!context.cacheHasChanged) return;
        this.cacheStore.set(key, context.tokenCache.serialize(), TOKEN_CACHE_TTL_MS);
      }
    };
  }

  getClient(rawConfig) {
    const config = normalizeConfig(rawConfig);
    const key = configKey(config);
    if (this.client && this.clientKey === key) return { client: this.client, config };

    this.client = new PublicClientApplication({
      auth: {
        clientId: config.clientId,
        authority: `https://login.microsoftonline.com/${encodeURIComponent(config.tenantId)}`
      },
      cache: { cachePlugin: this.cachePlugin(config) },
      system: {
        loggerOptions: {
          piiLoggingEnabled: false,
          logLevel: LogLevel.Error,
          loggerCallback: () => {}
        }
      }
    });
    this.clientKey = key;
    return { client: this.client, config };
  }

  async accounts(client) {
    if (typeof client.getAllAccounts === 'function') return await client.getAllAccounts();
    return await client.getTokenCache().getAllAccounts();
  }

  async status(rawConfig) {
    const { client, config } = this.getClient(rawConfig);
    const accounts = await this.accounts(client);
    return {
      ok: true,
      configured: true,
      connected: accounts.length > 0,
      account: sanitizeAccount(accounts[0]),
      tenantId: config.tenantId,
      clientId: config.clientId,
      scope: GRAPH_SCOPES[0]
    };
  }

  async acquireToken(rawConfig, handlers = {}) {
    const { client, config } = this.getClient(rawConfig);
    const accounts = await this.accounts(client);
    if (accounts.length) {
      try {
        const silent = await client.acquireTokenSilent({
          account: accounts[0],
          scopes: [...GRAPH_SCOPES]
        });
        if (silent && silent.accessToken) return { result: silent, config };
      } catch (_error) {}
    }

    const interactive = await client.acquireTokenByDeviceCode({
      scopes: [...GRAPH_SCOPES],
      deviceCodeCallback: (response) => {
        if (typeof handlers.onDeviceCode === 'function') {
          handlers.onDeviceCode(sanitizeDeviceCode(response));
        }
      }
    });
    if (!interactive || !interactive.accessToken) {
      throw new Error('Microsoft no devolvió un token de acceso.');
    }
    return { result: interactive, config };
  }

  async connect(rawConfig, handlers = {}) {
    const { result, config } = await this.acquireToken(rawConfig, handlers);
    return {
      ok: true,
      connected: true,
      account: sanitizeAccount(result.account),
      tenantId: config.tenantId,
      clientId: config.clientId,
      scope: GRAPH_SCOPES[0]
    };
  }

  async signOut(rawConfig) {
    const { client, config } = this.getClient(rawConfig);
    const accounts = await this.accounts(client);
    for (const account of accounts) {
      await client.getTokenCache().removeAccount(account);
    }
    this.cacheStore.remove(tokenCacheKey(config));
    return { ok: true, removed: accounts.length };
  }

  async createDrafts(rawConfig, payload, handlers = {}) {
    const source = payload && typeof payload === 'object' ? payload : {};
    const subject = text(source.subject);
    const body = String(source.body || '').trim();
    if (!subject || subject.length > MAX_SUBJECT_LENGTH) {
      throw new Error(`El asunto debe tener entre 1 y ${MAX_SUBJECT_LENGTH} caracteres.`);
    }
    if (!body || body.length > MAX_BODY_LENGTH) {
      throw new Error(`El mensaje debe tener entre 1 y ${MAX_BODY_LENGTH} caracteres.`);
    }
    const batches = normalizeBatches(source.batches);
    const { result } = await this.acquireToken(rawConfig, handlers);
    const drafts = [];

    for (let index = 0; index < batches.length; index += 1) {
      const batch = batches[index];
      if (typeof handlers.onProgress === 'function') {
        handlers.onProgress({ current: index + 1, total: batches.length, recipients: batch.length });
      }
      const response = await fetch(`${GRAPH_ROOT}/me/messages`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${result.accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          subject,
          body: { contentType: 'Text', content: body },
          bccRecipients: batch.map((address) => ({ emailAddress: { address } }))
        })
      });
      const draft = await readJsonResponse(response);
      drafts.push({
        id: text(draft.id),
        subject: text(draft.subject) || subject,
        webLink: text(draft.webLink),
        recipients: batch.length
      });
    }

    return {
      ok: true,
      account: sanitizeAccount(result.account),
      drafts,
      totalDrafts: drafts.length,
      totalRecipients: batches.reduce((sum, batch) => sum + batch.length, 0)
    };
  }
}

module.exports = { MicrosoftGraphDrafts, GRAPH_SCOPES };
