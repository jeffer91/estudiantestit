/* Población completa y compatible de envíos para Coordinadores.
 * - Fuente única: Firebase Títulos / envios.
 * - Sin limitar por período cuando Coordinadores consulta por sus carreras.
 * - Incluye Artículo Académico y Trabajo de Titulación en una sola población.
 * - Recupera históricos con títulos parciales/finales y deduplica por
 *   cédula + período + tipo de trabajo, conservando la versión más reciente.
 */
import {
  executeTitulosAction as executePrevious,
  publicTitleConfiguration
} from './titulos-firebase-v9.js';
import {
  listCollection,
  normalizeCedula,
  periodSignature,
  text
} from './firestore-fixed.js';
import {
  TIPO_TRABAJO_TITULACION,
  coincidePeriodoTrabajo,
  esTrabajoTitulacion
} from './trabajo-titulacion-unificado.js';

const TIPO_ARTICULO = 'ARTICULO_ACADEMICO';
const LIST_ACTIONS = new Set([
  'LISTAR_ENVIOS_COORDINADOR',
  'LISTAR_ENVIOS_POR_CARRERA'
]);
const STOPWORDS_CARRERA = new Set([
  'UNIVERSITARIA', 'UNIVERSITARIO', 'TECNOLOGIA', 'TECNOLOGO',
  'SUPERIOR', 'EN', 'DE', 'DEL', 'LA', 'EL', 'Y', 'ONLINE', 'LINEA', 'TSU'
]);

function normalize(value) {
  return text(value).toUpperCase().normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function splitList(value) {
  if (Array.isArray(value)) return value.map(text).filter(Boolean);
  return text(value).split(/[,;|\n]+/).map(text).filter(Boolean);
}

function normalizeStatus(value) {
  const status = text(value).toUpperCase().replace(/[^A-Z0-9]+/g, '_');
  if (status.includes('DEVUEL')) return 'DEVUELTO';
  if (status.includes('REEMPLAZ')) return 'REEMPLAZADO';
  if (status.includes('APROBAD')) return 'APROBADO';
  if (status.includes('PENDIENT') || status === 'ENVIADO') return 'PENDIENTE_REVISION';
  return status;
}

function cleanTitle(value) {
  let output = text(value).replace(/\s+/g, ' ');
  if (!output) return '';
  const jsonish = output.match(/^(?:["']?titulo["']?)\s*:\s*["']([\s\S]*?)["']$/i);
  if (jsonish) output = text(jsonish[1]);
  while (
    output.length >= 2 &&
    ((output.startsWith('"') && output.endsWith('"')) ||
      (output.startsWith("'") && output.endsWith("'")))
  ) output = output.slice(1, -1).trim();
  return output;
}

function proposalTitle(value) {
  if (typeof value === 'string') return cleanTitle(value);
  const item = value && typeof value === 'object' ? value : {};
  return cleanTitle(
    item.tituloFinal || item.titulo || item.tituloMejorado ||
    item.texto || item.title || item.nombre
  );
}

function collectTitles(row) {
  row = row || {};
  const titles = [];
  const seen = new Set();
  const add = (value) => {
    const title = cleanTitle(value);
    const key = normalize(title);
    if (!title || !key || seen.has(key)) return;
    seen.add(key);
    titles.push(title);
  };

  add(row.titulo1);
  add(row.titulo2);
  add(row.titulo3);

  for (const field of ['propuestasDetalle', 'propuestas', 'titulosEnviados']) {
    const list = Array.isArray(row[field]) ? row[field] : [];
    list.forEach((item) => add(proposalTitle(item)));
  }

  /* En históricos incompletos estos son, a veces, los únicos títulos que
     sobrevivieron a la migración. Se usan para no ocultar el envío. */
  add(row.tituloElegido);
  add(row.tituloFinal);
  add(row.tituloAprobado);
  add(row.tituloCorregido);
  add(row.tituloPreferidoTexto);

  return titles.slice(0, 3);
}

function rowType(row) {
  const explicit = text(row && row.tipoTrabajo).toUpperCase();
  if (explicit === TIPO_TRABAJO_TITULACION) return TIPO_TRABAJO_TITULACION;
  if (explicit === TIPO_ARTICULO) return TIPO_ARTICULO;
  return esTrabajoTitulacion(row) ? TIPO_TRABAJO_TITULACION : TIPO_ARTICULO;
}

function decorate(row) {
  if (!row || typeof row !== 'object') return row;
  const type = rowType(row);
  const titles = collectTitles(row);
  const output = {
    ...row,
    tipoTrabajo: type,
    tipoTrabajoLabel: type === TIPO_TRABAJO_TITULACION
      ? 'Trabajo de Titulación'
      : 'Artículo académico'
  };

  /* Las pantallas históricas todavía usan titulo1/2/3 como señal de que el
     documento es un envío revisable. Rellenamos solo huecos con evidencia real
     ya existente; nunca inventamos títulos. */
  const used = new Set([
    normalize(cleanTitle(output.titulo1)),
    normalize(cleanTitle(output.titulo2)),
    normalize(cleanTitle(output.titulo3))
  ].filter(Boolean));
  let cursor = 0;
  for (let index = 1; index <= 3; index += 1) {
    const field = `titulo${index}`;
    if (cleanTitle(output[field])) {
      output[field] = cleanTitle(output[field]);
      continue;
    }
    while (cursor < titles.length && used.has(normalize(titles[cursor]))) cursor += 1;
    if (cursor < titles.length) {
      output[field] = titles[cursor];
      used.add(normalize(titles[cursor]));
      cursor += 1;
    }
  }
  output.tieneTitulos = collectTitles(output).length > 0;
  return output;
}

function careerTokens(value) {
  return normalize(value).split(' ')
    .filter((token) => token.length >= 3 && !STOPWORDS_CARRERA.has(token));
}

function careerEquivalent(left, right) {
  const a = normalize(left);
  const b = normalize(right);
  if (!a || !b) return false;
  if (a === b || a.includes(b) || b.includes(a)) return true;
  const tokensA = careerTokens(a);
  const tokensB = careerTokens(b);
  if (!tokensA.length || !tokensB.length) return false;
  const common = tokensA.filter((token) => tokensB.includes(token));
  const base = Math.min(tokensA.length, tokensB.length);
  return common.length >= 2 && common.length / base >= 0.7;
}

function rowCareerValues(row) {
  row = row || {};
  return [
    row.carreraNombre, row.nombreCarrera, row.carrera,
    row.carreraClave, row.carreraId, row.carreraCodigo,
    row.codigoCarrera, row.CodigoCarrera
  ].map(text).filter(Boolean);
}

function matchesCareer(row, careers) {
  if (!careers.length) return true;
  const values = rowCareerValues(row);
  return careers.some((career) =>
    values.some((value) => careerEquivalent(value, career))
  );
}

function rowId(row, index = 0) {
  row = row || {};
  return text(row.id || row._id || row._docId || row.envioId || row.idRegistro) ||
    `sin_id__${index}`;
}

function periodFromId(row) {
  const id = rowId(row);
  const match = id.match(/^(20\d{2}-\d{2})(?:__(20\d{2}-\d{2}))?(?:__|$)/i);
  if (!match) return '';
  return match[2] ? `${match[1]}__${match[2]}` : match[1];
}

function periodKey(row) {
  row = row || {};
  const values = [
    row.periodoNombre,
    row.periodoLabel,
    row.periodoCanonicoLabel,
    row.periodoCanonicoId,
    periodFromId(row),
    row.periodoId,
    row.periodId,
    row.periodo
  ].map(text).filter(Boolean);
  for (const value of values) {
    const signature = text(periodSignature(value));
    if (signature && signature.includes('__')) return signature;
  }
  for (const value of values) {
    const signature = text(periodSignature(value));
    if (signature) return signature;
  }
  return normalize(values[0]).replace(/\s+/g, '_');
}

function versionScore(row) {
  row = row || {};
  return Math.max(
    Number(row.versionActual || 0),
    Number(row.numeroVersion || 0),
    Number(row.numeroEnvios || 0),
    Number(row.numeroReenvios || 0) + (row.numeroReenvios !== undefined ? 1 : 0)
  );
}

function dateScore(row) {
  row = row || {};
  return Math.max(
    Date.parse(typeof row.actualizadoEn === 'string' ? row.actualizadoEn : '') || 0,
    Date.parse(row.fechaResolucion || '') || 0,
    Date.parse(row.fechaEnvio || '') || 0,
    Date.parse(row.ultimaFechaRevision || '') || 0,
    Date.parse(row._updateTime || '') || 0,
    Date.parse(row._createTime || '') || 0
  );
}

function newer(left, right) {
  if (!right) return true;
  const versionLeft = versionScore(left);
  const versionRight = versionScore(right);
  if (versionLeft !== versionRight) return versionLeft > versionRight;
  const dateLeft = dateScore(left);
  const dateRight = dateScore(right);
  if (dateLeft !== dateRight) return dateLeft > dateRight;
  return rowId(left).localeCompare(rowId(right)) > 0;
}

function emptyValue(value) {
  return value === undefined || value === null || value === '' ||
    (Array.isArray(value) && value.length === 0);
}

function mergeMissing(primary, secondary) {
  const output = { ...(primary || {}) };
  for (const [key, value] of Object.entries(secondary || {})) {
    if (emptyValue(output[key]) && !emptyValue(value)) output[key] = value;
  }
  return output;
}

function logicalKey(row, index = 0) {
  const cedula = normalizeCedula(row && (row.cedula || row.numeroIdentificacion));
  const period = periodKey(row);
  const type = rowType(row);
  if (cedula && period) return `${cedula}__${period}__${type}`;
  return `id__${rowId(row, index)}`;
}

function dedupe(rows) {
  const map = new Map();
  (Array.isArray(rows) ? rows : []).forEach((raw, index) => {
    const row = decorate(raw);
    const key = logicalKey(row, index);
    const current = map.get(key);
    if (!current) {
      map.set(key, row);
      return;
    }
    if (newer(row, current)) map.set(key, mergeMissing(row, current));
    else map.set(key, mergeMissing(current, row));
  });
  return [...map.values()];
}

function requestedPeriods(payload) {
  return [payload.periodoId, payload.periodoLabel, payload.periodo]
    .flatMap((value) => Array.isArray(value) ? value : [value])
    .map(text)
    .filter(Boolean);
}

async function completeCoordinatorPopulation(payload, env) {
  const careers = splitList(payload.carreras || payload.carrera || payload.nombreCarrera);
  if (!careers.length) return [];

  /* La regla funcional de Coordinadores exige todos los períodos. La colección
     `envios` es la fuente oficial; no se consulta envios_trabajo_titulacion. */
  const all = await listCollection('TITULOS', 'envios', { maxDocuments: 10000 }, env);
  const periods = requestedPeriods(payload);
  const requestedState = normalizeStatus(payload.estado);
  const requestedType = text(payload.tipoTrabajo).toUpperCase();

  const filtered = all.filter((row) => {
    const cedula = normalizeCedula(row && (row.cedula || row.numeroIdentificacion));
    if (!cedula || !collectTitles(row).length) return false;
    if (!matchesCareer(row, careers)) return false;
    if (periods.length && !coincidePeriodoTrabajo(row, periods)) return false;
    if (requestedState && normalizeStatus(row.estado || row.estadoFinal) !== requestedState) return false;
    if (requestedType && requestedType !== 'TODOS' && rowType(row) !== requestedType) return false;
    return true;
  });

  return dedupe(filtered).sort((left, right) => {
    const versionDiff = versionScore(right) - versionScore(left);
    if (versionDiff) return versionDiff;
    return dateScore(right) - dateScore(left);
  });
}

async function completeListResult(result, payload, env) {
  const rows = await completeCoordinatorPopulation(payload, env);
  const articles = rows.filter((row) => row.tipoTrabajo === TIPO_ARTICULO).length;
  const works = rows.filter((row) => row.tipoTrabajo === TIPO_TRABAJO_TITULACION).length;
  return {
    ...(result || {}),
    ok: result && result.ok === false ? false : true,
    envios: rows,
    registros: rows,
    filas: rows,
    total: rows.length,
    articulos: articles,
    trabajosTitulacion: works,
    consultaCompletaCoordinadores: true,
    fuenteEnvios: 'FIREBASE_TITULOS_ENVÍOS',
    sinLimitePeriodo: requestedPeriods(payload).length === 0,
    deduplicacion: 'CEDULA_PERIODO_TIPO'
  };
}

export async function executeTitulosAction(action, payload = {}, userRole = 'student', env) {
  const normalized = text(action).toUpperCase();
  const result = await executePrevious(action, payload, userRole, env);
  if (LIST_ACTIONS.has(normalized) && splitList(payload.carreras || payload.carrera || payload.nombreCarrera).length) {
    return completeListResult(result, payload, env);
  }
  return result;
}

export { publicTitleConfiguration };
