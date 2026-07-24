/* Administración global corregida: períodos, carreras, población y estadísticas. */
import {
  commitDocuments,
  latestBy,
  listCollection,
  normalizeCedula,
  nowIso,
  periodSignature,
  samePeriod,
  text
} from './firestore.js';

function normalizedKey(value) {
  return text(value).toLowerCase().normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
}

function normalizedText(value) {
  return text(value).toLowerCase().normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ').trim();
}

function flexible(object, names) {
  if (!object || typeof object !== 'object') return undefined;
  const keys = Object.keys(object).reduce((output, key) => {
    output[normalizedKey(key)] = key;
    return output;
  }, {});
  for (const name of names) {
    const key = keys[normalizedKey(name)];
    if (key !== undefined && object[key] !== undefined && object[key] !== null) return object[key];
  }
  return undefined;
}

function isActive(value, fallback = true) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  return !['FALSE', '0', 'NO', 'INACTIVO', 'DESACTIVADO', 'RETIRADO', 'ANULADO', 'CANCELADO']
    .includes(text(value).toUpperCase());
}

function enrollmentActive(row) {
  return isActive(flexible(row, ['estadoMatricula', 'EstadoMatricula', 'estado', 'Estado', 'activo']), true);
}

function cedulaFrom(row) {
  const direct = normalizeCedula(flexible(row, [
    'numeroIdentificacion', 'NumeroIdentificacion', 'cedula', 'Cedula', 'Cédula', 'identificacion'
  ]));
  if (direct) return direct;
  const id = text(row && (row.id || row._id || row._docId));
  const match = id.match(/\d{9,10}/);
  return match ? normalizeCedula(match[0]) : '';
}

function periodRaw(row) {
  return text(flexible(row, [
    'periodoId', 'periodId', 'periodoCanonicoId', 'ultimoPeriodoId',
    'periodoLabel', 'periodoCanonicoLabel', 'PeriodoLabel', 'periodo', 'Periodo'
  ]));
}

function periodLabel(row) {
  return text(flexible(row, [
    'nombre', 'label', 'periodoLabel', 'periodoCanonicoLabel', 'PeriodoLabel', 'periodo', 'Periodo'
  ]));
}

function periodKey(row) {
  const label = periodLabel(row);
  const raw = periodRaw(row);
  return periodSignature(label) || periodSignature(raw) || periodSignature(row && row.id) || raw;
}

function nameFrom(row) {
  return text(flexible(row, ['Nombres', 'nombres', 'nombreCompleto', 'NombreCompleto', 'nombre', 'Nombre']));
}

function careerFrom(row) {
  return text(flexible(row, ['NombreCarrera', 'nombreCarrera', 'carreraNombre', 'carrera', 'Carrera']));
}

function careerCodeFrom(row) {
  return text(flexible(row, ['CodigoCarrera', 'codigoCarrera', 'carreraCodigo', 'codigo', 'Código']));
}

function phoneFrom(row) {
  return text(flexible(row, ['Celular', 'celular', 'telefono', 'Teléfono']));
}

function institutionalEmail(row) {
  return text(flexible(row, ['CorreoInstitucional', 'correoInstitucional', 'emailInstitucional'])).toLowerCase();
}

function personalEmail(row) {
  return text(flexible(row, ['CorreoPersonal', 'correoPersonal', 'emailPersonal'])).toLowerCase();
}

function normalizeStatus(row) {
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

function principal(row) {
  return Boolean(row && (row.principal === true || row.esPrincipal === true ||
    text(row.tipo).toUpperCase() === 'PRINCIPAL'));
}

function sortPeriods(a, b) {
  const endA = text(a.id).split('__').pop();
  const endB = text(b.id).split('__').pop();
  if (endA !== endB) return endB.localeCompare(endA, 'es', { numeric: true });
  return text(b.id).localeCompare(text(a.id), 'es', { numeric: true });
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
    estado: normalizeStatus(row),
    coordinador: text(row.coordinador || row.nombreCoordinador),
    observacion: text(row.observacion || row.comentarioCoordinador || row.comentario),
    fechaEnvio: text(row.fechaEnvio || row.actualizadoEn || row._createTime),
    fechaResolucion: text(row.fechaResolucion || row.fechaRevision)
  };
}

export async function listAdminPeriodsCatalog(env) {
  const [periodDocuments, enrollments, envios] = await Promise.all([
    listCollection('TITULOS', 'periodos', { maxDocuments: 1000 }, env),
    listCollection('UTET', 'EstudiantesPeriodo', { maxDocuments: 10000 }, env),
    listCollection('TITULOS', 'envios', { maxDocuments: 10000 }, env)
  ]);

  const map = new Map();
  function ensure(signature, label, source) {
    const id = periodSignature(label) || periodSignature(signature) || text(signature);
    if (!id) return null;
    if (!map.has(id)) map.set(id, {
      id, periodoId: id, documentId: '', label: text(label) || labelFromSignature(id),
      activo: false, principal: false, estudiantes: new Set(), envios: new Set(), origenes: []
    });
    const item = map.get(id);
    if (label && (!item.label || item.label === labelFromSignature(id))) item.label = text(label);
    if (source && !item.origenes.includes(source)) item.origenes.push(source);
    return item;
  }

  for (const row of periodDocuments) {
    const label = periodLabel(row) || labelFromSignature(periodSignature(row.id));
    const item = ensure(periodKey(row) || row.id, label, 'periodos');
    if (!item) continue;
    item.documentId = text(row.id) || item.id;
    item.activo = isActive(row.activo !== undefined ? row.activo : row.estado, true);
    item.principal = principal(row);
  }

  for (const row of enrollments) {
    const item = ensure(periodKey(row), periodLabel(row), 'EstudiantesPeriodo');
    if (!item || !enrollmentActive(row)) continue;
    const cedula = cedulaFrom(row);
    if (cedula) item.estudiantes.add(cedula);
  }

  for (const row of envios) {
    const item = ensure(periodKey(row), periodLabel(row), 'envios');
    if (!item) continue;
    const cedula = cedulaFrom(row);
    if (cedula) item.envios.add(cedula);
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
  })).sort(sortPeriods);

  let principalFound = false;
  periods.forEach((item) => {
    if (item.principal && !principalFound) principalFound = true;
    else if (item.principal) item.principal = false;
  });

  return {
    ok: true,
    periodos: periods,
    registros: periods,
    principal: periods.find((item) => item.principal) || null,
    total: periods.length,
    fuente: 'PERIODOS_UTET_Y_TITULOS'
  };
}

export async function saveAdminPeriod(payload = {}, env) {
  const catalog = await listAdminPeriodsCatalog(env);
  const requested = text(payload.periodoId || payload.id || payload.documentId || payload.periodo);
  const target = catalog.periodos.find((item) => item.id === periodSignature(requested) || samePeriod(item.id, requested));
  if (!target) throw new Error('No se encontró el período solicitado.');

  const setPrincipal = payload.principal === true;
  const setActive = payload.activo === undefined ? target.activo : payload.activo === true;
  if (!setActive && target.principal) throw new Error('Define primero otro período principal.');

  const current = await listCollection('TITULOS', 'periodos', { maxDocuments: 1000 }, env);
  const writes = [];
  if (setPrincipal) {
    current.forEach((row) => writes.push({
      collection: 'periodos', id: row.id,
      data: { principal: false, actualizadoEn: nowIso() }, merge: true
    }));
  }
  writes.push({
    collection: 'periodos',
    id: text(payload.documentId || target.documentId || target.id),
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
    ok: true,
    periodoId: target.id,
    activo: setPrincipal ? true : setActive,
    principal: setPrincipal ? true : target.principal,
    mensaje: setPrincipal ? 'Período principal actualizado.' : setActive ? 'Período activado.' : 'Período desactivado.'
  };
}

export async function listAdminCareers(env) {
  const [careers, coordinators] = await Promise.all([
    listCollection('TITULOS', 'carreras', { maxDocuments: 2000 }, env),
    listCollection('TITULOS', 'coordinadores', { maxDocuments: 1000 }, env)
  ]);
  const coordinatorMap = new Map(coordinators.map((item) => [text(item.id), item]));

  const records = careers.map((row) => {
    const id = text(row.id);
    const codigo = text(row.codigo || row.codigoCarrera || id);
    const nombre = text(row.nombre || row.nombreCarrera || id);
    let coordinadorId = text(row.coordinadorId);
    let coordinadorNombre = text(row.coordinadorNombre);

    if (!coordinadorId) {
      const found = coordinators.find((coordinator) => {
        const ids = Array.isArray(coordinator.carrerasIds) ? coordinator.carrerasIds.map(text) : [];
        const names = Array.isArray(coordinator.carrerasNombres)
          ? coordinator.carrerasNombres.map(normalizedText) : [];
        return ids.includes(id) || names.includes(normalizedText(nombre));
      });
      if (found) {
        coordinadorId = text(found.id);
        coordinadorNombre = text(found.nombre || found.coordinador);
      }
    }

    const coordinator = coordinatorMap.get(coordinadorId);
    return {
      id, codigo, nombre,
      activo: isActive(row.activo !== undefined ? row.activo : row.estado, true),
      coordinadorId,
      coordinadorNombre: coordinadorNombre || text(coordinator && (coordinator.nombre || coordinator.coordinador)),
      actualizadoEn: text(row.actualizadoEn || row._updateTime)
    };
  }).filter((item) => item.id && item.nombre)
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' }));

  return { ok: true, carreras: records, registros: records, total: records.length };
}

export async function assignCareerCoordinator(payload = {}, env) {
  const carreraId = text(payload.carreraId || payload.id || payload.codigoCarrera);
  const coordinadorId = text(payload.coordinadorId);
  if (!carreraId) throw new Error('Selecciona una carrera.');

  const [careersResult, coordinators] = await Promise.all([
    listAdminCareers(env),
    listCollection('TITULOS', 'coordinadores', { maxDocuments: 1000 }, env)
  ]);
  const career = careersResult.carreras.find((item) => item.id === carreraId || item.codigo === carreraId);
  if (!career) throw new Error('No se encontró la carrera seleccionada.');

  const coordinator = coordinadorId ? coordinators.find((item) => text(item.id) === coordinadorId) : null;
  if (coordinadorId && !coordinator) throw new Error('No se encontró el coordinador seleccionado.');
  const coordinadorNombre = coordinator ? text(coordinator.nombre || coordinator.coordinador) : '';

  const updated = careersResult.carreras.map((item) => item.id === career.id
    ? { ...item, coordinadorId, coordinadorNombre } : item);
  const assignments = new Map(coordinators.map((item) => [text(item.id), { ids: [], names: [] }]));
  updated.forEach((item) => {
    if (!item.coordinadorId || !assignments.has(item.coordinadorId)) return;
    assignments.get(item.coordinadorId).ids.push(item.id);
    assignments.get(item.coordinadorId).names.push(item.nombre);
  });

  const writes = [{
    collection: 'carreras', id: career.id,
    data: { codigo: career.codigo, nombre: career.nombre, coordinadorId, coordinadorNombre, actualizadoEn: nowIso() },
    merge: true
  }];
  coordinators.forEach((item) => {
    const value = assignments.get(text(item.id)) || { ids: [], names: [] };
    writes.push({
      collection: 'coordinadores', id: item.id,
      data: { carrerasIds: value.ids, carrerasNombres: value.names, actualizadoEn: nowIso() }, merge: true
    });
  });
  await commitDocuments('TITULOS', writes, env);
  return {
    ok: true, carreraId: career.id, coordinadorId, coordinadorNombre,
    mensaje: coordinadorId ? `Carrera asignada a ${coordinadorNombre}.` : 'Asignación retirada.'
  };
}

function mergeStudent(base, enrollment, cedula, byCode, byName) {
  const codigoRaw = careerCodeFrom(enrollment) || careerCodeFrom(base);
  const carreraRaw = careerFrom(enrollment) || careerFrom(base);
  const canonical = byCode.get(normalizedText(codigoRaw)) || byName.get(normalizedText(carreraRaw));
  return {
    cedula,
    nombres: nameFrom(enrollment) || nameFrom(base),
    codigoCarrera: canonical && canonical.codigo || codigoRaw,
    carrera: canonical && canonical.nombre || carreraRaw,
    celular: phoneFrom(enrollment) || phoneFrom(base),
    correoInstitucional: institutionalEmail(enrollment) || institutionalEmail(base),
    correoPersonal: personalEmail(enrollment) || personalEmail(base),
    periodoId: periodKey(enrollment) || periodKey(base),
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
  careersResult.carreras.forEach((career) => {
    if (career.codigo) byCode.set(normalizedText(career.codigo), career);
    if (career.nombre) byName.set(normalizedText(career.nombre), career);
  });
  const studentsById = new Map();
  students.forEach((row) => {
    const id = cedulaFrom(row);
    if (id) studentsById.set(id, row);
  });

  let expected = enrollments.filter((row) => enrollmentActive(row) && samePeriod(periodKey(row), requestedPeriod));
  if (!expected.length) expected = students.filter((row) => samePeriod(periodKey(row), requestedPeriod));

  const expectedById = new Map();
  expected.forEach((enrollment) => {
    const id = cedulaFrom(enrollment);
    if (!id) return;
    const student = mergeStudent(studentsById.get(id), enrollment, id, byCode, byName);
    if (requestedCareer && normalizedText(student.carrera) !== normalizedText(requestedCareer)) return;
    expectedById.set(id, student);
  });

  const enviosById = new Map();
  envios.forEach((row) => {
    if (!samePeriod(periodKey(row), requestedPeriod)) return;
    const id = cedulaFrom(row);
    if (!id) return;
    if (!enviosById.has(id)) enviosById.set(id, []);
    enviosById.get(id).push(row);
  });

  const records = [...expectedById.values()].map((student) => {
    const envio = publicEnvio(latestBy(enviosById.get(student.cedula) || [], ['versionActual', 'numeroVersion'],
      ['fechaResolucion', 'fechaEnvio', 'actualizadoEn', '_updateTime']));
    return {
      ...student,
      periodoId: periodSignature(requestedPeriod),
      periodo: student.periodo || labelFromSignature(periodSignature(requestedPeriod)),
      estado: envio ? envio.estado : 'NO_ENVIADO',
      enviado: Boolean(envio),
      ...(envio || {})
    };
  }).sort((a, b) => a.carrera.localeCompare(b.carrera, 'es') || a.nombres.localeCompare(b.nombres, 'es'));

  const outsidePopulation = [];
  enviosById.forEach((rows, id) => {
    if (expectedById.has(id)) return;
    const row = latestBy(rows, ['versionActual'], ['fechaEnvio', '_updateTime']);
    outsidePopulation.push({
      cedula: id, nombres: nameFrom(row), carrera: careerFrom(row),
      periodoId: periodSignature(requestedPeriod), estado: normalizeStatus(row), envioId: text(row.id)
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
    mensaje: records.length ? 'Lista global construida correctamente.' : 'No se encontraron estudiantes activos para el período.'
  };
}

export async function buildAdminStatistics(payload = {}, env) {
  const global = await buildAdminGlobalList(payload, env);
  const buckets = new Map();
  global.registros.forEach((student) => {
    const key = normalizedText(student.codigoCarrera || student.carrera) || 'sin carrera';
    if (!buckets.has(key)) buckets.set(key, {
      codigoCarrera: student.codigoCarrera || '', carrera: student.carrera || 'SIN CARRERA',
      esperados: 0, enviados: 0, faltan: 0, pendientes: 0,
      aprobados: 0, reemplazados: 0, devueltos: 0, avance: 0
    });
    const item = buckets.get(key);
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

  return { ...global, resumen, carreras, mensaje: 'Estadísticas calculadas desde la lista global.' };
}
