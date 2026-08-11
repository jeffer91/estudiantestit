/* Consulta de identidad académica desde Firebase UTET.
 * Fuente principal: Estudiante/{cedula}.
 * El período se resuelve desde matriculas y periodos cuando ya no viene
 * duplicado dentro del documento maestro del estudiante.
 */
import {
  getDocument,
  listCollection,
  normalizeCedula,
  periodSignature,
  queryField,
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

function scalar(value, nestedNames = []) {
  if (value === null || value === undefined) return '';
  if (typeof value !== 'object') return text(value);
  const nested = flexible(value, nestedNames.length ? nestedNames : [
    'id', 'periodoId', 'codigo', 'nombre', 'label', 'periodoLabel', 'periodoNombre'
  ]);
  return nested === undefined ? '' : scalar(nested);
}

function referenceId(value) {
  const raw = scalar(value);
  if (!raw) return '';
  const clean = raw.replace(/\/+$/, '');
  return clean.includes('/') ? clean.split('/').pop() : clean;
}

function yes(value) {
  return value === true || ['1', 'TRUE', 'SI', 'SÍ', 'YES', 'ACTIVO', 'ACTIVA'].includes(text(value).toUpperCase());
}

function active(row) {
  if (!row || typeof row !== 'object') return false;
  if (row.eliminado === true || yes(flexible(row, ['eliminado', 'deleted'])) && row.eliminado !== false) {
    return false;
  }
  const status = text(flexible(row, [
    'estadoMatricula', 'estado', 'Estado', 'status', 'activo'
  ])).toUpperCase();
  if (!status) return true;
  return !['FALSE', '0', 'NO', 'INACTIVO', 'INACTIVA', 'RETIRADO', 'ANULADO', 'CANCELADO', 'ELIMINADO'].includes(status);
}

function principal(row) {
  return Boolean(row && (
    row.principal === true ||
    row.esPrincipal === true ||
    text(row.tipo).toUpperCase() === 'PRINCIPAL' ||
    text(row.estado).toUpperCase() === 'PRINCIPAL'
  ));
}

function periodInfo(row) {
  row = row || {};
  const idRaw = scalar(flexible(row, [
    'periodoId', 'periodId', 'periodoAcademicoId', 'idPeriodo',
    'codigoPeriodo', 'periodoCodigo', 'periodoCanonicoId'
  ]), ['id', 'codigo', 'periodoId']);
  const labelRaw = scalar(flexible(row, [
    'periodoLabel', 'periodoNombre', 'nombrePeriodo', 'periodoAcademico',
    'periodo', 'nombre', 'label'
  ]), ['nombre', 'label', 'periodoLabel', 'periodoNombre', 'id']);
  const reference = flexible(row, [
    'periodoRef', 'periodoReferencia', 'periodoDocumento', 'periodoReference'
  ]);
  const refId = referenceId(reference);
  const source = idRaw || labelRaw || refId;
  const id = periodSignature(source);
  return {
    id,
    label: labelRaw || idRaw || refId || id,
    rawId: idRaw || refId
  };
}

function eventTime(row) {
  const fields = [
    'updatedAt', 'actualizadoEn', 'ultimaSincronizacion', 'fechaActualizacion',
    'fechaMatricula', 'createdAt', '_updateTime', '_createTime'
  ];
  for (const field of fields) {
    const parsed = Date.parse(row && row[field] || '');
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function dedupe(rows) {
  const map = new Map();
  (Array.isArray(rows) ? rows : []).forEach((row, index) => {
    if (!row || typeof row !== 'object') return;
    const key = text(row.id || row._id || row._docId) || `fila_${index}`;
    if (!map.has(key)) map.set(key, row);
  });
  return [...map.values()];
}

function chooseEnrollment(rows) {
  const all = dedupe(rows);
  const enabled = all.filter(active);
  const candidates = enabled.length ? enabled : all;
  candidates.sort((left, right) => {
    const periodLeft = periodInfo(left).id;
    const periodRight = periodInfo(right).id;
    if (periodLeft !== periodRight) {
      return periodRight.localeCompare(periodLeft, 'es', { numeric: true });
    }
    return eventTime(right) - eventTime(left);
  });
  return candidates[0] || null;
}

async function directStudentDocument(cedula, env) {
  const canonical = normalizeCedula(cedula);
  if (!canonical) return null;

  /* Estructura vigente. */
  const current = await getDocument('UTET', 'Estudiante', canonical, env);
  if (current) return current;

  /* Compatibilidad con la colección anterior durante la transición. */
  const legacy = await getDocument('UTET', 'Estudiantes', canonical, env);
  if (legacy) return legacy;

  if (canonical.startsWith('0')) {
    const shortId = canonical.slice(1);
    const currentShort = await getDocument('UTET', 'Estudiante', shortId, env);
    if (currentShort) return currentShort;
    return getDocument('UTET', 'Estudiantes', shortId, env);
  }
  return null;
}

async function enrollmentForStudent(cedula, env) {
  const canonical = normalizeCedula(cedula);
  if (!canonical) return null;
  const variants = canonical.startsWith('0') ? [canonical, canonical.slice(1)] : [canonical];
  const fields = [
    'cedula', 'numeroIdentificacion', 'estudianteCedula', 'cedulaEstudiante',
    'estudianteId', 'idEstudiante', 'firebaseDocumentId'
  ];

  for (const field of fields) {
    const rows = [];
    for (const value of variants) {
      const found = await queryField('UTET', 'matriculas', field, value, 50, env);
      rows.push(...found);
    }
    if (rows.length) return chooseEnrollment(rows);
  }
  return null;
}

async function periodDocumentById(id, env) {
  const candidate = referenceId(id);
  if (!candidate) return null;
  const direct = await getDocument('UTET', 'periodos', candidate, env);
  if (direct) return direct;

  const rows = await listCollection('UTET', 'periodos', { maxDocuments: 300 }, env);
  const signature = periodSignature(candidate);
  return rows.find((row) => {
    const info = periodInfo(row);
    return text(row.id) === candidate ||
      Boolean(signature && info.id && info.id === signature);
  }) || null;
}

async function currentPeriod(env) {
  const rows = await listCollection('UTET', 'periodos', { maxDocuments: 300 }, env);
  const enabled = rows.filter(active);
  const candidates = enabled.length ? enabled : rows;
  candidates.sort((left, right) => {
    if (principal(left) !== principal(right)) return principal(right) ? 1 : -1;
    const a = periodInfo(left).id;
    const b = periodInfo(right).id;
    if (a !== b) return b.localeCompare(a, 'es', { numeric: true });
    return eventTime(right) - eventTime(left);
  });
  return candidates[0] || null;
}

async function resolvePeriod(document, cedula, env) {
  const direct = periodInfo(document);
  if (direct.id) return { ...direct, source: 'ESTUDIANTE' };

  const enrollment = await enrollmentForStudent(cedula, env);
  if (enrollment) {
    let info = periodInfo(enrollment);
    if (info.rawId) {
      const periodDocument = await periodDocumentById(info.rawId, env);
      if (periodDocument) {
        const detailed = periodInfo(periodDocument);
        info = {
          id: detailed.id || info.id,
          label: detailed.label || info.label,
          rawId: info.rawId
        };
      }
    }
    if (info.id) return { ...info, source: 'MATRICULAS_UTET' };
  }

  const fallback = await currentPeriod(env);
  const fallbackInfo = periodInfo(fallback);
  return { ...fallbackInfo, source: fallbackInfo.id ? 'PERIODOS_UTET' : '' };
}

function minimumStudent(document, cedula, period, includePhone) {
  const row = mergedDocument(document);
  const names = text(flexible(row, ['nombres', 'Nombres', 'nombreCompleto', 'Nombre']));
  const career = text(flexible(row, [
    'nombreCarreraActual', 'NombreCarreraActual',
    'NombreCarrera', 'nombreCarrera', 'carrera', 'Carrera'
  ]));
  const careerCode = text(flexible(row, [
    'codigoCarreraActual', 'CodigoCarreraActual',
    'CodigoCarrera', 'codigoCarrera', 'carreraCodigo'
  ]));
  const phone = text(flexible(row, ['celular', 'Celular', 'telefono', 'Teléfono']));
  const sede = text(flexible(row, ['sede', 'Sede']));
  const periodId = text(period && period.id);
  const periodLabel = text(period && period.label) || periodId;

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
    codigoCarrera: careerCode,
    CodigoCarrera: careerCode,
    periodoId: periodId,
    periodId,
    periodoLabel: periodLabel,
    periodo: periodLabel,
    sede,
    Sede: sede,
    fuente: 'FIREBASE_UTET',
    fuentePeriodo: text(period && period.source)
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
  if (!document || document.eliminado === true) {
    return {
      ok: true,
      encontrado: false,
      existe: false,
      datosCompletos: false,
      cedula: canonical,
      numeroIdentificacion: canonical,
      mensaje: 'No encontramos un estudiante activo con esa cédula en Firebase UTET.',
      fuente: 'FIREBASE_UTET',
      lecturaDirecta: true
    };
  }

  const period = await resolvePeriod(document, canonical, env);
  const normalized = minimumStudent(document, canonical, period, options.includePhone === true);
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
    fuentePeriodo: normalized.student.fuentePeriodo,
    lecturaDirecta: true,
    mensaje: normalized.complete
      ? 'Estudiante encontrado correctamente en Firebase UTET.'
      : 'El estudiante existe en Firebase UTET, pero sus datos académicos están incompletos.'
  };
}

export const __test = Object.freeze({
  parsePayload,
  minimumStudent,
  periodInfo,
  chooseEnrollment
});
