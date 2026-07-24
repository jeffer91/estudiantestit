/* Fachada compatible: ahora Claves, Títulos, Requisitos e IA usan Firebase. */

import { listCollection, nowIso, setDocument, slug, text } from './firestore.js';
import { generateWithProvider, listProviders, saveProvider, toggleProvider } from './ia-firebase.js';
import { getStudentBasic, pullRequisitos } from './requisitos-firebase.js';
import { executeTitulosAction, publicTitleConfiguration } from './titulos-firebase.js';

function serviceActive(service) {
  return service && service.activo !== false && text(service.estado || 'ACTIVO').toUpperCase() !== 'INACTIVO';
}

async function listServices(includeSecrets = false) {
  const rows = await listCollection('TITULOS', 'servicios', { maxDocuments: 500 });
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
      version: text(row.version || 'firebase-1'),
      mensaje: text(row.mensaje),
      secretoConfigurado: Boolean(secret)
    };
    if (includeSecrets) output.secreto = secret;
    else delete output.secreto;
    return output;
  });

  const defaults = [
    {
      id: 'titulos',
      clave: 'TITULOS',
      key: 'TITULOS',
      nombre: 'Firebase Títulos',
      tipo: 'firebase',
      endpoint: 'firebase://titulos-ec2fa',
      spreadsheetId: '',
      activo: true,
      estado: 'ACTIVO',
      timeoutMs: 45000,
      version: 'firebase-1',
      mensaje: 'Operación directa sobre titulos-ec2fa.',
      secretoConfigurado: false
    },
    {
      id: 'requisitos',
      clave: 'REQUISITOS',
      key: 'REQUISITOS',
      nombre: 'Firebase UTET',
      tipo: 'firebase',
      endpoint: 'firebase://utet-4387a',
      spreadsheetId: '',
      activo: true,
      estado: 'ACTIVO',
      timeoutMs: 30000,
      version: 'firebase-1',
      mensaje: 'Consulta mínima de estudiantes en utet-4387a.',
      secretoConfigurado: false
    }
  ];

  for (const fallback of defaults) {
    const index = services.findIndex((item) => item.clave === fallback.clave);
    if (index >= 0) {
      services[index] = {
        ...services[index],
        ...fallback,
        id: services[index].id || fallback.id
      };
      if (includeSecrets) services[index].secreto = '';
    } else {
      services.push({ ...fallback, ...(includeSecrets ? { secreto: '' } : {}) });
    }
  }
  return services;
}

async function saveService(service = {}) {
  const key = text(service.clave || service.key || service.id || service.nombre).toUpperCase();
  const id = slug(service.id || key);
  if (!id || !key) throw new Error('El servicio necesita una clave.');
  const current = (await listServices(true)).find((item) => item.id === id || item.clave === key) || {};
  const secret = text(service.secreto || service.credencial || service.token) || current.secreto || '';
  const active = service.activo === false || text(service.estado).toUpperCase() === 'INACTIVO' ? false : true;

  const saved = await setDocument('TITULOS', 'servicios', id, {
    clave: key,
    nombre: text(service.nombre || current.nombre || key),
    tipo: text(service.tipo || current.tipo || 'firebase'),
    endpoint: text(service.endpoint || current.endpoint),
    secreto: secret,
    spreadsheetId: text(service.spreadsheetId || current.spreadsheetId),
    estado: active ? 'ACTIVO' : 'INACTIVO',
    activo: active,
    timeoutMs: Number(service.timeoutMs || current.timeoutMs || 45000),
    version: text(service.version || current.version || 'firebase-1'),
    mensaje: text(service.mensaje || current.mensaje),
    actualizadoEn: nowIso()
  });
  return { ok: true, servicio: saved, service: saved, mensaje: 'Servicio guardado en Firebase Títulos.' };
}

export async function requestClaves(env, action, data = {}, timeoutMs) {
  void env;
  void timeoutMs;
  const normalized = text(action).toUpperCase();

  if (normalized === 'LISTAR_SERVICIOS_PUBLICOS') {
    const servicios = (await listServices(false)).filter((item) => item.activo);
    return { ok: true, servicios, total: servicios.length, origen: 'FIREBASE_TITULOS' };
  }
  if (normalized === 'LISTAR_SERVICIOS_ADMIN') {
    const servicios = await listServices(true);
    return { ok: true, servicios, registros: servicios, total: servicios.length, origen: 'FIREBASE_TITULOS' };
  }
  if (normalized === 'GUARDAR_SERVICIO') {
    return saveService(data.servicio || data.service || data);
  }
  if (normalized === 'CONSULTAR_ESTUDIANTE_REQUISITOS' || normalized === 'CONSULTAR_ACCESO_ESTUDIANTE') {
    return getStudentBasic(data.cedula || data.numeroIdentificacion || data.identificacion, {
      periodoId: data.periodoId || data.periodo || data.periodoLabel,
      includePhone: data.includePhone === true || data.rol === 'admin'
    });
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
    const proveedores = await listProviders(false);
    return { ok: true, proveedores, total: proveedores.length };
  }
  if (normalized === 'LISTAR_PROVEEDORES_IA_ADMIN') {
    const proveedores = await listProviders(true);
    return { ok: true, proveedores, total: proveedores.length };
  }
  if (normalized === 'GUARDAR_PROVEEDOR_IA') {
    const proveedor = await saveProvider(data.proveedor || data.provider || data);
    return { ok: true, proveedor, data: proveedor };
  }
  if (normalized === 'CAMBIAR_ESTADO_PROVEEDOR_IA') {
    const proveedor = await toggleProvider(data.providerId || data.proveedorId, data.activo === true);
    return { ok: true, proveedor, providerId: proveedor.id };
  }
  if (normalized === 'GENERAR_IA') {
    return generateWithProvider(data.providerId || data.proveedorId, data.prompt, data.options || {});
  }

  throw new Error('Acción no reconocida en Firebase: ' + action);
}

export async function runService(env, service, action, method, payload, role, timeoutMs) {
  void env;
  void method;
  void timeoutMs;
  const normalizedService = text(service).toUpperCase();
  if (normalizedService === 'TITULOS') {
    return executeTitulosAction(action, payload || {}, text(role || 'student').toLowerCase());
  }
  if (normalizedService === 'REQUISITOS') {
    return pullRequisitos(action, { ...(payload || {}), rol: role });
  }
  throw new Error('Servicio Firebase no implementado: ' + service);
}

export async function getPublicStatus(env) {
  return requestClaves(env, 'LISTAR_SERVICIOS_PUBLICOS', {});
}

export async function listAiProviders(env, includeInactive = false) {
  void env;
  return listProviders(includeInactive);
}

export async function generateAi(env, providerId, prompt, options) {
  void env;
  return generateWithProvider(providerId, prompt, { ...(options || {}), allowInactive: true });
}

export async function saveAiProvider(env, provider) {
  void env;
  const saved = await saveProvider(provider || {});
  return { ok: true, proveedor: saved, data: saved };
}

export async function toggleAiProvider(env, providerId, active) {
  void env;
  return toggleProvider(providerId, active === true);
}

export async function getTitlePublicConfiguration() {
  return publicTitleConfiguration();
}
