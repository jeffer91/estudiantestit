/* Cliente Firestore REST autenticado para Cloudflare Pages Functions. */

export const FIREBASE_PROJECTS = Object.freeze({
  TITULOS: Object.freeze({ projectId: 'titulos-ec2fa' }),
  UTET: Object.freeze({ projectId: 'utet-4387a' })
});

const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const FIRESTORE_SCOPE = 'https://www.googleapis.com/auth/datastore';
const tokenCache = new Map();

export function text(value) {
  return String(value === null || value === undefined ? '' : value).trim();
}

export function normalizeCedula(value) {
  const digits = text(value).replace(/\D/g, '');
  if (digits.length === 9) return '0' + digits;
  return digits.length === 10 ? digits : '';
}

export function slug(value) {
  return text(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 140);
}

export function nowIso() {
  return new Date().toISOString();
}

function projectConfig(project) {
  const key = text(project).toUpperCase();
  const config = FIREBASE_PROJECTS[key];
  if (!config) throw new Error('Proyecto Firebase no configurado: ' + key);
  return { key, ...config };
}

function apiBase(project) {
  const config = projectConfig(project);
  return `https://firestore.googleapis.com/v1/projects/${config.projectId}/databases/(default)`;
}

function documentPath(parts) {
  return parts.map((item) => encodeURIComponent(text(item))).join('/');
}

function documentName(project, collectionName, documentId) {
  const config = projectConfig(project);
  return `projects/${config.projectId}/databases/(default)/documents/${collectionName}/${documentId}`;
}

function readEnv(env, name) {
  return env && Object.prototype.hasOwnProperty.call(env, name) ? env[name] : undefined;
}

function parseServiceAccount(raw, bindingName) {
  if (!raw) return null;
  let value = raw;
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value);
    } catch (_error) {
      throw new Error(`${bindingName} debe contener el JSON completo de una cuenta de servicio.`);
    }
  }
  if (!value || typeof value !== 'object') {
    throw new Error(`${bindingName} no contiene una cuenta de servicio válida.`);
  }
  const clientEmail = text(value.client_email || value.clientEmail);
  const privateKey = text(value.private_key || value.privateKey).replace(/\\n/g, '\n');
  if (!clientEmail || !privateKey) {
    throw new Error(`${bindingName} debe incluir client_email y private_key.`);
  }
  return {
    clientEmail,
    privateKey,
    privateKeyId: text(value.private_key_id || value.privateKeyId),
    projectId: text(value.project_id || value.projectId)
  };
}

function serviceAccount(env, project) {
  const config = projectConfig(project);
  const names = config.key === 'TITULOS'
    ? ['TITULOS_FIREBASE_SERVICE_ACCOUNT', 'FIREBASE_TITULOS_SERVICE_ACCOUNT']
    : ['UTET_FIREBASE_SERVICE_ACCOUNT', 'FIREBASE_UTET_SERVICE_ACCOUNT'];

  for (const name of names) {
    const parsed = parseServiceAccount(readEnv(env, name), name);
    if (parsed) return parsed;
  }

  const generic = parseServiceAccount(readEnv(env, 'FIREBASE_SERVICE_ACCOUNT'), 'FIREBASE_SERVICE_ACCOUNT');
  if (generic) return generic;

  throw new Error(
    `Falta el secreto ${names[0]} en Cloudflare Pages. ` +
    `Debe contener el JSON de una cuenta de servicio con acceso IAM a ${config.projectId}.`
  );
}

function bytesToBase64Url(bytes) {
  let binary = '';
  const chunk = 0x8000;
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, Math.min(index + chunk, bytes.length)));
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function stringToBase64Url(value) {
  return bytesToBase64Url(new TextEncoder().encode(value));
}

function pemToArrayBuffer(pem) {
  const base64 = pem
    .replace(/-----BEGIN PRIVATE KEY-----/g, '')
    .replace(/-----END PRIVATE KEY-----/g, '')
    .replace(/\s+/g, '');
  if (!base64) throw new Error('La clave privada de Firebase está vacía.');
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes.buffer;
}

async function createSignedJwt(account) {
  const now = Math.floor(Date.now() / 1000);
  const header = {
    alg: 'RS256',
    typ: 'JWT',
    ...(account.privateKeyId ? { kid: account.privateKeyId } : {})
  };
  const payload = {
    iss: account.clientEmail,
    scope: FIRESTORE_SCOPE,
    aud: TOKEN_ENDPOINT,
    iat: now,
    exp: now + 3600
  };
  const unsigned = `${stringToBase64Url(JSON.stringify(header))}.${stringToBase64Url(JSON.stringify(payload))}`;
  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToArrayBuffer(account.privateKey),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    new TextEncoder().encode(unsigned)
  );
  return `${unsigned}.${bytesToBase64Url(new Uint8Array(signature))}`;
}

async function accessToken(env, project) {
  const config = projectConfig(project);
  const account = serviceAccount(env, project);
  const cacheKey = `${config.key}|${account.clientEmail}`;
  const cached = tokenCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now() + 60 * 1000) return cached.token;

  const assertion = await createSignedJwt(account);
  const response = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion
    }).toString()
  });
  const raw = await response.text();
  let data = {};
  try {
    data = raw ? JSON.parse(raw) : {};
  } catch (_error) {
    throw new Error('Google OAuth respondió en un formato no válido.');
  }
  if (!response.ok || !data.access_token) {
    throw new Error(
      `No se pudo autenticar Firebase ${config.projectId}: ` +
      text(data.error_description || data.error || `HTTP ${response.status}`)
    );
  }

  const expiresIn = Math.max(300, Number(data.expires_in || 3600));
  const result = {
    token: data.access_token,
    expiresAt: Date.now() + expiresIn * 1000
  };
  tokenCache.set(cacheKey, result);
  return result.token;
}

async function firestoreFetch(project, url, options = {}, env) {
  const token = await accessToken(env, project);
  const headers = new Headers(options.headers || {});
  headers.set('Authorization', `Bearer ${token}`);
  if (options.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  return fetch(url, { ...options, headers });
}

export function encodeValue(value) {
  if (value === null || value === undefined) return { nullValue: null };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return { nullValue: null };
    return Number.isInteger(value)
      ? { integerValue: String(value) }
      : { doubleValue: value };
  }
  if (value instanceof Date) return { timestampValue: value.toISOString() };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(encodeValue) } };
  if (typeof value === 'object') return { mapValue: { fields: encodeFields(value) } };
  return { stringValue: String(value) };
}

export function encodeFields(data) {
  const fields = {};
  for (const [key, value] of Object.entries(data || {})) {
    if (value === undefined) continue;
    fields[key] = encodeValue(value);
  }
  return fields;
}

export function decodeValue(value) {
  if (!value || typeof value !== 'object') return null;
  if ('nullValue' in value) return null;
  if ('stringValue' in value) return value.stringValue;
  if ('booleanValue' in value) return value.booleanValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return Number(value.doubleValue);
  if ('timestampValue' in value) return value.timestampValue;
  if ('referenceValue' in value) return value.referenceValue;
  if ('bytesValue' in value) return value.bytesValue;
  if ('geoPointValue' in value) return value.geoPointValue;
  if ('arrayValue' in value) return (value.arrayValue && value.arrayValue.values || []).map(decodeValue);
  if ('mapValue' in value) return decodeFields(value.mapValue && value.mapValue.fields || {});
  return null;
}

export function decodeFields(fields) {
  const output = {};
  for (const [key, value] of Object.entries(fields || {})) output[key] = decodeValue(value);
  return output;
}

function decodeDocument(document) {
  if (!document || !document.name) return null;
  const id = document.name.split('/').pop();
  return {
    id,
    _id: id,
    _docId: id,
    ...decodeFields(document.fields || {}),
    _createTime: document.createTime || '',
    _updateTime: document.updateTime || ''
  };
}

async function parseResponse(response, source) {
  const raw = await response.text();
  let data = {};
  try {
    data = raw ? JSON.parse(raw) : {};
  } catch (_error) {
    throw new Error((source || 'Firestore') + ' respondió en un formato no válido.');
  }
  if (!response.ok) {
    const message = data && data.error && (data.error.message || data.error.status)
      || data && data.message
      || `Error HTTP ${response.status}`;
    const error = new Error((source || 'Firestore') + ': ' + message);
    error.status = response.status;
    error.code = data && data.error && data.error.status || '';
    throw error;
  }
  return data;
}

export async function getDocument(project, collectionName, documentId, env) {
  const path = documentPath([collectionName, documentId]);
  const response = await firestoreFetch(
    project,
    `${apiBase(project)}/documents/${path}`,
    { method: 'GET', cache: 'no-store' },
    env
  );
  if (response.status === 404) return null;
  return decodeDocument(await parseResponse(response, 'Firestore'));
}

export async function listCollection(project, collectionName, options = {}, env) {
  const pageSize = Math.min(300, Math.max(1, Number(options.pageSize || 300)));
  const maxDocuments = Math.min(10000, Math.max(1, Number(options.maxDocuments || 5000)));
  const documents = [];
  let pageToken = '';

  do {
    const url = new URL(`${apiBase(project)}/documents/${documentPath([collectionName])}`);
    url.searchParams.set('pageSize', String(pageSize));
    if (pageToken) url.searchParams.set('pageToken', pageToken);
    const response = await firestoreFetch(project, url.toString(), { method: 'GET', cache: 'no-store' }, env);
    if (response.status === 404) return [];
    const data = await parseResponse(response, 'Firestore');
    for (const document of data.documents || []) {
      const decoded = decodeDocument(document);
      if (decoded) documents.push(decoded);
      if (documents.length >= maxDocuments) return documents;
    }
    pageToken = text(data.nextPageToken);
  } while (pageToken);

  return documents;
}

export async function queryEqual(project, collectionName, fieldPath, value, limit = 200, env) {
  const response = await firestoreFetch(project, `${apiBase(project)}/documents:runQuery`, {
    method: 'POST',
    cache: 'no-store',
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: collectionName }],
        where: {
          fieldFilter: {
            field: { fieldPath },
            op: 'EQUAL',
            value: encodeValue(value)
          }
        },
        limit: Math.min(1000, Math.max(1, Number(limit || 200)))
      }
    })
  }, env);
  const data = await parseResponse(response, 'Firestore');
  return (Array.isArray(data) ? data : [])
    .map((item) => decodeDocument(item.document))
    .filter(Boolean);
}

export async function setDocument(project, collectionName, documentId, data, options = {}, env) {
  const clean = {};
  for (const [key, value] of Object.entries(data || {})) {
    if (value !== undefined) clean[key] = value;
  }
  if (!Object.keys(clean).length) return getDocument(project, collectionName, documentId, env);

  const url = new URL(`${apiBase(project)}/documents/${documentPath([collectionName, documentId])}`);
  if (options.merge !== false) {
    for (const field of Object.keys(clean)) url.searchParams.append('updateMask.fieldPaths', field);
  }
  if (options.exists !== undefined) url.searchParams.set('currentDocument.exists', String(options.exists === true));
  if (options.updateTime) url.searchParams.set('currentDocument.updateTime', text(options.updateTime));

  const response = await firestoreFetch(project, url.toString(), {
    method: 'PATCH',
    cache: 'no-store',
    body: JSON.stringify({ fields: encodeFields(clean) })
  }, env);
  return decodeDocument(await parseResponse(response, 'Firestore'));
}

export async function deleteDocument(project, collectionName, documentId, env) {
  const response = await firestoreFetch(
    project,
    `${apiBase(project)}/documents/${documentPath([collectionName, documentId])}`,
    { method: 'DELETE', cache: 'no-store' },
    env
  );
  if (response.status === 404) return false;
  await parseResponse(response, 'Firestore');
  return true;
}

function writeForCommit(project, item) {
  if (item.delete === true) {
    return { delete: documentName(project, item.collection, item.id) };
  }
  const clean = {};
  for (const [key, value] of Object.entries(item.data || {})) {
    if (value !== undefined) clean[key] = value;
  }
  const write = {
    update: {
      name: documentName(project, item.collection, item.id),
      fields: encodeFields(clean)
    }
  };
  if (item.merge !== false) write.updateMask = { fieldPaths: Object.keys(clean) };
  if (item.exists !== undefined) write.currentDocument = { exists: item.exists === true };
  if (item.updateTime) write.currentDocument = { updateTime: text(item.updateTime) };
  return write;
}

export async function commitDocuments(project, writes, env) {
  const normalized = (Array.isArray(writes) ? writes : []).filter((item) => item && item.collection && item.id);
  if (!normalized.length) return { writeResults: [], commitTime: '' };
  const response = await firestoreFetch(project, `${apiBase(project)}/documents:commit`, {
    method: 'POST',
    cache: 'no-store',
    body: JSON.stringify({ writes: normalized.map((item) => writeForCommit(project, item)) })
  }, env);
  return parseResponse(response, 'Firestore');
}

export async function pingProject(project, env) {
  const config = projectConfig(project);
  await listCollection(project, '__ping_inexistente__', { pageSize: 1, maxDocuments: 1 }, env);
  return { ok: true, projectId: config.projectId, autenticacion: 'service-account-oauth' };
}

export function periodSignature(value) {
  let base = text(value).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ' ');
  const months = {
    enero: '01', febrero: '02', marzo: '03', abril: '04', mayo: '05', junio: '06',
    julio: '07', agosto: '08', septiembre: '09', setiembre: '09', octubre: '10',
    noviembre: '11', diciembre: '12'
  };
  for (const [month, number] of Object.entries(months)) {
    base = base.replace(new RegExp(`\\b${month}\\b`, 'g'), number);
  }
  const pairs = [];
  const seen = new Set();
  const add = (year, month) => {
    const normalizedMonth = String(Number(month)).padStart(2, '0');
    const pair = `${year}-${normalizedMonth}`;
    if (Number(normalizedMonth) >= 1 && Number(normalizedMonth) <= 12 && !seen.has(pair)) {
      seen.add(pair);
      pairs.push(pair);
    }
  };
  let match;
  const yearMonth = /\b(20\d{2})[^0-9]+(\d{1,2})\b/g;
  while ((match = yearMonth.exec(base))) add(match[1], match[2]);
  const monthYear = /\b(\d{1,2})[^0-9]+(20\d{2})\b/g;
  while ((match = monthYear.exec(base))) add(match[2], match[1]);
  if (pairs.length >= 2) return `${pairs[0]}__${pairs[pairs.length - 1]}`;
  return pairs[0] || text(value);
}

export function samePeriod(a, b) {
  const first = periodSignature(a);
  const second = periodSignature(b);
  return Boolean(first && second && first === second);
}

export function latestBy(items, numberFields = [], dateFields = []) {
  return (Array.isArray(items) ? items.slice() : []).sort((a, b) => {
    const numberA = numberFields.reduce((value, field) => value || Number(a && a[field] || 0), 0);
    const numberB = numberFields.reduce((value, field) => value || Number(b && b[field] || 0), 0);
    if (numberA !== numberB) return numberB - numberA;
    const dateA = dateFields.reduce((value, field) => value || Date.parse(a && a[field] || '') || 0, 0);
    const dateB = dateFields.reduce((value, field) => value || Date.parse(b && b[field] || '') || 0, 0);
    if (dateA !== dateB) return dateB - dateA;
    return text(b && b.id).localeCompare(text(a && a.id), 'es', { numeric: true });
  })[0] || null;
}
