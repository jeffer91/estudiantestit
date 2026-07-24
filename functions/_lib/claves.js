/* Fachada compatible: Títulos, Requisitos e IA usan Firebase autenticado. */

import { listCollection, nowIso, setDocument, slug, text } from './firestore.js';
import { generateWithProvider, listProviders, saveProvider, toggleProvider } from './ia-firebase.js';
import { getStudentBasic, pullRequisitos } from './requisitos-firebase.js';
import { executeTitulosAction, publicTitleConfiguration } from './titulos-firebase.js';

const PRIVATE_STUDENT_FIELDS = new Set([
  'celular',
  'telefono',
  'telefonocelular',
  'phone',
  'mobile',
  'correoinstitucional',
  'correopersonal',
  'correo',
  'email',
  'emailinstitucional',
  'emailpersonal'
]);

function normalizedField(value) {
  return text(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

function sanitizeTitleResult(value, userRole, seen = new WeakSet()) {
  if (userRole === 'admin' || value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map((item) => sanitizeTitleResult(item, userRole, seen));
  if (typeof value !== 'object') return value;
  if (seen.has(value)) return null;
  seen.add(value);

  const output = {};
  for (const [key, item] of Object.entries(value)) {
    if (PRIVATE_STUDENT_FIELDS.has(normalizedField(key))) continue;
    output[key] = sanitizeTitleResult(item, userRole, seen);
  }
  return output;
}

function serviceActive(service) {
  return service && service.activo !== false && text(service.estado || 'ACTIVO').toUpperCase() !== 'INACTIVO';
}

function sanitizeService(service) {
  const output = { ...(service || {}) };
  output.secretoConfigurado = Boolean(text(output.secreto || output.credencial || output.token));
  delete output.secreto;
  delete output.credencial;
  delete output.token;
  return output;
}

function sanitizeProvider(provider) {
  const output = { ...(provider || {}) };
  output.apiKeyConfigurada = Boolean(text(output.credencial || output.apiKey || output.token));
  delete output.credencial;
  delete output.apiKey;
  delete output.token;
  return output;
}

async function listServices(includeSecrets = false, env) {
  const rows = await listCollection('TITULOS', 'servicios', { maxDocuments: 500 }, env);
  const services = rows.map((row) => {
    const id = slug(row.id || row.clave || row.nombre);
    const secret = text(row.secreto || row.credencial || row.token);
    const output = {
      ...row,
      id,
      clave: text(row.clave || id).toUpperCase(),
      key: text(row.clave || id).toUpperCase(),
      nombre: text(row.nombre || row.clave || id),
      tipo: text(row.tipo || 'firebase'),
      endpoint: text(row.endpoint),
      spreadsheetId: text(row.spreadsheetId),
      activo: serviceActive(row),
      estado: serviceActive(row) ? 'ACTIVO' : 'INACTIVO',
      timeoutMs: Number(row.timeoutMs || 45000),
      version: text(row.version || 'firebase-2'),
      mensaje: text(row.mensaje),
      secretoConfigurado: Boolean(secret)
    };
    if (includeSecrets) output.secreto = secret;
    return output;
  });

  const defaults = [
    {
      id: 'titulos',
      clave: 'TITULOS',
      key: 'TITULOS',
      nombre: 'Firebase Títulos',
      tipo: 'firebase-iam',
      endpoint: 'firebase://titulos-ec2fa',
      spreadsheetId: '',
      activo: true,
      estado: 'ACTIVO',
      timeoutMs: 45000,
      version: 'firebase-2',
      mensaje: 'Operación autenticada sobre titulos-ec2fa.',
      secretoConfigurado: false
    },
    {
      id: 'requisitos',
      clave: 'REQUISITOS',
      key: 'REQUISITOS',
      nombre: 'Firebase UTET',
      tipo: 'firebase-iam',
      endpoint: 'firebase://utet-4387a',
      spreadsheetId: '',
      activo: true,
      estado: 'ACTIVO',
      timeoutMs: 30000,
      version: 'firebase-2',
      mensaje: 'Consulta mínima autenticada de estudiantes en utet-4387a.',
      secretoConfigurado: false
    }
  ];

  for (const fallback of defaults) {
    const index = services.findIndex((item) => item.clave === fallback.clave);
    if (index >= 0) {
      const internalSecret = includeSecrets ? text(services[index].secreto) : '';
      services[index] = {
        ...services[index],
        ...fallback,
        id: services[index].id || fallback.id,
        ...(includeSecrets ? { secreto: internalSecret } : {})
      };
    } else {
      services.push({ ...fallback, ...(includeSecrets ? { secreto: '' } : {}) });
    }
  }
  return services;
}

async function saveService(service = {}, env) {
  const key = text(service.clave || service.key || service.id || service.nombre).toUpperCase();
  const id = slug(service.id || key);
  if (!id || !key) throw new Error('El servicio necesita una clave.');
  const current = (await listServices(true, env)).find((item) => item.id === id || item.clave === key) || {};
  const secret = text(service.secreto || service.credencial || service.token) || current.secreto || '';
  const active = service.activo === false || text(service.estado).toUpperCase() === 'INACTIVO' ? false : true;

  const saved = await setDocument('TITULOS', 'servicios', id, {
    clave: key,
    nombre: text(service.nombre || current.nombre || key),
    tipo: text(service.tipo || current.tipo || 'firebase-iam'),
    endpoint: text(service.endpoint || current.endpoint),
    secreto: secret,
    spreadsheetId: text(service.spreadsheetId || current.spreadsheetId),
    estado: active ? 'ACTIVO' : 'INACTIVO',
    activo: active,
    timeoutMs: Number(service.timeoutMs || current.timeoutMs || 45000),
    version: text(service.version || current.version || 'firebase-2'),
    mensaje: text(service.mensaje || current.mensaje),
    actualizadoEn: nowIso()
  }, { merge: true }, env);
  return {
    ok: true,
    servicio: sanitizeService(saved),
    service: sanitizeService(saved),
    mensaje: 'Servicio guardado en Firebase Títulos.'
  };
}

export async function requestClaves(env, action, data = {}, timeoutMs) {
  void timeoutMs;
  const normalized = text(action).toUpperCase();

  if (normalized === 'LISTAR_SERVICIOS_PUBLICOS') {
    const servicios = (await listServices(false, env)).filter((item) => item.activo).map(sanitizeService);
    return { ok: true, servicios, total: servicios.length, origen: 'FIREBASE_TITULOS_IAM' };
  }
  if (normalized === 'LISTAR_SERVICIOS_ADMIN') {
    const servicios = (await listServices(false, env)).map(sanitizeService);
    return { ok: true, servicios, registros: servicios, total: servicios.length, origen: 'FIREBASE_TITULOS_IAM' };
  }
  if (normalized === 'GUARDAR_SERVICIO') {
    return saveService(data.servicio || data.service || data, env);
  }
  if (normalized === 'CONSULTAR_ESTUDIANTE_REQUISITOS' || normalized === 'CONSULTAR_ACCESO_ESTUDIANTE') {
    return getStudentBasic(data.cedula || data.numeroIdentificacion || data.identificacion, {
      periodoId: data.periodoId || data.periodo || data.periodoLabel,
      includePhone: data.includePhone === true || data.rol === 'admin'
    }, env);
  }
  if (normalized === 'EJECUTAR_SERVICIO') {
    return runService(
      env,
      data.servicio,
      data.accionServicio,
      data.metodo,
      data.payload || {},
      data.rol,
      timeoutMs
    );
  }
  if (normalized === 'LISTAR_PROVEEDORES_IA_PUBLICOS') {
    const proveedores = (await listProviders(false, env)).map(sanitizeProvider);
    return { ok: true, proveedores, total: proveedores.length };
  }
  if (normalized === 'LISTAR_PROVEEDORES_IA_ADMIN') {
    const proveedores = (await listProviders(true, env)).map(sanitizeProvider);
    return { ok: true, proveedores, total: proveedores.length };
  }
  if (normalized === 'GUARDAR_PROVEEDOR_IA') {
    const proveedor = await saveProvider(data.proveedor || data.provider || data, env);
    return { ok: true, proveedor: sanitizeProvider(proveedor), data: sanitizeProvider(proveedor) };
  }
  if (normalized === 'CAMBIAR_ESTADO_PROVEEDOR_IA') {
    const proveedor = await toggleProvider(data.providerId || data.proveedorId, data.activo === true, env);
    return { ok: true, proveedor: sanitizeProvider(proveedor), providerId: proveedor.id };
  }
  if (normalized === 'GENERAR_IA') {
    return generateWithProvider(data.providerId || data.proveedorId, data.prompt, data.options || {}, env);
  }

  throw new Error('Acción no reconocida en Firebase: ' + action);
}

export async function runService(env, service, action, method, payload, role, timeoutMs) {
  void method;
  void timeoutMs;
  const normalizedService = text(service).toUpperCase();
  const userRole = text(role || 'student').toLowerCase();

  if (normalizedService === 'TITULOS') {
    const result = await executeTitulosAction(action, payload || {}, userRole, env);
    return sanitizeTitleResult(result, userRole);
  }
  if (normalizedService === 'REQUISITOS') {
    return pullRequisitos(action, { ...(payload || {}), rol: userRole }, env);
  }
  throw new Error('Servicio Firebase no implementado: ' + service);
}

export async function getPublicStatus(env) {
  return requestClaves(env, 'LISTAR_SERVICIOS_PUBLICOS', {});
}

export async function listAiProviders(env, includeInactive = false) {
  return listProviders(includeInactive, env);
}

export async function generateAi(env, providerId, prompt, options) {
  return generateWithProvider(providerId, prompt, { ...(options || {}), allowInactive: true }, env);
}

export async function saveAiProvider(env, provider) {
  const saved = await saveProvider(provider || {}, env);
  return { ok: true, proveedor: sanitizeProvider(saved), data: sanitizeProvider(saved) };
}

export async function toggleAiProvider(env, providerId, active) {
  return toggleProvider(providerId, active === true, env);
}

export async function getTitlePublicConfiguration(env) {
  return publicTitleConfiguration(env);
}
