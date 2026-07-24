/* Fachada Firestore con normalización robusta de períodos y PING válido. */
import * as base from './firestore.js';

export const FIREBASE_PROJECTS = base.FIREBASE_PROJECTS;
export const text = base.text;
export const normalizeCedula = base.normalizeCedula;
export const slug = base.slug;
export const nowIso = base.nowIso;
export const encodeValue = base.encodeValue;
export const encodeFields = base.encodeFields;
export const decodeValue = base.decodeValue;
export const decodeFields = base.decodeFields;
export const getDocument = base.getDocument;
export const listCollection = base.listCollection;
export const queryEqual = base.queryEqual;
export const setDocument = base.setDocument;
export const deleteDocument = base.deleteDocument;
export const commitDocuments = base.commitDocuments;
export const latestBy = base.latestBy;

const MONTHS = Object.freeze({
  enero: '01', febrero: '02', marzo: '03', abril: '04', mayo: '05', junio: '06',
  julio: '07', agosto: '08', septiembre: '09', setiembre: '09', octubre: '10',
  noviembre: '11', diciembre: '12'
});

function normalized(value) {
  return text(value).toLowerCase().normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function periodSignature(value) {
  let source = normalized(value);
  if (!source) return '';

  for (const [month, number] of Object.entries(MONTHS)) {
    source = source.replace(new RegExp(`\\b${month}\\b`, 'g'), number);
  }

  const found = [];
  const add = (index, year, month) => {
    const numericMonth = Number(month);
    if (numericMonth < 1 || numericMonth > 12) return;
    found.push({ index, pair: `${year}-${String(numericMonth).padStart(2, '0')}` });
  };

  let match;
  const yearMonth = /\b(20\d{2})\s*(?:[-_/.]|\s)\s*(0?[1-9]|1[0-2])\b/g;
  while ((match = yearMonth.exec(source))) add(match.index, match[1], match[2]);

  const monthYear = /\b(0?[1-9]|1[0-2])\s+(20\d{2})\b/g;
  while ((match = monthYear.exec(source))) add(match.index, match[2], match[1]);

  found.sort((a, b) => a.index - b.index);
  const pairs = [];
  for (const item of found) {
    if (!pairs.includes(item.pair)) pairs.push(item.pair);
  }

  if (pairs.length >= 2) return `${pairs[0]}__${pairs[pairs.length - 1]}`;
  if (pairs.length === 1) return pairs[0];
  return text(value);
}

export function samePeriod(left, right) {
  const a = periodSignature(left);
  const b = periodSignature(right);
  return Boolean(a && b && a === b);
}

export async function pingProject(project, env) {
  const key = text(project).toUpperCase();
  const collection = key === 'TITULOS' ? 'configuracion' : 'Estudiantes';
  await base.listCollection(key, collection, { pageSize: 1, maxDocuments: 1 }, env);
  return {
    ok: true,
    projectId: base.FIREBASE_PROJECTS[key] && base.FIREBASE_PROJECTS[key].projectId || '',
    autenticacion: 'firebase-rest'
  };
}
