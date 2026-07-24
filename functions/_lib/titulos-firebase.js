/* Operación completa de Titulación sobre Firebase titulos-ec2fa. */

import {
  commitDocuments,
  deleteDocument,
  latestBy,
  listCollection,
  normalizeCedula,
  nowIso,
  periodSignature,
  pingProject,
  queryEqual,
  samePeriod,
  setDocument,
  slug,
  text
} from './firestore.js';
import { getStudentBasic, listTitleCareers, listTitlePeriods } from './requisitos-firebase.js';

function normalizeStatus(value, fallback = 'PENDIENTE_REVISION') {
  const normalized = text(value).toUpperCase().replace(/[^A-Z0-9]+/g, '_');
  if (!normalized) return fallback;
  if (normalized.includes('DEVUEL')) return 'DEVUELTO';
  if (normalized.includes('REEMPLAZ')) return 'REEMPLAZADO';
  if (normalized.includes('APROBAD')) return 'APROBADO';
  if (normalized.includes('PENDIENT')) return 'PENDIENTE_REVISION';
  if (normalized.includes('INACTIVO')) return 'INACTIVO';
  if (normalized.includes('ACTIVO')) return 'ACTIVO';
  return normalized;
}

function cleanTitle(value) {
  let output = text(value).replace(/\s+/g, ' ');
  while (
    output.length >= 2 &&
    ((output.startsWith('"') && output.endsWith('"')) ||
      (output.startsWith("'") && output.endsWith("'")))
  ) {
    output = output.slice(1, -1).trim();
  }
  return output;
}

function titleFrom(value) {
  if (typeof value === 'string') return cleanTitle(value);
  const item = value || {};
  return cleanTitle(item.tituloFinal || item.titulo || item.tituloMejorado || item.texto || item.title);
}

function titlesFromPayload(payload) {
  const proposals = Array.isArray(payload.propuestas)
    ? payload.propuestas
    : Array.isArray(payload.titulosEnviados)
      ? payload.titulosEnviados
      : [];
  return [1, 2, 3].map((number, index) => cleanTitle(
    payload[`titulo${number}`] || titleFrom(proposals[index])
  ));
}

function preferredFromPayload(payload, titles) {
  const raw = Number(payload.tituloPreferidoNumero || payload.preferido || payload.favorito || 0);
  if ([1, 2, 3].includes(raw) && titles[raw - 1]) return raw;
  const preferredText = cleanTitle(payload.tituloPreferido || payload.tituloPreferidoTexto);
  const index = titles.findIndex((title) => title && title === preferredText);
  return index >= 0 ? index + 1 : 1;
}

function normalizePeriodId(value) {
  const raw = text(value);
  if (!raw) return '';
  return text(periodSignature(raw) || raw).replace(/\//g, '-');
}

function buildEnvioId(periodId, cedula) {
  return `${normalizePeriodId(periodId) || 'sin_periodo'}__${normalizeCedula(cedula)}`;
}

function uniqueEventId(prefix) {
  const random = typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID().replace(/-/g, '').slice(0, 12)
    : Math.random().toString(36).slice(2, 14);
  return `${prefix}__${Date.now()}__${random}`;
}

function splitList(value) {
  if (Array.isArray(value)) return value.map(text).filter(Boolean);
  return text(value).split(/[,;|\n]+/).map(text).filter(Boolean);
}

function publicEnvio(row) {
  row = row || {};
  const id = text(row.id || row._docId || row._id);
  const cedula = normalizeCedula(row.cedula || row.numeroIdentificacion);
  const names = text(row.nombres || row.estudiante || row.Nombres);
  const career = text(row.carreraNombre || row.nombreCarrera || row.carrera);
  const periodId = text(row.periodoId || row.periodId);
  const periodLabel = text(row.periodoNombre || row.periodoLabel || row.periodo || periodId);
  const titles = [cleanTitle(row.titulo1), cleanTitle(row.titulo2), cleanTitle(row.titulo3)];
  const preferred = Number(row.tituloPreferidoNumero || row.preferido || 0);
  const status = normalizeStatus(row.estado || row.estadoFinal);
  const finalTitle = cleanTitle(row.tituloFinal || row.tituloCorregido || row.tituloElegido);
  const observation = text(row.observacion || row.comentarioCoordinador || row.comentario);

  return {
    ...row,
    id,
    _id: id,
    _clave: id,
    idRegistro: id,
    envioId: id,
    cedula,
    numeroIdentificacion: cedula,
    nombres: names,
    estudiante: names,
    carrera: career,
    nombreCarrera: career,
    periodoId: periodId,
    periodo: periodLabel,
    periodoLabel: periodLabel,
    titulo1: titles[0],
    titulo2: titles[1],
    titulo3: titles[2],
    preferido: preferred,
    tituloPreferidoNumero: preferred,
    tituloPreferido: preferred,
    tituloPreferidoTexto: preferred ? titles[preferred - 1] : '',
    estado: status,
    estadoFinal: status,
    estadoProceso: status,
    tituloAprobado: finalTitle,
    tituloFinal: finalTitle,
    comentarioCoordinador: observation,
    observacion: observation,
    fechaRevision: text(row.fechaResolucion),
    permitirReenvio: status === 'DEVUELTO'
  };
}

async function queryUnique(collectionName, field, values, limit, env) {
  const rows = [];
  const seen = new Set();
  for (const value of values) {
    if (value === '' || value === null || value === undefined) continue;
    const found = await queryEqual('TITULOS', collectionName, field, value, limit, env);
    for (const row of found) {
      if (seen.has(row.id)) continue;
      seen.add(row.id);
      rows.push(row);
    }
  }
  return rows;
}

async function findEnviosByCedula(value, env) {
  const cedula = normalizeCedula(value);
  if (!cedula) return [];
  const variants = cedula.startsWith('0') ? [cedula, cedula.slice(1)] : [cedula];
  const [byCedula, byIdentification] = await Promise.all([
    queryUnique('envios', 'cedula', variants, 100, env),
    queryUnique('envios', 'numeroIdentificacion', variants, 100, env)
  ]);
  const map = new Map([...byCedula, ...byIdentification].map((row) => [row.id, row]));
  return [...map.values()];
}

export async function findEnvio(cedula, periodValue = '', env) {
  const rows = await findEnviosByCedula(cedula, env);
  if (!rows.length) return null;
  const requested = text(periodValue);
  const exact = requested
    ? rows.filter((row) => samePeriod(
        row.periodoId || row.periodoNombre || row.periodoLabel || row.periodo,
        requested
      ))
    : [];
  return latestBy(exact.length ? exact : rows, ['versionActual'], [
    'fechaResolucion', 'fechaEnvio', 'actualizadoEn', '_updateTime'
  ]);
}

async function related(collectionName, envioId, env) {
  return envioId ? queryEqual('TITULOS', collectionName, 'envioId', envioId, 1000, env) : [];
}

async function listCoordinators(env) {
  const [rows, careers] = await Promise.all([
    listCollection('TITULOS', 'coordinadores', { maxDocuments: 1000 }, env),
    listTitleCareers('', env)
  ]);
  const careerMap = new Map(careers.map((career) => [text(career.id).toLowerCase(), career.nombre]));

  return rows.map((row) => {
    const id = text(row.id || row._DocId || row._docId);
    const careerIds = Array.isArray(row.carrerasIds)
      ? row.carrerasIds.map(text).filter(Boolean)
      : splitList(row.carrerasIds || row.carreras);
    const careerNames = Array.isArray(row.carrerasNombres)
      ? row.carrerasNombres.map(text).filter(Boolean)
      : careerIds.map((careerId) => careerMap.get(careerId.toLowerCase()) || careerId);
    const status = normalizeStatus(row.estado || (row.activo === false ? 'INACTIVO' : 'ACTIVO'), 'ACTIVO');
    const name = text(row.nombre || row.coordinador);

    return {
      ...row,
      id,
      idRegistro: id,
      coordinadorId: id,
      nombre: name,
      coordinador: name,
      telegram: text(row.telegram),
      estado: status,
      activo: status !== 'INACTIVO',
      carrerasIds: careerIds,
      carrerasNombres: careerNames,
      carreras: careerNames,
      carrerasAsignadas: careerNames
    };
  }).filter((item) => item.id && item.nombre);
}

async function listEnvios(payload = {}, env) {
  let rows = await listCollection('TITULOS', 'envios', { maxDocuments: 10000 }, env);
  const careerFilters = splitList(payload.carreras || payload.carrera || payload.nombreCarrera)
    .map((item) => item.toLowerCase());
  const period = text(payload.periodoId || payload.periodoLabel || payload.periodo);
  const status = text(payload.estado) ? normalizeStatus(payload.estado, '') : '';

  if (careerFilters.length) {
    rows = rows.filter((row) => {
      const career = text(row.carreraNombre || row.nombreCarrera || row.carrera).toLowerCase();
      const careerId = text(row.carreraId).toLowerCase();
      return careerFilters.some((filter) => career === filter || careerId === filter || career.includes(filter));
    });
  }
  if (period) {
    rows = rows.filter((row) => samePeriod(
      row.periodoId || row.periodoNombre || row.periodoLabel || row.periodo,
      period
    ));
  }
  if (status) rows = rows.filter((row) => normalizeStatus(row.estado) === status);

  rows.sort((a, b) => {
    const dateA = Date.parse(a.fechaEnvio || a.actualizadoEn || a._updateTime || '') || 0;
    const dateB = Date.parse(b.fechaEnvio || b.actualizadoEn || b._updateTime || '') || 0;
    return dateB - dateA;
  });
  return rows.map(publicEnvio);
}

async function consultEnvio(payload = {}, env) {
  const cedula = normalizeCedula(payload.cedula || payload.numeroIdentificacion || payload.identificacion);
  const period = text(payload.periodoId || payload.periodoLabel || payload.periodo);
  const row = await findEnvio(cedula, period, env);
  if (!row) return { ok: true, existe: false, encontrado: false, tieneEnvio: false, cedula };
  const envio = publicEnvio(row);
  return {
    ok: true,
    existe: true,
    encontrado: true,
    tieneEnvio: envio.estado !== 'DEVUELTO',
    encontradoEnvio: true,
    permiteReenvio: envio.estado === 'DEVUELTO',
    estado: envio.estado,
    estadoFinal: envio.estado,
    envio,
    registro: envio,
    mensaje: envio.estado === 'DEVUELTO'
      ? 'El registro fue devuelto y puede corregirse.'
      : 'Envío encontrado correctamente en Firebase Títulos.'
  };
}

async function saveStudentSubmission(payload = {}, env) {
  const cedula = normalizeCedula(payload.cedula || payload.numeroIdentificacion);
  if (!cedula) throw new Error('No se recibió una cédula válida.');

  const titles = titlesFromPayload(payload);
  if (titles.some((title) => !title)) throw new Error('Debes enviar los tres títulos completos.');
  if (new Set(titles.map((title) => title.toLowerCase())).size !== 3) {
    throw new Error('Los tres títulos deben ser diferentes.');
  }

  const basic = await getStudentBasic(cedula, {
    periodoId: payload.periodoId || payload.periodo || payload.periodoLabel
  }, env);
  if (basic.encontrado !== true || !basic.estudiante) {
    throw new Error('La cédula no corresponde a un estudiante habilitado en Firebase UTET.');
  }

  const student = basic.estudiante;
  const periodId = normalizePeriodId(
    student.periodoId || payload.periodoId || payload.periodo || payload.periodoLabel
  );
  const periodLabel = text(student.periodoLabel || payload.periodoLabel || payload.periodo || periodId);
  if (!periodId) throw new Error('No se pudo determinar el período del estudiante.');

  const previous = await findEnvio(cedula, periodId, env);
  if (previous && normalizeStatus(previous.estado) !== 'DEVUELTO') {
    const error = new Error('Tus propuestas ya fueron enviadas y están siendo revisadas por coordinación.');
    error.duplicado = true;
    throw error;
  }

  const id = previous && previous.id || buildEnvioId(periodId, cedula);
  const versions = await related('versiones_envio', id, env);
  const versionNumber = versions.reduce((max, item) => Math.max(max, Number(item.numeroVersion || 0)), 0) + 1;
  const versionId = uniqueEventId(`${id}__v${String(versionNumber).padStart(3, '0')}`);
  const preferred = preferredFromPayload(payload, titles);
  const date = nowIso();
  const names = text(student.nombres || payload.nombres || payload.estudiante);
  const career = text(student.carrera || payload.carrera || payload.nombreCarrera);

  const envioData = {
    cedula,
    numeroIdentificacion: cedula,
    nombres: names,
    carreraNombre: career,
    carreraId: text(payload.carreraId || previous && previous.carreraId),
    carreraCodigo: text(student.codigoCarrera || payload.codigoCarrera || previous && previous.carreraCodigo),
    periodoId: periodId,
    periodoNombre: periodLabel || periodId,
    telegram: text(payload.telegram || payload.telegramUser),
    titulo1: titles[0],
    titulo2: titles[1],
    titulo3: titles[2],
    tituloPreferidoNumero: preferred,
    tituloFinal: null,
    estado: 'PENDIENTE_REVISION',
    observacion: null,
    coordinador: null,
    fechaEnvio: date,
    fechaResolucion: null,
    versionActual: versionNumber,
    versionActualId: versionId,
    resolucionActualId: null,
    requiereRevision: false,
    actualizadoEn: date
  };

  await commitDocuments('TITULOS', [
    {
      collection: 'versiones_envio',
      id: versionId,
      data: {
        envioId: id,
        numeroVersion: versionNumber,
        titulo1: titles[0],
        titulo2: titles[1],
        titulo3: titles[2],
        tituloPreferidoNumero: preferred,
        estado: 'PENDIENTE_REVISION',
        observacion: '',
        fechaEnvio: date
      },
      merge: false,
      exists: false
    },
    {
      collection: 'envios',
      id,
      data: envioData,
      merge: true,
      ...(previous && previous._updateTime
        ? { updateTime: previous._updateTime }
        : { exists: false })
    }
  ], env);

  return {
    ok: true,
    idRegistro: id,
    tituloId: id,
    envioId: id,
    versionId,
    numeroVersion: versionNumber,
    estado: 'PENDIENTE_REVISION',
    mensaje: 'Envío guardado correctamente en Firebase Títulos.'
  };
}

async function saveResolution(payload = {}, env) {
  const cedula = normalizeCedula(payload.cedula || payload.numeroIdentificacion);
  if (!cedula) throw new Error('No se recibió una cédula válida.');
  const period = text(payload.periodoId || payload.periodoLabel || payload.periodo);
  const envio = await findEnvio(cedula, period, env);
  if (!envio) throw new Error('No se encontró el envío del estudiante en Firebase Títulos.');

  const resolutions = await related('resoluciones', envio.id, env);
  const number = resolutions.reduce((max, item) => Math.max(max, Number(item.numeroResolucion || 0)), 0) + 1;
  const resolutionId = uniqueEventId(`${envio.id}__r${String(number).padStart(3, '0')}`);
  const status = normalizeStatus(payload.estadoFinal || payload.estado, 'APROBADO');
  const selected = cleanTitle(payload.tituloElegido || payload.preferido || envio.titulo1);
  const corrected = cleanTitle(payload.tituloCorregido);
  const finalTitle = corrected || selected;
  const observation = text(payload.observacion || payload.comentario || payload.comentarioCoordinador);
  const coordinator = text(payload.coordinador || payload.nombreCoordinador);
  const date = text(payload.fechaResolucion) || nowIso();

  await commitDocuments('TITULOS', [
    {
      collection: 'resoluciones',
      id: resolutionId,
      data: {
        envioId: envio.id,
        numeroResolucion: number,
        coordinador,
        estado: status,
        tituloElegido: selected,
        tituloCorregido: corrected,
        observacion: observation,
        fechaResolucion: date
      },
      merge: false,
      exists: false
    },
    {
      collection: 'envios',
      id: envio.id,
      data: {
        estado: status,
        tituloFinal: status === 'DEVUELTO' ? null : finalTitle,
        observacion: observation,
        coordinador,
        fechaResolucion: date,
        resolucionActualId: resolutionId,
        requiereRevision: status === 'DEVUELTO',
        actualizadoEn: date
      },
      merge: true,
      ...(envio._updateTime ? { updateTime: envio._updateTime } : {})
    }
  ], env);

  return {
    ok: true,
    envioId: envio.id,
    resolucionId: resolutionId,
    estado: status,
    estadoFinal: status,
    tituloFinal: status === 'DEVUELTO' ? '' : finalTitle,
    mensaje: status === 'DEVUELTO'
      ? 'Propuestas devueltas correctamente en Firebase Títulos.'
      : 'Resolución guardada correctamente en Firebase Títulos.'
  };
}

async function saveCoordinator(payload = {}, env) {
  const name = text(payload.nombre || payload.coordinador);
  const id = slug(payload.id || payload.idRegistro || payload.coordinadorId || name);
  if (!id || !name) throw new Error('El coordinador necesita un identificador y un nombre.');

  const careers = await listTitleCareers('', env);
  const byId = new Map(careers.map((career) => [text(career.id).toLowerCase(), career]));
  const byName = new Map(careers.map((career) => [text(career.nombre).toLowerCase(), career]));
  const inputCareers = splitList(payload.carrerasIds || payload.carreras || payload.carrerasAsignadas);
  const careerIds = [];
  const careerNames = [];

  for (const item of inputCareers) {
    const found = byId.get(item.toLowerCase()) || byName.get(item.toLowerCase());
    const careerId = found ? found.id : item;
    const careerName = found ? found.nombre : item;
    if (!careerIds.includes(careerId)) careerIds.push(careerId);
    if (!careerNames.includes(careerName)) careerNames.push(careerName);
  }

  const status = payload.activo === false || normalizeStatus(payload.estado, 'ACTIVO') === 'INACTIVO'
    ? 'INACTIVO'
    : 'ACTIVO';
  const saved = await setDocument('TITULOS', 'coordinadores', id, {
    nombre: name,
    telegram: text(payload.telegram),
    carrerasIds: careerIds,
    carrerasNombres: careerNames,
    estado: status,
    activo: status === 'ACTIVO',
    actualizadoEn: nowIso()
  }, { merge: true }, env);

  return {
    ok: true,
    coordinador: saved,
    id,
    mensaje: 'Coordinador guardado correctamente en Firebase Títulos.'
  };
}

async function deleteEnvio(payload = {}, env) {
  const envio = await findEnvio(
    payload.cedula || payload.numeroIdentificacion,
    payload.periodoId || payload.periodoLabel || payload.periodo,
    env
  );
  if (!envio) return { ok: true, eliminado: false, mensaje: 'El envío ya no existe.' };

  const [versions, resolutions] = await Promise.all([
    related('versiones_envio', envio.id, env),
    related('resoluciones', envio.id, env)
  ]);
  await Promise.all([
    ...versions.map((item) => deleteDocument('TITULOS', 'versiones_envio', item.id, env)),
    ...resolutions.map((item) => deleteDocument('TITULOS', 'resoluciones', item.id, env))
  ]);
  await deleteDocument('TITULOS', 'envios', envio.id, env);
  return { ok: true, eliminado: true, envioId: envio.id, mensaje: 'Envío eliminado correctamente.' };
}

async function summaryAdmin(env) {
  const envios = await listEnvios({}, env);
  const counts = envios.reduce((output, item) => {
    output[item.estado] = (output[item.estado] || 0) + 1;
    return output;
  }, {});
  return {
    ok: true,
    total: envios.length,
    envios,
    estados: counts,
    pendientes: counts.PENDIENTE_REVISION || 0,
    aprobados: counts.APROBADO || 0,
    reemplazados: counts.REEMPLAZADO || 0,
    devueltos: counts.DEVUELTO || 0,
    fuente: 'FIREBASE_TITULOS'
  };
}

async function configPublic(env) {
  const rows = await listCollection('TITULOS', 'configuracion', { maxDocuments: 500 }, env);
  const general = rows.find((item) => item.id === 'general') || {};
  return {
    ok: true,
    activo: general.enviosHabilitados !== false,
    nombre: 'Firebase Títulos',
    version: text(general.version || 'firebase-2'),
    estado: general.enviosHabilitados === false ? 'INACTIVO' : 'ACTIVO',
    mensaje: general.mensaje || 'Conexión autenticada con Firebase Títulos.',
    projectId: 'titulos-ec2fa',
    origenConfig: 'firebase-iam'
  };
}

export async function executeTitulosAction(action, payload = {}, userRole = 'student', env) {
  const normalized = text(action).toUpperCase();

  if (normalized === 'PING') return pingProject('TITULOS', env);
  if (normalized === 'CONFIGURACION_PUBLICA') return configPublic(env);
  if (normalized === 'LISTAR_COORDINADORES' || normalized === 'SINCRONIZAR_COORDINADORES') {
    const coordinadores = await listCoordinators(env);
    return { ok: true, coordinadores, registros: coordinadores, total: coordinadores.length };
  }
  if (normalized === 'LISTAR_ENVIOS_COORDINADOR' || normalized === 'LISTAR_ENVIOS_POR_CARRERA') {
    const envios = await listEnvios(payload, env);
    return { ok: true, envios, registros: envios, filas: envios, total: envios.length };
  }
  if (['CONSULTAR_ENVIO_BASE_CEDULA', 'CONSULTAR_ENVIO_CEDULA', 'VERIFICAR_ENVIO'].includes(normalized)) {
    return consultEnvio(payload, env);
  }
  if (normalized === 'CONSULTAR_RESOLUCION_CEDULA') {
    const envio = await findEnvio(
      payload.cedula || payload.numeroIdentificacion,
      payload.periodoId || payload.periodoLabel || payload.periodo,
      env
    );
    if (!envio) return { ok: true, encontrado: false, existe: false };
    const resolutions = await related('resoluciones', envio.id, env);
    const resolution = latestBy(resolutions, ['numeroResolucion'], ['fechaResolucion', '_updateTime']);
    return {
      ok: true,
      encontrado: Boolean(resolution),
      existe: Boolean(resolution),
      resolucion: resolution,
      registro: resolution
    };
  }
  if (normalized === 'ENVIO_ESTUDIANTE') return saveStudentSubmission(payload, env);
  if ([
    'APROBAR_ENVIO_COORDINADOR',
    'DEVOLVER_ENVIO_COORDINADOR',
    'GUARDAR_REVISION_COORDINADOR',
    'GUARDAR_RESOLUCION',
    'MOVER_DEVUELTO_COORDINADOR',
    'ADMIN_DEVOLVER_TITULOS'
  ].includes(normalized)) return saveResolution(payload, env);
  if (['GUARDAR_COORDINADOR', 'ACTUALIZAR_COORDINADOR', 'CAMBIAR_ESTADO_COORDINADOR', 'ASIGNAR_CARRERA'].includes(normalized)) {
    return saveCoordinator(payload, env);
  }
  if (normalized === 'ADMIN_ELIMINAR_TITULOS') return deleteEnvio(payload, env);
  if (normalized === 'RESUMEN_ADMINISTRADOR') return summaryAdmin(env);
  if (normalized === 'LISTAR_PENDIENTES_SYNC') return { ok: true, pendientes: [], registros: [], total: 0 };
  if (normalized === 'LISTAR_LOGS' || normalized === 'LISTAR_HISTORIAL_REPARACIONES') {
    const rows = await listCollection('TITULOS', 'migraciones', { maxDocuments: 1000 }, env);
    return { ok: true, logs: rows, registros: rows, total: rows.length };
  }
  if (normalized === 'GUARDAR_LOG') {
    const id = `LOG_${Date.now()}`;
    const log = await setDocument('TITULOS', 'migraciones', id, {
      tipo: 'LOG',
      estado: 'REGISTRADO',
      rol: userRole,
      detalle: payload,
      creadoEn: nowIso()
    }, { merge: false, exists: false }, env);
    return { ok: true, log };
  }
  if (normalized === 'CONSULTAR_ESTUDIANTE') {
    return getStudentBasic(payload.cedula || payload.numeroIdentificacion, {
      periodoId: payload.periodoId || payload.periodo,
      includePhone: userRole === 'admin'
    }, env);
  }
  if (normalized === 'LISTAR_BASE_ESTUDIANTES') {
    return {
      ok: true,
      registros: [],
      estudiantes: [],
      total: 0,
      mensaje: 'La consulta de estudiantes se realiza por cédula para no descargar la base institucional completa.'
    };
  }
  if (normalized === 'ANALIZAR_GOOGLE_SHEETS' || normalized === 'CORREGIR_GOOGLE_SHEETS') {
    return { ok: false, mensaje: 'Google Sheets ya no es la base activa. El sistema trabaja con Firebase.' };
  }

  throw new Error('Acción de Títulos no implementada en Firebase: ' + action);
}

export async function publicTitleConfiguration(env) {
  return configPublic(env);
}

export async function titlePeriodsAndCareers(env) {
  const [periods, careers] = await Promise.all([
    listTitlePeriods(env),
    listTitleCareers('', env)
  ]);
  return { periods, careers };
}
