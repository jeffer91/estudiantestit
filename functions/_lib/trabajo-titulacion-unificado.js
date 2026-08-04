import {
  getDocument,
  listCollection,
  periodSignature,
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

function valoresPeriodo(value) {
  if (Array.isArray(value)) return value.flatMap(valoresPeriodo).filter(Boolean);
  if (value && typeof value === 'object') {
    return [
      value.periodoId,
      value.periodId,
      value.periodoNombre,
      value.periodoLabel,
      value.periodoCanonicoId,
      value.periodoCanonicoLabel,
      value.periodo
    ].map(text).filter(Boolean);
  }
  const direct = text(value);
  return direct ? [direct] : [];
}

export function cedulaEstricta(value) {
  const digits = text(value).replace(/\D/g, '');
  return digits.length === 10 ? digits : '';
}

export function esTrabajoTitulacion(row) {
  return text(row && row.tipoTrabajo).toUpperCase() === TIPO_TRABAJO_TITULACION ||
    text(row && row.tipoTrabajoLabel).toLowerCase() === 'trabajo de titulación' ||
    text(row && (row.id || row._id || row._docId)).toLowerCase().includes('trabajo_titulacion');
}

export function periodoTrabajo(value) {
  const raw = text(value);
  return text(periodSignature(raw) || raw).replace(/\//g, '-');
}

export function coincidePeriodoTrabajo(rowOrValue, requested) {
  const left = valoresPeriodo(rowOrValue);
  const right = valoresPeriodo(requested);
  if (!left.length || !right.length) return false;

  return left.some((a) => right.some((b) => {
    if (normalizarComparacion(a) === normalizarComparacion(b)) return true;
    const signatureA = periodSignature(a);
    const signatureB = periodSignature(b);
    return Boolean(signatureA && signatureB && signatureA === signatureB);
  }));
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

export async function migrarTrabajosTitulacionLegados(env) {
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

  return {
    ok: true,
    envios,
    versiones,
    resoluciones,
    totalCopiados: envios.copiados + versiones.copiados + resoluciones.copiados
  };
}

export async function listarTrabajosTitulacionUnificados(env) {
  await migrarTrabajosTitulacionLegados(env);
  const rows = await listCollection('TITULOS', COLECCION_ENVIOS, { maxDocuments: 10000 }, env);
  return rows.filter(esTrabajoTitulacion);
}
