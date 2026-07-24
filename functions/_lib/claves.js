/* Fachada compatible: Títulos, Requisitos e IA usan Firebase autenticado. */

import { text } from './firestore.js';
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

function sanitizeTitleResult(value, userRole, seen = new WeakMap()) {
  if (userRole === 'admin' || value === null || value === undefined) return value;
  if (typeof value !== 'object') return value;
  if (seen.has(value)) return seen.get(value);

  if (Array.isArray(value)) {
    const output = [];
    seen.set(value, output);
    for (const item of value) output.push(sanitizeTitleResult(item, userRole, seen));
    return output;
  }

  const output = {};
  seen.set(value, output);
  for (const [key, item] of Object.entries(value)) {
    if (PRIVATE_STUDENT_FIELDS.has(normalizedField(key))) continue;
    output[key] = sanitizeTitleResult(item, userRole, seen);
  }
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

async function serviceStatuses(env) {
  const titleConfig = await publicTitleConfiguration(env);
  return [
    {
      id: 'titulos',
      clave: 'TITULOS',
      key: 'TITULOS',
      nombre: 'Firebase Títulos',
      tipo: 'firebase-iam',
      endpoint: 'firebase://titulos-ec2fa',
      projectId: 'titulos-ec2fa',
      activo: titleConfig.activo !== false,
      estado: text(titleConfig.estado || (titleConfig.activo === false ? 'INACTIVO' : 'ACTIVO')),
      timeoutMs: 45000,
      version: text(titleConfig.version || 'firebase-3'),
      mensaje: text(titleConfig.mensaje || 'Operación autenticada sobre Firebase Títulos.'),
      soloLectura: false,
      configuracion: 'cloudflare-secrets',
      secretoConfigurado: true
    },
    {
      id: 'requisitos',
      clave: 'REQUISITOS',
      key: 'REQUISITOS',
      nombre: 'Firebase UTET',
      tipo: 'firebase-iam',
      endpoint: 'firebase://utet-4387a',
      projectId: 'utet-4387a',
      activo: true,
      estado: 'ACTIVO',
      timeoutMs: 30000,
      version: 'firebase-3',
      mensaje: 'Consulta mínima autenticada de estudiantes en Firebase UTET.',
      soloLectura: true,
      configuracion: 'cloudflare-secrets',
      secretoConfigurado: true
    }
  ];
}

export async function requestClaves(env, action, data = {}, timeoutMs) {
  void timeoutMs;
  const normalized = text(action).toUpperCase();

  if (normalized === 'LISTAR_SERVICIOS_PUBLICOS' || normalized === 'LISTAR_SERVICIOS_ADMIN') {
    const servicios = await serviceStatuses(env);
    return {
      ok: true,
      servicios,
      registros: servicios,
      total: servicios.length,
      origen: 'FIREBASE_IAM_CLOUDFLARE'
    };
  }
  if (normalized === 'GUARDAR_SERVICIO') {
    throw new Error(
      'Títulos y UTET se configuran mediante secretos cifrados de Cloudflare Pages; no se guardan endpoints ni tokens desde el navegador.'
    );
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
