/* Administración global v8: cruce flexible y verificación secundaria por cédula.
 *
 * La consulta por período sigue siendo la vía principal y eficiente. Antes de
 * declarar a alguien como NO_ENVIADO, se comprueban en grupo las cédulas que
 * quedaron sin coincidencia. Así los registros históricos con un periodoId
 * corto (por ejemplo 2026-02) no se pierden cuando el catálogo usa un ID
 * canónico (por ejemplo 2026-02__2026-08).
 */
import {
  assignCareerCoordinator,
  buildAdminGlobalList as buildAdminGlobalListV7,
  listAdminCareers,
  listAdminPeriodsCatalog,
  saveAdminPeriod
} from './admin-global-v7.js';
import {
  latestBy,
  normalizeCedula,
  periodSignature,
  queryIn,
  samePeriod,
  text
} from './firestore-fixed.js';
import {
  TIPO_TRABAJO_TITULACION,
  esTrabajoTitulacion
} from './trabajo-titulacion-unificado.js';

export {
  assignCareerCoordinator,
  listAdminCareers,
  listAdminPeriodsCatalog,
  saveAdminPeriod
};

/* 510 cédulas equivalen como máximo a 17 bloques por campo. Consultando
   cedula + numeroIdentificacion son 34 subrequests adicionales, todavía dentro
   del margen previsto para una carga normal del Administrador en Cloudflare. */
const MAX_SECONDARY_VERIFICATION = 510;

function normalized(value) {
  return text(value).toLowerCase().normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanTitle(value) {
  let output = text(value).replace(/\s+/g, ' ');
  const jsonish = output.match(/^(?:["']?titulo["']?)\s*:\s*["']([\s\S]*?)["']$/i);
  if (jsonish) output = text(jsonish[1]);
  while (
    output.length >= 2 &&
    ((output.startsWith('"') && output.endsWith('"')) ||
      (output.startsWith("'") && output.endsWith("'")))
  ) output = output.slice(1, -1).trim();
  return output;
}

function normalizeStatus(value) {
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

function workType(row) {
  return esTrabajoTitulacion(row) ? TIPO_TRABAJO_TITULACION : 'ARTICULO_ACADEMICO';
}

function rowCedula(row) {
  return normalizeCedula(row && (
    row.cedula || row.numeroIdentificacion || row.identificacion || row.estudianteCedula
  ));
}

function rowPeriodValues(row) {
  const raw = [
    row && row.periodoId,
    row && row.periodId,
    row && row.periodoCanonicoId,
    row && row.periodoNombre,
    row && row.periodoLabel,
    row && row.periodoCanonicoLabel,
    row && row.periodo
  ].map(text).filter(Boolean);
  const canonical = raw.map((value) => periodSignature(value)).filter(Boolean);
  return [...new Set([...raw, ...canonical])];
}

function requestedPeriodValues(payload, global) {
  const raw = [
    payload && payload.periodoId,
    payload && payload.periodoLabel,
    payload && payload.periodo,
    payload && payload.documentId,
    global && global.periodoId,
    global && global.periodo
  ].map(text).filter(Boolean);
  const canonical = raw.map((value) => periodSignature(value)).filter(Boolean);
  return [...new Set([...raw, ...canonical])];
}

function samePeriodValue(left, right) {
  const a = text(left);
  const b = text(right);
  if (!a || !b) return false;
  return normalized(a) === normalized(b) || samePeriod(a, b);
}

function rowMatchesPeriod(row, payload, global) {
  const wanted = requestedPeriodValues(payload, global);
  return rowPeriodValues(row).some((left) =>
    wanted.some((right) => samePeriodValue(left, right))
  );
}

function publicEnvio(row) {
  if (!row) return null;
  const preferred = Number(row.tituloPreferidoNumero || row.preferido || 0);
  const titles = [cleanTitle(row.titulo1), cleanTitle(row.titulo2), cleanTitle(row.titulo3)];
  const type = workType(row);
  return {
    envioId: text(row.id || row._docId || row._id),
    titulo1: titles[0],
    titulo2: titles[1],
    titulo3: titles[2],
    tituloPreferidoNumero: preferred,
    tituloPreferidoTexto: preferred >= 1 && preferred <= 3 ? titles[preferred - 1] : '',
    tituloFinal: cleanTitle(
      row.tituloFinal || row.tituloAprobado || row.tituloCorregido || row.tituloElegido
    ),
    tituloCoordinador: cleanTitle(row.tituloCoordinador || row.tituloValidadoCoordinador),
    estadoProceso: normalizeStatus(row.estadoProceso || row.estado || row.estadoFinal || row.ultimoEstadoRevision),
    estado: normalizeStatus(row.estadoProceso || row.estado || row.estadoFinal || row.ultimoEstadoRevision),
    resultadoCoordinador: text(row.resultadoCoordinador),
    resultadoInvestigacion: text(row.resultadoInvestigacion),
    resultadoAdministrativo: text(row.resultadoAdministrativo),
    observacionInvestigacion: text(row.observacionInvestigacion),
    tituloFinalInvestigacion: cleanTitle(row.tituloFinalInvestigacion),
    fechaValidacionCoordinador: text(row.fechaValidacionCoordinador),
    fechaResolucionInvestigacion: text(row.fechaResolucionInvestigacion),
    coordinador: text(row.coordinador || row.nombreCoordinador || row.ultimoCoordinador),
    observacion: text(
      row.observacion || row.comentarioCoordinador || row.comentario || row.ultimoComentario
    ),
    fechaEnvio: text(row.fechaEnvio || row.actualizadoEn || row._createTime),
    fechaResolucion: text(row.fechaResolucion || row.ultimaFechaRevision || row.fechaRevision),
    tipoTrabajo: type,
    tipoTrabajoLabel: type === TIPO_TRABAJO_TITULACION
      ? 'Trabajo de Titulación'
      : 'Artículo académico'
  };
}

function addCompatibleRows(target, rows, missingSet, payload, global) {
  (rows || []).forEach((row) => {
    const id = rowCedula(row);
    if (!id || !missingSet.has(id) || !rowMatchesPeriod(row, payload, global)) return;
    if (!target.has(id)) target.set(id, []);
    target.get(id).push(row);
  });
}

async function recoverMissingSubmissions(global, payload, env) {
  const missing = (global.registros || [])
    .filter((item) => text(item && item.estado).toUpperCase() === 'NO_ENVIADO')
    .map((item) => normalizeCedula(item && item.cedula))
    .filter(Boolean);
  const unique = [...new Set(missing)];

  if (!unique.length) return new Map();
  if (unique.length > MAX_SECONDARY_VERIFICATION) {
    throw new Error(
      `Hay ${unique.length} estudiantes marcados inicialmente como no enviados. ` +
      `Se detuvo antes de confirmarlos porque la verificación secundaria admite hasta ` +
      `${MAX_SECONDARY_VERIFICATION} cédulas por carga para no exceder el límite de Cloudflare.`
    );
  }

  const missingSet = new Set(unique);
  const recovered = new Map();

  /* Ambos nombres de campo han existido históricamente. Las consultas son IN
     agrupadas; nunca se hace una petición individual por estudiante. */
  const byCedula = await queryIn('TITULOS', 'envios', 'cedula', unique, 1000, env);
  addCompatibleRows(recovered, byCedula, missingSet, payload, global);

  const stillMissing = unique.filter((id) => !recovered.has(id));
  if (stillMissing.length) {
    const byIdentification = await queryIn(
      'TITULOS',
      'envios',
      'numeroIdentificacion',
      stillMissing,
      1000,
      env
    );
    addCompatibleRows(recovered, byIdentification, missingSet, payload, global);
  }

  return recovered;
}

function mergeRecovered(global, recovered) {
  if (!recovered.size) {
    return {
      ...global,
      verificacionFaltantesPorCedula: true,
      enviosRecuperadosPorCedula: 0
    };
  }

  const records = (global.registros || []).map((student) => {
    const id = normalizeCedula(student && student.cedula);
    const rows = recovered.get(id) || [];
    if (!rows.length) return student;
    const envio = publicEnvio(latestBy(
      rows,
      ['versionActual', 'numeroVersion', 'numeroEnvios'],
      ['fechaResolucion', 'ultimaFechaRevision', 'fechaEnvio', 'actualizadoEn', '_updateTime']
    ));
    if (!envio) return student;
    return {
      ...student,
      estado: envio.estado,
      enviado: true,
      ...envio,
      fueraPoblacion: false,
      recuperadoPorCedula: true
    };
  });

  const faltantes = records.filter((item) => item.estado === 'NO_ENVIADO');
  const allWithSubmission = [
    ...records.filter((item) => item.estado !== 'NO_ENVIADO'),
    ...(global.fueraPoblacion || [])
  ];
  const workCount = allWithSubmission.filter(
    (item) => item.tipoTrabajo === TIPO_TRABAJO_TITULACION
  ).length;
  const recoveredCount = records.filter((item) => item.recuperadoPorCedula === true).length;
  const totalEnvios = Number(global.totalEnviosPeriodo || 0) + recoveredCount;

  return {
    ...global,
    registros: records,
    estudiantes: records,
    faltantes,
    totalEnviosPeriodo: totalEnvios,
    totalTrabajosTitulacion: workCount,
    verificacionFaltantesPorCedula: true,
    enviosRecuperadosPorCedula: recoveredCount,
    mensaje: records.length
      ? `Lista global cargada: ${records.length} estudiantes, ${totalEnvios} con envío` +
        `${recoveredCount ? ` (${recoveredCount} recuperado(s) por cédula)` : ''} y ` +
        `${workCount} Trabajo(s) de Titulación.`
      : global.mensaje
  };
}

export async function buildAdminGlobalList(payload = {}, env) {
  const global = await buildAdminGlobalListV7(payload, env);
  const recovered = await recoverMissingSubmissions(global, payload, env);
  return mergeRecovered(global, recovered);
}

export async function buildAdminStatistics(payload = {}, env) {
  const global = await buildAdminGlobalList(payload, env);
  const careerBuckets = new Map();
  const coordinatorBuckets = new Map();

  global.registros.forEach((student) => {
    const state = normalizeStatus(student.estado);
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
      if (state === 'APROBADO_FINAL') { career.aprobados += 1; career.aprobadosFinal += 1; }
      else if (state === 'APROBADO') career.aprobados += 1;
      else if (state === 'REEMPLAZADO') career.reemplazados += 1;
      else if (state === 'DEVUELTO') career.devueltos += 1;
      else if (state === 'PENDIENTE_INVESTIGADOR') { career.pendientes += 1; career.pendientesInvestigacion += 1; }
      else { career.pendientes += 1; career.pendientesCoordinacion += 1; }
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
    ['esperados', 'enviados', 'faltan', 'pendientes', 'pendientesCoordinacion', 'pendientesInvestigacion', 'aprobados', 'aprobadosFinal', 'reemplazados', 'devueltos']
      .forEach((field) => { total[field] += item[field]; });
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
  resumen.enviosFirebase = global.totalEnviosPeriodo || 0;
  resumen.trabajosTitulacion = global.totalTrabajosTitulacion || 0;
  resumen.fueraPoblacion = (global.fueraPoblacion || []).length;

  const coordinadores = [...coordinatorBuckets.values()].map((item) => ({
    ...item,
    carreras: [...item.carreras].sort((a, b) => a.localeCompare(b, 'es'))
  })).sort((a, b) =>
    b.pendientesRevision - a.pendientesRevision ||
    a.coordinador.localeCompare(b.coordinador, 'es')
  );

  const pendientesRevision = global.registros.filter(
    (item) => normalizeStatus(item.estado) === 'PENDIENTE_REVISION'
  );
  const pendientesInvestigacion = global.registros.filter(
    (item) => normalizeStatus(item.estado) === 'PENDIENTE_INVESTIGADOR'
  );

  return {
    ...global,
    resumen,
    carreras,
    coordinadores,
    pendientesRevision,
    pendientesInvestigacion,
    mensaje:
      `Estadísticas calculadas para ${resumen.esperados} estudiantes: ` +
      `${resumen.enviados} enviaron y ${resumen.faltan} faltan por enviar.`
  };
}
