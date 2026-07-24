/* Estadísticas administrativas combinando Firebase UTET y Firebase Títulos. */

import {
  latestBy,
  listCollection,
  normalizeCedula,
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
  const keys = Object.keys(object).reduce((output, key) => {
    output[normalizedKey(key)] = key;
    return output;
  }, {});
  for (const name of names) {
    const key = keys[normalizedKey(name)];
    if (key !== undefined && object[key] !== undefined && object[key] !== null) {
      return object[key];
    }
  }
  return undefined;
}

function activeEnrollment(row) {
  const raw = text(flexible(row, [
    'estadoMatricula', 'EstadoMatricula', 'estado', 'Estado', 'activo', 'Activo'
  ]) || 'ACTIVO').toUpperCase();
  return !['FALSE', '0', 'NO', 'INACTIVO', 'RETIRADO', 'ANULADO', 'CANCELADO'].includes(raw);
}

function cedulaFrom(row) {
  const direct = normalizeCedula(flexible(row, [
    'numeroIdentificacion', 'NumeroIdentificacion', 'cedula', 'Cedula', 'Cédula', 'identificacion'
  ]));
  if (direct) return direct;
  const match = text(row && (row.id || row._id || row._docId)).match(/(?:^|\D)(\d{9,10})(?:\D|$)/);
  return match ? normalizeCedula(match[1]) : '';
}

function periodFrom(row) {
  const direct = text(flexible(row, [
    'periodoId', 'periodId', 'periodoCanonicoId', 'ultimoPeriodoId',
    'periodoLabel', 'periodoCanonicoLabel', 'PeriodoLabel', 'periodo'
  ]));
  if (direct) return direct;
  const id = text(row && (row.id || row._id || row._docId));
  return periodSignature(id) || '';
}

function nameFrom(row) {
  return text(flexible(row, [
    'Nombres', 'nombres', 'nombreCompleto', 'NombreCompleto', 'nombre', 'Nombre'
  ]));
}

function careerFrom(row) {
  return text(flexible(row, [
    'NombreCarrera', 'nombreCarrera', 'carrera', 'Carrera'
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

function statusFrom(row) {
  const value = text(flexible(row, ['estado', 'estadoFinal']) || 'PENDIENTE_REVISION')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_');
  if (value.includes('DEVUEL')) return 'DEVUELTO';
  if (value.includes('REEMPLAZ')) return 'REEMPLAZADO';
  if (value.includes('APROBAD')) return 'APROBADO';
  return 'PENDIENTE_REVISION';
}

function mergeStudent(base, enrollment, cedula) {
  const names = nameFrom(enrollment) || nameFrom(base);
  const career = careerFrom(enrollment) || careerFrom(base);
  const phone = phoneFrom(enrollment) || phoneFrom(base);
  const institutionalEmail = institutionalEmailFrom(enrollment) || institutionalEmailFrom(base);
  const personalEmail = personalEmailFrom(enrollment) || personalEmailFrom(base);
  return {
    cedula,
    nombres: names,
    carrera: career,
    celular: phone,
    correoInstitucional: institutionalEmail,
    correoPersonal: personalEmail,
    periodo: periodFrom(enrollment) || periodFrom(base)
  };
}

function latestEnvio(rows) {
  return latestBy(rows, ['versionActual'], [
    'fechaResolucion', 'fechaEnvio', 'actualizadoEn', '_updateTime'
  ]);
}

function careerBucket(map, career) {
  const name = text(career) || 'SIN CARRERA';
  const key = normalizedText(name) || 'sin carrera';
  if (!map.has(key)) {
    map.set(key, {
      carrera: name,
      esperados: 0,
      enviados: 0,
      pendientes: 0,
      aprobados: 0,
      reemplazados: 0,
      devueltos: 0,
      faltan: 0,
      avance: 0
    });
  }
  return map.get(key);
}

export async function buildAdminStatistics(payload = {}, env) {
  const requestedPeriod = text(payload.periodoId || payload.periodoLabel || payload.periodo);
  const requestedCareer = text(payload.carrera || payload.nombreCarrera);
  if (!requestedPeriod) {
    throw new Error('Selecciona un período para calcular las estadísticas.');
  }

  const [enrollments, students, envios] = await Promise.all([
    listCollection('UTET', 'EstudiantesPeriodo', { maxDocuments: 10000 }, env),
    listCollection('UTET', 'Estudiantes', { maxDocuments: 10000 }, env),
    listCollection('TITULOS', 'envios', { maxDocuments: 10000 }, env)
  ]);

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
    const student = mergeStudent(studentsByCedula.get(cedula), enrollment, cedula);
    if (requestedCareer && normalizedText(student.carrera) !== normalizedText(requestedCareer)) continue;
    expectedByCedula.set(cedula, student);
  }

  const enviosByCedula = new Map();
  for (const envio of envios) {
    const period = text(envio.periodoId || envio.periodoNombre || envio.periodoLabel || envio.periodo);
    if (!period || !samePeriod(period, requestedPeriod)) continue;
    const cedula = cedulaFrom(envio);
    if (!cedula) continue;
    const career = careerFrom(envio) || text(envio.carreraNombre || envio.nombreCarrera || envio.carrera);
    if (requestedCareer && normalizedText(career) !== normalizedText(requestedCareer)) continue;
    const existing = enviosByCedula.get(cedula) || [];
    existing.push(envio);
    enviosByCedula.set(cedula, existing);
  }

  const latestEnvios = new Map();
  for (const [cedula, rows] of enviosByCedula.entries()) {
    latestEnvios.set(cedula, latestEnvio(rows));
  }

  const buckets = new Map();
  const missing = [];

  for (const student of expectedByCedula.values()) {
    const bucket = careerBucket(buckets, student.carrera);
    bucket.esperados += 1;
    const envio = latestEnvios.get(student.cedula);
    if (!envio) {
      bucket.faltan += 1;
      missing.push(student);
      continue;
    }
    bucket.enviados += 1;
    const status = statusFrom(envio);
    if (status === 'APROBADO') bucket.aprobados += 1;
    else if (status === 'REEMPLAZADO') bucket.reemplazados += 1;
    else if (status === 'DEVUELTO') bucket.devueltos += 1;
    else bucket.pendientes += 1;
  }

  for (const [cedula, envio] of latestEnvios.entries()) {
    if (expectedByCedula.has(cedula)) continue;
    const career = careerFrom(envio) || text(envio.carreraNombre || envio.nombreCarrera || envio.carrera);
    const bucket = careerBucket(buckets, career);
    bucket.enviados += 1;
    const status = statusFrom(envio);
    if (status === 'APROBADO') bucket.aprobados += 1;
    else if (status === 'REEMPLAZADO') bucket.reemplazados += 1;
    else if (status === 'DEVUELTO') bucket.devueltos += 1;
    else bucket.pendientes += 1;
  }

  const careers = [...buckets.values()]
    .map((item) => ({
      ...item,
      avance: item.esperados > 0
        ? Math.min(100, Number(((Math.min(item.enviados, item.esperados) / item.esperados) * 100).toFixed(1)))
        : 0
    }))
    .sort((a, b) => a.carrera.localeCompare(b.carrera, 'es', { sensitivity: 'base' }));

  const summary = careers.reduce((output, item) => {
    output.esperados += item.esperados;
    output.enviados += item.enviados;
    output.pendientes += item.pendientes;
    output.aprobados += item.aprobados;
    output.reemplazados += item.reemplazados;
    output.devueltos += item.devueltos;
    output.faltan += item.faltan;
    return output;
  }, {
    esperados: 0,
    enviados: 0,
    pendientes: 0,
    aprobados: 0,
    reemplazados: 0,
    devueltos: 0,
    faltan: 0
  });
  summary.avance = summary.esperados > 0
    ? Math.min(100, Number(((Math.min(summary.enviados, summary.esperados) / summary.esperados) * 100).toFixed(1)))
    : 0;

  missing.sort((a, b) => a.carrera.localeCompare(b.carrera, 'es', { sensitivity: 'base' }) ||
    a.nombres.localeCompare(b.nombres, 'es', { sensitivity: 'base' }));

  return {
    ok: true,
    periodo: requestedPeriod,
    carrera: requestedCareer,
    resumen: summary,
    carreras: careers,
    faltantes: missing,
    totalMatriculasLeidas: enrollments.length,
    totalEstudiantesLeidos: students.length,
    totalEnviosLeidos: envios.length,
    fuente: 'FIREBASE_UTET_Y_TITULOS',
    mensaje: expectedByCedula.size
      ? 'Estadísticas calculadas correctamente.'
      : 'No se encontraron estudiantes activos para el período seleccionado en EstudiantesPeriodo.'
  };
}
