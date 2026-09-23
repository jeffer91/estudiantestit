import { onRequest } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

import * as accesoEstudiante from './api/acceso-estudiante.js';
import * as adminFlujo from './api/admin-flujo.js';
import * as adminTrabajo from './api/admin-trabajo-titulacion.js';
import * as claves from './api/claves.js';
import * as estadisticas from './api/estadisticas.js';
import * as historialTitulos from './api/historial-titulos.js';
import * as ia from './api/ia.js';
import * as investigadores from './api/investigadores.js';
import * as requisitos from './api/requisitos.js';
import * as sheets from './api/sheets.js';
import * as titulos from './api/titulos.js';
import * as trabajoTitulacion from './api/trabajo-titulacion.js';

if (!getApps().length) initializeApp();

const TITULOS_FIREBASE_SERVICE_ACCOUNT = defineSecret('TITULOS_FIREBASE_SERVICE_ACCOUNT');
const UTET_FIREBASE_SERVICE_ACCOUNT = defineSecret('UTET_FIREBASE_SERVICE_ACCOUNT');

const ROUTES = new Map([
  ['acceso-estudiante', accesoEstudiante],
  ['admin-flujo', adminFlujo],
  ['admin-trabajo-titulacion', adminTrabajo],
  ['claves', claves],
  ['estadisticas', estadisticas],
  ['historial-titulos', historialTitulos],
  ['ia', ia],
  ['investigadores', investigadores],
  ['requisitos', requisitos],
  ['sheets', sheets],
  ['titulos', titulos],
  ['trabajo-titulacion', trabajoTitulacion]
]);

const ALLOWED_ORIGINS = new Set([
  'https://jeffer91.github.io',
  'http://localhost:5500',
  'http://127.0.0.1:5500',
  'http://localhost:5173',
  'http://127.0.0.1:5173'
]);

function text(value) {
  return String(value === null || value === undefined ? '' : value).trim();
}

function normalizeRole(value) {
  const role = text(value).toUpperCase().replace(/[^A-Z]/g, '');
  if (role === 'ADMIN' || role === 'ADMINISTRADOR') return 'admin';
  if (role === 'COORDINADOR' || role === 'COORDINATOR') return 'coordinator';
  if (role === 'INVESTIGADOR' || role === 'INVESTIGATOR' || role === 'INVESTIGACION') return 'investigator';
  return 'student';
}

function cors(req, extra = {}) {
  const origin = text(req.headers.origin);
  return {
    ...(origin && ALLOWED_ORIGINS.has(origin) ? { 'Access-Control-Allow-Origin': origin } : {}),
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Titulos-App',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
    ...extra
  };
}

function sendJson(req, res, status, data) {
  res.set(cors(req, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  }));
  res.status(status).send(JSON.stringify(data));
}

function runtimeEnv() {
  return {
    TITULOS_FIREBASE_SERVICE_ACCOUNT: TITULOS_FIREBASE_SERVICE_ACCOUNT.value(),
    UTET_FIREBASE_SERVICE_ACCOUNT: UTET_FIREBASE_SERVICE_ACCOUNT.value()
  };
}

async function authContext(req) {
  const raw = text(req.headers.authorization);
  if (!raw) return { role: 'student', authenticated: false, user: null };
  const match = raw.match(/^Bearer\s+(.+)$/i);
  if (!match) throw new Error('Cabecera Authorization no válida.');

  const decoded = await getAuth().verifyIdToken(match[1], true);
  let profile = {};
  try {
    const snap = await getFirestore().collection('usuarios').doc(decoded.uid).get();
    if (snap.exists) profile = snap.data() || {};
  } catch (_error) {
    profile = {};
  }

  const role = normalizeRole(decoded.role || profile.role || profile.rol);
  return {
    role,
    authenticated: true,
    user: {
      uid: decoded.uid,
      email: text(decoded.email),
      nombre: text(profile.nombre || profile.name || decoded.name || decoded.email),
      coordinadorId: text(profile.coordinadorId || profile.idCoordinador),
      carreras: Array.isArray(profile.carreras) ? profile.carreras : [],
      role
    }
  };
}

function routeName(req) {
  const value = text(req.path || req.url || '/')
    .split('?')[0]
    .replace(/^\/+/, '')
    .replace(/^api\//, '');
  return value.split('/')[0] || '';
}

function webUrl(req) {
  const path = text(req.originalUrl || req.url || '/');
  return 'https://firebase-functions.internal' + (path.startsWith('/') ? path : '/' + path);
}

function buildWebRequest(req, auth) {
  const headers = new Headers();
  Object.entries(req.headers || {}).forEach(([key, value]) => {
    if (value === undefined || value === null) return;
    headers.set(key, Array.isArray(value) ? value.join(', ') : String(value));
  });

  const method = text(req.method || 'GET').toUpperCase();
  const init = { method, headers };
  if (!['GET', 'HEAD'].includes(method)) {
    if (req.rawBody && req.rawBody.length) {
      init.body = req.rawBody;
    } else if (req.body !== undefined) {
      init.body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
      if (!headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
    }
  }

  const request = new Request(webUrl(req), init);
  const pathRole = routeName(req) === 'investigadores' && !auth.authenticated
    ? 'investigator'
    : auth.role;

  Object.defineProperty(request, '__verifiedRole', {
    value: pathRole,
    enumerable: false,
    configurable: false
  });
  Object.defineProperty(request, '__verifiedUser', {
    value: auth.user,
    enumerable: false,
    configurable: false
  });
  return request;
}

async function invokeModule(module, request, env) {
  const context = { request, env };
  const method = request.method.toUpperCase();

  if (typeof module.onRequest === 'function') return module.onRequest(context);
  if (method === 'GET' && typeof module.onRequestGet === 'function') return module.onRequestGet(context);
  if (method === 'POST' && typeof module.onRequestPost === 'function') return module.onRequestPost(context);
  if (method === 'OPTIONS' && typeof module.onRequestOptions === 'function') return module.onRequestOptions(context);

  return new Response(JSON.stringify({ ok: false, mensaje: 'Método no permitido.' }), {
    status: 405,
    headers: { 'Content-Type': 'application/json; charset=utf-8' }
  });
}

async function pipeWebResponse(webResponse, res) {
  res.status(webResponse.status);
  webResponse.headers.forEach((value, key) => res.setHeader(key, value));
  const body = Buffer.from(await webResponse.arrayBuffer());
  res.send(body);
}

export const api = onRequest({
  region: 'us-central1',
  timeoutSeconds: 120,
  memory: '512MiB',
  secrets: [
    TITULOS_FIREBASE_SERVICE_ACCOUNT,
    UTET_FIREBASE_SERVICE_ACCOUNT
  ]
}, async (req, res) => {
  const origin = text(req.headers.origin);
  if (origin && !ALLOWED_ORIGINS.has(origin)) {
    return sendJson(req, res, 403, { ok: false, mensaje: 'Origen no permitido.' });
  }

  if (req.method === 'OPTIONS') {
    res.set(cors(req));
    return res.status(204).send('');
  }

  try {
    const auth = await authContext(req);
    const name = routeName(req);

    if (name === 'health') {
      return sendJson(req, res, 200, {
        ok: true,
        servicio: 'Titulación Firebase Functions',
        version: '4.0.0'
      });
    }

    if (name === 'session') {
      if (!auth.authenticated || !auth.user) {
        return sendJson(req, res, 401, { ok: false, mensaje: 'Inicia sesión.' });
      }
      return sendJson(req, res, 200, {
        ok: true,
        usuario: auth.user,
        role: auth.role
      });
    }

    const module = ROUTES.get(name);
    if (!module) {
      return sendJson(req, res, 404, { ok: false, mensaje: 'Ruta API no encontrada.' });
    }

    const webRequest = buildWebRequest(req, auth);
    const webResponse = await invokeModule(module, webRequest, runtimeEnv());
    return pipeWebResponse(webResponse, res);
  } catch (error) {
    const message = text(error && error.message || error) || 'No se pudo completar la solicitud.';
    const authError = /token|auth|authorization|sesión|session/i.test(message);
    return sendJson(req, res, authError ? 401 : 500, { ok: false, mensaje: message });
  }
});
