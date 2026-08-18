/* Datos sanitizados para el reporte PDF de Firebase Títulos.
 * El reporte es estrictamente de lectura y usa límites por colección para no
 * agotar subrequests de Cloudflare en una sola invocación.
 */
import { listCollection, nowIso, text } from './firestore-fixed.js';

const COLLECTIONS = Object.freeze([
  ['periodos', 500],
  ['carreras', 500],
  ['coordinadores', 500],
  ['envios', 900],
  ['versiones_envio', 900],
  ['resoluciones', 900],
  ['ia', 300],
  ['servicios', 300],
  ['configuracion', 300],
  ['migraciones', 300]
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
  const collections = {};
  const summary = [];
  const truncatedCollections = [];

  /* Secuencial a propósito: evita abrir demasiadas conexiones externas en
     paralelo dentro de la misma invocación del Worker. Se lee un registro
     adicional para saber si la colección supera el límite del reporte. */
  for (const [name, limit] of COLLECTIONS) {
    const rows = await listCollection('TITULOS', name, {
      maxDocuments: limit + 1
    }, env);
    const truncated = rows.length > limit;
    const visible = truncated ? rows.slice(0, limit) : rows;
    collections[name] = visible.map((row) => sanitize(row));
    summary.push({
      coleccion: name,
      documentos: visible.length,
      limite: limit,
      truncado: truncated
    });
    if (truncated) truncatedCollections.push(name);
  }

  const complete = truncatedCollections.length === 0;
  return {
    ok: true,
    proyecto: 'titulos-ec2fa',
    generadoEn: nowIso(),
    resumen: summary,
    colecciones: collections,
    completo: complete,
    coleccionesTruncadas: truncatedCollections,
    nota: complete
      ? 'Las credenciales, tokens y secretos se excluyeron del reporte.'
      : 'Reporte parcial para proteger los límites del servidor. Se alcanzó el máximo seguro en: ' + truncatedCollections.join(', ') + '. Las credenciales, tokens y secretos se excluyeron.'
  };
}
