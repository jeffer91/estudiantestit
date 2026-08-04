/* Lista global definitiva: población UTET + envíos reales de Firebase Títulos. */
import {
  assignCareerCoordinator,
  buildAdminGlobalList as buildPreviousGlobal,
  listAdminCareers,
  listAdminPeriodsCatalog,
  saveAdminPeriod
} from './admin-global-v5.js';
import {
  latestBy,
  listCollection,
  normalizeCedula,
  periodSignature,
  text
} from './firestore-fixed.js';
import {
  TIPO_TRABAJO_TITULACION,
  coincidePeriodoTrabajo,
  esTrabajoTitulacion,
  migrarTrabajosTitulacionLegados
} from './trabajo-titulacion-unificado.js';

export { assignCareerCoordinator, listAdminCareers, listAdminPeriodsCatalog, saveAdminPeriod };

function normalized(value) {
  return text(value).toLowerCase().normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ').trim();
}

function status(value) {
  const current = text(value || 'PENDIENTE_REVISION').toUpperCase().replace(/[^A-Z0-9]+/g, '_');
  if (current.includes('DEVUEL')) return 'DEVUELTO';
  if (current.includes('REEMPLAZ')) return 'REEMPLAZADO';
  if (current.includes('APROBAD')) return 'APROBADO';
  return 'PENDIENTE_REVISION';
}

function cleanTitle(value) {
  let output = text(value).replace(/\s+/g, ' ');
  while (output.length >= 2 && (
    (output.startsWith('"') && output.endsWith('"')) ||
    (output.startsWith("'") && output.endsWith("'"))
  )) output = output.slice(1, -1).trim();
  return output;
}

function envioPeriod(row) {
  return text(row && (
    row.periodoNombre || row.periodoLabel || row.periodoCanonicoLabel || row.periodo ||
    row.periodoId || row.periodId
  ));
}

function envioPeriodId(row, requestedPeriod) {
  return text(row && (row.periodoId || row.periodId || row.periodoCanonicoId)) ||
    periodSignature(envioPeriod(row) || requestedPeriod);
}

function envioCedula(row) {
  const direct = normalizeCedula(row && (row.cedula || row.numeroIdentificacion));
  if (direct) return direct;
  const match = text(row && (row.id || row._id || row._docId)).match(/\d{9,10}/);
  return match ? normalizeCedula(match[0]) : '';
}

function envioTipo(row) {
  return esTrabajoTitulacion(row) ? TIPO_TRABAJO_TITULACION : 'ARTICULO_ACADEMICO';
}

function normalizeEnvio(row, requestedPeriod) {
  const preferred = Number(row.tituloPreferidoNumero || row.preferido || 0);
  const titles = [cleanTitle(row.titulo1), cleanTitle(row.titulo2), cleanTitle(row.titulo3)];
  const type = envioTipo(row);
  return {
    envioId: text(row.id || row._id || row._docId),
    cedula: envioCedula(row),
    nombres: text(row.nombres || row.estudiante || row.Nombres),
    carrera: text(row.carreraNombre || row.nombreCarrera || row.carrera),
    codigoCarrera: text(row.carreraCodigo || row.codigoCarrera || row.carreraId),
    periodoId: envioPeriodId(row, requestedPeriod),
    periodo: envioPeriod(row) || requestedPeriod,
    estado: status(row.estado || row.estadoFinal),
    enviado: true,
    tipoTrabajo: type,
    tipoTrabajoLabel: type === TIPO_TRABAJO_TITULACION ? 'Trabajo de Titulación' : 'Artículo académico',
    titulo1: titles[0],
    titulo2: titles[1],
    titulo3: titles[2],
    tituloPreferidoNumero: preferred,
    tituloPreferidoTexto: preferred >= 1 && preferred <= 3 ? titles[preferred - 1] : '',
    tituloFinal: cleanTitle(row.tituloFinal || row.tituloCorregido || row.tituloElegido),
    coordinador: text(row.coordinador || row.nombreCoordinador),
    observacion: text(row.observacion || row.comentarioCoordinador || row.comentario),
    fechaEnvio: text(row.fechaEnvio || row.actualizadoEn || row._createTime),
    fechaResolucion: text(row.fechaResolucion || row.fechaRevision)
  };
}

export async function buildAdminGlobalList(payload = {}, env) {
  await migrarTrabajosTitulacionLegados(env);
  const requestedPeriods = [payload.periodoId, payload.periodoLabel, payload.periodo].map(text).filter(Boolean);
  const requestedPeriod = requestedPeriods[0] || '';
  const requestedCareer = text(payload.carrera || payload.nombreCarrera);
  const base = await buildPreviousGlobal(payload, env);
  const allEnvios = await listCollection('TITULOS', 'envios', { maxDocuments: 10000 }, env);

  const periodEnvios = requestedPeriods.length
    ? allEnvios.filter((row) => coincidePeriodoTrabajo(row, requestedPeriods))
    : allEnvios;
  const enviosByCedula = new Map();
  for (const row of periodEnvios) {
    const cedula = envioCedula(row);
    if (!cedula) continue;
    if (!enviosByCedula.has(cedula)) enviosByCedula.set(cedula, []);
    enviosByCedula.get(cedula).push(row);
  }

  const seen = new Set();
  const records = (base.registros || []).map((student) => {
    const cedula = normalizeCedula(student.cedula || student.numeroIdentificacion);
    seen.add(cedula);
    const latest = latestBy(enviosByCedula.get(cedula) || [], ['versionActual'], [
      'fechaResolucion', 'fechaEnvio', 'actualizadoEn', '_updateTime'
    ]);
    if (!latest) return { ...student, cedula, estado: 'NO_ENVIADO', enviado: false, fueraPoblacion: false };
    return {
      ...student,
      ...normalizeEnvio(latest, requestedPeriod),
      cedula,
      nombres: text(student.nombres) || text(latest.nombres || latest.estudiante),
      carrera: text(student.carrera) || text(latest.carreraNombre || latest.carrera),
      codigoCarrera: text(student.codigoCarrera) || text(latest.carreraCodigo || latest.codigoCarrera),
      fueraPoblacion: false
    };
  });

  const outside = [];
  enviosByCedula.forEach((rows, cedula) => {
    if (seen.has(cedula)) return;
    const latest = latestBy(rows, ['versionActual'], [
      'fechaResolucion', 'fechaEnvio', 'actualizadoEn', '_updateTime'
    ]);
    if (!latest) return;
    const item = { ...normalizeEnvio(latest, requestedPeriod), fueraPoblacion: true };
    if (requestedCareer && normalized(item.carrera) !== normalized(requestedCareer)) return;
    outside.push(item);
    records.push(item);
  });

  records.sort((left, right) => normalized(left.carrera).localeCompare(normalized(right.carrera), 'es') ||
    normalized(left.nombres).localeCompare(normalized(right.nombres), 'es'));

  const missing = records.filter((item) => !item.fueraPoblacion && item.estado === 'NO_ENVIADO');
  const workCount = periodEnvios.filter(esTrabajoTitulacion).length;
  return {
    ...base,
    registros: records,
    estudiantes: records,
    faltantes: missing,
    fueraPoblacion: outside,
    total: records.length,
    totalEsperados: records.filter((item) => !item.fueraPoblacion).length,
    totalEnviosPeriodo: enviosByCedula.size,
    totalTrabajosTitulacion: workCount,
    mensaje: `Lista global cargada: ${records.filter((item) => !item.fueraPoblacion).length} estudiantes UTET, ${enviosByCedula.size} estudiantes con envío y ${workCount} Trabajo(s) de Titulación en Firebase Títulos.`
  };
}

export async function buildAdminStatistics(payload = {}, env) {
  const global = await buildAdminGlobalList(payload, env);
  const buckets = new Map();
  const expected = global.registros.filter((item) => !item.fueraPoblacion);

  expected.forEach((student) => {
    const bucketKey = normalized(student.codigoCarrera || student.carrera) || 'sin carrera';
    if (!buckets.has(bucketKey)) buckets.set(bucketKey, {
      codigoCarrera: student.codigoCarrera || '',
      carrera: student.carrera || 'SIN CARRERA',
      esperados: 0,
      enviados: 0,
      faltan: 0,
      pendientes: 0,
      aprobados: 0,
      reemplazados: 0,
      devueltos: 0,
      avance: 0
    });
    const item = buckets.get(bucketKey);
    item.esperados += 1;
    if (student.estado === 'NO_ENVIADO') item.faltan += 1;
    else {
      item.enviados += 1;
      if (student.estado === 'APROBADO') item.aprobados += 1;
      else if (student.estado === 'REEMPLAZADO') item.reemplazados += 1;
      else if (student.estado === 'DEVUELTO') item.devueltos += 1;
      else item.pendientes += 1;
    }
  });

  const carreras = [...buckets.values()].map((item) => ({
    ...item,
    avance: item.esperados ? Number(((item.enviados / item.esperados) * 100).toFixed(1)) : 0
  })).sort((left, right) => left.carrera.localeCompare(right.carrera, 'es'));

  const resumen = carreras.reduce((total, item) => {
    ['esperados', 'enviados', 'faltan', 'pendientes', 'aprobados', 'reemplazados', 'devueltos']
      .forEach((field) => { total[field] += item[field]; });
    return total;
  }, { esperados: 0, enviados: 0, faltan: 0, pendientes: 0, aprobados: 0, reemplazados: 0, devueltos: 0 });
  resumen.avance = resumen.esperados ? Number(((resumen.enviados / resumen.esperados) * 100).toFixed(1)) : 0;
  resumen.enviosFirebase = global.totalEnviosPeriodo || 0;
  resumen.trabajosTitulacion = global.totalTrabajosTitulacion || 0;
  resumen.fueraPoblacion = global.fueraPoblacion.length;

  return {
    ...global,
    resumen,
    carreras,
    mensaje: `Estadísticas calculadas con ${resumen.esperados} estudiantes UTET, ${resumen.enviosFirebase} estudiantes con envío y ${resumen.trabajosTitulacion} Trabajo(s) de Titulación.`
  };
}
