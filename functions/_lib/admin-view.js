import {
  batchGetDocuments,
  commitDocuments,
  getDocument,
  nowIso,
  periodSignature,
  text
} from './firestore-fixed.js';

const META_COLLECTION = 'admin_vista_periodos';
const PAGE_COLLECTION = 'admin_vista_paginas';
const PAGE_SIZE = 50;
const MAX_VIEW_AGE_MS = 10 * 60 * 1000;

function normalized(value) {
  return text(value).toLowerCase().normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function safeId(value) {
  return text(value).replace(/[^a-zA-Z0-9_-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 180);
}

function periodKey(payload = {}, global = {}) {
  const source = text(
    payload.periodoId || payload.periodoLabel || payload.periodo || payload.documentId ||
    global.periodoId || global.periodo
  );
  return periodSignature(source) || source;
}

function status(value) {
  const state = text(value || 'PENDIENTE_REVISION')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_');
  if (state === 'PENDIENTE_INVESTIGADOR') return 'PENDIENTE_INVESTIGADOR';
  if (state === 'APROBADO_FINAL') return 'APROBADO_FINAL';
  if (state === 'PENDIENTE_COORDINADOR') return 'PENDIENTE_REVISION';
  if (state.includes('DEVUEL')) return 'DEVUELTO';
  if (state.includes('REEMPLAZ')) return 'REEMPLAZADO';
  if (state.includes('APROBAD')) return 'APROBADO';
  if (state.includes('NO_ENVIADO')) return 'NO_ENVIADO';
  return 'PENDIENTE_REVISION';
}

function splitPages(rows, size = PAGE_SIZE) {
  const list = Array.isArray(rows) ? rows : [];
  const pages = [];
  for (let offset = 0; offset < list.length; offset += size) {
    pages.push(list.slice(offset, offset + size));
  }
  return pages;
}

function pageId(key, version, kind, index) {
  return `${safeId(key)}__${safeId(version)}__${kind}__${String(index + 1).padStart(3, '0')}`;
}

function calculateStatistics(global = {}) {
  const careerBuckets = new Map();
  const coordinatorBuckets = new Map();
  const records = Array.isArray(global.registros) ? global.registros : [];

  records.forEach((student) => {
    const state = status(student.estado);
    const careerKey = normalized(student.codigoCarrera || student.carrera) || 'sin carrera';
    const coordinatorId = text(student.coordinadorResponsableId);
    const coordinatorName = text(student.coordinadorResponsable) || 'Sin coordinador';
    const coordinatorKey = coordinatorId || '__SIN_COORDINADOR__';

    if (!careerBuckets.has(careerKey)) {
      careerBuckets.set(careerKey, {
        codigoCarrera: student.codigoCarrera || '',
        carrera: student.carrera || 'SIN CARRERA',
        coordinadorId,
        coordinador: coordinatorName,
        esperados: 0,
        enviados: 0,
        faltan: 0,
        pendientes: 0,
        pendientesCoordinacion: 0,
        pendientesInvestigacion: 0,
        aprobados: 0,
        aprobadosFinal: 0,
        reemplazados: 0,
        devueltos: 0,
        avance: 0
      });
    }

    const career = careerBuckets.get(careerKey);
    career.esperados += 1;
    if (state === 'NO_ENVIADO') {
      career.faltan += 1;
    } else {
      career.enviados += 1;
      if (state === 'APROBADO_FINAL') {
        career.aprobados += 1;
        career.aprobadosFinal += 1;
      } else if (state === 'APROBADO') {
        career.aprobados += 1;
      } else if (state === 'REEMPLAZADO') {
        career.reemplazados += 1;
      } else if (state === 'DEVUELTO') {
        career.devueltos += 1;
      } else if (state === 'PENDIENTE_INVESTIGADOR') {
        career.pendientes += 1;
        career.pendientesInvestigacion += 1;
      } else {
        career.pendientes += 1;
        career.pendientesCoordinacion += 1;
      }
    }

    if (!coordinatorBuckets.has(coordinatorKey)) {
      coordinatorBuckets.set(coordinatorKey, {
        coordinadorKey,
        coordinadorId,
        coordinador: coordinatorName,
        carreras: new Set(),
        estudiantes: 0,
        enviados: 0,
        faltan: 0,
        pendientesRevision: 0
      });
    }

    const coordinator = coordinatorBuckets.get(coordinatorKey);
    coordinator.estudiantes += 1;
    if (student.carrera) coordinator.carreras.add(student.carrera);
    if (state === 'NO_ENVIADO') coordinator.faltan += 1;
    else coordinator.enviados += 1;
    if (state === 'PENDIENTE_REVISION') coordinator.pendientesRevision += 1;
  });

  const carreras = [...careerBuckets.values()].map((item) => ({
    ...item,
    avance: item.esperados
      ? Number(((item.enviados / item.esperados) * 100).toFixed(1))
      : 0
  })).sort((a, b) => a.carrera.localeCompare(b.carrera, 'es'));

  const resumen = carreras.reduce((total, item) => {
    [
      'esperados', 'enviados', 'faltan', 'pendientes', 'pendientesCoordinacion',
      'pendientesInvestigacion', 'aprobados', 'aprobadosFinal', 'reemplazados', 'devueltos'
    ].forEach((field) => { total[field] += item[field]; });
    return total;
  }, {
    esperados: 0,
    enviados: 0,
    faltan: 0,
    pendientes: 0,
    pendientesCoordinacion: 0,
    pendientesInvestigacion: 0,
    aprobados: 0,
    aprobadosFinal: 0,
    reemplazados: 0,
    devueltos: 0
  });

  resumen.avance = resumen.esperados
    ? Number(((resumen.enviados / resumen.esperados) * 100).toFixed(1))
    : 0;
  resumen.totalEstudiantes = resumen.esperados;
  resumen.enviaron = resumen.enviados;
  resumen.porRevisar = resumen.pendientesCoordinacion;
  resumen.porRevisarInvestigacion = resumen.pendientesInvestigacion;
  resumen.enviosFirebase = Number(global.totalEnviosPeriodo || 0);
  resumen.trabajosTitulacion = Number(global.totalTrabajosTitulacion || 0);
  resumen.fueraPoblacion = Array.isArray(global.fueraPoblacion) ? global.fueraPoblacion.length : 0;

  const coordinadores = [...coordinatorBuckets.values()].map((item) => ({
    ...item,
    carreras: [...item.carreras].sort((a, b) => a.localeCompare(b, 'es'))
  })).sort((a, b) =>
    b.pendientesRevision - a.pendientesRevision ||
    a.coordinador.localeCompare(b.coordinador, 'es')
  );

  return {
    resumen,
    carreras,
    coordinadores,
    pendientesRevision: records.filter((item) => status(item.estado) === 'PENDIENTE_REVISION'),
    pendientesInvestigacion: records.filter((item) => status(item.estado) === 'PENDIENTE_INVESTIGADOR')
  };
}

function metaId(key) {
  return safeId(key);
}

async function getFreshMeta(payload, env) {
  if (payload && payload.forzarVista === true) return null;
  const key = periodKey(payload);
  if (!key) return null;
  const meta = await getDocument('TITULOS', META_COLLECTION, metaId(key), env);
  if (!meta || text(meta.periodoKey) !== key || !text(meta.version)) return null;
  const expires = Date.parse(text(meta.expiraEn));
  if (!Number.isFinite(expires) || expires <= Date.now()) return null;
  return meta;
}

async function readPages(ids, env) {
  const list = Array.isArray(ids) ? ids.filter(Boolean) : [];
  if (!list.length) return [];
  const documents = await batchGetDocuments(
    'TITULOS',
    list.map((documentId) => ({ collectionName: PAGE_COLLECTION, documentId })),
    env
  );
  const byId = new Map(documents.map((item) => [item.id, item]));
  const rows = [];
  list.forEach((id) => {
    const page = byId.get(id);
    if (page && Array.isArray(page.registros)) rows.push(...page.registros);
  });
  return rows;
}

function baseFromMeta(meta, records, outside, payload) {
  const requestedCareer = text(payload && (payload.carrera || payload.nombreCarrera));
  const selectedRecords = requestedCareer
    ? records.filter((item) => normalized(item.carrera) === normalized(requestedCareer))
    : records;
  const selectedOutside = requestedCareer
    ? outside.filter((item) => normalized(item.carrera) === normalized(requestedCareer))
    : outside;
  const submitted = selectedRecords.filter((item) => status(item.estado) !== 'NO_ENVIADO');

  return {
    ok: true,
    periodo: text(meta.periodo || meta.periodoLabel || meta.periodoKey),
    periodoId: text(meta.periodoId || meta.periodoKey),
    carrera: requestedCareer,
    registros: selectedRecords,
    estudiantes: selectedRecords,
    faltantes: selectedRecords.filter((item) => status(item.estado) === 'NO_ENVIADO'),
    fueraPoblacion: selectedOutside,
    total: selectedRecords.length,
    totalEsperados: selectedRecords.length,
    totalEnviosPeriodo: requestedCareer ? submitted.length : Number(meta.totalEnviosPeriodo || submitted.length),
    totalTrabajosTitulacion: requestedCareer
      ? submitted.filter((item) => text(item.tipoTrabajo) === 'TRABAJO_TITULACION').length
      : Number(meta.totalTrabajosTitulacion || 0),
    fuentePoblacion: text(meta.fuentePoblacion || 'ADMIN_VISTA'),
    consultaOptimizada: true,
    lecturaEstudiantesAgrupada: true,
    segundaLecturaEnviosEliminada: true,
    sinBarridosCompletos: true,
    consultasPeriodoAcotadas: true,
    vistaAdministrativa: true,
    vistaVersion: text(meta.version),
    vistaGeneradaEn: text(meta.generadoEn),
    mensaje: `Vista administrativa: ${selectedRecords.length} estudiantes, ${submitted.length} con envío.`
  };
}

export async function readAdminGlobalView(payload = {}, env) {
  const meta = await getFreshMeta(payload, env);
  if (!meta) return null;
  const [records, outside] = await Promise.all([
    readPages(meta.pageIds, env),
    readPages(meta.outsidePageIds, env)
  ]);
  if (records.length !== Number(meta.totalEsperados || 0)) return null;
  return baseFromMeta(meta, records, outside, payload);
}

export async function readAdminStatisticsView(payload = {}, env) {
  const meta = await getFreshMeta(payload, env);
  if (!meta || !meta.estadisticas || typeof meta.estadisticas !== 'object') return null;
  const requestedCareer = text(payload && (payload.carrera || payload.nombreCarrera));
  const missing = await readPages(meta.missingPageIds, env);
  const allCareers = Array.isArray(meta.estadisticas.carreras) ? meta.estadisticas.carreras : [];
  const careers = requestedCareer
    ? allCareers.filter((item) => normalized(item.carrera) === normalized(requestedCareer))
    : allCareers;

  let resumen = meta.estadisticas.resumen || {};
  if (requestedCareer) {
    const item = careers[0] || {};
    resumen = {
      esperados: Number(item.esperados || 0),
      enviados: Number(item.enviados || 0),
      faltan: Number(item.faltan || 0),
      pendientes: Number(item.pendientes || 0),
      pendientesCoordinacion: Number(item.pendientesCoordinacion || 0),
      pendientesInvestigacion: Number(item.pendientesInvestigacion || 0),
      aprobados: Number(item.aprobados || 0),
      aprobadosFinal: Number(item.aprobadosFinal || 0),
      reemplazados: Number(item.reemplazados || 0),
      devueltos: Number(item.devueltos || 0),
      avance: Number(item.avance || 0),
      totalEstudiantes: Number(item.esperados || 0),
      enviaron: Number(item.enviados || 0),
      porRevisar: Number(item.pendientesCoordinacion || 0),
      porRevisarInvestigacion: Number(item.pendientesInvestigacion || 0),
      enviosFirebase: Number(item.enviados || 0),
      trabajosTitulacion: 0,
      fueraPoblacion: 0
    };
  }

  const missingFiltered = requestedCareer
    ? missing.filter((item) => normalized(item.carrera) === normalized(requestedCareer))
    : missing;
  const outsideCount = requestedCareer ? 0 : Number(meta.fueraPoblacionTotal || 0);

  return {
    ok: true,
    periodo: text(meta.periodo || meta.periodoLabel || meta.periodoKey),
    periodoId: text(meta.periodoId || meta.periodoKey),
    carrera: requestedCareer,
    resumen,
    carreras: careers,
    coordinadores: Array.isArray(meta.estadisticas.coordinadores) ? meta.estadisticas.coordinadores : [],
    pendientesRevision: [],
    pendientesInvestigacion: [],
    faltantes: missingFiltered,
    fueraPoblacion: Array.from({ length: outsideCount }, () => null),
    vistaAdministrativa: true,
    vistaVersion: text(meta.version),
    vistaGeneradaEn: text(meta.generadoEn),
    mensaje: `Estadísticas optimizadas para ${Number(resumen.esperados || 0)} estudiantes.`
  };
}

export async function saveAdminView(global = {}, env) {
  const key = periodKey({}, global);
  if (!key) return global;
  const previous = await getDocument('TITULOS', META_COLLECTION, metaId(key), env).catch(() => null);
  const version = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const generatedAt = nowIso();
  const expiresAt = new Date(Date.now() + MAX_VIEW_AGE_MS).toISOString();
  const records = Array.isArray(global.registros) ? global.registros : [];
  const outside = Array.isArray(global.fueraPoblacion) ? global.fueraPoblacion : [];
  const missing = records.filter((item) => status(item.estado) === 'NO_ENVIADO');
  const statistics = calculateStatistics(global);

  const makePages = (rows, kind) => splitPages(rows).map((page, index) => ({
    id: pageId(key, version, kind, index),
    data: {
      periodoKey: key,
      version,
      tipo: kind,
      pagina: index + 1,
      registros: page,
      generadoEn: generatedAt
    }
  }));

  const recordPages = makePages(records, 'registros');
  const outsidePages = makePages(outside, 'fuera');
  const missingPages = makePages(missing, 'faltantes');
  const allPages = [...recordPages, ...outsidePages, ...missingPages];

  for (let offset = 0; offset < allPages.length; offset += 200) {
    const chunk = allPages.slice(offset, offset + 200);
    await commitDocuments('TITULOS', chunk.map((item) => ({
      collection: PAGE_COLLECTION,
      id: item.id,
      data: item.data,
      merge: false
    })), env);
  }

  await commitDocuments('TITULOS', [{
    collection: META_COLLECTION,
    id: metaId(key),
    data: {
      periodoKey: key,
      periodoId: text(global.periodoId || key),
      periodo: text(global.periodo || global.periodoId || key),
      version,
      generadoEn: generatedAt,
      expiraEn: expiresAt,
      pageIds: recordPages.map((item) => item.id),
      outsidePageIds: outsidePages.map((item) => item.id),
      missingPageIds: missingPages.map((item) => item.id),
      totalEsperados: records.length,
      totalEnviosPeriodo: Number(global.totalEnviosPeriodo || 0),
      totalTrabajosTitulacion: Number(global.totalTrabajosTitulacion || 0),
      fueraPoblacionTotal: outside.length,
      fuentePoblacion: text(global.fuentePoblacion),
      estadisticas: statistics
    },
    merge: false
  }], env);

  const oldIds = previous
    ? [
        ...(Array.isArray(previous.pageIds) ? previous.pageIds : []),
        ...(Array.isArray(previous.outsidePageIds) ? previous.outsidePageIds : []),
        ...(Array.isArray(previous.missingPageIds) ? previous.missingPageIds : [])
      ].filter((id) => !allPages.some((item) => item.id === id))
    : [];
  for (let offset = 0; offset < oldIds.length; offset += 400) {
    const chunk = oldIds.slice(offset, offset + 400);
    await commitDocuments('TITULOS', chunk.map((id) => ({
      collection: PAGE_COLLECTION,
      id,
      delete: true
    })), env).catch(() => null);
  }

  return {
    ...global,
    vistaAdministrativa: true,
    vistaVersion: version,
    vistaGeneradaEn: generatedAt
  };
}

export function statisticsFromGlobal(global = {}) {
  const statistics = calculateStatistics(global);
  return {
    ...global,
    ...statistics,
    faltantes: Array.isArray(global.faltantes)
      ? global.faltantes
      : (global.registros || []).filter((item) => status(item.estado) === 'NO_ENVIADO'),
    mensaje: `Estadísticas calculadas para ${Number(statistics.resumen.esperados || 0)} estudiantes.`
  };
}
