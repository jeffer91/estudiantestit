import {
  commitDocuments,
  getDocument,
  listCollection,
  nowIso,
  queryEqual,
  setDocument,
  text
} from '../_lib/firestore-fixed.js';
import {
  carreraEnvio,
  esPendienteInvestigacion,
  nombresEnvio,
  resultadoPorCambio,
  tipoTrabajoLabel,
  tituloCoordinacion
} from '../_lib/workflow-titulacion.js';
import {
  corsHeaders,
  jsonReply,
  normalizeAction,
  readJson,
  rejectUnknownOrigin,
  role
} from '../_lib/http.js';

const INVESTIGADORES = Object.freeze([
  { cedula: '1723704191', nombre: 'Carla Thalia Rivera Ávalos' },
  { cedula: '1720209764', nombre: 'Grimaneza del Pilar Villarroel Bosmediano' },
  { cedula: '0704847474', nombre: 'Verónica María Ayala León' },
  { cedula: '1313382689', nombre: 'Mariana Saray Defaz Itaz' },
  { cedula: '1720285087', nombre: 'Brenda Sarina Reyes Jaramillo' },
  { cedula: '1719625400', nombre: 'Cesar Leonardo Segovia Mejia' },
  { cedula: '1724125255', nombre: 'William Andrés Perez Mayorga' },
  { cedula: '1725075533', nombre: 'Jhair Ramiro Aldas Onofre' },
  { cedula: '1004431241', nombre: 'Pamela Araceli Placencia Noquez' },
  { cedula: '1723249015', nombre: 'María Fernanda Garcés Quimuña' }
]);

const LOCK_MS = 2 * 60 * 1000;
const SESSION_MS = 8 * 60 * 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 5;
const LOGIN_LOCK_MS = 15 * 60 * 1000;
const enc = new TextEncoder();

function cedula(value) {
  const digits = text(value).replace(/\D/g, '');
  return digits.length === 10 ? digits : '';
}

function normal(value) {
  return text(value).toLowerCase().normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function hex(buffer) {
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function randomHex(bytes = 16) {
  const values = new Uint8Array(bytes);
  crypto.getRandomValues(values);
  return [...values].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function sha256(value) {
  return hex(await crypto.subtle.digest('SHA-256', enc.encode(String(value))));
}

async function pinHash(pin, salt) {
  const material = await crypto.subtle.importKey(
    'raw',
    enc.encode(String(pin)),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  return hex(await crypto.subtle.deriveBits({
    name: 'PBKDF2',
    salt: enc.encode(String(salt)),
    iterations: 120000,
    hash: 'SHA-256'
  }, material, 256));
}

function validarPin(pin) {
  const value = text(pin);
  if (!/^\d{4,8}$/.test(value)) throw new Error('El PIN debe tener entre 4 y 8 dígitos.');
  return value;
}

async function asegurarCatalogo(env) {
  for (const item of INVESTIGADORES) {
    const actual = await getDocument('TITULOS', 'investigadores', item.cedula, env);
    if (!actual) {
      await setDocument('TITULOS', 'investigadores', item.cedula, {
        cedula: item.cedula,
        nombre: item.nombre,
        activo: true,
        pinHash: '',
        pinSalt: '',
        creadoEn: nowIso(),
        actualizadoEn: nowIso()
      }, { merge: false, exists: false }, env);
    }
  }
}

async function investigadorActivo(id, env) {
  const c = cedula(id);
  if (!c) return null;
  const item = await getDocument('TITULOS', 'investigadores', c, env);
  return item && item.activo !== false ? item : null;
}

async function revocarSesiones(cedulaInvestigador, env) {
  const sesiones = await queryEqual('TITULOS', 'investigadores_sesiones', 'cedula', cedulaInvestigador, 1000, env);
  const activas = sesiones.filter((item) => item.activo !== false);
  if (!activas.length) return 0;
  const fecha = nowIso();
  await commitDocuments('TITULOS', activas.map((item) => ({
    collection: 'investigadores_sesiones',
    id: item.id,
    data: { activo: false, revocadaEn: fecha },
    merge: true,
    ...(item._updateTime ? { updateTime: item._updateTime } : {})
  })), env);
  return activas.length;
}

async function cerrarSesion(token, env) {
  const raw = text(token);
  if (!raw) return { ok: true };
  const id = await sha256(raw);
  const sesion = await getDocument('TITULOS', 'investigadores_sesiones', id, env);
  if (sesion && sesion.activo !== false) {
    await setDocument('TITULOS', 'investigadores_sesiones', id, {
      activo: false,
      cerradaEn: nowIso()
    }, { merge: true, ...(sesion._updateTime ? { updateTime: sesion._updateTime } : {}) }, env);
  }
  return { ok: true };
}

async function crearSesion(investigador, env) {
  const token = crypto.randomUUID() + '.' + randomHex(16);
  const id = await sha256(token);
  const expiraEn = new Date(Date.now() + SESSION_MS).toISOString();
  await setDocument('TITULOS', 'investigadores_sesiones', id, {
    cedula: investigador.cedula,
    nombre: investigador.nombre,
    creadoEn: nowIso(),
    expiraEn,
    activo: true
  }, { merge: false, exists: false }, env);
  return { token, expiraEn };
}

async function validarSesion(token, env) {
  const raw = text(token);
  if (!raw) throw new Error('La sesión de Investigación no es válida.');
  const id = await sha256(raw);
  const sesion = await getDocument('TITULOS', 'investigadores_sesiones', id, env);
  if (!sesion || sesion.activo === false || Date.parse(sesion.expiraEn || '') <= Date.now()) {
    throw new Error('La sesión de Investigación venció. Ingresa nuevamente.');
  }
  const investigador = await investigadorActivo(sesion.cedula, env);
  if (!investigador) throw new Error('El investigador está inactivo.');
  return investigador;
}

async function consultarAcceso(payload, env) {
  await asegurarCatalogo(env);
  const c = cedula(payload.cedula);
  if (!c) throw new Error('Ingresa una cédula válida de 10 dígitos.');
  const investigador = await investigadorActivo(c, env);
  if (!investigador) return { ok: true, encontrado: false, mensaje: 'Cédula no habilitada para Investigación.' };
  return {
    ok: true,
    encontrado: true,
    cedula: investigador.cedula,
    nombre: investigador.nombre,
    requiereRegistroPin: !text(investigador.pinHash)
  };
}

async function registrarPin(payload, env) {
  await asegurarCatalogo(env);
  const c = cedula(payload.cedula);
  const pin = validarPin(payload.pin);
  const investigador = await investigadorActivo(c, env);
  if (!investigador) throw new Error('Cédula no habilitada para Investigación.');
  if (text(investigador.pinHash)) throw new Error('Este investigador ya tiene un PIN registrado.');
  const salt = randomHex(16);
  const hash = await pinHash(pin, salt);
  const actualizado = await setDocument('TITULOS', 'investigadores', c, {
    pinSalt: salt,
    pinHash: hash,
    pinCreadoEn: nowIso(),
    intentosFallidos: 0,
    bloqueoLoginHasta: '',
    actualizadoEn: nowIso()
  }, { merge: true, updateTime: investigador._updateTime }, env);
  const sesion = await crearSesion(actualizado, env);
  return { ok: true, nombre: actualizado.nombre, cedula: c, sesion: sesion.token, expiraEn: sesion.expiraEn };
}

async function login(payload, env) {
  await asegurarCatalogo(env);
  const c = cedula(payload.cedula);
  const pin = validarPin(payload.pin);
  const investigador = await investigadorActivo(c, env);
  if (!investigador) throw new Error('Cédula no habilitada para Investigación.');
  if (!text(investigador.pinHash) || !text(investigador.pinSalt)) {
    return { ok: false, requiereRegistroPin: true, mensaje: 'Primero registra tu PIN.' };
  }
  const bloqueoHasta = Date.parse(investigador.bloqueoLoginHasta || '');
  if (Number.isFinite(bloqueoHasta) && bloqueoHasta > Date.now()) {
    throw new Error('Acceso temporalmente bloqueado por varios intentos fallidos. Intenta más tarde o solicita al administrador restablecer el PIN.');
  }
  const hash = await pinHash(pin, investigador.pinSalt);
  if (hash !== investigador.pinHash) {
    const intentos = Number(investigador.intentosFallidos || 0) + 1;
    const bloquear = intentos >= LOGIN_MAX_ATTEMPTS;
    await setDocument('TITULOS', 'investigadores', c, {
      intentosFallidos: bloquear ? 0 : intentos,
      bloqueoLoginHasta: bloquear ? new Date(Date.now() + LOGIN_LOCK_MS).toISOString() : '',
      ultimoIntentoFallidoEn: nowIso(),
      actualizadoEn: nowIso()
    }, { merge: true, ...(investigador._updateTime ? { updateTime: investigador._updateTime } : {}) }, env);
    throw new Error(bloquear
      ? 'Demasiados intentos fallidos. El acceso quedó bloqueado temporalmente.'
      : 'PIN incorrecto.');
  }
  const actualizado = await setDocument('TITULOS', 'investigadores', c, {
    intentosFallidos: 0,
    bloqueoLoginHasta: '',
    ultimoIngresoEn: nowIso(),
    actualizadoEn: nowIso()
  }, { merge: true, ...(investigador._updateTime ? { updateTime: investigador._updateTime } : {}) }, env);
  const sesion = await crearSesion(actualizado, env);
  return { ok: true, nombre: actualizado.nombre, cedula: c, sesion: sesion.token, expiraEn: sesion.expiraEn };
}

function lockId(envioId) {
  return text(envioId).replace(/\//g, '__');
}

function lockVigente(lock) {
  return Boolean(lock && Date.parse(lock.bloqueoHasta || '') > Date.now());
}

async function bloqueosActivos(env) {
  const rows = await listCollection('TITULOS', 'investigacion_bloqueos', { pageSize: 300, maxDocuments: 5000 }, env);
  const map = new Map();
  rows.forEach((item) => {
    if (lockVigente(item)) map.set(text(item.envioId), item);
  });
  return map;
}

async function pendientes(env) {
  const rows = await listCollection('TITULOS', 'envios', { pageSize: 300, maxDocuments: 10000 }, env);
  return rows.filter(esPendienteInvestigacion);
}

function publicoPendiente(row, lock, actual) {
  const base = tituloCoordinacion(row);
  const tomado = lockVigente(lock);
  return {
    id: row.id,
    cedula: text(row.cedula || row.numeroIdentificacion),
    nombre: nombresEnvio(row),
    carrera: carreraEnvio(row),
    periodo: text(row.periodoLabel || row.periodoNombre || row.periodoId || row.periodo),
    tipoTrabajo: text(row.tipoTrabajo).toUpperCase() === 'TRABAJO_TITULACION' ? 'TRABAJO_TITULACION' : 'ARTICULO_ACADEMICO',
    tipoTrabajoLabel: tipoTrabajoLabel(row),
    titulo1: text(row.titulo1),
    titulo2: text(row.titulo2),
    titulo3: text(row.titulo3),
    tituloPreferidoNumero: Number(row.tituloPreferidoNumero || row.preferido || 0),
    tituloCoordinador: base,
    comentarioCoordinador: text(row.comentarioCoordinador || row.observacionCoordinador || row.ultimoComentario),
    tomado,
    tomadoPorMi: tomado && text(lock.cedulaInvestigador) === text(actual.cedula),
    estadoToma: tomado
      ? (text(lock.cedulaInvestigador) === text(actual.cedula) ? 'CONTINUAR_REVISION' : 'TOMADO_POR_OTRO_USUARIO')
      : 'DISPONIBLE'
  };
}

async function listarCarreras(actual, env) {
  const [rows, locks] = await Promise.all([pendientes(env), bloqueosActivos(env)]);
  const mapa = new Map();
  rows.forEach((row) => {
    const carrera = carreraEnvio(row) || 'Sin carrera';
    const key = normal(carrera) || 'sin-carrera';
    if (!mapa.has(key)) mapa.set(key, { carrera, cantidad: 0 });
    mapa.get(key).cantidad += 1;
  });
  return {
    ok: true,
    investigador: { cedula: actual.cedula, nombre: actual.nombre },
    totalPendientes: rows.length,
    carreras: [...mapa.values()].sort((a, b) => b.cantidad - a.cantidad || a.carrera.localeCompare(b.carrera, 'es')),
    tomadosActivos: locks.size
  };
}

async function listarPendientesCarrera(payload, actual, env) {
  const carreraSolicitada = normal(payload.carrera);
  const [rows, locks] = await Promise.all([pendientes(env), bloqueosActivos(env)]);
  const filtrados = rows.filter((row) => !carreraSolicitada || normal(carreraEnvio(row)) === carreraSolicitada);
  return {
    ok: true,
    carrera: text(payload.carrera),
    pendientes: filtrados.map((row) => publicoPendiente(row, locks.get(row.id), actual))
  };
}

async function historialEnvio(envioId, env) {
  const rows = await queryEqual('TITULOS', 'workflow_eventos', 'envioId', envioId, 1000, env);
  return rows.map((item) => ({
    rol: text(item.rol),
    accion: text(item.accion),
    resultado: text(item.resultado),
    tituloAntes: text(item.tituloAntes),
    tituloDespues: text(item.tituloDespues),
    observacion: text(item.observacion),
    fecha: text(item.fecha || item.actualizadoEn || item._updateTime)
  })).sort((a, b) => (Date.parse(a.fecha || '') || 0) - (Date.parse(b.fecha || '') || 0));
}

async function tomarRevision(payload, actual, env) {
  const id = text(payload.envioId);
  if (!id) throw new Error('No se indicó el título a revisar.');
  const envio = await getDocument('TITULOS', 'envios', id, env);
  if (!envio || !esPendienteInvestigacion(envio)) throw new Error('Este título ya no está pendiente de Investigación.');
  const lid = lockId(id);
  const actualLock = await getDocument('TITULOS', 'investigacion_bloqueos', lid, env);
  if (lockVigente(actualLock) && text(actualLock.cedulaInvestigador) !== actual.cedula) {
    return { ok: false, tomado: true, mensaje: 'Tomado por otro usuario.' };
  }
  const data = {
    envioId: id,
    cedulaInvestigador: actual.cedula,
    tomadoEn: actualLock && actualLock.cedulaInvestigador === actual.cedula ? actualLock.tomadoEn : nowIso(),
    heartbeatEn: nowIso(),
    bloqueoHasta: new Date(Date.now() + LOCK_MS).toISOString()
  };
  try {
    await setDocument('TITULOS', 'investigacion_bloqueos', lid, data, actualLock
      ? { merge: true, updateTime: actualLock._updateTime }
      : { merge: false, exists: false }, env);
  } catch (_error) {
    const comprobacion = await getDocument('TITULOS', 'investigacion_bloqueos', lid, env);
    if (lockVigente(comprobacion) && text(comprobacion.cedulaInvestigador) !== actual.cedula) {
      return { ok: false, tomado: true, mensaje: 'Tomado por otro usuario.' };
    }
    throw _error;
  }
  const historial = await historialEnvio(id, env).catch(() => []);
  return { ok: true, envio: { ...publicoPendiente(envio, data, actual), historial }, bloqueoHasta: data.bloqueoHasta };
}

async function heartbeat(payload, actual, env) {
  const id = text(payload.envioId);
  const lid = lockId(id);
  const lock = await getDocument('TITULOS', 'investigacion_bloqueos', lid, env);
  if (!lockVigente(lock) || text(lock.cedulaInvestigador) !== actual.cedula) {
    throw new Error('La revisión ya no está reservada para tu usuario.');
  }
  const bloqueoHasta = new Date(Date.now() + LOCK_MS).toISOString();
  await setDocument('TITULOS', 'investigacion_bloqueos', lid, {
    heartbeatEn: nowIso(),
    bloqueoHasta
  }, { merge: true, updateTime: lock._updateTime }, env);
  return { ok: true, bloqueoHasta };
}

async function liberar(payload, actual, env, forzar = false) {
  const id = text(payload.envioId);
  const lid = lockId(id);
  const lock = await getDocument('TITULOS', 'investigacion_bloqueos', lid, env);
  if (!lock) return { ok: true, liberado: true };
  if (!forzar && text(lock.cedulaInvestigador) !== actual.cedula) {
    throw new Error('No puedes liberar una revisión tomada por otro usuario.');
  }
  await setDocument('TITULOS', 'investigacion_bloqueos', lid, {
    bloqueoHasta: new Date(0).toISOString(),
    liberadoEn: nowIso(),
    liberadoPor: forzar ? 'ADMINISTRADOR' : 'INVESTIGADOR'
  }, { merge: true, updateTime: lock._updateTime }, env);
  return { ok: true, liberado: true };
}

function eventoId(envioId) {
  return (text(envioId) + '__inv__' + Date.now() + '__' + randomHex(6)).replace(/\//g, '__');
}

async function resolver(payload, actual, env) {
  const id = text(payload.envioId);
  const accion = normalizeAction(payload.accionRevision || payload.resultado || payload.accion);
  const permitidas = new Set(['APROBAR', 'CORREGIR_APROBAR', 'DEVOLVER']);
  if (!permitidas.has(accion)) throw new Error('Acción de Investigación no válida.');

  const [envio, lock] = await Promise.all([
    getDocument('TITULOS', 'envios', id, env),
    getDocument('TITULOS', 'investigacion_bloqueos', lockId(id), env)
  ]);
  if (!envio || !esPendienteInvestigacion(envio)) throw new Error('Este título ya no está pendiente de Investigación.');
  if (!lockVigente(lock) || text(lock.cedulaInvestigador) !== actual.cedula) {
    throw new Error('Primero debes tomar esta revisión.');
  }

  const antes = tituloCoordinacion(envio);
  if (!antes) throw new Error('El registro no contiene el título validado por Coordinación.');
  const observacion = text(payload.observacion).replace(/\s+/g, ' ').trim();
  if ((accion === 'CORREGIR_APROBAR' || accion === 'DEVOLVER') && observacion.length < 4) {
    throw new Error('Escribe una observación para justificar esta acción.');
  }

  let despues = antes;
  let estado = 'APROBADO_FINAL';
  let resultado = 'APROBADO_SIN_CAMBIOS';
  if (accion === 'CORREGIR_APROBAR') {
    despues = text(payload.tituloFinal).replace(/\s+/g, ' ').trim();
    if (despues.length < 8) throw new Error('Escribe un título final completo.');
    resultado = resultadoPorCambio(antes, despues);
  } else if (accion === 'DEVOLVER') {
    estado = 'DEVUELTO';
    despues = '';
    resultado = 'DEVUELTO';
  }

  const fecha = nowIso();
  const evento = eventoId(id);
  const envioUpdate = accion === 'DEVOLVER'
    ? {
        estado,
        estadoProceso: estado,
        permitirReenvio: true,
        devueltoPor: 'INVESTIGACION',
        observacion,
        observacionDevolucion: observacion,
        tituloFinal: null,
        fechaResolucionInvestigacion: fecha,
        resultadoInvestigacion: resultado,
        requiereAccionDe: 'ESTUDIANTE',
        investigacionRevisionId: evento,
        actualizadoEn: fecha
      }
    : {
        estado,
        estadoProceso: estado,
        permitirReenvio: false,
        devueltoPor: '',
        tituloFinal: despues,
        tituloFinalInvestigacion: despues,
        observacionInvestigacion: observacion,
        fechaResolucionInvestigacion: fecha,
        resultadoInvestigacion: resultado,
        requiereAccionDe: '',
        investigacionRevisionId: evento,
        actualizadoEn: fecha
      };

  await commitDocuments('TITULOS', [
    {
      collection: 'envios',
      id,
      data: envioUpdate,
      merge: true,
      updateTime: envio._updateTime
    },
    {
      collection: 'workflow_eventos',
      id: evento,
      data: {
        envioId: id,
        rol: 'INVESTIGADOR',
        revisorId: actual.cedula,
        revisorNombre: actual.nombre,
        accion,
        resultado,
        estadoAnterior: text(envio.estadoProceso || envio.estado),
        estadoNuevo: estado,
        tituloAntes: antes,
        tituloDespues: despues,
        observacion,
        fecha
      },
      merge: false,
      exists: false
    },
    {
      collection: 'investigacion_bloqueos',
      id: lockId(id),
      data: {
        bloqueoHasta: new Date(0).toISOString(),
        liberadoEn: fecha,
        liberadoPor: 'RESOLUCION'
      },
      merge: true,
      updateTime: lock._updateTime
    }
  ], env);

  return {
    ok: true,
    estado,
    resultado,
    tituloFinal: despues,
    mensaje: accion === 'DEVOLVER'
      ? 'Título devuelto al estudiante. El proceso se reiniciará cuando vuelva a enviar.'
      : 'Revisión de Investigación guardada correctamente.'
  };
}

async function adminListar(env) {
  await asegurarCatalogo(env);
  const rows = await listCollection('TITULOS', 'investigadores', { pageSize: 100, maxDocuments: 500 }, env);
  return {
    ok: true,
    investigadores: rows.map((item) => ({
      cedula: item.cedula,
      nombre: item.nombre,
      activo: item.activo !== false,
      tienePin: Boolean(text(item.pinHash))
    })).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
  };
}

async function adminGuardar(payload, env) {
  const c = cedula(payload.cedula);
  const nombre = text(payload.nombre).replace(/\s+/g, ' ').trim();
  if (!c || !nombre) throw new Error('Nombre y cédula son obligatorios.');
  const actual = await getDocument('TITULOS', 'investigadores', c, env);
  await setDocument('TITULOS', 'investigadores', c, {
    cedula: c,
    nombre,
    activo: payload.activo !== false,
    actualizadoEn: nowIso(),
    ...(actual ? {} : { creadoEn: nowIso(), pinHash: '', pinSalt: '' })
  }, actual ? { merge: true, updateTime: actual._updateTime } : { merge: false, exists: false }, env);
  return { ok: true, mensaje: 'Investigador guardado.' };
}

async function adminResetPin(payload, env) {
  const c = cedula(payload.cedula);
  const actual = await getDocument('TITULOS', 'investigadores', c, env);
  if (!actual) throw new Error('Investigador no encontrado.');
  await setDocument('TITULOS', 'investigadores', c, {
    pinHash: '',
    pinSalt: '',
    intentosFallidos: 0,
    bloqueoLoginHasta: '',
    pinReiniciadoEn: nowIso(),
    actualizadoEn: nowIso()
  }, { merge: true, updateTime: actual._updateTime }, env);
  await revocarSesiones(c, env);
  return { ok: true, mensaje: 'PIN restablecido y sesiones anteriores cerradas. Se solicitará uno nuevo en el próximo ingreso.' };
}

async function execute(action, payload, userRole, env) {
  if (action === 'CONSULTAR_ACCESO') return consultarAcceso(payload, env);
  if (action === 'REGISTRAR_PIN') return registrarPin(payload, env);
  if (action === 'LOGIN') return login(payload, env);
  if (action === 'LOGOUT') return cerrarSesion(payload.sesion, env);

  if (userRole === 'admin') {
    if (action === 'ADMIN_LISTAR_INVESTIGADORES') return adminListar(env);
    if (action === 'ADMIN_GUARDAR_INVESTIGADOR') return adminGuardar(payload, env);
    if (action === 'ADMIN_RESETEAR_PIN_INVESTIGADOR') return adminResetPin(payload, env);
    if (action === 'ADMIN_LIBERAR_REVISION_INVESTIGACION') {
      return liberar(payload, { cedula: 'ADMIN', nombre: 'Administrador' }, env, true);
    }
  }

  const actual = await validarSesion(payload.sesion, env);
  if (action === 'LISTAR_CARRERAS') return listarCarreras(actual, env);
  if (action === 'LISTAR_PENDIENTES_CARRERA') return listarPendientesCarrera(payload, actual, env);
  if (action === 'TOMAR_REVISION') return tomarRevision(payload, actual, env);
  if (action === 'HEARTBEAT_REVISION') return heartbeat(payload, actual, env);
  if (action === 'LIBERAR_REVISION') return liberar(payload, actual, env);
  if (action === 'RESOLVER_REVISION') return resolver(payload, actual, env);
  throw new Error('Acción de Investigación no reconocida.');
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
    const action = normalizeAction(input.accion || input.action);
    const payload = input.datos && typeof input.datos === 'object' ? input.datos : input;
    const userRole = role(request);
    if (!['investigator', 'admin'].includes(userRole)) {
      return jsonReply(request, { ok: false, mensaje: 'Acceso exclusivo de Investigación.' }, 403);
    }
    return jsonReply(request, await execute(action, payload, userRole, env));
  } catch (error) {
    return jsonReply(request, {
      ok: false,
      mensaje: error && error.message ? error.message : 'No se pudo completar la operación de Investigación.'
    }, 400);
  }
}
