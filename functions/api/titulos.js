import { getPublicStatus, requestClaves, runService } from '../_lib/claves.js';
import { corsHeaders, jsonReply, normalizeAction, readJson, rejectUnknownOrigin, role, text } from '../_lib/http.js';

const ACCESS_ACTION = 'CONSULTAR_ACCESO_ESTUDIANTE';
const STUDENT = new Set([
  'PING',
  'CONFIGURACION_PUBLICA',
  ACCESS_ACTION,
  'CONSULTAR_ENVIO_BASE_CEDULA',
  'CONSULTAR_RESOLUCION_CEDULA',
  'CONSULTAR_ENVIO_CEDULA',
  'VERIFICAR_ENVIO',
  'ENVIO_ESTUDIANTE'
]);
const COORDINATOR = new Set([
  ...STUDENT,
  'LISTAR_COORDINADORES',
  'LISTAR_ENVIOS_COORDINADOR',
  'LISTAR_ENVIOS_POR_CARRERA',
  'APROBAR_ENVIO_COORDINADOR',
  'DEVOLVER_ENVIO_COORDINADOR',
  'GUARDAR_REVISION_COORDINADOR',
  'GUARDAR_RESOLUCION',
  'MOVER_DEVUELTO_COORDINADOR',
  'GUARDAR_LOG'
]);
const ADMIN = new Set([
  ...COORDINATOR,
  'RESUMEN_ADMINISTRADOR',
  'LISTAR_BASE_ESTUDIANTES',
  'GUARDAR_COORDINADOR',
  'ACTUALIZAR_COORDINADOR',
  'CAMBIAR_ESTADO_COORDINADOR',
  'ASIGNAR_CARRERA',
  'SINCRONIZAR_COORDINADORES',
  'ADMIN_DEVOLVER_TITULOS',
  'ADMIN_ELIMINAR_TITULOS',
  'LISTAR_PENDIENTES_SYNC',
  'LISTAR_HISTORIAL_REPARACIONES',
  'LISTAR_LOGS',
  'ANALIZAR_GOOGLE_SHEETS',
  'CORREGIR_GOOGLE_SHEETS',
  'CONSULTAR_ESTUDIANTE'
]);
const READ_BY_ID = new Set([
  ACCESS_ACTION,
  'CONSULTAR_ENVIO_BASE_CEDULA',
  'CONSULTAR_RESOLUCION_CEDULA',
  'VERIFICAR_ENVIO',
  'CONSULTAR_ENVIO_CEDULA'
]);
const WRITE_ACTIONS = new Set([
  'ENVIO_ESTUDIANTE',
  'APROBAR_ENVIO_COORDINADOR',
  'DEVOLVER_ENVIO_COORDINADOR',
  'GUARDAR_REVISION_COORDINADOR',
  'GUARDAR_RESOLUCION',
  'MOVER_DEVUELTO_COORDINADOR',
  'ADMIN_DEVOLVER_TITULOS',
  'ADMIN_ELIMINAR_TITULOS'
]);
const LIST_TTL = new Map([
  ['LISTAR_COORDINADORES', 5 * 60 * 1000],
  ['LISTAR_ENVIOS_COORDINADOR', 60 * 1000],
  ['LISTAR_ENVIOS_POR_CARRERA', 60 * 1000]
]);

const CACHE_LIMIT = 400;
const verificationCache = new Map();
const verificationInflight = new Map();
const queryCache = new Map();
const queryInflight = new Map();
let publicStatusCache = null;
let publicStatusInflight = null;

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

function cedulaVariants(value) {
  const canonical = normalizeCedula(value);
  if (!canonical) return [];
  return canonical.startsWith('0') ? [canonical, canonical.slice(1)] : [canonical];
}

function rawCedula(value) {
  return text(value).replace(/\D/g, '');
}

function verificationKey(payload) {
  const cedula = normalizeCedula(
    payload.cedula || payload.numeroIdentificacion || payload.identificacion
  );
  const period = text(payload.periodoId || payload.periodo || payload.periodoLabel);
  return cedula ? cedula + '|' + period : '';
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    return Object.keys(value).sort().reduce((out, key) => {
      if (key !== 'token' && key !== 'acceso') out[key] = stable(value[key]);
      return out;
    }, {});
  }
  return value;
}

function trimCache(map) {
  while (map.size >= CACHE_LIMIT) {
    const first = map.keys().next().value;
    if (first === undefined) break;
    map.delete(first);
  }
}

function cacheGet(map, key) {
  const item = map.get(key);
  if (!item) return null;
  if (item.expiresAt <= Date.now()) {
    map.delete(key);
    return null;
  }
  return item.value;
}

function cacheSet(map, key, value, ttl) {
  trimCache(map);
  map.set(key, { value, expiresAt: Date.now() + ttl });
  return value;
}

function clearCaches() {
  verificationCache.clear();
  verificationInflight.clear();
  queryCache.clear();
  queryInflight.clear();
  publicStatusCache = null;
  publicStatusInflight = null;
}

function yes(value) {
  return value === true || ['SI', 'SÍ', 'TRUE', '1', 'YES'].includes(text(value).toUpperCase());
}

function normalizedKey(value) {
  return text(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

function flexible(object, names) {
  if (!object || typeof object !== 'object') return undefined;
  const map = Object.keys(object).reduce((out, key) => {
    out[normalizedKey(key)] = key;
    return out;
  }, {});
  for (const name of names) {
    const key = map[normalizedKey(name)];
    if (key !== undefined && object[key] !== undefined && object[key] !== null) {
      return object[key];
    }
  }
  return undefined;
}

function unwrap(result) {
  return result && (result.respuesta || result.data) || result || {};
}

function table(result, names) {
  const root = unwrap(result);
  const nested = root.result && typeof root.result === 'object' ? root.result : {};
  const nestedData = root.data && typeof root.data === 'object' ? root.data : {};
  const tables = root.tables || nested.tables || nestedData.tables || {};

  for (const name of names) {
    const variants = [
      tables[name],
      tables[name.toLowerCase()],
      root[name],
      root[name.toLowerCase()],
      nested[name],
      nested[name.toLowerCase()],
      nestedData[name],
      nestedData[name.toLowerCase()]
    ];
    const found = variants.find(Array.isArray);
    if (found) return found;
  }
  return [];
}

function mergeNonEmpty(...sources) {
  const output = {};
  for (const source of sources) {
    if (!source || typeof source !== 'object') continue;
    for (const [key, value] of Object.entries(source)) {
      if (value !== undefined && value !== null && text(value) !== '') output[key] = value;
    }
  }
  return output;
}

function sameCedula(item, cedula) {
  const variants = new Set(cedulaVariants(cedula));
  const found = rawCedula(flexible(item || {}, [
    'cedula',
    'numeroIdentificacion',
    'NumeroIdentificacion',
    'identificacion',
    'Cédula'
  ]));
  return Boolean(found && variants.has(found));
}

function chooseEnrollment(items) {
  const list = (Array.isArray(items) ? items : []).slice();
  list.sort((a, b) => {
    const activeA = text(flexible(a, ['estadoMatricula', 'EstadoMatricula']) || 'ACTIVO').toUpperCase() === 'ACTIVO' ? 1 : 0;
    const activeB = text(flexible(b, ['estadoMatricula', 'EstadoMatricula']) || 'ACTIVO').toUpperCase() === 'ACTIVO' ? 1 : 0;
    if (activeA !== activeB) return activeB - activeA;

    const periodA = text(flexible(a, ['periodoId', 'periodId', 'ultimoPeriodoId', 'periodoLabel']));
    const periodB = text(flexible(b, ['periodoId', 'periodId', 'ultimoPeriodoId', 'periodoLabel']));
    return periodB.localeCompare(periodA, 'es', { sensitivity: 'base' });
  });
  return list[0] || null;
}

function normalizeFallbackStudent(base, enrollment, cedula, requestedPeriod) {
  const merged = mergeNonEmpty(base, enrollment);
  const periodId = text(flexible(merged, [
    'periodoId',
    'periodId',
    'periodoCanonicoId',
    'ultimoPeriodoId'
  ]) || requestedPeriod);
  const periodLabel = text(flexible(merged, [
    'periodoLabel',
    'periodoCanonicoLabel',
    'PeriodoLabel',
    'periodo'
  ]) || periodId);
  const names = text(flexible(merged, [
    'Nombres',
    'nombres',
    'nombreCompleto',
    'NombreCompleto',
    'nombre',
    'Nombre'
  ]));
  const career = text(flexible(merged, [
    'NombreCarrera',
    'nombreCarrera',
    'carrera',
    'Carrera'
  ]));
  const canonical = normalizeCedula(cedula);

  return {
    ...merged,
    id: text(flexible(merged, ['id', '_id', 'studentId']) || (periodId ? periodId + '__' + canonical : canonical)),
    _id: text(flexible(merged, ['_id', 'id', 'studentId']) || (periodId ? periodId + '__' + canonical : canonical)),
    studentId: text(flexible(merged, ['studentId', 'id', '_id']) || (periodId ? periodId + '__' + canonical : canonical)),
    cedula: canonical,
    numeroIdentificacion: canonical,
    NumeroIdentificacion: canonical,
    Nombres: names,
    nombres: names,
    NombreCarrera: career,
    nombreCarrera: career,
    carrera: career,
    CodigoCarrera: text(flexible(merged, ['CodigoCarrera', 'codigoCarrera'])),
    codigoCarrera: text(flexible(merged, ['codigoCarrera', 'CodigoCarrera'])),
    periodoId: periodId,
    periodId,
    periodoCanonicoId: periodId,
    periodoLabel: periodLabel,
    periodoCanonicoLabel: periodLabel,
    Sede: text(flexible(merged, ['Sede', 'sede'])),
    sede: text(flexible(merged, ['sede', 'Sede'])),
    estadoMatricula: text(flexible(merged, ['estadoMatricula', 'EstadoMatricula']) || 'ACTIVO'),
    source: 'requisitos_pull_bl2_fallback'
  };
}

async function lookupStudentFallback(env, cedula, requestedPeriod) {
  const pulled = await runService(
    env,
    'REQUISITOS',
    'pull_bl2',
    'POST',
    { scope: 'all', includeData: true },
    'consulta',
    60000
  );

  const students = table(pulled, ['Estudiantes', 'BaseEstudiantes']);
  const enrollments = table(pulled, [
    'MatriculasPeriodo',
    'Matriculas',
    'EstudiantesPeriodo'
  ]);

  const baseRows = students.filter((item) => sameCedula(item, cedula));
  let enrollmentRows = enrollments.filter((item) => sameCedula(item, cedula));

  if (requestedPeriod) {
    const exact = enrollmentRows.filter((item) => {
      const periodId = text(flexible(item, [
        'periodoId',
        'periodId',
        'periodoCanonicoId',
        'periodoLabel',
        'periodo'
      ]));
      return periodId === requestedPeriod;
    });
    if (exact.length) enrollmentRows = exact;
  }

  const base = baseRows[baseRows.length - 1] || null;
  const enrollment = chooseEnrollment(enrollmentRows);
  if (!base && !enrollment) {
    return {
      ok: true,
      encontrado: false,
      existe: false,
      cedula: normalizeCedula(cedula),
      periodoId: requestedPeriod,
      fuente: 'REQUISITOS_BDLOCAL_SYNC',
      fallback: true,
      mensaje: 'No encontramos un estudiante con esa cédula en REQUISITOS_BDLOCAL_SYNC.'
    };
  }

  const student = normalizeFallbackStudent(base, enrollment, cedula, requestedPeriod);
  return {
    ok: true,
    encontrado: true,
    existe: true,
    estudiante: student,
    registro: student,
    cedula: student.cedula,
    periodoId: student.periodoId,
    periodoLabel: student.periodoLabel,
    coincidencias: Math.max(baseRows.length, enrollmentRows.length, 1),
    fuente: 'REQUISITOS_BDLOCAL_SYNC',
    fallback: true,
    mensaje: 'Estudiante encontrado correctamente.'
  };
}

function studentFound(result) {
  return Boolean(
    result &&
    (
      result.encontrado === true ||
      result.existe === true ||
      yes(result.encontrado) ||
      yes(result.existe) ||
      result.estudiante ||
      result.registro
    )
  );
}

function looksLikeEnvio(value) {
  return Boolean(value && typeof value === 'object' && flexible(value, [
    'titulo1',
    'titulo2',
    'titulo3',
    'tituloAprobado',
    'tituloCorregido',
    'tituloElegido',
    'tituloFinalAprobado'
  ]) !== undefined);
}

function extractEnvio(result) {
  if (!result || typeof result !== 'object') return null;
  const candidates = [
    result.envio,
    result.registroEnvio,
    result.envioActual,
    result.data && result.data.envio,
    result.data && result.data.registroEnvio,
    result.resultado && result.resultado.envio,
    result.respuesta && result.respuesta.envio,
    result.registro
  ];
  for (const candidate of candidates) {
    if (looksLikeEnvio(candidate)) return candidate;
  }
  return looksLikeEnvio(result) ? result : null;
}

function envioEstado(result) {
  const envio = extractEnvio(result) || {};
  return text(
    flexible(envio, ['estado', 'estadoFinal', 'estadoProceso', 'estadoGoogleSheets']) ||
    flexible(result, ['estado', 'estadoFinal'])
  ).toUpperCase();
}

function permiteReenvio(result) {
  const envio = extractEnvio(result) || {};
  const estado = envioEstado(result);
  const own = flexible(envio, ['permitirReenvio', 'permiteReenvio']);
  const valor = own !== undefined
    ? own
    : flexible(result, ['permitirReenvio', 'permiteReenvio']);
  return estado === 'DEVUELTO' && (
    valor === undefined ||
    valor === null ||
    valor === '' ||
    yes(valor)
  );
}

function directHasEnvio(result) {
  return Boolean(
    result &&
    (
      yes(flexible(result, ['existe', 'encontrado', 'tieneEnvio', 'encontradoEnvio'])) ||
      extractEnvio(result)
    )
  );
}

function accessHasEnvio(result) {
  const student = result && (result.estudiante || result.registro) || {};
  const evidence = Boolean(
    result &&
    (
      yes(flexible(result, ['tieneEnvio', 'encontradoEnvio', 'existeEnvio'])) ||
      extractEnvio(result) ||
      yes(flexible(student, ['tieneEnvio', 'tiene envío', 'envioRegistrado'])) ||
      text(flexible(student, ['idRegistro', 'envioId', 'tituloId']))
    )
  );
  return evidence && !permiteReenvio(result);
}

async function executeService(env, action, method, payload, userRole) {
  const result = await runService(env, 'TITULOS', action, method, payload, userRole);
  return result.respuesta || result.data || result;
}

async function lookupEnvio(env, payload, userRole) {
  const cedula = normalizeCedula(
    payload.cedula || payload.numeroIdentificacion || payload.identificacion
  );
  if (!cedula) return { ok: true, existe: false, encontrado: false };

  const periodo = text(payload.periodo || payload.periodoLabel || payload.periodoId);
  return executeService(
    env,
    'CONSULTAR_ENVIO_CEDULA',
    'GET',
    {
      cedula,
      numeroIdentificacion: cedula,
      periodo,
      periodoLabel: text(payload.periodoLabel),
      periodoId: text(payload.periodoId)
    },
    userRole
  );
}

async function executeAccess(env, payload, userRole) {
  const cedula = normalizeCedula(
    payload.cedula || payload.numeroIdentificacion || payload.identificacion
  );
  const requestedPeriod = text(
    payload.periodoId || payload.periodo || payload.periodoLabel
  );

  let base = await requestClaves(
    env,
    ACCESS_ACTION,
    { cedula, periodoId: requestedPeriod },
    12000
  );

  /*
    Algunas hojas antiguas guardaron las cédulas como números y eliminaron
    el cero inicial. Si la consulta rápida no encuentra el registro, se usa
    pull_bl2 una sola vez y se compara la forma de 10 y de 9 dígitos.
  */
  if (!studentFound(base)) {
    try {
      const fallback = await lookupStudentFallback(env, cedula, requestedPeriod);
      if (studentFound(fallback)) base = fallback;
    } catch (error) {
      base = {
        ...base,
        fallbackError: text(error && error.message)
      };
    }
  }

  const student = base.estudiante || base.registro || {};

  /*
    Aunque Claves encuentre el índice, siempre se consulta TITULOS.
    Así se recupera la resolución más reciente y el título final aprobado.
  */
  let direct = await lookupEnvio(
    env,
    {
      cedula,
      periodo:
        base.periodoLabel ||
        flexible(student, ['periodoLabel', 'periodo']) ||
        payload.periodo ||
        payload.periodoLabel,
      periodoLabel:
        base.periodoLabel ||
        flexible(student, ['periodoLabel', 'periodo']) ||
        payload.periodoLabel,
      periodoId:
        base.periodoId ||
        flexible(student, ['periodoId']) ||
        payload.periodoId
    },
    userRole
  );

  if (!directHasEnvio(direct)) {
    direct = await lookupEnvio(env, { cedula }, userRole);
  }
  if (!directHasEnvio(direct)) return base;

  const envio = extractEnvio(direct);
  const permitir = permiteReenvio(direct);
  const estado = envioEstado(direct);
  const aprobado = estado.includes('APROBADO') || estado === 'REEMPLAZADO';

  return {
    ...base,
    tieneEnvio: !permitir,
    encontradoEnvio: true,
    permiteReenvio: permitir,
    envio,
    estadoEnvio: estado,
    fuenteEnvio: 'ENVÍOS_Y_RESOLUCIONES_RESPALDO_TITULOS_APP',
    mensaje: permitir
      ? 'El registro fue devuelto y puede corregirse.'
      : aprobado
        ? 'Tu tema de titulación fue aprobado por coordinación.'
        : 'Tus propuestas ya fueron enviadas y están siendo revisadas por coordinación.'
  };
}

async function executeRead(env, action, method, payload, userRole) {
  if (action === ACCESS_ACTION) return executeAccess(env, payload, userRole);
  return executeService(env, action, method, payload, userRole);
}

async function verifyWithCache(env, action, method, payload, userRole) {
  const rawKey = verificationKey(payload);
  if (!rawKey) return executeRead(env, action, method, payload, userRole);

  const key = action + '|' + rawKey;
  const cached = cacheGet(verificationCache, key);
  if (cached) return { ...cached, cache: 'worker' };
  if (verificationInflight.has(key)) return verificationInflight.get(key);

  const task = executeRead(env, action, method, payload, userRole)
    .then((result) => {
      const positive = action === ACCESS_ACTION
        ? studentFound(result) || accessHasEnvio(result)
        : directHasEnvio(result);
      return cacheSet(verificationCache, key, result, positive ? 30 * 1000 : 5 * 1000);
    })
    .finally(() => verificationInflight.delete(key));

  verificationInflight.set(key, task);
  return task;
}

async function queryWithCache(env, action, method, payload, userRole) {
  const ttl = LIST_TTL.get(action);
  if (!ttl) return executeService(env, action, method, payload, userRole);

  const key = userRole + '|' + action + '|' + JSON.stringify(stable(payload));
  const cached = cacheGet(queryCache, key);
  if (cached) return cached;
  if (queryInflight.has(key)) return queryInflight.get(key);

  const task = executeService(env, action, method, payload, userRole)
    .then((result) => cacheSet(queryCache, key, result, ttl))
    .finally(() => queryInflight.delete(key));

  queryInflight.set(key, task);
  return task;
}

async function getCachedPublicStatus(env) {
  if (publicStatusCache && publicStatusCache.expiresAt > Date.now()) {
    return publicStatusCache.value;
  }
  if (publicStatusInflight) return publicStatusInflight;

  publicStatusInflight = getPublicStatus(env)
    .then((value) => {
      publicStatusCache = {
        value,
        expiresAt: Date.now() + 5 * 60 * 1000
      };
      return value;
    })
    .finally(() => {
      publicStatusInflight = null;
    });

  return publicStatusInflight;
}

export async function onRequest({ request, env }) {
  const bad = rejectUnknownOrigin(request);
  if (bad) return bad;

  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: corsHeaders(request)
    });
  }

  if (request.method !== 'POST') {
    return jsonReply(request, {
      ok: false,
      mensaje: 'Método no permitido.'
    }, 405);
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
      const item = publicService(await getCachedPublicStatus(env), 'TITULOS');
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

    const nested = input.datos && typeof input.datos === 'object'
      ? input.datos
      : {};
    const payload = { ...input, ...nested };
    delete payload.token;
    delete payload.acceso;

    if (action === 'ENVIO_ESTUDIANTE') {
      const previous = await lookupEnvio(env, payload, userRole);
      if (directHasEnvio(previous) && !permiteReenvio(previous)) {
        return jsonReply(request, {
          ok: false,
          duplicado: true,
          tieneEnvio: true,
          envio: extractEnvio(previous),
          mensaje: 'Tus propuestas ya fueron enviadas y están siendo revisadas por coordinación.'
        }, 409);
      }
    }

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
      result = await queryWithCache(
        env,
        action,
        input.metodo || 'POST',
        payload,
        userRole
      );
    }

    if (WRITE_ACTIONS.has(action)) clearCaches();
    return jsonReply(request, result);
  } catch (error) {
    return jsonReply(request, {
      ok: false,
      servicio: 'TITULOS',
      mensaje: error.message || String(error)
    }, 502);
  }
}
