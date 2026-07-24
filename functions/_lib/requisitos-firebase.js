/* Lectura mínima de estudiantes desde Firebase UTET. */

import {
  getDocument,
  latestBy,
  listCollection,
  normalizeCedula,
  periodSignature,
  queryEqual,
  text
} from './firestore.js';

function normalizedKey(value) {
  return text(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

function flexible(object, names) {
  if (!object || typeof object !== 'object') return undefined;
  const normalized = Object.keys(object).reduce((output, key) => {
    output[normalizedKey(key)] = key;
    return output;
  }, {});
  for (const name of names) {
    const key = normalized[normalizedKey(name)];
    if (key !== undefined && object[key] !== undefined && object[key] !== null) return object[key];
  }
  return undefined;
}

function active(value) {
  const normalized = text(value === undefined || value === null || value === '' ? 'ACTIVO' : value).toUpperCase();
  return !['FALSE', '0', 'NO', 'INACTIVO', 'RETIRADO', 'ANULADO', 'CANCELADO'].includes(normalized);
}

function principal(row) {
  return row && (
    row.principal === true ||
    row.esPrincipal === true ||
    text(row.tipo).toUpperCase() === 'PRINCIPAL' ||
    text(row.estado).toUpperCase() === 'PRINCIPAL'
  );
}

async function getStudentDocument(cedula, env) {
  const canonical = normalizeCedula(cedula);
  if (!canonical) return null;

  const variants = canonical.startsWith('0') ? [canonical, canonical.slice(1)] : [canonical];
  for (const id of variants) {
    const direct = await getDocument('UTET', 'Estudiantes', id, env);
    if (direct) return direct;
  }

  for (const field of ['numeroIdentificacion', 'cedula', 'Cedula', 'Cédula']) {
    for (const value of variants) {
      const found = await queryEqual('UTET', 'Estudiantes', field, value, 5, env);
      if (found.length) return found[0];
    }
  }
  return null;
}

async function getStudentPeriodRecord(cedula, requestedPeriod, env) {
  const canonical = normalizeCedula(cedula);
  if (!canonical) return null;
  const variants = canonical.startsWith('0') ? [canonical, canonical.slice(1)] : [canonical];
  const rows = [];
  const signatures = new Set();

  for (const field of ['numeroIdentificacion', 'cedula', 'Cedula', 'Cédula']) {
    for (const value of variants) {
      const found = await queryEqual('UTET', 'EstudiantesPeriodo', field, value, 50, env);
      for (const row of found) {
        if (signatures.has(row.id)) continue;
        signatures.add(row.id);
        rows.push(row);
      }
    }
  }

  const requestedSignature = periodSignature(requestedPeriod);
  const exact = requestedSignature
    ? rows.filter((row) => periodSignature(flexible(row, [
        'periodoId', 'periodId', 'periodoCanonicoId', 'ultimoPeriodoId', 'periodoLabel', 'periodo'
      ])) === requestedSignature)
    : [];
  const activeRows = rows.filter((row) => active(flexible(row, ['estadoMatricula', 'EstadoMatricula', 'estado'])));
  const candidates = exact.length ? exact : activeRows.length ? activeRows : rows;
  return latestBy(candidates, [], [
    'ultimaSincronizacion', 'actualizadoEn', 'fechaActualizacion', '_updateTime'
  ]);
}

async function activeTitlePeriod(env) {
  const periods = await listTitlePeriods(env);
  return periods.find((item) => item.principal) || periods[0] || null;
}

export async function listTitlePeriods(env) {
  const rows = await listCollection('TITULOS', 'periodos', { maxDocuments: 500 }, env);
  const periods = rows
    .filter((row) => active(row.activo !== undefined ? row.activo : row.estado))
    .map((row) => ({
      id: text(row.id),
      periodoId: text(row.id),
      label: text(row.nombre || row.label || row.periodoLabel || row.id),
      periodoLabel: text(row.nombre || row.label || row.periodoLabel || row.id),
      activo: true,
      principal: principal(row)
    }))
    .filter((item) => item.id)
    .sort((a, b) => periodSignature(b.id).localeCompare(periodSignature(a.id), 'es', { numeric: true }));

  if (periods.length && !periods.some((item) => item.principal)) periods[0].principal = true;
  return periods;
}

export async function listTitleCareers(periodId = '', env) {
  const rows = await listCollection('TITULOS', 'carreras', { maxDocuments: 1000 }, env);
  return rows
    .filter((row) => active(row.activo !== undefined ? row.activo : row.estado))
    .map((row) => ({
      id: text(row.id),
      codigo: text(row.codigo || row.codigoCarrera || row.id),
      CodigoCarrera: text(row.codigo || row.codigoCarrera || row.id),
      codigoCarrera: text(row.codigo || row.codigoCarrera || row.id),
      nombre: text(row.nombre || row.nombreCarrera || row.id),
      NombreCarrera: text(row.nombre || row.nombreCarrera || row.id),
      nombreCarrera: text(row.nombre || row.nombreCarrera || row.id),
      carrera: text(row.nombre || row.nombreCarrera || row.id),
      periodoId: text(periodId)
    }))
    .filter((item) => item.id && item.nombre);
}

export async function getStudentBasic(cedula, options = {}, env) {
  const canonical = normalizeCedula(cedula);
  if (!canonical) {
    return {
      ok: true,
      encontrado: false,
      existe: false,
      cedula: '',
      mensaje: 'No se recibió una cédula válida.'
    };
  }

  const document = await getStudentDocument(canonical, env);
  if (!document) {
    return {
      ok: true,
      encontrado: false,
      existe: false,
      cedula: canonical,
      numeroIdentificacion: canonical,
      mensaje: 'No encontramos un estudiante con esa cédula en Firebase UTET.',
      fuente: 'FIREBASE_UTET'
    };
  }

  const requestedPeriod = text(options.periodoId || options.periodo || options.periodoLabel);
  let periodId = text(flexible(document, [
    'periodoId', 'periodId', 'periodoCanonicoId', 'ultimoPeriodoId'
  ]));
  let periodLabel = text(flexible(document, [
    'periodoLabel', 'periodoCanonicoLabel', 'PeriodoLabel', 'periodo'
  ]));

  if (!periodId || requestedPeriod) {
    const enrollment = await getStudentPeriodRecord(canonical, requestedPeriod, env);
    if (enrollment) {
      periodId = text(flexible(enrollment, [
        'periodoId', 'periodId', 'periodoCanonicoId', 'ultimoPeriodoId', 'periodoLabel', 'periodo'
      ])) || periodId;
      periodLabel = text(flexible(enrollment, [
        'periodoLabel', 'periodoCanonicoLabel', 'PeriodoLabel', 'periodo', 'periodoId'
      ])) || periodLabel || periodId;
    }
  }

  if (!periodId) {
    const fallback = await activeTitlePeriod(env);
    periodId = fallback && fallback.id || '';
    periodLabel = fallback && fallback.label || periodId;
  }

  const names = text(flexible(document, ['Nombres', 'nombres', 'nombreCompleto', 'Nombre']));
  const career = text(flexible(document, ['NombreCarrera', 'nombreCarrera', 'carrera', 'Carrera']));
  const phone = text(flexible(document, ['Celular', 'celular', 'telefono', 'Teléfono']));

  const student = {
    id: canonical,
    _id: canonical,
    studentId: canonical,
    cedula: canonical,
    numeroIdentificacion: canonical,
    NumeroIdentificacion: canonical,
    nombres: names,
    Nombres: names,
    carrera: career,
    nombreCarrera: career,
    NombreCarrera: career,
    periodoId: periodId,
    periodId,
    periodoLabel: periodLabel || periodId,
    periodo: periodLabel || periodId,
    fuente: 'FIREBASE_UTET'
  };

  if (options.includePhone === true) {
    student.celular = phone;
    student.Celular = phone;
  }

  return {
    ok: true,
    encontrado: true,
    existe: true,
    estudiante: student,
    registro: student,
    cedula: canonical,
    periodoId: periodId,
    periodoLabel: periodLabel || periodId,
    coincidencias: 1,
    fuente: 'FIREBASE_UTET',
    lecturaDirecta: true,
    mensaje: 'Estudiante encontrado correctamente en Firebase UTET.'
  };
}

export async function pullRequisitos(action, payload = {}, env) {
  const normalizedAction = text(action).toLowerCase();
  if (normalizedAction === 'ping') {
    await listCollection('UTET', 'Estudiantes', { pageSize: 1, maxDocuments: 1 }, env);
    return {
      ok: true,
      servicio: 'REQUISITOS',
      projectId: 'utet-4387a',
      fuente: 'FIREBASE_UTET',
      autenticacion: 'service-account-oauth'
    };
  }

  if (normalizedAction === 'pull_bl2') {
    const scope = text(payload.scope || 'all').toLowerCase();
    const periods = await listTitlePeriods(env);
    const careers = scope === 'periods' ? [] : await listTitleCareers(payload.periodoId, env);
    return {
      ok: true,
      fuente: 'FIREBASE_UTET_Y_TITULOS',
      tables: {
        Periodos: periods,
        Carreras: careers,
        Estudiantes: [],
        BaseEstudiantes: [],
        EstudiantesPeriodo: []
      },
      periodos: periods,
      carreras: careers
    };
  }

  if (['consultar_estudiante', 'consultar_estudiante_titulacion'].includes(normalizedAction)) {
    return getStudentBasic(
      payload.cedula || payload.numeroIdentificacion || payload.identificacion,
      {
        periodoId: payload.periodoId || payload.periodo || payload.periodoLabel,
        includePhone: payload.includePhone === true || payload.rol === 'admin'
      },
      env
    );
  }

  throw new Error('Acción de Requisitos no implementada en Firebase: ' + action);
}
