/* Consulta rápida de identidad académica desde Firebase UTET.
 * Máximo: dos lecturas directas en Estudiantes/{cedula}.
 * No consulta EstudiantesPeriodo, requisitos, notas ni Firebase Títulos.
 */
import {
  getDocument,
  normalizeCedula,
  periodSignature,
  text
} from './firestore-fixed.js';

function normalizedKey(value) {
  return text(value).toLowerCase().normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
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

function parsePayload(value) {
  if (!value) return {};
  if (typeof value === 'object') return value;
  try {
    const parsed = JSON.parse(text(value));
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (_error) {
    return {};
  }
}

function mergedDocument(document) {
  const payload = parsePayload(flexible(document, ['payloadJson', 'payload', 'datosJson']));
  return { ...payload, ...(document || {}) };
}

function minimumStudent(document, cedula, includePhone) {
  const row = mergedDocument(document);
  const names = text(flexible(row, ['Nombres', 'nombres', 'nombreCompleto', 'Nombre']));
  const career = text(flexible(row, ['NombreCarrera', 'nombreCarrera', 'carrera', 'Carrera']));
  const rawPeriodId = text(flexible(row, [
    'periodoId', 'periodId', 'periodoCanonicoId', 'ultimoPeriodoId'
  ]));
  const rawPeriodLabel = text(flexible(row, [
    'periodoLabel', 'periodoCanonicoLabel', 'PeriodoLabel', 'periodo'
  ]));
  const periodId = periodSignature(rawPeriodId || rawPeriodLabel);
  const periodLabel = rawPeriodLabel || rawPeriodId || periodId;
  const phone = text(flexible(row, ['Celular', 'celular', 'telefono', 'Teléfono']));

  const student = {
    id: cedula,
    _id: cedula,
    studentId: cedula,
    cedula,
    numeroIdentificacion: cedula,
    NumeroIdentificacion: cedula,
    nombres: names,
    Nombres: names,
    carrera: career,
    nombreCarrera: career,
    NombreCarrera: career,
    periodoId: periodId,
    periodId,
    periodoLabel: periodLabel,
    periodo: periodLabel,
    fuente: 'FIREBASE_UTET'
  };

  if (includePhone === true) {
    student.celular = phone;
    student.Celular = phone;
  }

  return {
    student,
    complete: Boolean(names && career && periodId)
  };
}

async function directStudentDocument(cedula, env) {
  const canonical = normalizeCedula(cedula);
  if (!canonical) return null;
  const direct = await getDocument('UTET', 'Estudiantes', canonical, env);
  if (direct) return direct;
  if (canonical.startsWith('0')) {
    return getDocument('UTET', 'Estudiantes', canonical.slice(1), env);
  }
  return null;
}

export async function getStudentBasicFast(cedula, options = {}, env) {
  const canonical = normalizeCedula(cedula);
  if (!canonical) {
    return {
      ok: true,
      encontrado: false,
      existe: false,
      datosCompletos: false,
      cedula: '',
      mensaje: 'No se recibió una cédula válida.',
      fuente: 'FIREBASE_UTET'
    };
  }

  const document = await directStudentDocument(canonical, env);
  if (!document) {
    return {
      ok: true,
      encontrado: false,
      existe: false,
      datosCompletos: false,
      cedula: canonical,
      numeroIdentificacion: canonical,
      mensaje: 'No encontramos un estudiante con esa cédula en Firebase UTET.',
      fuente: 'FIREBASE_UTET',
      lecturaDirecta: true
    };
  }

  const normalized = minimumStudent(document, canonical, options.includePhone === true);
  return {
    ok: true,
    encontrado: true,
    existe: true,
    habilitado: normalized.complete,
    datosCompletos: normalized.complete,
    estudiante: normalized.student,
    registro: normalized.student,
    cedula: canonical,
    periodoId: normalized.student.periodoId,
    periodoLabel: normalized.student.periodoLabel,
    coincidencias: 1,
    fuente: 'FIREBASE_UTET',
    lecturaDirecta: true,
    mensaje: normalized.complete
      ? 'Estudiante encontrado correctamente en Firebase UTET.'
      : 'El estudiante existe en Firebase UTET, pero sus datos académicos están incompletos.'
  };
}

export const __test = Object.freeze({
  parsePayload,
  minimumStudent
});
