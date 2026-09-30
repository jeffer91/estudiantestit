/* Lectura optimizada de Firebase Títulos con períodos canónicos. */
import {
  executeTitulosAction as executePrevious,
  publicTitleConfiguration
} from './titulos-firebase-fixed.js';
import { buildAdminGlobalList } from './admin-global-v6.js';
import {
  latestBy,
  listCollection,
  normalizeCedula,
  periodSignature,
  pingProject,
  queryEqual,
  text
} from './firestore-fixed.js';
import {
  TIPO_TRABAJO_TITULACION,
  coincidePeriodoTrabajo,
  esTrabajoTitulacion
} from './trabajo-titulacion-unificado.js';

function normalizeStatus(value, fallback = 'PENDIENTE_REVISION') {
  const normalized = text(value).toUpperCase().replace(/[^A-Z0-9]+/g, '_');
  if (!normalized) return fallback;
  if (normalized.includes('NO_ENVIADO')) return 'NO_ENVIADO';
  if (normalized.includes('DEVUEL')) return 'DEVUELTO';
  if (normalized.includes('REEMPLAZ')) return 'REEMPLAZADO';
  if (normalized.includes('APROBAD')) return 'APROBADO';
  if (normalized.includes('PENDIENT')) return 'PENDIENTE_REVISION';
  return normalized;
}

function cleanTitle(value) {
  let output = text(value).replace(/\s+/g, ' ');
  while (output.length >= 2 && (
    (output.startsWith('"') && output.endsWith('"')) ||
    (output.startsWith("'") && output.endsWith("'"))
  )) output = output.slice(1, -1).trim();
  return output;
}

function splitList(value) {
  if (Array.isArray(value)) return value.map(text).filter(Boolean);
  return text(value).split(/[,;|\n]+/).map(text).filter(Boolean);
}

function trueValue(value) {
  if (value === true) return true;
  return ['1', 'true', 'yes', 'si', 'sí'].includes(text(value).toLowerCase());
}

function activeValue(value) {
  if (value === undefined || value === null || value === '') return true;
  if (value === false) return false;
  return !['0', 'false', 'no', 'inactivo', 'desactivado', 'anulado'].includes(text(value).toLowerCase());
}

function principalValue(row) {
  return Boolean(row && (
    row.principal === true ||
    row.esPrincipal === true ||
    text(row.tipo).toUpperCase() === 'PRINCIPAL'
  ));
}

function periodLabel(row) {
  return text(row && (
    row.periodoNombre || row.periodoLabel || row.periodoCanonicoLabel || row.periodo ||
    row.periodoId || row.periodId
  ));
}

function periodId(row) {
  const direct = text(row && (row.periodoId || row.periodId || row.periodoCanonicoId));
  return direct || periodSignature(periodLabel(row));
}

function tipoTrabajo(row) {
  return esTrabajoTitulacion(row) ? TIPO_TRABAJO_TITULACION : 'ARTICULO_ACADEMICO';
}

function normalizeEnvio(row) {
  row = row || {};
  const id = text(row.id || row._docId || row._id || row.envioId);
  const cedula = normalizeCedula(row.cedula || row.numeroIdentificacion);
  const names = text(row.nombres || row.estudiante || row.Nombres);
  const career = text(row.carreraNombre || row.nombreCarrera || row.carrera);
  const label = periodLabel(row);
  const canonicalPeriod = periodId(row) || label;
  const titles = [cleanTitle(row.titulo1), cleanTitle(row.titulo2), cleanTitle(row.titulo3)];
  const hasTitles = titles.some(Boolean);
  const preferred = Number(row.tituloPreferidoNumero || row.preferido || 0);
  const status = hasTitles ? normalizeStatus(row.estado || row.estadoFinal) : 'NO_ENVIADO';
  const finalTitle = cleanTitle(row.tituloFinal || row.tituloCorregido || row.tituloElegido);
  const observation = text(row.observacion || row.comentarioCoordinador || row.comentario);
  const type = tipoTrabajo(row);

  return {
    ...row,
    id: id || `${canonicalPeriod || 'sin_periodo'}__${cedula}`,
    _id: id || `${canonicalPeriod || 'sin_periodo'}__${cedula}`,
    _clave: id || `${canonicalPeriod || 'sin_periodo'}__${cedula}`,
    idRegistro: id,
    envioId: id,
    tipoTrabajo: type,
    tipoTrabajoLabel: type === TIPO_TRABAJO_TITULACION ? 'Trabajo de Titulación' : 'Artículo académico',
    cedula,
    numeroIdentificacion: cedula,
    nombres: names,
    estudiante: names,
    carrera: career,
    nombreCarrera: career,
    codigoCarrera: text(row.codigoCarrera || row.carreraCodigo || row.carreraId),
    periodoId: canonicalPeriod,
    periodo: label || canonicalPeriod,
    periodoLabel: label || canonicalPeriod,
    celular: text(row.celular || row.telefono || row.Telefono),
    correoInstitucional: text(row.correoInstitucional),
    correoPersonal: text(row.correoPersonal),
    titulo1: titles[0],
    titulo2: titles[1],
    titulo3: titles[2],
    preferido: preferred,
    tituloPreferidoNumero: preferred,
    tituloPreferidoTexto: preferred >= 1 && preferred <= 3 ? titles[preferred - 1] : '',
    estado: status,
    estadoFinal: status,
    estadoProceso: status,
    enviado: hasTitles,
    tieneTitulos: hasTitles,
    tituloAprobado: finalTitle,
    tituloFinal: finalTitle,
    comentarioCoordinador: observation,
    observacion: observation,
    fechaRevision: text(row.fechaResolucion),
    permitirReenvio: status === 'DEVUELTO'
  };
}

function careerMatches(row, filters) {
  if (!filters.length) return true;
  const name = text(row.carreraNombre || row.nombreCarrera || row.carrera).toLowerCase();
  const id = text(row.carreraId || row.carreraCodigo || row.codigoCarrera).toLowerCase();
  return filters.some((filter) => name === filter || id === filter || name.includes(filter));
}

async function queryValues(collectionName, field, values, limit, env) {
  const map = new Map();
  for (const value of values) {
    if (!text(value)) continue;
    const rows = await queryEqual('TITULOS', collectionName, field, value, limit, env);
    rows.forEach((row) => map.set(row.id, row));
  }
  return [...map.values()];
}

async function queryByFirstMatchingField(collectionName, fields, values, limit, env) {
  for (const field of fields) {
    const rows = await queryValues(collectionName, field, values, limit, env);
    if (rows.length) return rows;
  }
  return [];
}

async function principalPeriodValues(env) {
  const periods = await listCollection('TITULOS', 'periodos', { maxDocuments: 500 }, env);
  const active = periods.filter((item) => activeValue(
    item.activo !== undefined ? item.activo : item.estado
  ));
  const selected = active.find(principalValue) || active[0] || periods.find(principalValue) || periods[0];
  if (!selected) return [];
  const values = [
    selected.id,
    selected.periodoId,
    selected.periodId,
    selected.periodoCanonicoId,
    selected.nombre,
    selected.label,
    selected.periodoNombre,
    selected.periodoLabel,
    selected.periodo
  ].map(text).filter(Boolean);
  const canonical = values.map((value) => periodSignature(value)).filter(Boolean);
  return [...new Set([...values, ...canonical])];
}

async function candidateEnvios(payload, env) {
  const careerValues = splitList(payload.carreras || payload.carrera || payload.nombreCarrera);
  const periodValues = [payload.periodoId, payload.periodoLabel, payload.periodo]
    .map(text).filter(Boolean);
  const statusValue = text(payload.estado) ? normalizeStatus(payload.estado, '') : '';

  /* La prioridad evita descargar toda la colección: Coordinadores consulta por
     sus carreras; otras vistas pueden consultar por período o estado. */
  if (careerValues.length) {
    return queryByFirstMatchingField('envios', [
      'carreraNombre', 'nombreCarrera', 'carrera',
      'carreraCodigo', 'codigoCarrera', 'carreraId'
    ], careerValues, 1000, env);
  }
  if (periodValues.length) {
    const canonical = periodValues.map((value) => periodSignature(value)).filter(Boolean);
    const values = [...new Set([...periodValues, ...canonical])];
    return queryByFirstMatchingField('envios', [
      'periodoId', 'periodId', 'periodoCanonicoId',
      'periodoNombre', 'periodoLabel', 'periodo'
    ], values, 1000, env);
  }
  if (statusValue) {
    return queryByFirstMatchingField('envios', ['estado', 'estadoFinal'], [statusValue], 1000, env);
  }

  /* Una lectura global solo se permite cuando la acción lo solicita de forma
     explícita. Las pantallas antiguas sin filtros reciben el período principal
     en vez de recorrer hasta 5.000 documentos de todos los períodos. */
  if (trueValue(payload.incluirTodos || payload.todas)) {
    return listCollection('TITULOS', 'envios', { maxDocuments: 5000 }, env);
  }
  const principal = await principalPeriodValues(env);
  if (!principal.length) return [];
  return queryByFirstMatchingField('envios', [
    'periodoId', 'periodId', 'periodoCanonicoId',
    'periodoNombre', 'periodoLabel', 'periodo'
  ], principal, 1000, env);
}

async function listEnvios(payload = {}, env) {
  let rows = await candidateEnvios(payload, env);
  const filters = splitList(payload.carreras || payload.carrera || payload.nombreCarrera)
    .map((item) => item.toLowerCase());
  const requestedPeriods = [payload.periodoId, payload.periodoLabel, payload.periodo].map(text).filter(Boolean);
  const requestedStatus = text(payload.estado) ? normalizeStatus(payload.estado, '') : '';
  const requestedType = text(payload.tipoTrabajo).toUpperCase();

  rows = rows.filter((row) => {
    if (!careerMatches(row, filters)) return false;
    if (requestedPeriods.length && !coincidePeriodoTrabajo(row, requestedPeriods)) return false;
    if (requestedStatus && normalizeStatus(row.estado || row.estadoFinal) !== requestedStatus) return false;
    if (requestedType && tipoTrabajo(row) !== requestedType) return false;
    return true;
  });

  rows.sort((left, right) => {
    const a = Date.parse(left.fechaResolucion || left.fechaEnvio || left.actualizadoEn || left._updateTime || '') || 0;
    const b = Date.parse(right.fechaResolucion || right.fechaEnvio || right.actualizadoEn || right._updateTime || '') || 0;
    return b - a;
  });
  return rows.map(normalizeEnvio);
}

async function listCoordinatorPopulation(payload = {}, env) {
  const global = await buildAdminGlobalList({
    periodoId: text(payload.periodoId || payload.periodoLabel || payload.periodo),
    periodo: text(payload.periodo || payload.periodoLabel || payload.periodoId),
    carrera: ''
  }, env);
  const records = (global.registros || global.estudiantes || []).map(normalizeEnvio);
  return {
    ...global,
    ok: true,
    envios: records,
    registros: records,
    filas: records,
    estudiantes: records,
    total: records.length,
    fuente: 'UTET_MAS_FIREBASE_TITULOS'
  };
}

async function queryUnique(field, values, env) {
  const map = new Map();
  for (const value of values) {
    if (!value) continue;
    const rows = await queryEqual('TITULOS', 'envios', field, value, 100, env);
    rows.forEach((row) => map.set(row.id, row));
  }
  return [...map.values()];
}

async function findEnvio(payload = {}, env, defaultType = '') {
  const cedula = normalizeCedula(payload.cedula || payload.numeroIdentificacion || payload.identificacion);
  if (!cedula) return null;
  const variants = cedula.startsWith('0') ? [cedula, cedula.slice(1)] : [cedula];
  const [byCedula, byIdentification] = await Promise.all([
    queryUnique('cedula', variants, env),
    queryUnique('numeroIdentificacion', variants, env)
  ]);
  const requestedPeriods = [payload.periodoId, payload.periodoLabel, payload.periodo].map(text).filter(Boolean);
  const requestedType = text(payload.tipoTrabajo || defaultType).toUpperCase();
  const rows = [...new Map([...byCedula, ...byIdentification].map((row) => [row.id, row])).values()]
    .filter((row) => !requestedPeriods.length || coincidePeriodoTrabajo(row, requestedPeriods))
    .filter((row) => !requestedType || tipoTrabajo(row) === requestedType);
  return latestBy(rows, ['versionActual'], [
    'fechaResolucion', 'fechaEnvio', 'actualizadoEn', '_updateTime'
  ]);
}

async function consultEnvio(payload, env, userRole) {
  const defaultType = userRole === 'student' ? 'ARTICULO_ACADEMICO' : '';
  const row = await findEnvio(payload, env, defaultType);
  const cedula = normalizeCedula(payload.cedula || payload.numeroIdentificacion || payload.identificacion);
  if (!row) return { ok: true, existe: false, encontrado: false, tieneEnvio: false, cedula };
  const envio = normalizeEnvio(row);
  return {
    ok: true,
    existe: true,
    encontrado: true,
    tieneEnvio: envio.estado !== 'DEVUELTO',
    encontradoEnvio: true,
    permiteReenvio: envio.estado === 'DEVUELTO',
    estado: envio.estado,
    estadoFinal: envio.estado,
    envio,
    registro: envio,
    mensaje: envio.estado === 'DEVUELTO'
      ? 'El registro fue devuelto y puede corregirse.'
      : 'Envío encontrado correctamente en Firebase Títulos.'
  };
}

async function summary(env) {
  const envios = await listEnvios({ incluirTodos: true }, env);
  const estados = envios.reduce((output, item) => {
    output[item.estado] = (output[item.estado] || 0) + 1;
    return output;
  }, {});
  const tipos = envios.reduce((output, item) => {
    output[item.tipoTrabajo] = (output[item.tipoTrabajo] || 0) + 1;
    return output;
  }, {});
  return {
    ok: true,
    total: envios.length,
    envios,
    estados,
    tipos,
    pendientes: estados.PENDIENTE_REVISION || 0,
    aprobados: estados.APROBADO || 0,
    reemplazados: estados.REEMPLAZADO || 0,
    devueltos: estados.DEVUELTO || 0,
    fuente: 'FIREBASE_TITULOS_DIRECTO'
  };
}

export async function executeTitulosAction(action, payload = {}, userRole = 'student', env) {
  const normalized = text(action).toUpperCase();
  const role = text(userRole).toLowerCase();
  if (normalized === 'PING') return pingProject('TITULOS', env);
  if (normalized === 'LISTAR_ENVIOS_COORDINADOR' || normalized === 'LISTAR_ENVIOS_POR_CARRERA') {
    const careers = splitList(payload.carreras || payload.carrera || payload.nombreCarrera);
    const hasOtherFilter = Boolean(
      text(payload.periodoId || payload.periodoLabel || payload.periodo) || text(payload.estado)
    );
    if (role === 'coordinator' && !careers.length && !hasOtherFilter) {
      return {
        ok: true,
        envios: [],
        registros: [],
        filas: [],
        total: 0,
        consultaFiltrada: true,
        mensaje: 'El coordinador no tiene carreras asignadas; no se realizó una lectura global.',
        fuente: 'FIREBASE_TITULOS_DIRECTO'
      };
    }
    if (payload.incluirFaltantes === true || text(payload.incluirFaltantes).toLowerCase() === 'true') {
      return listCoordinatorPopulation(payload, env);
    }
    const envios = await listEnvios(payload, env);
    return {
      ok: true,
      envios,
      registros: envios,
      filas: envios,
      total: envios.length,
      consultaFiltrada: Boolean(
        careers.length ||
        text(payload.periodoId || payload.periodoLabel || payload.periodo) ||
        text(payload.estado) ||
        !trueValue(payload.incluirTodos || payload.todas)
      ),
      fuente: 'FIREBASE_TITULOS_DIRECTO'
    };
  }
  if (['CONSULTAR_ENVIO_BASE_CEDULA', 'CONSULTAR_ENVIO_CEDULA', 'VERIFICAR_ENVIO'].includes(normalized)) {
    return consultEnvio(payload, env, userRole);
  }
  if (normalized === 'RESUMEN_ADMINISTRADOR') return summary(env);
  return executePrevious(action, payload, userRole, env);
}

export { publicTitleConfiguration };
