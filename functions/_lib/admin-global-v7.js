/* Administración global v7: consultas acotadas por período, sin barridos completos.
 * Población académica: matriculas + Estudiante.
 * Envíos y estados: Firebase Títulos.
 * Compatibilidad temporal: EstudiantesPeriodo + Estudiantes.
 */
import {
  assignCareerCoordinator,
  listAdminCareers,
  listAdminPeriodsCatalog,
  saveAdminPeriod
} from './admin-global-v6.js';
import {
  batchGetDocuments,
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

const QUERY_LIMIT = 1000;
const MAX_SAFE_POPULATION = 1800;

const PERIOD_FIELDS = Object.freeze({
  matriculas: Object.freeze([
    'periodoId',
    'periodId',
    'periodoAcademicoId',
    'idPeriodo',
    'codigoPeriodo',
    'periodoCodigo'
  ]),
  EstudiantesPeriodo: Object.freeze([
    'periodoId',
    'periodId',
    'periodoCanonicoId',
    'periodoNombre',
    'periodoLabel',
    'periodo'
  ]),
  envios: Object.freeze([
    'periodoId',
    'periodId',
    'periodoCanonicoId',
    'periodoNombre',
    'periodoLabel',
    'periodo'
  ])
});

function normalizedKey(value) {
  return text(value).toLowerCase().normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

function normalized(value) {
  return text(value).toLowerCase().normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function flexible(object, names) {
  if (!object || typeof object !== 'object') return undefined;
  const map = Object.keys(object).reduce((output, name) => {
    output[normalizedKey(name)] = name;
    return output;
  }, {});
  for (const name of names) {
    const original = map[normalizedKey(name)];
    if (
      original !== undefined &&
      object[original] !== undefined &&
      object[original] !== null
    ) {
      return object[original];
    }
  }
  return undefined;
}

function scalar(value, nestedNames = []) {
  if (value === null || value === undefined) return '';
  if (typeof value !== 'object') return text(value);
  const nested = flexible(value, nestedNames.length ? nestedNames : [
    'id', 'cedula', 'numeroIdentificacion', 'codigo', 'nombre', 'label',
    'periodoId', 'periodId', 'periodoLabel', 'periodoNombre', 'path', 'reference'
  ]);
  return nested === undefined ? '' : scalar(nested);
}

function referenceId(value) {
  const raw = scalar(value);
  if (!raw) return '';
  const clean = raw.replace(/\/+$/, '');
  return clean.includes('/') ? clean.split('/').pop() : clean;
}

function activeValue(value, fallback = true) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  return ![
    'FALSE', '0', 'NO', 'INACTIVO', 'INACTIVA', 'DESACTIVADO', 'DESACTIVADA',
    'RETIRADO', 'RETIRADA', 'ANULADO', 'ANULADA', 'CANCELADO', 'CANCELADA',
    'ELIMINADO', 'ELIMINADA'
  ].includes(text(value).toUpperCase());
}

function rowActive(row) {
  if (!row || typeof row !== 'object') return false;
  const deleted = flexible(row, ['eliminado', 'deleted']);
  if (deleted === true || text(deleted).toUpperCase() === 'TRUE') return false;
  return activeValue(flexible(row, [
    'estadoMatricula', 'EstadoMatricula', 'estado', 'Estado', 'activo'
  ]), true);
}

function cedulaFrom(row) {
  const direct = scalar(flexible(row, [
    'cedula', 'Cedula', 'Cédula', 'numeroIdentificacion', 'NumeroIdentificacion',
    'estudianteCedula', 'cedulaEstudiante', 'estudianteId', 'idEstudiante',
    'firebaseDocumentId', 'identificacion', 'estudiante', 'estudianteRef'
  ]), ['cedula', 'numeroIdentificacion', 'id', 'firebaseDocumentId']);
  const canonical = normalizeCedula(referenceId(direct));
  if (canonical) return canonical;
  const id = text(row && (row.id || row._id || row._docId));
  const match = id.match(/\d{9,10}/);
  return match ? normalizeCedula(match[0]) : '';
}

function periodRaw(row) {
  return scalar(flexible(row, [
    'periodoId', 'periodId', 'periodoAcademicoId', 'idPeriodo',
    'codigoPeriodo', 'periodoCodigo', 'periodoCanonicoId',
    'periodoActualId', 'periodoAcademicoCodigo',
    'periodoRef', 'periodoReferencia', 'periodoDocumento'
  ]), ['id', 'codigo', 'periodoId', 'periodId']);
}

function periodLabel(row) {
  return scalar(flexible(row, [
    'periodoNombre', 'PeriodoNombre', 'periodoLabel', 'periodoCanonicoLabel',
    'PeriodoLabel', 'nombrePeriodo', 'periodoAcademico', 'periodo',
    'Periodo', 'nombre', 'label'
  ]), ['nombre', 'label', 'periodoLabel', 'periodoNombre', 'id']);
}

function periodKey(row) {
  const raw = referenceId(periodRaw(row));
  const label = periodLabel(row);
  return periodSignature(label) || periodSignature(raw) ||
    periodSignature(row && row.id) || raw;
}

function names(row) {
  return text(flexible(row, [
    'nombres', 'Nombres', 'nombreCompleto', 'NombreCompleto', 'nombre', 'Nombre'
  ]));
}

function career(row) {
  return text(flexible(row, [
    'nombreCarreraActual', 'NombreCarreraActual',
    'NombreCarrera', 'nombreCarrera', 'carreraNombre', 'carrera', 'Carrera'
  ]));
}

function careerCode(row) {
  return text(flexible(row, [
    'codigoCarreraActual', 'CodigoCarreraActual',
    'CodigoCarrera', 'codigoCarrera', 'carreraCodigo', 'codigo', 'Código'
  ]));
}

function phone(row) {
  return text(flexible(row, ['celular', 'Celular', 'telefono', 'Teléfono']));
}

function institutionalEmail(row) {
  return text(flexible(row, [
    'correoInstitucional', 'CorreoInstitucional', 'emailInstitucional'
  ])).toLowerCase();
}

function personalEmail(row) {
  return text(flexible(row, [
    'correoPersonal', 'CorreoPersonal', 'emailPersonal'
  ])).toLowerCase();
}

function normalizeStatus(value) {
  const state = text(value || 'PENDIENTE_REVISION')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_');
  if (state.includes('DEVUEL')) return 'DEVUELTO';
  if (state.includes('REEMPLAZ')) return 'REEMPLAZADO';
  if (state.includes('APROBAD')) return 'APROBADO';
  if (state.includes('NO_ENVIADO')) return 'NO_ENVIADO';
  return 'PENDIENTE_REVISION';
}

function cleanTitle(value) {
  let output = text(value).replace(/\s+/g, ' ');
  const jsonish = output.match(/^(?:["']?titulo["']?)\s*:\s*["']([\s\S]*?)["']$/i);
  if (jsonish) output = text(jsonish[1]);
  while (
    output.length >= 2 &&
    (
      (output.startsWith('"') && output.endsWith('"')) ||
      (output.startsWith("'") && output.endsWith("'"))
    )
  ) {
    output = output.slice(1, -1).trim();
  }
  return output;
}

function workType(row) {
  return esTrabajoTitulacion(row) ? TIPO_TRABAJO_TITULACION : 'ARTICULO_ACADEMICO';
}

const MONTHS = [
  '', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

function labelFromSignature(signature) {
  const parts = text(signature).split('__');
  const format = (part) => {
    const match = part.match(/^(20\d{2})-(\d{2})$/);
    return match ? `${MONTHS[Number(match[2])] || match[2]} ${match[1]}` : part;
  };
  return parts.length > 1
    ? `${format(parts[0])} a ${format(parts[parts.length - 1])}`
    : format(parts[0]);
}

function publicEnvio(row) {
  if (!row) return null;
  const preferred = Number(row.tituloPreferidoNumero || row.preferido || 0);
  const titles = [
    cleanTitle(row.titulo1),
    cleanTitle(row.titulo2),
    cleanTitle(row.titulo3)
  ];
  const type = workType(row);
  const finalTitle = cleanTitle(
    row.tituloFinal || row.tituloAprobado || row.tituloCorregido || row.tituloElegido
  );
  return {
    envioId: text(row.id || row._docId || row._id),
    titulo1: titles[0],
    titulo2: titles[1],
    titulo3: titles[2],
    tituloPreferidoNumero: preferred,
    tituloPreferidoTexto: preferred >= 1 && preferred <= 3 ? titles[preferred - 1] : '',
    tituloFinal: finalTitle,
    estado: normalizeStatus(row.estado || row.estadoFinal),
    coordinador: text(row.coordinador || row.nombreCoordinador),
    observacion: text(row.observacion || row.comentarioCoordinador || row.comentario),
    fechaEnvio: text(row.fechaEnvio || row._createTime),
    fechaResolucion: text(row.fechaResolucion || row.fechaRevision),
    tipoTrabajo: type,
    tipoTrabajoLabel: type === TIPO_TRABAJO_TITULACION
      ? 'Trabajo de Titulación'
      : 'Artículo académico'
  };
}

function periodValues(payload) {
  const raw = [
    payload.periodoId,
    payload.periodoLabel,
    payload.periodo
  ].map(text).filter(Boolean);
  const canonical = raw.map((value) => periodSignature(value)).filter(Boolean);
  return [...new Set([...raw, ...canonical])];
}

function rowPeriodValues(row) {
  const raw = referenceId(periodRaw(row));
  const label = periodLabel(row);
  const key = periodKey(row);
  return [...new Set([
    raw,
    label,
    key,
    periodSignature(raw),
    periodSignature(label)
  ].map(text).filter(Boolean))];
}

function periodValueMatches(left, right) {
  const a = text(left);
  const b = text(right);
  if (!a || !b) return false;
  return normalized(a) === normalized(b) || samePeriod(a, b);
}

function matchesRequestedPeriod(row, payload, requestedPeriod) {
  const wanted = [...new Set([
    ...periodValues(payload),
    text(requestedPeriod)
  ].filter(Boolean))];
  return rowPeriodValues(row).some((left) =>
    wanted.some((right) => periodValueMatches(left, right))
  );
}

function periodFields(collectionName) {
  return PERIOD_FIELDS[collectionName] || PERIOD_FIELDS.envios;
}

async function queryPeriodRows(project, collectionName, payload, env) {
  const values = periodValues(payload);
  if (!values.length) return [];

  const rowsById = new Map();
  let limitReached = false;

  for (const field of periodFields(collectionName)) {
    const rows = await queryIn(
      project,
      collectionName,
      field,
      values,
      QUERY_LIMIT,
      env
    );
    if (rows.length >= QUERY_LIMIT) limitReached = true;
    rows.forEach((row) => {
      const id = text(row && (row.id || row._id || row._docId));
      if (id) rowsById.set(id, row);
    });
  }

  if (limitReached) {
    throw new Error(
      `La consulta de ${collectionName} alcanzó el límite seguro de ${QUERY_LIMIT} ` +
      'registros en uno de los campos de período. Se detuvo para evitar mostrar datos incompletos.'
    );
  }

  return [...rowsById.values()];
}

async function currentEnrollments(payload, requestedPeriod, env) {
  let rows = await queryPeriodRows('UTET', 'matriculas', payload, env);
  rows = rows.filter((row) =>
    rowActive(row) && matchesRequestedPeriod(row, payload, requestedPeriod)
  );
  if (rows.length) return { rows, source: 'matriculas' };

  rows = await queryPeriodRows('UTET', 'EstudiantesPeriodo', payload, env);
  rows = rows.filter((row) =>
    rowActive(row) && matchesRequestedPeriod(row, payload, requestedPeriod)
  );
  return {
    rows,
    source: rows.length ? 'EstudiantesPeriodo' : 'matriculas'
  };
}

function studentDocumentVariants(id) {
  const canonical = normalizeCedula(id);
  if (!canonical) return [];
  return canonical.startsWith('0') ? [canonical, canonical.slice(1)] : [canonical];
}

function completeEnrollmentProfile(row) {
  return Boolean(
    names(row) &&
    career(row) &&
    phone(row) &&
    (institutionalEmail(row) || personalEmail(row))
  );
}

function indexBatch(rows) {
  return new Map(
    (rows || []).map((row) => [`${row._collection}/${row.id}`, row])
  );
}

function findStudentInIndex(id, index, collectionName) {
  for (const value of studentDocumentVariants(id)) {
    const current = index.get(`${collectionName}/${value}`);
    if (current && rowActive(current)) return current;
  }
  return null;
}

async function fetchStudentCollection(ids, collectionName, env) {
  const references = [];
  ids.forEach((id) => {
    studentDocumentVariants(id).forEach((documentId) => {
      references.push({ collectionName, documentId });
    });
  });
  return indexBatch(await batchGetDocuments('UTET', references, env));
}

async function baseStudentsForEnrollments(rows, env) {
  const enrollmentsById = new Map();
  rows.forEach((row) => {
    const id = cedulaFrom(row);
    if (id && !enrollmentsById.has(id)) enrollmentsById.set(id, row);
  });

  const ids = [...enrollmentsById.keys()];
  if (ids.length > MAX_SAFE_POPULATION) {
    throw new Error(
      `El período contiene ${ids.length} estudiantes. El Administrador admite hasta ` +
      `${MAX_SAFE_POPULATION} estudiantes por carga para proteger el límite de Cloudflare.`
    );
  }

  const idsToFetch = ids.filter(
    (id) => !completeEnrollmentProfile(enrollmentsById.get(id))
  );
  const currentIndex = await fetchStudentCollection(idsToFetch, 'Estudiante', env);

  const missing = idsToFetch.filter(
    (id) => !findStudentInIndex(id, currentIndex, 'Estudiante')
  );
  const legacyIndex = missing.length
    ? await fetchStudentCollection(missing, 'Estudiantes', env)
    : new Map();

  const output = new Map();
  ids.forEach((id) => {
    const enrollment = enrollmentsById.get(id);
    output.set(
      id,
      findStudentInIndex(id, currentIndex, 'Estudiante') ||
      findStudentInIndex(id, legacyIndex, 'Estudiantes') ||
      enrollment
    );
  });
  return output;
}

function mergeStudent(base, enrollment, id, byCode, byName, requestedPeriod) {
  const rawCode = careerCode(enrollment) || careerCode(base);
  const rawCareer = career(enrollment) || career(base);
  const canonical =
    byCode.get(normalized(rawCode)) ||
    byName.get(normalized(rawCareer));

  return {
    cedula: id,
    nombres: names(enrollment) || names(base),
    codigoCarrera: canonical && canonical.codigo || rawCode,
    carrera: canonical && canonical.nombre || rawCareer,
    celular: phone(base) || phone(enrollment),
    correoInstitucional: institutionalEmail(base) || institutionalEmail(enrollment),
    correoPersonal: personalEmail(base) || personalEmail(enrollment),
    sede: text(
      flexible(base, ['sede', 'Sede']) ||
      flexible(enrollment, ['sede', 'Sede'])
    ),
    periodoId: periodSignature(requestedPeriod),
    periodo: periodLabel(enrollment) ||
      labelFromSignature(periodSignature(requestedPeriod))
  };
}

export async function buildAdminGlobalList(payload = {}, env) {
  const requestedPeriod = text(
    payload.periodoId || payload.periodoLabel || payload.periodo
  );
  const requestedCareer = text(payload.carrera || payload.nombreCarrera);

  if (!requestedPeriod) {
    throw new Error('Selecciona un período para cargar la lista global.');
  }

  const [enrollmentResult, enviosInitial, careersResult] = await Promise.all([
    currentEnrollments(payload, requestedPeriod, env),
    queryPeriodRows('TITULOS', 'envios', payload, env),
    listAdminCareers(env)
  ]);

  const enrollments = enrollmentResult.rows;
  const envios = enviosInitial.filter((row) =>
    matchesRequestedPeriod(row, payload, requestedPeriod)
  );

  const byCode = new Map();
  const byName = new Map();
  careersResult.carreras.forEach((item) => {
    if (item.codigo) byCode.set(normalized(item.codigo), item);
    if (item.nombre) byName.set(normalized(item.nombre), item);
  });

  const relevantEnrollments = requestedCareer
    ? enrollments.filter((enrollment) => {
      const rawCode = careerCode(enrollment);
      const rawCareer = career(enrollment);
      const canonical =
        byCode.get(normalized(rawCode)) ||
        byName.get(normalized(rawCareer));
      const knownCareer = canonical && canonical.nombre || rawCareer;
      return !knownCareer || normalized(knownCareer) === normalized(requestedCareer);
    })
    : enrollments;

  const baseStudents = await baseStudentsForEnrollments(relevantEnrollments, env);

  const expectedById = new Map();
  relevantEnrollments.forEach((enrollment) => {
    const id = cedulaFrom(enrollment);
    if (!id) return;
    const base = baseStudents.get(id);
    if (!base) return;

    const student = mergeStudent(
      base,
      enrollment,
      id,
      byCode,
      byName,
      requestedPeriod
    );

    if (!student.nombres || !student.carrera) return;
    if (
      requestedCareer &&
      normalized(student.carrera) !== normalized(requestedCareer)
    ) return;

    expectedById.set(id, student);
  });

  const enviosById = new Map();
  envios.forEach((row) => {
    const id = cedulaFrom(row);
    if (!id) return;
    if (!enviosById.has(id)) enviosById.set(id, []);
    enviosById.get(id).push(row);
  });

  const records = [...expectedById.values()].map((student) => {
    const envio = publicEnvio(latestBy(
      enviosById.get(student.cedula) || [],
      ['versionActual', 'numeroVersion'],
      ['fechaResolucion', 'fechaEnvio', 'actualizadoEn', '_updateTime']
    ));
    return {
      ...student,
      estado: envio ? envio.estado : 'NO_ENVIADO',
      enviado: Boolean(envio),
      ...(envio || {}),
      fueraPoblacion: false
    };
  }).sort((a, b) =>
    text(a.carrera).localeCompare(text(b.carrera), 'es') ||
    text(a.nombres).localeCompare(text(b.nombres), 'es')
  );

  const outsidePopulation = [];
  enviosById.forEach((rows, id) => {
    if (expectedById.has(id)) return;

    const row = latestBy(
      rows,
      ['versionActual', 'numeroVersion'],
      ['fechaResolucion', 'fechaEnvio', 'actualizadoEn', '_updateTime']
    );
    const envio = publicEnvio(row) || {};
    const item = {
      cedula: id,
      nombres: names(row),
      carrera: career(row),
      codigoCarrera: careerCode(row),
      periodoId: periodSignature(requestedPeriod),
      periodo: periodLabel(row) ||
        labelFromSignature(periodSignature(requestedPeriod)),
      fueraPoblacion: true,
      ...envio
    };

    if (
      requestedCareer &&
      normalized(item.carrera) !== normalized(requestedCareer)
    ) return;

    outsidePopulation.push(item);
  });

  const allWithSubmission = [
    ...records.filter((item) => item.estado !== 'NO_ENVIADO'),
    ...outsidePopulation
  ];
  const workCount = allWithSubmission.filter(
    (item) => item.tipoTrabajo === TIPO_TRABAJO_TITULACION
  ).length;

  return {
    ok: true,
    periodo: requestedPeriod,
    periodoId: periodSignature(requestedPeriod),
    carrera: requestedCareer,
    registros: records,
    estudiantes: records,
    faltantes: records.filter((item) => item.estado === 'NO_ENVIADO'),
    fueraPoblacion: outsidePopulation,
    total: records.length,
    totalEsperados: records.length,
    totalEnviosPeriodo: enviosById.size,
    totalTrabajosTitulacion: workCount,
    fuentePoblacion: enrollmentResult.source === 'matriculas'
      ? 'UTET_MATRICULAS_Y_ESTUDIANTE'
      : 'UTET_LEGACY',
    consultaOptimizada: true,
    lecturaEstudiantesAgrupada: true,
    segundaLecturaEnviosEliminada: true,
    sinBarridosCompletos: true,
    consultasPeriodoAcotadas: true,
    mensaje: records.length
      ? `Lista global cargada: ${records.length} estudiantes, ` +
        `${enviosById.size} con envío y ${workCount} Trabajo(s) de Titulación.`
      : 'No se encontraron matrículas activas para el período seleccionado.'
  };
}

export async function buildAdminStatistics(payload = {}, env) {
  const global = await buildAdminGlobalList(payload, env);
  const buckets = new Map();

  global.registros.forEach((student) => {
    const bucketKey =
      normalized(student.codigoCarrera || student.carrera) ||
      'sin carrera';

    if (!buckets.has(bucketKey)) {
      buckets.set(bucketKey, {
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
    }

    const item = buckets.get(bucketKey);
    item.esperados += 1;

    if (student.estado === 'NO_ENVIADO') {
      item.faltan += 1;
    } else {
      item.enviados += 1;
      if (student.estado === 'APROBADO') item.aprobados += 1;
      else if (student.estado === 'REEMPLAZADO') item.reemplazados += 1;
      else if (student.estado === 'DEVUELTO') item.devueltos += 1;
      else item.pendientes += 1;
    }
  });

  const carreras = [...buckets.values()].map((item) => ({
    ...item,
    avance: item.esperados
      ? Number(((item.enviados / item.esperados) * 100).toFixed(1))
      : 0
  })).sort((a, b) => a.carrera.localeCompare(b.carrera, 'es'));

  const resumen = carreras.reduce((total, item) => {
    [
      'esperados',
      'enviados',
      'faltan',
      'pendientes',
      'aprobados',
      'reemplazados',
      'devueltos'
    ].forEach((field) => {
      total[field] += item[field];
    });
    return total;
  }, {
    esperados: 0,
    enviados: 0,
    faltan: 0,
    pendientes: 0,
    aprobados: 0,
    reemplazados: 0,
    devueltos: 0
  });

  resumen.avance = resumen.esperados
    ? Number(((resumen.enviados / resumen.esperados) * 100).toFixed(1))
    : 0;
  resumen.enviosFirebase = global.totalEnviosPeriodo || 0;
  resumen.trabajosTitulacion = global.totalTrabajosTitulacion || 0;
  resumen.fueraPoblacion = global.fueraPoblacion.length;

  return {
    ...global,
    resumen,
    carreras,
    mensaje: `Estadísticas calculadas para ${resumen.esperados} estudiantes.`
  };
}
