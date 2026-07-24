/*
Archivo: functions/_lib/admin-global.js
Función:
- Construir el catálogo administrativo completo de períodos.
- Unir EstudiantesPeriodo + Estudiantes + envios por cédula y período.
- Calcular títulos y estadísticas desde una sola población.
- Asignar carreras a coordinadores desde la colección carreras.
*/

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
  return text(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

function normalizedText(value) {
  return text(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function flexible(object, names) {
  if (!object || typeof object !== 'object') return undefined;
  const map = Object.keys(object).reduce((output, key) => {
    output[normalizedKey(key)] = key;
    return output;
  }, {});
  for (const name of names) {
    const key = map[normalizedKey(name)];
    if (key !== undefined && object[key] !== undefined && object[key] !== null) {
      return object[key];
    }
  }
  return undefined;
}

function booleanValue(value, fallback = true) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  return !['FALSE', '0', 'NO', 'INACTIVO', 'DESACTIVADO', 'RETIRADO', 'ANULADO', 'CANCELADO']
    .includes(text(value).toUpperCase());
}

function activeEnrollment(row) {
  return booleanValue(flexible(row, [
    'estadoMatricula', 'EstadoMatricula', 'estado', 'Estado', 'activo', 'Activo'
  ]), true);
}

function principalValue(row) {
  return Boolean(row && (
    row.principal === true ||
    row.esPrincipal === true ||
    text(row.tipo).toUpperCase() === 'PRINCIPAL' ||
    text(row.estado).toUpperCase() === 'PRINCIPAL'
  ));
}

function cedulaFrom(row) {
  const direct = normalizeCedula(flexible(row, [
    'numeroIdentificacion', 'NumeroIdentificacion', 'cedula', 'Cedula', 'Cédula', 'identificacion'
  ]));
  if (direct) return direct;
  const id = text(row && (row.id || row._id || row._docId));
  const matches = id.match(/(?:^|\D)(\d{9,10})(?:\D|$)/g) || [];
  for (const match of matches) {
    const found = normalizeCedula(match);
    if (found) return found;
  }
  return '';
}

function periodFrom(row) {
  const direct = text(flexible(row, [
    'periodoId', 'periodId', 'periodoCanonicoId', 'ultimoPeriodoId',
    'periodoLabel', 'periodoCanonicoLabel', 'PeriodoLabel', 'periodo', 'Periodo'
  ]));
  if (direct) return direct;
  const id = text(row && (row.id || row._id || row._docId));
  return periodSignature(id) || '';
}

function periodLabelFrom(row) {
  return text(flexible(row, [
    'nombre', 'label', 'periodoLabel', 'periodoCanonicoLabel', 'PeriodoLabel', 'periodo', 'Periodo'
  ])) || periodFrom(row);
}

function nameFrom(row) {
  return text(flexible(row, [
    'Nombres', 'nombres', 'nombreCompleto', 'NombreCompleto', 'nombre', 'Nombre'
  ]));
}

function careerFrom(row) {
  return text(flexible(row, [
    'NombreCarrera', 'nombreCarrera', 'carreraNombre', 'carrera', 'Carrera'
  ]));
}

function careerCodeFrom(row) {
  return text(flexible(row, [
    'CodigoCarrera', 'codigoCarrera', 'carreraCodigo', 'codigo', 'Código'
  ]));
}

function phoneFrom(row) {
  return text(flexible(row, ['Celular', 'celular', 'telefono', 'Teléfono']));
}

function institutionalEmailFrom(row) {
  return text(flexible(row, [
    'CorreoInstitucional', 'correoInstitucional', 'emailInstitucional', 'correo_institucional'
  ])).toLowerCase();
}

function personalEmailFrom(row) {
  return text(flexible(row, [
    'CorreoPersonal', 'correoPersonal', 'emailPersonal', 'correo_personal'
  ])).toLowerCase();
}

function normalizeStatus(row) {
  const value = text(flexible(row, ['estado', 'estadoFinal']) || 'PENDIENTE_REVISION')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_');
  if (value.includes('DEVUEL')) return 'DEVUELTO';
  if (value.includes('REEMPLAZ')) return 'REEMPLAZADO';
  if (value.includes('APROBAD')) return 'APROBADO';
  return 'PENDIENTE_REVISION';
}

const MONTHS = [
  '', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

function labelFromSignature(signature) {
  const parts = text(signature).split('__');
  const format = (part) => {
    const match = text(part).match(/^(20\d{2})-(\d{2})$/);
    if (!match) return text(part);
    return `${MONTHS[Number(match[2])] || match[2]} ${match[1]}`;
  };
  if (parts.length >= 2) return `${format(parts[0])} a ${format(parts[parts.length - 1])}`;
  return format(parts[0]);
}

function sortPeriods(a, b) {
  const first = text(a.firma || a.id);
  const second = text(b.firma || b.id);
  const endA = first.includes('__') ? first.split('__').pop() : first;
  const endB = second.includes('__') ? second.split('__').pop() : second;
  if (endA !== endB) return endB.localeCompare(endA, 'es', { numeric: true });
  return second.localeCompare(first, 'es', { numeric: true });
}

function mergeStudent(base, enrollment, cedula, careersByCode, careersByName) {
  const code = careerCodeFrom(enrollment) || careerCodeFrom(base);
  const rawCareer = careerFrom(enrollment) || careerFrom(base);
  const canonical = (code && careersByCode.get(normalizedText(code))) ||
    (rawCareer && careersByName.get(normalizedText(rawCareer))) || null;
  return {
    cedula,
    nombres: nameFrom(enrollment) || nameFrom(base),
    codigoCarrera: canonical && canonical.codigo || code,
    carrera: canonical && canonical.nombre || rawCareer,
    celular: phoneFrom(enrollment) || phoneFrom(base),
    correoInstitucional: institutionalEmailFrom(enrollment) || institutionalEmailFrom(base),
    correoPersonal: personalEmailFrom(enrollment) || personalEmailFrom(base),
    periodoId: periodSignature(periodFrom(enrollment) || periodFrom(base)),
    periodo: periodLabelFrom(enrollment) || periodLabelFrom(base)
  };
}

function latestEnvio(rows) {
  return latestBy(rows, ['versionActual', 'numeroVersion'], [
    'fechaResolucion', 'fechaEnvio', 'actualizadoEn', '_updateTime'
  ]);
}

function publicEnvio(row) {
  if (!row) return null;
  const preferred = Number(row.tituloPreferidoNumero || row.preferido || 0);
  const titles = [text(row.titulo1), text(row.titulo2), text(row.titulo3)];
  return {
    envioId: text(row.id || row._docId || row._id),
    titulo1: titles[0],
    titulo2: titles[1],
    titulo3: titles[2],
    tituloPreferidoNumero: preferred,
    tituloPreferidoTexto: preferred >= 1 && preferred <= 3 ? titles[preferred - 1] : '',
    tituloFinal: text(row.tituloFinal || row.tituloAprobado || row.tituloCorregido),
    estado: normalizeStatus(row),
    coordinador: text(row.coordinador || row.nombreCoordinador),
    observacion: text(row.observacion || row.comentarioCoordinador || row.comentario),
    fechaEnvio: text(row.fechaEnvio || row.actualizadoEn || row._createTime),
    fechaResolucion: text(row.fechaResolucion || row.fechaRevision),
    versionActualId: text(row.versionActualId),
    resolucionActualId: text(row.resolucionActualId)
  };
}

export async function listAdminPeriodsCatalog(env) {
  const [periodDocuments, enrollments, envios] = await Promise.all([
    listCollection('TITULOS', 'periodos', { maxDocuments: 1000 }, env),
    listCollection('UTET', 'EstudiantesPeriodo', { maxDocuments: 10000 }, env),
    listCollection('TITULOS', 'envios', { maxDocuments: 10000 }, env)
  ]);

  const map = new Map();
  const ensure = (value, label, source) => {
    const signature = periodSignature(value || label);
    if (!signature) return null;
    if (!map.has(signature)) {
      map.set(signature, {
        id: signature,
        periodoId: signature,
        documentId: '',
        firma: signature,
        label: text(label) || labelFromSignature(signature),
        periodoLabel: text(label) || labelFromSignature(signature),
        activo: false,
        principal: false,
        origenes: [],
        estudiantes: new Set(),
        envios: new Set()
      });
    }
    const item = map.get(signature);
    if (text(label) && (!item.label || item.label === labelFromSignature(signature))) {
      item.label = text(label);
      item.periodoLabel = text(label);
    }
    if (source && !item.origenes.includes(source)) item.origenes.push(source);
    return item;
  };

  for (const row of periodDocuments) {
    const item = ensure(row.id || periodFrom(row), periodLabelFrom(row), 'periodos');
    if (!item) continue;
    item.documentId = text(row.id) || item.id;
    item.activo = booleanValue(row.activo !== undefined ? row.activo : row.estado, true);
    item.principal = principalValue(row);
  }

  for (const row of enrollments) {
    const period = periodFrom(row);
    const item = ensure(period, periodLabelFrom(row), 'EstudiantesPeriodo');
    if (!item || !activeEnrollment(row)) continue;
    const cedula = cedulaFrom(row);
    if (cedula) item.estudiantes.add(cedula);
  }

  for (const row of envios) {
    const period = periodFrom(row);
    const item = ensure(period, periodLabelFrom(row), 'envios');
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

  const principals = periods.filter((item) => item.principal);
  if (principals.length > 1) {
    principals.slice(1).forEach((item) => { item.principal = false; });
  }

  return {
    ok: true,
    periodos: periods,
    registros: periods,
    principal: periods.find((item) => item.principal) || null,
    total: periods.length,
    fuente: 'PERIODOS_ENVÍOS_UTET'
  };
}

export async function saveAdminPeriod(payload = {}, env) {
  const catalog = await listAdminPeriodsCatalog(env);
  const requested = text(payload.periodoId || payload.id || payload.documentId || payload.periodo);
  const signature = periodSignature(requested);
  const target = catalog.periodos.find((item) => item.id === signature || samePeriod(item.id, requested));
  if (!target) throw new Error('No se encontró el período solicitado.');

  const documentId = text(payload.documentId || target.documentId || target.id);
  const setPrincipal = payload.principal === true;
  const setActive = payload.activo === undefined ? target.activo : payload.activo === true;
  if (!setActive && target.principal) {
    throw new Error('No puedes desactivar el período principal. Define primero otro período principal.');
  }

  const currentDocuments = await listCollection('TITULOS', 'periodos', { maxDocuments: 1000 }, env);
  const writes = [];
  if (setPrincipal) {
    for (const row of currentDocuments) {
      writes.push({
        collection: 'periodos',
        id: row.id,
        data: { principal: false, actualizadoEn: nowIso() },
        merge: true
      });
    }
  }
  writes.push({
    collection: 'periodos',
    id: documentId,
    data: {
      nombre: target.label,
      activo: setPrincipal ? true : setActive,
      principal: setPrincipal ? true : target.principal,
      actualizadoEn: nowIso()
    },
    merge: true
  });

  const uniqueWrites = [...new Map(writes.map((item) => [`${item.collection}/${item.id}`, item])).values()];
  await commitDocuments('TITULOS', uniqueWrites, env);
  return {
    ok: true,
    periodoId: target.id,
    activo: setPrincipal ? true : setActive,
    principal: setPrincipal ? true : target.principal,
    mensaje: setPrincipal
      ? 'Período definido como principal y activado correctamente.'
      : setActive
        ? 'Período activado correctamente.'
        : 'Período desactivado correctamente.'
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
    const code = text(row.codigo || row.codigoCarrera || id);
    const name = text(row.nombre || row.nombreCarrera || id);
    let coordinatorId = text(row.coordinadorId);
    let coordinatorName = text(row.coordinadorNombre);

    if (!coordinatorId) {
      const fallback = coordinators.find((coordinator) => {
        const ids = Array.isArray(coordinator.carrerasIds) ? coordinator.carrerasIds.map(text) : [];
        const names = Array.isArray(coordinator.carrerasNombres) ? coordinator.carrerasNombres.map(normalizedText) : [];
        return ids.includes(id) || names.includes(normalizedText(name));
      });
      if (fallback) {
        coordinatorId = text(fallback.id);
        coordinatorName = text(fallback.nombre || fallback.coordinador);
      }
    }

    const coordinator = coordinatorMap.get(coordinatorId);
    return {
      id,
      codigo: code,
      nombre: name,
      activo: booleanValue(row.activo !== undefined ? row.activo : row.estado, true),
      coordinadorId,
      coordinadorNombre: coordinatorName || text(coordinator && (coordinator.nombre || coordinator.coordinador)),
      actualizadoEn: text(row.actualizadoEn || row._updateTime)
    };
  }).filter((item) => item.id && item.nombre)
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' }));

  return { ok: true, carreras: records, registros: records, total: records.length };
}

export async function assignCareerCoordinator(payload = {}, env) {
  const careerId = text(payload.carreraId || payload.id || payload.codigoCarrera);
  const coordinatorId = text(payload.coordinadorId);
  if (!careerId) throw new Error('Selecciona una carrera.');

  const [careersResult, coordinators] = await Promise.all([
    listAdminCareers(env),
    listCollection('TITULOS', 'coordinadores', { maxDocuments: 1000 }, env)
  ]);
  const career = careersResult.carreras.find((item) => item.id === careerId || item.codigo === careerId);
  if (!career) throw new Error('No se encontró la carrera seleccionada.');

  const coordinator = coordinatorId
    ? coordinators.find((item) => text(item.id) === coordinatorId)
    : null;
  if (coordinatorId && !coordinator) throw new Error('No se encontró el coordinador seleccionado.');
  if (coordinator && !booleanValue(coordinator.activo !== undefined ? coordinator.activo : coordinator.estado, true)) {
    throw new Error('El coordinador seleccionado está inactivo.');
  }

  const coordinatorName = coordinator ? text(coordinator.nombre || coordinator.coordinador) : '';
  const updatedCareers = careersResult.carreras.map((item) => item.id === career.id
    ? { ...item, coordinadorId, coordinadorNombre: coordinatorName }
    : item);

  const assignments = new Map(coordinators.map((item) => [text(item.id), { ids: [], names: [] }]));
  for (const item of updatedCareers) {
    if (!item.coordinadorId || !assignments.has(item.coordinadorId)) continue;
    const assignment = assignments.get(item.coordinadorId);
    assignment.ids.push(item.id);
    assignment.names.push(item.nombre);
  }

  const writes = [{
    collection: 'carreras',
    id: career.id,
    data: {
      codigo: career.codigo,
      nombre: career.nombre,
      coordinadorId,
      coordinadorNombre: coordinatorName,
      actualizadoEn: nowIso()
    },
    merge: true
  }];
  for (const coordinatorRow of coordinators) {
    const assignment = assignments.get(text(coordinatorRow.id)) || { ids: [], names: [] };
    writes.push({
      collection: 'coordinadores',
      id: coordinatorRow.id,
      data: {
        carrerasIds: assignment.ids,
        carrerasNombres: assignment.names,
        actualizadoEn: nowIso()
      },
      merge: true
    });
  }
  await commitDocuments('TITULOS', writes, env);

  return {
    ok: true,
    carreraId: career.id,
    coordinadorId,
    coordinadorNombre: coordinatorName,
    mensaje: coordinatorId
      ? `Carrera asignada a ${coordinatorName}.`
      : 'Asignación de coordinador retirada correctamente.'
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

  const careersByCode = new Map();
  const careersByName = new Map();
  for (const career of careersResult.carreras) {
    if (career.codigo) careersByCode.set(normalizedText(career.codigo), career);
    if (career.nombre) careersByName.set(normalizedText(career.nombre), career);
  }

  const studentsByCedula = new Map();
  for (const row of students) {
    const cedula = cedulaFrom(row);
    if (cedula) studentsByCedula.set(cedula, row);
  }

  let expectedRows = enrollments.filter((row) => {
    const period = periodFrom(row);
    return activeEnrollment(row) && period && samePeriod(period, requestedPeriod);
  });
  if (!expectedRows.length) {
    expectedRows = students.filter((row) => {
      const period = periodFrom(row);
      return period && samePeriod(period, requestedPeriod);
    });
  }

  const expectedByCedula = new Map();
  for (const enrollment of expectedRows) {
    const cedula = cedulaFrom(enrollment);
    if (!cedula) continue;
    const student = mergeStudent(
      studentsByCedula.get(cedula), enrollment, cedula, careersByCode, careersByName
    );
    if (requestedCareer && normalizedText(student.carrera) !== normalizedText(requestedCareer)) continue;
    expectedByCedula.set(cedula, student);
  }

  const enviosByCedula = new Map();
  for (const envio of envios) {
    const period = periodFrom(envio);
    if (!period || !samePeriod(period, requestedPeriod)) continue;
    const cedula = cedulaFrom(envio);
    if (!cedula) continue;
    if (!enviosByCedula.has(cedula)) enviosByCedula.set(cedula, []);
    enviosByCedula.get(cedula).push(envio);
  }

  const records = [];
  for (const student of expectedByCedula.values()) {
    const envio = publicEnvio(latestEnvio(enviosByCedula.get(student.cedula) || []));
    records.push({
      ...student,
      periodoId: periodSignature(requestedPeriod),
      periodo: student.periodo || labelFromSignature(periodSignature(requestedPeriod)),
      estado: envio ? envio.estado : 'NO_ENVIADO',
      enviado: Boolean(envio),
      ...(envio || {})
    });
  }

  records.sort((a, b) => a.carrera.localeCompare(b.carrera, 'es', { sensitivity: 'base' }) ||
    a.nombres.localeCompare(b.nombres, 'es', { sensitivity: 'base' }));

  const outsidePopulation = [];
  for (const [cedula, rows] of enviosByCedula.entries()) {
    if (expectedByCedula.has(cedula)) continue;
    const envio = latestEnvio(rows);
    outsidePopulation.push({
      cedula,
      nombres: nameFrom(envio),
      carrera: careerFrom(envio),
      codigoCarrera: careerCodeFrom(envio),
      periodoId: periodSignature(requestedPeriod),
      estado: normalizeStatus(envio),
      envioId: text(envio.id)
    });
  }

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
    totalEnviosLeidos: envios.length,
    mensaje: records.length
      ? 'Lista global construida correctamente desde UTET y Firebase Títulos.'
      : 'No se encontraron estudiantes activos para el período seleccionado.'
  };
}

export async function buildAdminStatistics(payload = {}, env) {
  const global = await buildAdminGlobalList(payload, env);
  const buckets = new Map();
  const bucketFor = (student) => {
    const key = normalizedText(student.codigoCarrera || student.carrera) || 'sin carrera';
    if (!buckets.has(key)) {
      buckets.set(key, {
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
    return buckets.get(key);
  };

  for (const student of global.registros) {
    const bucket = bucketFor(student);
    bucket.esperados += 1;
    if (student.estado === 'NO_ENVIADO') bucket.faltan += 1;
    else {
      bucket.enviados += 1;
      if (student.estado === 'APROBADO') bucket.aprobados += 1;
      else if (student.estado === 'REEMPLAZADO') bucket.reemplazados += 1;
      else if (student.estado === 'DEVUELTO') bucket.devueltos += 1;
      else bucket.pendientes += 1;
    }
  }

  const careers = [...buckets.values()].map((item) => ({
    ...item,
    avance: item.esperados
      ? Number(((item.enviados / item.esperados) * 100).toFixed(1))
      : 0
  })).sort((a, b) => a.carrera.localeCompare(b.carrera, 'es', { sensitivity: 'base' }));

  const summary = careers.reduce((output, item) => {
    output.esperados += item.esperados;
    output.enviados += item.enviados;
    output.faltan += item.faltan;
    output.pendientes += item.pendientes;
    output.aprobados += item.aprobados;
    output.reemplazados += item.reemplazados;
    output.devueltos += item.devueltos;
    return output;
  }, {
    esperados: 0,
    enviados: 0,
    faltan: 0,
    pendientes: 0,
    aprobados: 0,
    reemplazados: 0,
    devueltos: 0
  });
  summary.avance = summary.esperados
    ? Number(((summary.enviados / summary.esperados) * 100).toFixed(1))
    : 0;

  return {
    ...global,
    resumen: summary,
    carreras: careers,
    mensaje: global.registros.length
      ? 'Estadísticas calculadas desde la misma lista global de estudiantes.'
      : global.mensaje
  };
}
