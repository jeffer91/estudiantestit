/* Administración global basada en períodos canónicos y periodoNombre de envios. */
import {
  commitDocuments,
  latestBy,
  listCollection,
  normalizeCedula,
  nowIso,
  periodSignature,
  samePeriod,
  text
} from './firestore-fixed.js';
import {
  assignCareerCoordinator,
  listAdminCareers
} from './admin-global-fixed.js';

export { assignCareerCoordinator, listAdminCareers };

function key(value) {
  return text(value).toLowerCase().normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
}

function normalized(value) {
  return text(value).toLowerCase().normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ').trim();
}

function flexible(object, names) {
  if (!object || typeof object !== 'object') return undefined;
  const map = Object.keys(object).reduce((output, name) => {
    output[key(name)] = name;
    return output;
  }, {});
  for (const name of names) {
    const original = map[key(name)];
    if (original !== undefined && object[original] !== undefined && object[original] !== null) {
      return object[original];
    }
  }
  return undefined;
}

function active(value, fallback = true) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  return !['FALSE', '0', 'NO', 'INACTIVO', 'DESACTIVADO', 'RETIRADO', 'ANULADO', 'CANCELADO']
    .includes(text(value).toUpperCase());
}

function principal(row) {
  return Boolean(row && (
    row.principal === true || row.esPrincipal === true ||
    text(row.tipo).toUpperCase() === 'PRINCIPAL'
  ));
}

function cedula(row) {
  const direct = normalizeCedula(flexible(row, [
    'numeroIdentificacion', 'NumeroIdentificacion', 'cedula', 'Cedula', 'Cédula', 'identificacion'
  ]));
  if (direct) return direct;
  const match = text(row && (row.id || row._id || row._docId)).match(/\d{9,10}/);
  return match ? normalizeCedula(match[0]) : '';
}

function periodLabel(row) {
  return text(flexible(row, [
    'periodoNombre', 'PeriodoNombre', 'nombre', 'label',
    'periodoLabel', 'periodoCanonicoLabel', 'PeriodoLabel', 'periodo', 'Periodo'
  ]));
}

function periodRaw(row) {
  return text(flexible(row, [
    'periodoId', 'periodId', 'periodoCanonicoId', 'ultimoPeriodoId',
    'periodoNombre', 'periodoLabel', 'periodoCanonicoLabel', 'periodo'
  ]));
}

function period(row) {
  const label = periodLabel(row);
  return periodSignature(label) || periodSignature(periodRaw(row)) || periodSignature(row && row.id);
}

function names(row) {
  return text(flexible(row, ['Nombres', 'nombres', 'nombreCompleto', 'NombreCompleto', 'nombre', 'Nombre']));
}

function career(row) {
  return text(flexible(row, ['NombreCarrera', 'nombreCarrera', 'carreraNombre', 'carrera', 'Carrera']));
}

function careerCode(row) {
  return text(flexible(row, ['CodigoCarrera', 'codigoCarrera', 'carreraCodigo', 'codigo', 'Código']));
}

function phone(row) {
  return text(flexible(row, ['Celular', 'celular', 'telefono', 'Teléfono']));
}

function institutionalEmail(row) {
  return text(flexible(row, ['CorreoInstitucional', 'correoInstitucional', 'emailInstitucional'])).toLowerCase();
}

function personalEmail(row) {
  return text(flexible(row, ['CorreoPersonal', 'correoPersonal', 'emailPersonal'])).toLowerCase();
}

function enrollmentActive(row) {
  return active(flexible(row, ['estadoMatricula', 'EstadoMatricula', 'estado', 'Estado', 'activo']), true);
}

function status(row) {
  const value = text(flexible(row, ['estado', 'estadoFinal']) || 'PENDIENTE_REVISION')
    .toUpperCase().replace(/[^A-Z0-9]+/g, '_');
  if (value.includes('DEVUEL')) return 'DEVUELTO';
  if (value.includes('REEMPLAZ')) return 'REEMPLAZADO';
  if (value.includes('APROBAD')) return 'APROBADO';
  return 'PENDIENTE_REVISION';
}

const MONTHS = ['', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

function labelFromSignature(signature) {
  const parts = text(signature).split('__');
  const format = (part) => {
    const match = part.match(/^(20\d{2})-(\d{2})$/);
    return match ? `${MONTHS[Number(match[2])] || match[2]} ${match[1]}` : part;
  };
  return parts.length > 1 ? `${format(parts[0])} a ${format(parts[parts.length - 1])}` : format(parts[0]);
}

function publicEnvio(row) {
  if (!row) return null;
  const preferred = Number(row.tituloPreferidoNumero || row.preferido || 0);
  const titles = [text(row.titulo1), text(row.titulo2), text(row.titulo3)];
  return {
    envioId: text(row.id || row._docId || row._id),
    titulo1: titles[0], titulo2: titles[1], titulo3: titles[2],
    tituloPreferidoNumero: preferred,
    tituloPreferidoTexto: preferred >= 1 && preferred <= 3 ? titles[preferred - 1] : '',
    tituloFinal: text(row.tituloFinal || row.tituloAprobado || row.tituloCorregido),
    estado: status(row),
    coordinador: text(row.coordinador || row.nombreCoordinador),
    observacion: text(row.observacion || row.comentarioCoordinador || row.comentario),
    fechaEnvio: text(row.fechaEnvio || row.actualizadoEn || row._createTime),
    fechaResolucion: text(row.fechaResolucion || row.fechaRevision)
  };
}

export async function listAdminPeriodsCatalog(env) {
  const [periodRows, enrollments, envios] = await Promise.all([
    listCollection('TITULOS', 'periodos', { maxDocuments: 1000 }, env),
    listCollection('UTET', 'EstudiantesPeriodo', { maxDocuments: 10000 }, env),
    listCollection('TITULOS', 'envios', { maxDocuments: 10000 }, env)
  ]);
  const map = new Map();

  function ensure(signature, label, source) {
    const id = periodSignature(label) || periodSignature(signature);
    if (!id) return null;
    if (!map.has(id)) map.set(id, {
      id, documentId: '', label: text(label) || labelFromSignature(id), activo: false,
      principal: false, estudiantes: new Set(), envios: new Set(), origenes: []
    });
    const item = map.get(id);
    if (label && (!item.label || item.label === labelFromSignature(id))) item.label = text(label);
    if (source && !item.origenes.includes(source)) item.origenes.push(source);
    return item;
  }

  for (const row of periodRows) {
    const label = periodLabel(row) || labelFromSignature(periodSignature(row.id));
    const item = ensure(period(row) || row.id, label, 'periodos');
    if (!item) continue;
    item.documentId = text(row.id) || item.id;
    item.activo = active(row.activo !== undefined ? row.activo : row.estado, true);
    item.principal = principal(row);
  }
  for (const row of enrollments) {
    const item = ensure(period(row), periodLabel(row), 'EstudiantesPeriodo');
    if (!item || !enrollmentActive(row)) continue;
    const id = cedula(row);
    if (id) item.estudiantes.add(id);
  }
  for (const row of envios) {
    const item = ensure(period(row), periodLabel(row), 'envios');
    if (!item) continue;
    const id = cedula(row);
    if (id) item.envios.add(id);
  }

  const periods = [...map.values()].map((item) => ({
    id: item.id,
    periodoId: item.id,
    documentId: item.documentId || item.id,
    label: item.label || labelFromSignature(item.id),
    periodoLabel: item.label || labelFromSignature(item.id),
    activo: item.activo === true,
    principal: item.principal === true,
    estudiantes: item.estudiantes.size,
    envios: item.envios.size,
    origenes: item.origenes
  })).sort((a, b) => {
    const endA = a.id.split('__').pop();
    const endB = b.id.split('__').pop();
    return endA === endB ? b.id.localeCompare(a.id, 'es') : endB.localeCompare(endA, 'es');
  });

  let foundPrincipal = false;
  periods.forEach((item) => {
    if (item.principal && !foundPrincipal) foundPrincipal = true;
    else if (item.principal) item.principal = false;
  });

  return {
    ok: true,
    periodos: periods,
    registros: periods,
    principal: periods.find((item) => item.principal) || null,
    total: periods.length,
    fuente: 'PERIODOS_CANONICOS_UTET_TITULOS'
  };
}

export async function saveAdminPeriod(payload = {}, env) {
  const catalog = await listAdminPeriodsCatalog(env);
  const requested = text(payload.periodoId || payload.id || payload.documentId || payload.periodo);
  const target = catalog.periodos.find((item) => samePeriod(item.id, requested));
  if (!target) throw new Error('No se encontró el período solicitado.');
  const setPrincipal = payload.principal === true;
  const setActive = payload.activo === undefined ? target.activo : payload.activo === true;
  if (!setActive && target.principal) throw new Error('Define primero otro período principal.');

  const current = await listCollection('TITULOS', 'periodos', { maxDocuments: 1000 }, env);
  const writes = [];
  if (setPrincipal) current.forEach((row) => writes.push({
    collection: 'periodos', id: row.id,
    data: { principal: false, actualizadoEn: nowIso() }, merge: true
  }));
  writes.push({
    collection: 'periodos', id: text(payload.documentId || target.documentId || target.id),
    data: {
      nombre: target.label,
      activo: setPrincipal ? true : setActive,
      principal: setPrincipal ? true : target.principal,
      actualizadoEn: nowIso()
    },
    merge: true
  });
  await commitDocuments('TITULOS', [...new Map(writes.map((item) => [item.id, item])).values()], env);
  return {
    ok: true, periodoId: target.id,
    activo: setPrincipal ? true : setActive,
    principal: setPrincipal ? true : target.principal,
    mensaje: setPrincipal ? 'Período principal actualizado.' : setActive ? 'Período activado.' : 'Período desactivado.'
  };
}

function mergeStudent(base, enrollment, id, byCode, byName) {
  const rawCode = careerCode(enrollment) || careerCode(base);
  const rawCareer = career(enrollment) || career(base);
  const canonical = byCode.get(normalized(rawCode)) || byName.get(normalized(rawCareer));
  return {
    cedula: id,
    nombres: names(enrollment) || names(base),
    codigoCarrera: canonical && canonical.codigo || rawCode,
    carrera: canonical && canonical.nombre || rawCareer,
    celular: phone(enrollment) || phone(base),
    correoInstitucional: institutionalEmail(enrollment) || institutionalEmail(base),
    correoPersonal: personalEmail(enrollment) || personalEmail(base),
    periodoId: period(enrollment) || period(base),
    periodo: periodLabel(enrollment) || periodLabel(base)
  };
}

export async function buildAdminGlobalList(payload = {}, env) {
  const requestedPeriod = text(payload.periodoId || payload.periodoLabel || payload.periodo);
  const requestedCareer = text(payload.carrera || payload.nombreCarrera);
  if (!requestedPeriod) throw new Error('Selecciona un período para cargar la lista global.');

  const [enrollments, students, envios, careersResult] = await Promise.all([
    listCollection('UTET', 'EstudiantesPeriodo', { maxDocuments: 10000 }, env),
    listCollection('UTET', 'Estudiantes', { maxDocuments: 10000 }, env),
    listCollection('TITULOS', 'envios', { maxDocuments: 10000 }, env),
    listAdminCareers(env)
  ]);
  const byCode = new Map(), byName = new Map();
  careersResult.carreras.forEach((item) => {
    if (item.codigo) byCode.set(normalized(item.codigo), item);
    if (item.nombre) byName.set(normalized(item.nombre), item);
  });
  const studentsById = new Map();
  students.forEach((row) => {
    const id = cedula(row);
    if (id) studentsById.set(id, row);
  });

  let expected = enrollments.filter((row) => enrollmentActive(row) && samePeriod(period(row), requestedPeriod));
  if (!expected.length) expected = students.filter((row) => samePeriod(period(row), requestedPeriod));
  const expectedById = new Map();
  expected.forEach((enrollment) => {
    const id = cedula(enrollment);
    if (!id) return;
    const student = mergeStudent(studentsById.get(id), enrollment, id, byCode, byName);
    if (requestedCareer && normalized(student.carrera) !== normalized(requestedCareer)) return;
    expectedById.set(id, student);
  });

  const enviosById = new Map();
  envios.forEach((row) => {
    if (!samePeriod(period(row), requestedPeriod)) return;
    const id = cedula(row);
    if (!id) return;
    if (!enviosById.has(id)) enviosById.set(id, []);
    enviosById.get(id).push(row);
  });

  const records = [...expectedById.values()].map((student) => {
    const envio = publicEnvio(latestBy(enviosById.get(student.cedula) || [], ['versionActual'],
      ['fechaResolucion', 'fechaEnvio', 'actualizadoEn', '_updateTime']));
    return {
      ...student,
      periodoId: periodSignature(requestedPeriod),
      periodo: student.periodo || labelFromSignature(periodSignature(requestedPeriod)),
      estado: envio ? envio.estado : 'NO_ENVIADO',
      enviado: Boolean(envio),
      ...(envio || {})
    };
  }).sort((a, b) => text(a.carrera).localeCompare(text(b.carrera), 'es') ||
    text(a.nombres).localeCompare(text(b.nombres), 'es'));

  const outsidePopulation = [];
  enviosById.forEach((rows, id) => {
    if (expectedById.has(id)) return;
    const row = latestBy(rows, ['versionActual'], ['fechaEnvio', '_updateTime']);
    outsidePopulation.push({
      cedula: id, nombres: names(row), carrera: career(row),
      periodoId: periodSignature(requestedPeriod), estado: status(row), envioId: text(row.id)
    });
  });

  const missing = records.filter((item) => item.estado === 'NO_ENVIADO');
  return {
    ok: true,
    periodo: requestedPeriod,
    periodoId: periodSignature(requestedPeriod),
    carrera: requestedCareer,
    registros: records,
    estudiantes: records,
    faltantes: missing,
    fueraPoblacion: outsidePopulation,
    total: records.length,
    totalEnviosPeriodo: [...enviosById.keys()].length,
    mensaje: records.length ? 'Lista global construida correctamente desde las dos Firebase.' :
      'No se encontraron estudiantes activos para el período.'
  };
}

export async function buildAdminStatistics(payload = {}, env) {
  const global = await buildAdminGlobalList(payload, env);
  const buckets = new Map();
  global.registros.forEach((student) => {
    const bucketKey = normalized(student.codigoCarrera || student.carrera) || 'sin carrera';
    if (!buckets.has(bucketKey)) buckets.set(bucketKey, {
      codigoCarrera: student.codigoCarrera || '', carrera: student.carrera || 'SIN CARRERA',
      esperados: 0, enviados: 0, faltan: 0, pendientes: 0,
      aprobados: 0, reemplazados: 0, devueltos: 0, avance: 0
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
  })).sort((a, b) => a.carrera.localeCompare(b.carrera, 'es'));
  const resumen = carreras.reduce((total, item) => {
    ['esperados', 'enviados', 'faltan', 'pendientes', 'aprobados', 'reemplazados', 'devueltos']
      .forEach((field) => { total[field] += item[field]; });
    return total;
  }, { esperados: 0, enviados: 0, faltan: 0, pendientes: 0, aprobados: 0, reemplazados: 0, devueltos: 0 });
  resumen.avance = resumen.esperados ? Number(((resumen.enviados / resumen.esperados) * 100).toFixed(1)) : 0;
  return { ...global, resumen, carreras, mensaje: 'Estadísticas calculadas desde la misma lista global.' };
}
