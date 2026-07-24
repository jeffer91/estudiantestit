/* Cliente Firestore REST compartido para Cloudflare Pages Functions. */

export const FIREBASE_PROJECTS = Object.freeze({
  TITULOS: Object.freeze({
    projectId: 'titulos-ec2fa',
    apiKey: 'AIzaSyDkSOhJ552LwxQtt8GhP5iDJk49y0t4mOg'
  }),
  UTET: Object.freeze({
    projectId: 'utet-4387a',
    apiKey: 'AIzaSyCaHf1C0BB0X_H3BDZ1o-UDAsPmLTjsZLA'
  })
});

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
  return config;
}

function apiBase(project) {
  const config = projectConfig(project);
  return `https://firestore.googleapis.com/v1/projects/${config.projectId}/databases/(default)`;
}

function withKey(project, url) {
  const config = projectConfig(project);
  const parsed = new URL(url);
  parsed.searchParams.set('key', config.apiKey);
  return parsed.toString();
}

function documentPath(parts) {
  return parts.map((item) => encodeURIComponent(text(item))).join('/');
}

function isIsoDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value);
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
  if (Array.isArray(value)) {
    return { arrayValue: { values: value.map(encodeValue) } };
  }
  if (typeof value === 'object') {
    return { mapValue: { fields: encodeFields(value) } };
  }
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
  if ('arrayValue' in value) {
    return (value.arrayValue && value.arrayValue.values || []).map(decodeValue);
  }
  if ('mapValue' in value) {
    return decodeFields(value.mapValue && value.mapValue.fields || {});
  }
  return null;
}

export function decodeFields(fields) {
  const output = {};
  for (const [key, value] of Object.entries(fields || {})) {
    output[key] = decodeValue(value);
  }
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

export async function getDocument(project, collectionName, documentId) {
  const path = documentPath([collectionName, documentId]);
  const url = withKey(project, `${apiBase(project)}/documents/${path}`);
  const response = await fetch(url, { method: 'GET', cache: 'no-store' });
  if (response.status === 404) return null;
  return decodeDocument(await parseResponse(response, 'Firestore'));
}

export async function listCollection(project, collectionName, options = {}) {
  const pageSize = Math.min(300, Math.max(1, Number(options.pageSize || 300)));
  const maxDocuments = Math.min(10000, Math.max(1, Number(options.maxDocuments || 5000)));
  const documents = [];
  let pageToken = '';

  do {
    const base = `${apiBase(project)}/documents/${documentPath([collectionName])}`;
    const url = new URL(withKey(project, base));
    url.searchParams.set('pageSize', String(pageSize));
    if (pageToken) url.searchParams.set('pageToken', pageToken);
    const response = await fetch(url.toString(), { method: 'GET', cache: 'no-store' });
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

export async function queryEqual(project, collectionName, fieldPath, value, limit = 200) {
  const url = withKey(project, `${apiBase(project)}/documents:runQuery`);
  const response = await fetch(url, {
    method: 'POST',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
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
  });
  const data = await parseResponse(response, 'Firestore');
  return (Array.isArray(data) ? data : [])
    .map((item) => decodeDocument(item.document))
    .filter(Boolean);
}

export async function setDocument(project, collectionName, documentId, data, options = {}) {
  const clean = {};
  for (const [key, value] of Object.entries(data || {})) {
    if (value !== undefined) clean[key] = value;
  }
  if (!Object.keys(clean).length) return getDocument(project, collectionName, documentId);

  const base = `${apiBase(project)}/documents/${documentPath([collectionName, documentId])}`;
  const url = new URL(withKey(project, base));
  if (options.merge !== false) {
    for (const field of Object.keys(clean)) {
      url.searchParams.append('updateMask.fieldPaths', field);
    }
  }

  const response = await fetch(url.toString(), {
    method: 'PATCH',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: encodeFields(clean) })
  });
  return decodeDocument(await parseResponse(response, 'Firestore'));
}

export async function deleteDocument(project, collectionName, documentId) {
  const url = withKey(
    project,
    `${apiBase(project)}/documents/${documentPath([collectionName, documentId])}`
  );
  const response = await fetch(url, { method: 'DELETE', cache: 'no-store' });
  if (response.status === 404) return false;
  await parseResponse(response, 'Firestore');
  return true;
}

export async function pingProject(project) {
  const config = projectConfig(project);
  try {
    await listCollection(project, '__ping_inexistente__', { pageSize: 1, maxDocuments: 1 });
    return { ok: true, projectId: config.projectId };
  } catch (error) {
    if (error.status === 404) return { ok: true, projectId: config.projectId };
    throw error;
  }
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
