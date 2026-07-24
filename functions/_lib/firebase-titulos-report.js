/* Datos sanitizados para el reporte PDF de Firebase Títulos. */
import { listCollection, nowIso, text } from './firestore-fixed.js';

const COLLECTIONS = Object.freeze([
  ['periodos', 1000],
  ['carreras', 2000],
  ['coordinadores', 1000],
  ['envios', 10000],
  ['versiones_envio', 10000],
  ['resoluciones', 10000],
  ['ia', 1000],
  ['servicios', 1000],
  ['configuracion', 1000],
  ['migraciones', 3000]
]);

function normalizedKey(value) {
  return text(value).toLowerCase().normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
}

function sensitive(key) {
  return /(credencial|secreto|password|token|apikey|privatekey|clientsecret|authorization)/i
    .test(normalizedKey(key));
}

function sanitize(value, key = '', depth = 0) {
  if (sensitive(key)) return value ? '[CONFIGURADO - OCULTO]' : '';
  if (value === null || value === undefined) return '';
  if (depth > 6) return '[Contenido anidado]';
  if (Array.isArray(value)) return value.map((item) => sanitize(item, key, depth + 1));
  if (typeof value === 'object') {
    return Object.entries(value).reduce((output, [childKey, childValue]) => {
      output[childKey] = sanitize(childValue, childKey, depth + 1);
      return output;
    }, {});
  }
  return value;
}

export async function buildFirebaseTitlesReport(env) {
  const results = await Promise.all(COLLECTIONS.map(async ([name, maxDocuments]) => {
    const rows = await listCollection('TITULOS', name, { maxDocuments }, env);
    return [name, rows.map((row) => sanitize(row))];
  }));
  const collections = Object.fromEntries(results);
  const summary = Object.entries(collections).map(([collection, rows]) => ({
    coleccion: collection,
    documentos: Array.isArray(rows) ? rows.length : 0
  }));

  return {
    ok: true,
    proyecto: 'titulos-ec2fa',
    generadoEn: nowIso(),
    resumen: summary,
    colecciones: collections,
    nota: 'Las credenciales, tokens y secretos se excluyeron del reporte.'
  };
}
