/* Respaldo académico de Firebase UTET.
 * Consulta exclusivamente la hoja Estudiantes mediante Apps Script.
 * Nunca consulta requisitos, notas, matrículas ni resoluciones.
 */
import {
  getDocument,
  normalizeCedula,
  periodSignature,
  text
} from './firestore-fixed.js';

const CONFIG_TTL_MS = 5 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 10000;
let cachedConfig = null;
let cachedUntil = 0;

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

function parseJson(value) {
  if (!value) return {};
  if (typeof value === 'object') return value;
  try {
    const parsed = JSON.parse(text(value));
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (_error) {
    return {};
  }
}

function firstEnv(env, names) {
  for (const name of names) {
    const value = text(env && env[name]);
    if (value) return value;
  }
  return '';
}

async function serviceDocument(env) {
  const ids = ['requisitos', 'google_sheets_requisitos', 'sheets_requisitos', 'REQUISITOS'];
  for (const id of ids) {
    try {
      const document = await getDocument('TITULOS', 'servicios', id, env);
      if (document) return document;
    } catch (_error) {
      // La contingencia no debe fallar por no existir un documento opcional.
    }
  }
  return null;
}

async function resolveConfig(env) {
  if (cachedConfig && cachedUntil > Date.now()) return cachedConfig;

  const configured = {
    url: firstEnv(env, [
      'REQUISITOS_SHEETS_URL',
      'REQUISITOS_APPS_SCRIPT_URL',
      'GOOGLE_SHEETS_REQUISITOS_URL',
      'APPS_SCRIPT_REQUISITOS_URL'
    ]),
    token: firstEnv(env, [
      'REQUISITOS_SHEETS_TOKEN',
      'REQUISITOS_APPS_SCRIPT_TOKEN',
      'GOOGLE_SHEETS_REQUISITOS_TOKEN'
    ]),
    spreadsheetId: firstEnv(env, [
      'REQUISITOS_SHEETS_ID',
      'REQUISITOS_SPREADSHEET_ID',
      'GOOGLE_SHEETS_REQUISITOS_ID'
    ])
  };

  if (!configured.url) {
    const service = await serviceDocument(env);
    if (service) {
      configured.url = text(flexible(service, [
        'endpoint', 'url', 'webAppUrl', 'scriptUrl', 'appsScriptUrl'
      ]));
      configured.token = configured.token || text(flexible(service, [
        'secreto', 'token', 'credencial', 'apiKey'
      ]));
      configured.spreadsheetId = configured.spreadsheetId || text(flexible(service, [
        'spreadsheetId', 'sheetId', 'idHoja', 'documentoId'
      ]));
    }
  }

  cachedConfig = configured;
  cachedUntil = Date.now() + CONFIG_TTL_MS;
  return configured;
}

function normalizeFastStudent(result, cedula) {
  const envelope = result && typeof result === 'object'
    ? (result.estudiante || result.registro || result.data || result.resultado || result)
    : {};
  const payload = parseJson(flexible(envelope, ['payloadJson', 'payload', 'datosJson']));
  const row = { ...payload, ...(envelope || {}) };
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
  const found = result && result.encontrado !== false && Boolean(names || career || periodId);

  if (!found) {
    return {
      ok: true,
      encontrado: false,
      existe: false,
      datosCompletos: false,
      cedula,
      numeroIdentificacion: cedula,
      fuente: 'GOOGLE_SHEETS_ESTUDIANTES',
      mensaje: 'No encontramos un estudiante con esa cédula en la hoja Estudiantes.'
    };
  }

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
    fuente: 'GOOGLE_SHEETS_ESTUDIANTES'
  };
  const complete = Boolean(names && career && periodId);

  return {
    ok: true,
    encontrado: true,
    existe: true,
    habilitado: complete,
    datosCompletos: complete,
    estudiante: student,
    registro: student,
    cedula,
    periodoId: periodId,
    periodoLabel: periodLabel,
    fuente: 'GOOGLE_SHEETS_ESTUDIANTES',
    lecturaRespaldo: true,
    mensaje: complete
      ? 'Datos académicos recuperados desde el respaldo institucional.'
      : 'El respaldo encontró al estudiante, pero sus datos académicos están incompletos.'
  };
}

export async function getStudentFromSheets(cedula, env) {
  const canonical = normalizeCedula(cedula);
  if (!canonical) throw new Error('No se recibió una cédula válida para Google Sheets.');
  const config = await resolveConfig(env);
  if (!config.url) {
    const error = new Error('El respaldo de Google Sheets no está configurado.');
    error.code = 'SHEETS_NOT_CONFIGURED';
    throw error;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(config.url, {
      method: 'POST',
      redirect: 'follow',
      cache: 'no-store',
      headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
      body: JSON.stringify({
        action: 'consultar_estudiante_rapido',
        accion: 'consultar_estudiante_rapido',
        source: 'titulos-estudiantes',
        token: config.token,
        spreadsheetId: config.spreadsheetId,
        sheetName: 'Estudiantes',
        cedula: canonical,
        numeroIdentificacion: canonical
      }),
      signal: controller.signal
    });
    const body = await response.text();
    let json;
    try {
      json = body ? JSON.parse(body) : {};
    } catch (_error) {
      throw new Error('Google Sheets respondió en un formato no válido.');
    }
    if (!response.ok || json.ok === false) {
      throw new Error(text(json.message || json.mensaje || json.error) || `Google Sheets respondió HTTP ${response.status}.`);
    }
    return normalizeFastStudent(json, canonical);
  } catch (error) {
    if (error && error.name === 'AbortError') {
      throw new Error('La consulta de respaldo en Google Sheets excedió el tiempo máximo.');
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export const __test = Object.freeze({
  normalizeFastStudent
});
