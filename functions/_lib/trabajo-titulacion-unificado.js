import {
  getDocument,
  listCollection,
  periodSignature,
  queryEqual,
  samePeriod,
  setDocument,
  text
} from './firestore-fixed.js';

export const TIPO_TRABAJO_TITULACION = 'TRABAJO_TITULACION';
export const COLECCION_ENVIOS = 'envios';
export const COLECCION_VERSIONES = 'versiones_envio';
export const COLECCION_RESOLUCIONES = 'resoluciones';

const LEGACY_ENVIOS = 'envios_trabajo_titulacion';
const LEGACY_VERSIONES = 'versiones_trabajo_titulacion';
const LEGACY_RESOLUCIONES = 'resoluciones_trabajo_titulacion';
const MIGRATION_MARKER_ID = 'migracion_trabajos_titulacion_v1';

function fechaValor(row) {
  return Date.parse(
    row && (
      row.actualizadoEn || row.fechaResolucion || row.fechaEnvio ||
      row._updateTime || row._createTime
    ) || ''
  ) || 0;
}

function normalizarComparacion(value) {
  return text(value).toLowerCase().normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function periodosDesdeId(value) {
  const id = text(value).toLowerCase();
  if (!id) return [];
  const match = id.match(/^(20\d{2}-\d{2})(?:__(20\d{2}-\d{2}))?(?:__|$)/);
  if (!match) return [];
  return match[2]
    ? [match[1], `${match[1]}__${match[2]}`]
    : [match[1]];
}

function valoresPeriodo(value) {
  if (Array.isArray(value)) return value.flatMap(valoresPeriodo).filter(Boolean);
  if (value && typeof value === 'object') {
    const direct = [
      value.periodoId,
      value.periodId,
      value.periodoNombre,
      value.periodoLabel,
      value.periodoCanonicoId,
      value.periodoCanonicoLabel,
      value.periodo
    ].map(text).filter(Boolean);
    const id = text(value.id || value._id || value._docId || value.envioId || value.idRegistro);
    return [...new Set([...direct, ...periodosDesdeId(id)])];
  }
  const direct = text(value);
  return direct ? [direct] : [];
}

function partesPeriodo(value) {
  const signature = text(periodSignature(value));
  return signature ? signature.split('__').filter(Boolean) : [];
}

function periodoCompatible(left, right) {
  const a = text(left);
  const b = text(right);
  if (!a || !b) return false;
  if (normalizarComparacion(a) === normalizarComparacion(b)) return true;
  if (samePeriod(a, b)) return true;

  const partsA = partesPeriodo(a);
  const partsB = partesPeriodo(b);
  if (!partsA.length || !partsB.length) return false;

  if (partsA.length === 1 && partsB.length > 1 && partsA[0] === partsB[0]) return true;
  if (partsB.length === 1 && partsA.length > 1 && partsB[0] === partsA[0]) return true;
  return false;
}

function migrationEnabled(env, options = {}) {
  if (options.forzar === true) return true;
  const raw = text(env && env.ENABLE_LEGACY_TITULOS_MIGRATION).toLowerCase();
  return ['1', 'true', 'yes', 'si', 'sí'].includes(raw);
}

export function cedulaEstricta(value) {
  const digits = text(value).replace(/\D/g, '');
  return digits.length === 10 ? digits : '';
}

function legacyWorkEvidence(row) {
  row = row || {};
  const source = normalizarComparacion(
    row.migradoDesde || row.origenColeccion || row.coleccionOrigen || row.fuenteOrigen
  );
  const migrationId = normalizarComparacion(row.migracionId);
  const id = normalizarComparacion(row.id || row._id || row._docId || row.envioId || row.idRegistro);

  if (source.includes('trabajo titulacion') || source.includes('trabajo_titulacion')) return true;
  if (id.includes('trabajo titulacion') || id.includes('trabajo_titulacion')) return true;

  /* Los primeros lotes migrados de Trabajo de Titulación quedaron en `envios`
     sin `tipoTrabajo`, pero sí conservaron `migracionId`. Para no confundir
     artículos modernos, esta compatibilidad solo se activa cuando faltan
     explícitamente los campos de tipo y el documento tiene rasgos de resolución
     del flujo antiguo de Trabajo de Titulación. */
  const hasExplicitType = Boolean(text(row.tipoTrabajo || row.tipoTrabajoLabel));
  const hasLegacyResolution = Boolean(
    text(row.resolucionActualId) &&
    (text(row.observacion) || text(row.fechaResolucion) || row.requiereRevision === true)
  );
  return !hasExplicitType && Boolean(migrationId) && hasLegacyResolution;
}

export function esTrabajoTitulacion(row) {
  const type = text(row && row.tipoTrabajo).toUpperCase();
  const label = normalizarComparacion(row && row.tipoTrabajoLabel);
  if (type === TIPO_TRABAJO_TITULACION) return true;
  if (type === 'ARTICULO_ACADEMICO') return false;
  if (label === 'trabajo de titulacion') return true;
  if (label === 'articulo academico') return false;
  return legacyWorkEvidence(row);
}

export function periodoTrabajo(value) {
  const raw = text(value);
  return text(periodSignature(raw) || raw).replace(/\//g, '-');
}

export function coincidePeriodoTrabajo(rowOrValue, requested) {
  const left = valoresPeriodo(rowOrValue);
  const right = valoresPeriodo(requested);
  if (!left.length || !right.length) return false;
  return left.some((a) => right.some((b) => periodoCompatible(a, b)));
}

export function idTrabajoTitulacion(periodo, cedula) {
  return `${periodoTrabajo(periodo) || 'sin_periodo'}__${cedulaEstricta(cedula)}__trabajo_titulacion`;
}

function documentoId(row, fallbackCollection) {
  return text(row && (row.id || row._id || row._docId)) ||
    `${fallbackCollection}__${Date.now()}__${Math.random().toString(36).slice(2, 10)}`;
}

function limpiarInternos(row) {
  const output = {};
  for (const [key, value] of Object.entries(row || {})) {
    if (key.startsWith('_') || key === 'id') continue;
    output[key] = value;
  }
  return output;
}

async function listarColeccionSegura(nombre, env) {
  try {
    return await listCollection('TITULOS', nombre, { maxDocuments: 10000 }, env);
  } catch (error) {
    const message = text(error && error.message).toLowerCase();
    if (message.includes('not found') || message.includes('404')) return [];
    throw error;
  }
}

async function copiarColeccion(origen, destino, transform, env) {
  const rows = await listarColeccionSegura(origen, env);
  let copiados = 0;
  let omitidos = 0;

  for (const row of rows) {
    const data = transform(row);
    if (!data) {
      omitidos += 1;
      continue;
    }
    const id = documentoId(row, origen);
    const current = await getDocument('TITULOS', destino, id, env);
    if (current && fechaValor(current) >= fechaValor(row)) {
      omitidos += 1;
      continue;
    }
    await setDocument('TITULOS', destino, id, data, { merge: false }, env);
    copiados += 1;
  }

  return { encontrados: rows.length, copiados, omitidos };
}

export async function migrarTrabajosTitulacionLegados(env, options = {}) {
  if (!migrationEnabled(env, options)) {
    return {
      ok: true,
      omitida: true,
      motivo: 'MIGRACION_LEGADA_DESACTIVADA',
      totalCopiados: 0
    };
  }

  const marker = await getDocument('TITULOS', 'configuracion', MIGRATION_MARKER_ID, env);
  if (marker && marker.completada === true && options.forzar !== true) {
    return {
      ok: true,
      omitida: true,
      motivo: 'MIGRACION_YA_COMPLETADA',
      completadaEn: text(marker.completadaEn),
      totalCopiados: Number(marker.totalCopiados || 0)
    };
  }

  const envios = await copiarColeccion(
    LEGACY_ENVIOS,
    COLECCION_ENVIOS,
    (row) => {
      const cedula = cedulaEstricta(row.cedula || row.numeroIdentificacion);
      if (!cedula) return null;
      return {
        ...limpiarInternos(row),
        cedula,
        numeroIdentificacion: cedula,
        tipoTrabajo: TIPO_TRABAJO_TITULACION,
        tipoTrabajoLabel: 'Trabajo de Titulación',
        migradoDesde: LEGACY_ENVIOS,
        migradoEn: new Date().toISOString()
      };
    },
    env
  );

  const versiones = await copiarColeccion(
    LEGACY_VERSIONES,
    COLECCION_VERSIONES,
    (row) => ({
      ...limpiarInternos(row),
      tipoTrabajo: TIPO_TRABAJO_TITULACION,
      migradoDesde: LEGACY_VERSIONES,
      migradoEn: new Date().toISOString()
    }),
    env
  );

  const resoluciones = await copiarColeccion(
    LEGACY_RESOLUCIONES,
    COLECCION_RESOLUCIONES,
    (row) => ({
      ...limpiarInternos(row),
      tipoTrabajo: TIPO_TRABAJO_TITULACION,
      migradoDesde: LEGACY_RESOLUCIONES,
      migradoEn: new Date().toISOString()
    }),
    env
  );

  const totalCopiados = envios.copiados + versiones.copiados + resoluciones.copiados;
  await setDocument('TITULOS', 'configuracion', MIGRATION_MARKER_ID, {
    completada: true,
    completadaEn: new Date().toISOString(),
    totalCopiados,
    envios,
    versiones,
    resoluciones
  }, { merge: true }, env);

  return {
    ok: true,
    envios,
    versiones,
    resoluciones,
    totalCopiados
  };
}

export async function listarTrabajosTitulacionUnificados(env) {
  const direct = await queryEqual(
    'TITULOS',
    COLECCION_ENVIOS,
    'tipoTrabajo',
    TIPO_TRABAJO_TITULACION,
    1000,
    env
  );

  /* Compatibilidad con documentos históricos que quedaron sin `tipoTrabajo`.
     Se hace una lectura global solo para completar los legados y se deduplica
     por ID; los documentos modernos siguen resolviéndose por consulta indexada. */
  const all = await listCollection('TITULOS', COLECCION_ENVIOS, { maxDocuments: 10000 }, env);
  const map = new Map();
  [...direct, ...all.filter(esTrabajoTitulacion)].forEach((row) => {
    const id = documentoId(row, COLECCION_ENVIOS);
    if (id) map.set(id, row);
  });
  return [...map.values()];
}
