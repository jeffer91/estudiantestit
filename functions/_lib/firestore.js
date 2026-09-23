/* Cliente Firestore REST para Firebase Functions.
   Usa Application Default Credentials (ADC) de la identidad de ejecución.
   No almacena ni procesa llaves JSON de cuentas de servicio. */

import { GoogleAuth } from 'google-auth-library';

export const FIREBASE_PROJECTS = Object.freeze({
  TITULOS: Object.freeze({
    projectId: 'titulos-ec2fa'
  }),
  UTET: Object.freeze({
    projectId: 'utet-4387a'
  })
});

const FIRESTORE_SCOPE = 'https://www.googleapis.com/auth/datastore';
const googleAuth = new GoogleAuth({ scopes: [FIRESTORE_SCOPE] });
let authClientPromise = null;

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

async function accessToken() {
  if (!authClientPromise) authClientPromise = googleAuth.getClient();
  const client = await authClientPromise;
  const tokenResult = await client.getAccessToken();
  const token = typeof tokenResult === 'string'
    ? tokenResult
    : tokenResult && tokenResult.token;
  if (!text(token)) throw new Error('Firebase Functions no pudo obtener credenciales ADC de Google Cloud.');
  return text(token);
}

async function firestoreFetch(project, url, options = {}, _env) {
  /* El mismo token ADC sirve para ambos proyectos. El acceso real lo decide IAM:
     - titulos-ec2fa: lectura/escritura según la identidad de ejecución.
     - utet-4387a: solo lectura, concedida explícitamente en IAM. */
  projectConfig(project);
  const token = await accessToken();
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

/* Firestore batchGet accepts document names from the same database in a
   single request. Keeping the chunks sequential is intentional: it reduces
   Worker subrequests without opening many simultaneous connections. */
export async function batchGetDocuments(project, references, env) {
  const unique = new Map();
  for (const reference of Array.isArray(references) ? references : []) {
    const collectionName = text(reference && (reference.collectionName || reference.collection));
    const documentId = text(reference && (reference.documentId || reference.id));
    if (!collectionName || !documentId) continue;
    const name = documentName(project, collectionName, documentId);
    unique.set(name, { name, collectionName });
  }

  const pending = [...unique.values()];
  const documents = [];
  const chunkSize = 500;

  for (let offset = 0; offset < pending.length; offset += chunkSize) {
    const chunk = pending.slice(offset, offset + chunkSize);
    const response = await firestoreFetch(project, `${apiBase(project)}/documents:batchGet`, {
      method: 'POST',
      cache: 'no-store',
      body: JSON.stringify({ documents: chunk.map((item) => item.name) })
    }, env);
    const data = await parseResponse(response, 'Firestore');
    if (!Array.isArray(data)) throw new Error('Firestore batchGet respondió en un formato no válido.');

    for (const item of data) {
      const decoded = decodeDocument(item && item.found);
      if (!decoded) continue;
      const match = unique.get(item.found.name);
      documents.push({
        ...decoded,
        _collection: match && match.collectionName || ''
      });
    }
  }

  return documents;
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

export async function queryIn(project, collectionName, fieldPath, values, limit = 200, env) {
  const uniqueValues = [...new Map(
    (Array.isArray(values) ? values : [values])
      .filter((value) => value !== undefined && value !== null && text(value))
      .map((value) => [JSON.stringify(encodeValue(value)), value])
  ).values()];
  if (!uniqueValues.length) return [];
  if (uniqueValues.length === 1) {
    return queryEqual(project, collectionName, fieldPath, uniqueValues[0], limit, env);
  }

  const maximum = Math.min(1000, Math.max(1, Number(limit || 200)));
  const rows = new Map();
  const chunkSize = 30;

  for (let offset = 0; offset < uniqueValues.length && rows.size < maximum; offset += chunkSize) {
    const chunk = uniqueValues.slice(offset, offset + chunkSize);
    const response = await firestoreFetch(project, `${apiBase(project)}/documents:runQuery`, {
      method: 'POST',
      cache: 'no-store',
      body: JSON.stringify({
        structuredQuery: {
          from: [{ collectionId: collectionName }],
          where: {
            fieldFilter: {
              field: { fieldPath },
              op: 'IN',
              value: { arrayValue: { values: chunk.map(encodeValue) } }
            }
          },
          limit: maximum - rows.size
        }
      })
    }, env);
    const data = await parseResponse(response, 'Firestore');
    for (const item of Array.isArray(data) ? data : []) {
      const decoded = decodeDocument(item.document);
      if (decoded) rows.set(decoded.id, decoded);
    }
  }

  return [...rows.values()];
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
  return {
    ok: true,
    projectId: config.projectId,
    autenticacion: 'google-cloud-adc-iam'
  };
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
