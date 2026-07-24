/* Operación completa de Titulación sobre Firebase titulos-ec2fa. */

import {
  deleteDocument,
  latestBy,
  listCollection,
  normalizeCedula,
  nowIso,
  periodSignature,
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

function valueFrom(item) {
  if (typeof item === 'string') return cleanTitle(item);
  item = item || {};
  return cleanTitle(item.tituloFinal || item.titulo || item.tituloMejorado || item.texto || item.title);
}

function titleValues(payload) {
  const proposals = Array.isArray(payload.propuestas)
    ? payload.propuestas
    : Array.isArray(payload.titulosEnviados)
      ? payload.titulosEnviados
      : [];
  return [1, 2, 3].map((number, index) => cleanTitle(
    payload[`titulo${number}`] || valueFrom(proposals[index])
  ));
}

function preferredNumber(payload, titles) {
  const raw = Number(payload.tituloPreferidoNumero || payload.preferido || payload.favorito || 0);
  if ([1, 2, 3].includes(raw) && titles[raw - 1]) return raw;
  const preferredText = cleanTitle(payload.tituloPreferido || payload.tituloPreferidoTexto);
  const matched = titles.findIndex((title) => title && title === preferredText);
  return matched >= 0 ? matched + 1 : 1;
}

function normalizePeriodId(value) {
  const raw = text(value);
  if (!raw) return '';
  const signature = periodSignature(raw);
  return text(signature || raw).replace(/\//g, '-');
}

function envioId(periodId, cedula) {
  return `${normalizePeriodId(periodId) || 'sin_periodo'}__${normalizeCedula(cedula)}`;
}

function splitList(value) {
  if (Array.isArray(value)) return value.map(text).filter(Boolean);
  return text(value).split(/[,;|\n]+/).map(text).filter(Boolean);
}

function publicEnvio(row) {
  row = row || {};
  const preferred = Number(row.tituloPreferidoNumero || row.preferido || 0);
  const titles = [cleanTitle(row.titulo1), cleanTitle(row.titulo2), cleanTitle(row.titulo3)];
  const career = text(row.carreraNombre || row.nombreCarrera || row.carrera);
  const periodId = text(row.periodoId || row.periodId);
  const periodLabel = text(row.periodoNombre || row.periodoLabel || row.periodo || periodId);
  const names = text(row.nombres || row.estudiante || row.Nombres);
  const status = normalizeStatus(row.estado || row.estadoFinal);
  const finalTitle = cleanTitle(row.tituloFinal || row.tituloCorregido || row.tituloElegido);
  const observation = text(row.observacion || row.comentarioCoordinador || row.comentario);

  return {
    ...row,
    id: text(row.id || row._docId),
    _id: text(row.id || row._docId),
    idRegistro: text(row.id || row._docId),
    envioId: text(row.id || row._docId),
    cedula: normalizeCedula(row.cedula || row.numeroIdentificacion),
    numeroIdentificacion: normalizeCedula(row.cedula || row.numeroIdentificacion),
    nombres: names,
    estudiante: names,
    carrera: career,
    nombreCarrera: career,
    periodoId,
    periodo: periodLabel,
    periodoLabel: periodLabel,
    titulo1: titles[0],
    titulo2: titles[1],
    titulo3: titles[2],
    preferido: preferred,
    tituloPreferidoNumero: preferred,
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

async function findEnviosByCedula(cedula) {
  const canonical = normalizeCedula(cedula);
  if (!canonical) return [];
  const variants = canonical.startsWith('0') ? [canonical, canonical.slice(1)] : [canonical];
  const rows = [];
  const seen = new Set();
  for (const value of variants) {
    for (const field of ['cedula', 'numeroIdentificacion']) {
      const found = await queryEqual('TITULOS', 'envios', field, value, 100);
      for (const row of found) {
        if (seen.has(row.id)) continue;
        seen.add(row.id);
        rows.push(row);
      }
    }
  }
  return rows;
}

export async function findEnvio(cedula, periodValue = '') {
  const rows = await findEnviosByCedula(cedula);
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

async function related(collectionName, field, value) {
  if (!value) return [];
  return queryEqual('TITULOS', collectionName, field, value, 500);
}

async function listCoordinators() {
  const [coordinators, careers] = await Promise.all([
    listCollection('TITULOS', 'coordinadores', { maxDocuments: 1000 }),
    listTitleCareers('')
  ]);
  const careerMap = new Map(careers.map((career) => [career.id, career.nombre]));

  return coordinators.map((item) => {
    const ids = Array.isArray(item.carrerasIds)
      ? item.carrerasIds.map(text).filter(Boolean)
      : splitList(item.carrerasIds || item.carreras);
    const names = Array.isArray(item.carrerasNombres)
      ? item.carrerasNombres.map(text).filter(Boolean)
      : ids.map((id) => careerMap.get(id) || id);
    const status = normalizeStatus(item.estado || (item.activo === false ? 'INACTIVO' : 'ACTIVO'), 'ACTIVO');
    return {
      ...item,
      id: text(item.id || item._docId),
      idRegistro: text(item.id || item._docId),
      coordinadorId: text(item.id || item._docId),
      nombre: text(item.nombre || item.coordinador),
      coordinador: text(item.nombre || item.coordinador),
      telegram: text(item.telegram),
      estado: status,
      activo: status !== 'INACTIVO',
      carrerasIds: ids,
      carrerasNombres: names,
      carreras: names,
      carrerasAsignadas: names
    };
  });
}

async function listEnvios(payload = {}) {
  let rows = await listCollection('TITULOS', 'envios', { maxDocuments: 10000 });
  const careerFilters = splitList(payload.carreras || payload.carrera || payload.nombreCarrera)
    .map((item) => item.toLowerCase());
  const period = text(payload.periodoId || payload.periodoLabel || payload.periodo);
  const status = normalizeStatus(payload.estado, '');

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

  rows.sort((a, b) => Date.parse(b.fechaEnvio || b.actualizadoEn || b._updateTime || '') - Date.parse(a.fechaEnvio || a.actualizadoEn || a._updateTime || ''));
  return rows.map(publicEnvio);
}

async function consultEnvio(payload = {}) {
  const cedula = normalizeCedula(payload.cedula || payload.numeroIdentificacion || payload.identificacion);
  const period = text(payload.periodoId || payload.periodoLabel || payload.periodo);
  const row = await findEnvio(cedula, period);
  if (!row) {
    return {
      ok: true,
      existe: false,
      encontrado: false,
      tieneEnvio: false,
      cedula
    };
  }
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

async function saveStudentSubmission(payload = {}) {
  const cedula = normalizeCedula(payload.cedula || payload.numeroIdentificacion);
  if (!cedula) throw new Error('No se recibió una cédula válida.');

  const titles = titleValues(payload);
  if (titles.some((title) => !title)) throw new Error('Debes enviar los tres títulos completos.');
  if (new Set(titles.map((title) => title.toLowerCase())).size !== 3) {
    throw new Error('Los tres títulos deben ser diferentes.');
  }

  const basic = await getStudentBasic(cedula, {
    periodoId: payload.periodoId || payload.periodo || payload.periodoLabel
  });
  const student = basic.estudiante || {};
  const periodId = normalizePeriodId(
    payload.periodoId || student.periodoId || payload.periodo || payload.periodoLabel
  );
  const periodLabel = text(
    payload.periodoLabel || payload.periodo || student.periodoLabel || periodId
  );
  if (!periodId) throw new Error('No se pudo determinar el período del estudiante.');

  const previous = await findEnvio(cedula, periodId);
  if (previous && normalizeStatus(previous.estado) !== 'DEVUELTO') {
    const error = new Error('Tus propuestas ya fueron enviadas y están siendo revisadas por coordinación.');
    error.duplicado = true;
    throw error;
  }

  const id = previous && previous.id || envioId(periodId, cedula);
  const versions = await related('versiones_envio', 'envioId', id);
  const versionNumber = versions.reduce((max, item) => Math.max(max, Number(item.numeroVersion || 0)), 0) + 1;
  const versionId = `${id}__v${String(versionNumber).padStart(3, '0')}`;
  const preferred = preferredNumber(payload, titles);
  const date = nowIso();
  const names = text(payload.nombres || payload.estudiante || student.nombres || previous && previous.nombres);
  const career = text(payload.carrera || payload.nombreCarrera || student.carrera || previous && previous.carreraNombre);

  await setDocument('TITULOS', 'versiones_envio', versionId, {
    envioId: id,
    numeroVersion: versionNumber,
    titulo1: titles[0],
    titulo2: titles[1],
    titulo3: titles[2],
    tituloPreferidoNumero: preferred,
    estado: 'PENDIENTE_REVISION',
    observacion: '',
    fechaEnvio: date
  });

  await setDocument('TITULOS', 'envios', id, {
    cedula,
    nombres: names,
    carreraNombre: career,
    carreraId: text(payload.carreraId || previous && previous.carreraId),
    carreraCodigo: text(payload.codigoCarrera || student.codigoCarrera || previous && previous.carreraCodigo),
    periodoId,
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
    versionActualId: versionId,
    resolucionActualId: null,
    requiereRevision: false,
    actualizadoEn: date
  });

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

async function saveResolution(payload = {}) {
  const cedula = normalizeCedula(payload.cedula || payload.numeroIdentificacion);
  if (!cedula) throw new Error('No se recibió una cédula válida.');
  const period = text(payload.periodoId || payload.periodoLabel || payload.periodo);
  const envio = await findEnvio(cedula, period);
  if (!envio) throw new Error('No se encontró el envío del estudiante en Firebase Títulos.');

  const resolutions = await related('resoluciones', 'envioId', envio.id);
  const number = resolutions.reduce((max, item) => Math.max(max, Number(item.numeroResolucion || 0)), 0) + 1;
  const resolutionId = `${envio.id}__r${String(number).padStart(3, '0')}`;
  const status = normalizeStatus(payload.estadoFinal || payload.estado, 'APROBADO');
  const selected = cleanTitle(payload.tituloElegido || payload.preferido || envio.titulo1);
  const corrected = cleanTitle(payload.tituloCorregido);
  const finalTitle = corrected || selected;
  const observation = text(payload.observacion || payload.comentario || payload.comentarioCoordinador);
  const coordinator = text(payload.coordinador || payload.nombreCoordinador);
  const date = text(payload.fechaResolucion) || nowIso();

  await setDocument('TITULOS', 'resoluciones', resolutionId, {
    envioId: envio.id,
    numeroResolucion: number,
    coordinador,
    estado: status,
    tituloElegido: selected,
    tituloCorregido: corrected,
    observacion: observation,
    fechaResolucion: date
  });

  await setDocument('TITULOS', 'envios', envio.id, {
    estado: status,
    tituloFinal: status === 'DEVUELTO' ? null : finalTitle,
    observacion: observation,
    coordinador,
    fechaResolucion: date,
    resolucionActualId: resolutionId,
    requiereRevision: status === 'DEVUELTO',
    actualizadoEn: date
  });

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

async function saveCoordinator(payload = {}) {
  const name = text(payload.nombre || payload.coordinador);
  const id = slug(payload.id || payload.idRegistro || payload.coordinadorId || name);
  if (!id || !name) throw new Error('El coordinador necesita un identificador y un nombre.');

  const careers = await listTitleCareers('');
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
  });

  return {
    ok: true,
    coordinador: saved,
    id,
    mensaje: 'Coordinador guardado correctamente en Firebase Títulos.'
  };
}

async function deleteEnvio(payload = {}) {
  const envio = await findEnvio(
    payload.cedula || payload.numeroIdentificacion,
    payload.periodoId || payload.periodoLabel || payload.periodo
  );
  if (!envio) return { ok: true, eliminado: false, mensaje: 'El envío ya no existe.' };
  const [versions, resolutions] = await Promise.all([
    related('versiones_envio', 'envioId', envio.id),
    related('resoluciones', 'envioId', envio.id)
  ]);
  await Promise.all([
    ...versions.map((item) => deleteDocument('TITULOS', 'versiones_envio', item.id)),
    ...resolutions.map((item) => deleteDocument('TITULOS', 'resoluciones', item.id))
  ]);
  await deleteDocument('TITULOS', 'envios', envio.id);
  return { ok: true, eliminado: true, envioId: envio.id, mensaje: 'Envío eliminado correctamente.' };
}

async function summaryAdmin() {
  const envios = await listEnvios({});
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

async function configPublic() {
  const rows = await listCollection('TITULOS', 'configuracion', { maxDocuments: 500 });
  const general = rows.find((item) => item.id === 'general') || {};
  return {
    ok: true,
    activo: general.enviosHabilitados !== false,
    nombre: 'Firebase Títulos',
    version: text(general.version || 'firebase-1'),
    estado: general.enviosHabilitados === false ? 'INACTIVO' : 'ACTIVO',
    mensaje: general.mensaje || 'Conexión directa con Firebase Títulos.',
    projectId: 'titulos-ec2fa',
    origenConfig: 'firebase'
  };
}

export async function executeTitulosAction(action, payload = {}, userRole = 'student') {
  const normalized = text(action).toUpperCase();

  if (normalized === 'PING') {
    return { ok: true, servicio: 'TITULOS', projectId: 'titulos-ec2fa', fuente: 'FIREBASE_TITULOS' };
  }
  if (normalized === 'CONFIGURACION_PUBLICA') return configPublic();
  if (normalized === 'LISTAR_COORDINADORES' || normalized === 'SINCRONIZAR_COORDINADORES') {
    const coordinadores = await listCoordinators();
    return { ok: true, coordinadores, registros: coordinadores, total: coordinadores.length };
  }
  if (normalized === 'LISTAR_ENVIOS_COORDINADOR' || normalized === 'LISTAR_ENVIOS_POR_CARRERA') {
    const envios = await listEnvios(payload);
    return { ok: true, envios, registros: envios, filas: envios, total: envios.length };
  }
  if (['CONSULTAR_ENVIO_BASE_CEDULA', 'CONSULTAR_ENVIO_CEDULA', 'VERIFICAR_ENVIO'].includes(normalized)) {
    return consultEnvio(payload);
  }
  if (normalized === 'CONSULTAR_RESOLUCION_CEDULA') {
    const envio = await findEnvio(
      payload.cedula || payload.numeroIdentificacion,
      payload.periodoId || payload.periodoLabel || payload.periodo
    );
    if (!envio) return { ok: true, encontrado: false, existe: false };
    const resolutions = await related('resoluciones', 'envioId', envio.id);
    const resolution = latestBy(resolutions, ['numeroResolucion'], ['fechaResolucion', '_updateTime']);
    return {
      ok: true,
      encontrado: Boolean(resolution),
      existe: Boolean(resolution),
      resolucion: resolution,
      registro: resolution
    };
  }
  if (normalized === 'ENVIO_ESTUDIANTE') return saveStudentSubmission(payload);
  if ([
    'APROBAR_ENVIO_COORDINADOR',
    'DEVOLVER_ENVIO_COORDINADOR',
    'GUARDAR_REVISION_COORDINADOR',
    'GUARDAR_RESOLUCION',
    'MOVER_DEVUELTO_COORDINADOR',
    'ADMIN_DEVOLVER_TITULOS'
  ].includes(normalized)) return saveResolution(payload);
  if (['GUARDAR_COORDINADOR', 'ACTUALIZAR_COORDINADOR', 'CAMBIAR_ESTADO_COORDINADOR', 'ASIGNAR_CARRERA'].includes(normalized)) {
    return saveCoordinator(payload);
  }
  if (normalized === 'ADMIN_ELIMINAR_TITULOS') return deleteEnvio(payload);
  if (normalized === 'RESUMEN_ADMINISTRADOR') return summaryAdmin();
  if (normalized === 'LISTAR_PENDIENTES_SYNC') return { ok: true, pendientes: [], registros: [], total: 0 };
  if (normalized === 'LISTAR_LOGS' || normalized === 'LISTAR_HISTORIAL_REPARACIONES') {
    const rows = await listCollection('TITULOS', 'migraciones', { maxDocuments: 1000 });
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
    });
    return { ok: true, log };
  }
  if (normalized === 'CONSULTAR_ESTUDIANTE') {
    return getStudentBasic(payload.cedula || payload.numeroIdentificacion, {
      periodoId: payload.periodoId || payload.periodo,
      includePhone: userRole === 'admin'
    });
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
    return {
      ok: false,
      mensaje: 'Google Sheets ya no es la base activa. El sistema trabaja con Firebase.'
    };
  }

  throw new Error('Acción de Títulos no implementada en Firebase: ' + action);
}

export async function publicTitleConfiguration() {
  return configPublic();
}

export async function titlePeriodsAndCareers() {
  const [periods, careers] = await Promise.all([listTitlePeriods(), listTitleCareers('')]);
  return { periods, careers };
}
