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

function flexible(object, names) {
  if (!object || typeof object !== 'object') return undefined;
  const normalized = Object.keys(object).reduce((output, key) => {
    output[text(key).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '')] = key;
    return output;
  }, {});
  for (const name of names) {
    const key = normalized[text(name).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '')];
    if (key !== undefined && object[key] !== undefined && object[key] !== null) return object[key];
  }
  return undefined;
}

function active(value) {
  const normalized = text(value || 'ACTIVO').toUpperCase();
  return !['INACTIVO', 'RETIRADO', 'ANULADO', 'CANCELADO'].includes(normalized);
}

async function getStudentDocument(cedula) {
  const canonical = normalizeCedula(cedula);
  if (!canonical) return null;

  const variants = canonical.startsWith('0') ? [canonical, canonical.slice(1)] : [canonical];
  for (const id of variants) {
    const direct = await getDocument('UTET', 'Estudiantes', id);
    if (direct) return direct;
  }

  for (const field of ['numeroIdentificacion', 'cedula', 'Cedula', 'Cédula']) {
    for (const value of variants) {
      const found = await queryEqual('UTET', 'Estudiantes', field, value, 5);
      if (found.length) return found[0];
    }
  }
  return null;
}

async function getStudentPeriodRecord(cedula, requestedPeriod) {
  const canonical = normalizeCedula(cedula);
  if (!canonical) return null;
  const variants = canonical.startsWith('0') ? [canonical, canonical.slice(1)] : [canonical];
  const rows = [];
  const signatures = new Set();

  for (const field of ['numeroIdentificacion', 'cedula', 'Cedula', 'Cédula']) {
    for (const value of variants) {
      const found = await queryEqual('UTET', 'EstudiantesPeriodo', field, value, 50);
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
  const candidates = exact.length ? exact : rows.filter((row) => active(flexible(row, ['estadoMatricula', 'EstadoMatricula', 'estado'])));
  return latestBy(candidates.length ? candidates : rows, [], [
    'ultimaSincronizacion', 'actualizadoEn', 'fechaActualizacion', '_updateTime'
  ]);
}

async function activeTitlePeriod() {
  const periods = await listTitlePeriods();
  return periods.find((item) => item.principal || item.activo) || periods[0] || null;
}

export async function listTitlePeriods() {
  const rows = await listCollection('TITULOS', 'periodos', { maxDocuments: 500 });
  const periods = rows
    .map((row) => ({
      id: text(row.id),
      periodoId: text(row.id),
      label: text(row.nombre || row.label || row.periodoLabel || row.id),
      periodoLabel: text(row.nombre || row.label || row.periodoLabel || row.id),
      activo: row.activo !== false,
      principal: row.activo === true
    }))
    .filter((item) => item.id && item.activo !== false)
    .sort((a, b) => periodSignature(b.id).localeCompare(periodSignature(a.id), 'es', { numeric: true }));

  if (periods.length && !periods.some((item) => item.principal)) periods[0].principal = true;
  return periods;
}

export async function listTitleCareers(periodId = '') {
  const rows = await listCollection('TITULOS', 'carreras', { maxDocuments: 1000 });
  return rows
    .filter((row) => row.activo !== false)
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
    }));
}

export async function getStudentBasic(cedula, options = {}) {
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

  const document = await getStudentDocument(canonical);
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
    const enrollment = await getStudentPeriodRecord(canonical, requestedPeriod);
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
    const fallback = await activeTitlePeriod();
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
    periodoId,
    periodId: periodoId,
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
    periodoId,
    periodoLabel: periodLabel || periodId,
    coincidencias: 1,
    fuente: 'FIREBASE_UTET',
    lecturaDirecta: true,
    mensaje: 'Estudiante encontrado correctamente en Firebase UTET.'
  };
}

export async function pullRequisitos(action, payload = {}) {
  const normalizedAction = text(action).toLowerCase();
  if (normalizedAction === 'ping') {
    return {
      ok: true,
      servicio: 'REQUISITOS',
      projectId: 'utet-4387a',
      fuente: 'FIREBASE_UTET'
    };
  }

  if (normalizedAction === 'pull_bl2') {
    const scope = text(payload.scope || 'all').toLowerCase();
    const periods = await listTitlePeriods();
    const careers = scope === 'periods' ? [] : await listTitleCareers(payload.periodoId);
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
      }
    );
  }

  throw new Error('Acción de Requisitos no implementada en Firebase: ' + action);
}
