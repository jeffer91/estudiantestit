import { getPublicStatus, runService } from '../_lib/claves.js';
import {
  corsHeaders,
  jsonReply,
  normalizeAction,
  readJson,
  rejectUnknownOrigin,
  role,
  text
} from '../_lib/http.js';

const STUDENT = new Set([
  'PING', 'CONFIGURACION_PUBLICA', 'CONSULTAR_ENVIO_CEDULA',
  'VERIFICAR_ENVIO', 'ENVIO_ESTUDIANTE'
]);
const COORDINATOR = new Set([
  'PING', 'CONFIGURACION_PUBLICA', 'LISTAR_COORDINADORES',
  'LISTAR_ENVIOS_COORDINADOR', 'LISTAR_ENVIOS_POR_CARRERA',
  'VERIFICAR_ENVIO', 'CONSULTAR_ENVIO_CEDULA',
  'APROBAR_ENVIO_COORDINADOR', 'DEVOLVER_ENVIO_COORDINADOR',
  'GUARDAR_REVISION_COORDINADOR', 'GUARDAR_RESOLUCION',
  'MOVER_DEVUELTO_COORDINADOR', 'GUARDAR_LOG'
]);
const ADMIN = new Set([
  ...STUDENT,
  ...COORDINATOR,
  'RESUMEN_ADMINISTRADOR', 'LISTAR_BASE_ESTUDIANTES',
  'GUARDAR_COORDINADOR', 'ACTUALIZAR_COORDINADOR',
  'CAMBIAR_ESTADO_COORDINADOR', 'ASIGNAR_CARRERA',
  'SINCRONIZAR_COORDINADORES', 'ADMIN_DEVOLVER_TITULOS',
  'ADMIN_ELIMINAR_TITULOS', 'LISTAR_PENDIENTES_SYNC',
  'LISTAR_HISTORIAL_REPARACIONES', 'LISTAR_LOGS',
  'ANALIZAR_GOOGLE_SHEETS', 'CORREGIR_GOOGLE_SHEETS',
  'CONSULTAR_ESTUDIANTE'
]);

const READ_BY_ID = new Set(['VERIFICAR_ENVIO', 'CONSULTAR_ENVIO_CEDULA']);
const WRITE_ACTIONS = new Set([
  'ENVIO_ESTUDIANTE', 'APROBAR_ENVIO_COORDINADOR',
  'DEVOLVER_ENVIO_COORDINADOR', 'GUARDAR_REVISION_COORDINADOR',
  'GUARDAR_RESOLUCION', 'MOVER_DEVUELTO_COORDINADOR',
  'ADMIN_DEVOLVER_TITULOS', 'ADMIN_ELIMINAR_TITULOS'
]);
const CACHE_TTL_MS = 2 * 60 * 1000;
const CACHE_LIMIT = 400;
const verificationCache = new Map();
const verificationInflight = new Map();

function allowed(userRole, action) {
  return userRole === 'admin'
    ? ADMIN.has(action)
    : userRole === 'coordinator'
      ? COORDINATOR.has(action)
      : STUDENT.has(action);
}

function publicService(status, key) {
  const list = Array.isArray(status.servicios) ? status.servicios : [];
  return list.find((item) => String(item.clave || item.key || '').toUpperCase() === key) || null;
}

function normalizeCedula(value) {
  const digits = text(value).replace(/\D/g, '');
  if (digits.length === 9) return '0' + digits;
  return digits.length === 10 ? digits : '';
}

function verificationKey(payload) {
  const cedula = normalizeCedula(
    payload.cedula || payload.numeroIdentificacion || payload.identificacion
  );
  const period = text(payload.periodoId || payload.periodo || payload.periodoLabel);
  return cedula ? cedula + '|' + period : '';
}

function getCached(key) {
  const item = verificationCache.get(key);
  if (!item) return null;
  if (item.expiresAt <= Date.now()) {
    verificationCache.delete(key);
    return null;
  }
  return { ...item.value, cache: 'worker' };
}

function setCached(key, value) {
  if (!key) return;
  if (verificationCache.size >= CACHE_LIMIT) {
    const oldest = verificationCache.keys().next().value;
    if (oldest) verificationCache.delete(oldest);
  }
  verificationCache.set(key, {
    value,
    expiresAt: Date.now() + CACHE_TTL_MS
  });
}

function clearVerificationCache() {
  verificationCache.clear();
  verificationInflight.clear();
}

async function executeService(env, action, method, payload, userRole) {
  const result = await runService(env, 'TITULOS', action, method, payload, userRole);
  return result.respuesta || result.data || result;
}

async function verifyWithCache(env, action, method, payload, userRole) {
  const key = verificationKey(payload);
  if (!key) return executeService(env, action, method, payload, userRole);

  const cached = getCached(key);
  if (cached) return cached;
  if (verificationInflight.has(key)) return verificationInflight.get(key);

  const task = executeService(env, action, method, payload, userRole)
    .then((result) => {
      setCached(key, result);
      return result;
    })
    .finally(() => {
      verificationInflight.delete(key);
    });

  verificationInflight.set(key, task);
  return task;
}

export async function onRequest({ request, env }) {
  const bad = rejectUnknownOrigin(request);
  if (bad) return bad;

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(request) });
  }
  if (request.method !== 'POST') {
    return jsonReply(request, { ok: false, mensaje: 'Método no permitido.' }, 405);
  }

  try {
    const input = await readJson(request);
    const action = normalizeAction(input.accion || input.action || input.tipo);
    const userRole = role(request);

    if (!action) throw new Error('No se indicó una acción.');
    if (!allowed(userRole, action)) {
      return jsonReply(request, {
        ok: false,
        mensaje: 'Acción no permitida para esta pantalla.'
      }, 403);
    }

    if (action === 'CONFIGURACION_PUBLICA') {
      const item = publicService(await getPublicStatus(env), 'TITULOS');
      if (!item) throw new Error('TITULOS no está configurado en Claves.');
      return jsonReply(request, {
        ok: true,
        activo: item.activo === true,
        nombre: item.nombre || 'RESPALDO TITULOS APP',
        version: item.version || '',
        estado: item.estado || '',
        mensaje: item.mensaje || '',
        origenConfig: 'claves'
      });
    }

    const nested = input.datos && typeof input.datos === 'object' ? input.datos : {};
    const payload = { ...input, ...nested };
    delete payload.token;
    delete payload.acceso;

    let result;
    if (READ_BY_ID.has(action)) {
      result = await verifyWithCache(
        env,
        action,
        input.metodo || 'POST',
        payload,
        userRole
      );
    } else {
      result = await executeService(
        env,
        action,
        input.metodo || 'POST',
        payload,
        userRole
      );
      if (WRITE_ACTIONS.has(action)) clearVerificationCache();
    }

    return jsonReply(request, result);
  } catch (error) {
    return jsonReply(request, {
      ok: false,
      servicio: 'TITULOS',
      mensaje: error.message || String(error)
    }, 502);
  }
}
