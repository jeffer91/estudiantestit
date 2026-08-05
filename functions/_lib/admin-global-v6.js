/* Lista global definitiva sin repetir lecturas de Firebase Títulos. */
import {
  assignCareerCoordinator,
  buildAdminGlobalList as buildPreviousGlobal,
  listAdminCareers,
  listAdminPeriodsCatalog,
  saveAdminPeriod
} from './admin-global-v5.js';
import { text } from './firestore-fixed.js';
import { TIPO_TRABAJO_TITULACION } from './trabajo-titulacion-unificado.js';

export { assignCareerCoordinator, listAdminCareers, listAdminPeriodsCatalog, saveAdminPeriod };

function normalized(value) {
  return text(value).toLowerCase().normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ').trim();
}

function normalizeType(item) {
  const type = text(item && item.tipoTrabajo).toUpperCase() === TIPO_TRABAJO_TITULACION
    ? TIPO_TRABAJO_TITULACION
    : 'ARTICULO_ACADEMICO';
  return {
    ...(item || {}),
    tipoTrabajo: type,
    tipoTrabajoLabel: type === TIPO_TRABAJO_TITULACION ? 'Trabajo de Titulación' : 'Artículo académico'
  };
}

export async function buildAdminGlobalList(payload = {}, env) {
  /* admin-global-v5 ya obtiene la población y los envíos del período. Antes
     esta capa volvía a leer la colección envios completa una segunda vez. */
  const base = await buildPreviousGlobal(payload, env);
  const records = (base.registros || []).map((item) => normalizeType({
    ...item,
    fueraPoblacion: false
  }));
  const outside = (base.fueraPoblacion || []).map((item) => normalizeType({
    ...item,
    fueraPoblacion: true
  }));
  const requestedCareer = text(payload.carrera || payload.nombreCarrera);
  const filteredOutside = requestedCareer
    ? outside.filter((item) => normalized(item.carrera) === normalized(requestedCareer))
    : outside;
  const allWithSubmission = [...records.filter((item) => item.estado !== 'NO_ENVIADO'), ...filteredOutside];
  const workCount = allWithSubmission.filter(
    (item) => item.tipoTrabajo === TIPO_TRABAJO_TITULACION
  ).length;

  return {
    ...base,
    registros: records,
    estudiantes: records,
    faltantes: records.filter((item) => item.estado === 'NO_ENVIADO'),
    fueraPoblacion: filteredOutside,
    total: records.length,
    totalEsperados: records.length,
    totalEnviosPeriodo: Number(base.totalEnviosPeriodo || allWithSubmission.length),
    totalTrabajosTitulacion: workCount,
    consultaOptimizada: true,
    segundaLecturaEnviosEliminada: true,
    mensaje: `Lista global cargada con consultas por período: ${records.length} estudiantes, ${Number(base.totalEnviosPeriodo || allWithSubmission.length)} con envío y ${workCount} Trabajo(s) de Titulación.`
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
    mensaje: `Estadísticas calculadas con consultas por período para ${resumen.esperados} estudiantes.`
  };
}
