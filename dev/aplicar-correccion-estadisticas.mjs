import fs from 'node:fs';

function read(file) { return fs.readFileSync(file, 'utf8'); }
function write(file, value) { fs.writeFileSync(file, value, 'utf8'); }
function replaceRequired(file, from, to) {
  const src = read(file);
  if (!src.includes(from)) throw new Error(`No se encontró el bloque esperado en ${file}: ${from.slice(0, 120)}`);
  write(file, src.replace(from, to));
}
function replaceAllRequired(file, from, to) {
  const src = read(file);
  if (!src.includes(from)) throw new Error(`No se encontró el texto esperado en ${file}: ${from}`);
  write(file, src.split(from).join(to));
}

const VERSION = '3.6.3';

const stateHelper = `import { batchGetDocuments, text } from './firestore-fixed.js';
import { normalizarEstadoProceso } from './workflow-titulacion.js';

function legacyStatus(processStatus) {
  return processStatus === 'PENDIENTE_COORDINADOR' ? 'PENDIENTE_REVISION' : processStatus;
}

export function estadoActualEnvio(envio = {}) {
  return normalizarEstadoProceso(envio.estadoProceso || envio.estado || envio.estadoFinal);
}

async function cargarEnvios(ids, env) {
  const unique = [...new Set((ids || []).map(text).filter(Boolean))];
  const rows = [];
  for (let offset = 0; offset < unique.length; offset += 100) {
    rows.push(...await batchGetDocuments(
      'TITULOS',
      unique.slice(offset, offset + 100).map((documentId) => ({ collectionName: 'envios', documentId })),
      env
    ));
  }
  return rows;
}

function reconciliarFila(row, envio) {
  if (!row || !envio) return row;
  const estadoProceso = estadoActualEnvio(envio);
  const tipoTrabajo = text(envio.tipoTrabajo) || text(row.tipoTrabajo);
  return {
    ...row,
    estadoProceso,
    estado: legacyStatus(estadoProceso),
    tituloCoordinador: text(envio.tituloCoordinador || envio.tituloValidadoCoordinador),
    tituloFinal: text(envio.tituloFinalInvestigacion || envio.tituloFinal || envio.tituloAprobado || envio.tituloCorregido),
    resultadoCoordinador: text(envio.resultadoCoordinador),
    resultadoInvestigacion: text(envio.resultadoInvestigacion),
    observacionInvestigacion: text(envio.observacionInvestigacion),
    fechaValidacionCoordinador: text(envio.fechaValidacionCoordinador),
    fechaResolucionInvestigacion: text(envio.fechaResolucionInvestigacion),
    tipoTrabajo,
    tipoTrabajoLabel: tipoTrabajo === 'TRABAJO_TITULACION'
      ? 'Trabajo de Titulación'
      : tipoTrabajo === 'ARTICULO_ACADEMICO'
        ? 'Artículo académico'
        : text(row.tipoTrabajoLabel)
  };
}

export async function reconcileAdminGlobalState(global = {}, env) {
  const registros = Array.isArray(global.registros) ? global.registros : [];
  const fuera = Array.isArray(global.fueraPoblacion) ? global.fueraPoblacion : [];
  const ids = [...registros, ...fuera]
    .map((item) => text(item && item.envioId))
    .filter(Boolean);
  if (!ids.length) return global;

  const envios = await cargarEnvios(ids, env);
  const byId = new Map(envios.map((item) => [text(item.id), item]));
  const reconciliar = (rows) => rows.map((row) =>
    reconciliarFila(row, byId.get(text(row && row.envioId)))
  );
  const nuevosRegistros = reconciliar(registros);
  const nuevosFuera = reconciliar(fuera);

  return {
    ...global,
    registros: nuevosRegistros,
    estudiantes: nuevosRegistros,
    faltantes: nuevosRegistros.filter((item) => text(item.estado).toUpperCase() === 'NO_ENVIADO'),
    fueraPoblacion: nuevosFuera,
    estadosReconciliadosConEnvios: true
  };
}
`;
write('functions/_lib/admin-global-state.js', stateHelper);

const statsFacade = `/* Fachada administrativa optimizada.
 * La vista materializada se conserva como optimización, pero cada lectura se
 * reconcilia con el documento real de envío para no perder estados del flujo.
 */
import {
  assignCareerCoordinator,
  buildAdminGlobalList as buildAdminGlobalListV8,
  listAdminCareers,
  listAdminPeriodsCatalog,
  saveAdminPeriod
} from './admin-global-v8.js';
import {
  readAdminGlobalView,
  saveAdminView,
  statisticsFromGlobal
} from './admin-view.js';
import { reconcileAdminGlobalState } from './admin-global-state.js';
import { samePeriod, text } from './firestore-fixed.js';

export {
  assignCareerCoordinator,
  listAdminCareers,
  listAdminPeriodsCatalog,
  saveAdminPeriod
};

function periodItems(catalog) {
  return catalog && (catalog.periodos || catalog.registros) || [];
}

export function enrichAdminPeriodPayload(payload = {}, catalog = {}) {
  const input = { ...(payload || {}) };
  const requested = text(input.periodoId || input.periodoLabel || input.periodo || input.documentId);
  if (!requested) return input;

  const items = periodItems(catalog);
  const target = items.find((item) =>
    text(item && item.id) === requested ||
    text(item && item.periodoId) === requested ||
    text(item && item.documentId) === requested ||
    text(item && item.label) === requested ||
    text(item && item.periodoLabel) === requested
  ) || items.find((item) =>
    samePeriod(item && (item.id || item.periodoId), requested) ||
    samePeriod(item && (item.label || item.periodoLabel), requested)
  );

  if (!target) return input;
  const canonical = text(target.id || target.periodoId || requested);
  const label = text(target.label || target.periodoLabel);
  const documentId = text(target.documentId);
  const existingPeriod = text(input.periodo);
  return {
    ...input,
    periodoId: text(input.periodoId) || canonical,
    periodoLabel: text(input.periodoLabel) || label,
    periodo: documentId || existingPeriod || label || requested,
    documentId: text(input.documentId) || documentId
  };
}

async function resolveAdminPeriodPayload(payload, env) {
  const input = { ...(payload || {}) };
  const requested = text(input.periodoId || input.periodoLabel || input.periodo || input.documentId);
  if (!requested) return input;
  try {
    const catalog = await listAdminPeriodsCatalog(env);
    return enrichAdminPeriodPayload(input, catalog);
  } catch (_error) {
    return input;
  }
}

async function reconciled(view, env) {
  return view ? reconcileAdminGlobalState(view, env) : null;
}

async function rebuildGlobal(payload, env) {
  const raw = await buildAdminGlobalListV8(payload, env);
  const rebuilt = await reconcileAdminGlobalState(raw, env);
  try {
    return await saveAdminView(rebuilt, env);
  } catch (_error) {
    return { ...rebuilt, vistaAdministrativa: false, vistaError: true };
  }
}

export async function buildAdminGlobalList(payload = {}, env) {
  if (payload.forzarVista !== true) {
    try {
      const direct = await readAdminGlobalView(payload, env);
      if (direct) return reconciled(direct, env);
    } catch (_error) {}
  }

  const resolved = await resolveAdminPeriodPayload(payload, env);
  if (resolved.forzarVista !== true) {
    try {
      const cached = await readAdminGlobalView(resolved, env);
      if (cached) return reconciled(cached, env);
    } catch (_error) {}
  }
  return rebuildGlobal(resolved, env);
}

export async function buildAdminStatistics(payload = {}, env) {
  const global = await buildAdminGlobalList(payload, env);
  const statistics = statisticsFromGlobal(global);
  const resumen = statistics.resumen || {};
  return {
    ...statistics,
    mensaje: 'Estadísticas calculadas con el estado actual reconciliado: ' +
      Number(resumen.esperados || 0) + ' estudiantes, ' +
      Number(resumen.enviados || 0) + ' con envío.'
  };
}
`;
write('functions/_lib/estadisticas-admin.js', statsFacade);

let reviews = read('functions/_lib/revisiones-admin.js');
replaceRequired(
  'functions/_lib/revisiones-admin.js',
  "  const eventos = await queryEqual('TITULOS', 'workflow_eventos', 'rol', rol, 10000, env);\n  const envios = await cargarEnvios(eventos.map((item) => item.envioId), env);",
  "  const eventos = await queryEqual('TITULOS', 'workflow_eventos', 'rol', rol, 10000, env);\n  if (eventos.length >= 10000) {\n    throw new Error('El historial alcanzó el límite seguro de 10.000 revisiones. Aplica filtros más específicos antes de generar el reporte.');\n  }\n  const envios = await cargarEnvios(eventos.map((item) => item.envioId), env);"
);
reviews = read('functions/_lib/revisiones-admin.js');
const oldFields = `      cedula: text(envio.cedula || envio.numeroIdentificacion),
      estudiante: text(envio.nombres || envio.estudiante || envio.nombreCompleto),
      carrera: text(envio.carreraNombre || envio.carrera),
      periodoId: text(envio.periodoId),
      periodo: text(envio.periodoLabel || envio.periodoNombre || envio.periodo || envio.periodoId),
      tipoTrabajo: tipoTrabajo(envio.tipoTrabajo),
      tipoTrabajoLabel: tipoTrabajo(envio.tipoTrabajo) === 'TRABAJO_TITULACION' ? 'Trabajo de Titulación' : 'Artículo académico'`;
const newFields = `      cedula: text(event.cedula || envio.cedula || envio.numeroIdentificacion),
      estudiante: text(event.estudiante || event.nombres || envio.nombres || envio.estudiante || envio.nombreCompleto),
      carrera: text(event.carrera || envio.carreraNombre || envio.carrera),
      periodoId: text(event.periodoId || envio.periodoId),
      periodo: text(event.periodo || event.periodoLabel || envio.periodoLabel || envio.periodoNombre || envio.periodo || envio.periodoId),
      tipoTrabajo: tipoTrabajo(event.tipoTrabajo || envio.tipoTrabajo),
      tipoTrabajoLabel: tipoTrabajo(event.tipoTrabajo || envio.tipoTrabajo) === 'TRABAJO_TITULACION'
        ? 'Trabajo de Titulación'
        : tipoTrabajo(event.tipoTrabajo || envio.tipoTrabajo) === 'ARTICULO_ACADEMICO'
          ? 'Artículo académico'
          : 'Sin tipo registrado'`;
if (!reviews.includes(oldFields)) throw new Error('No se encontró el bloque de contexto histórico en revisiones-admin.js');
write('functions/_lib/revisiones-admin.js', reviews.replace(oldFields, newFields));
replaceRequired(
  'functions/_lib/revisiones-admin.js',
  "    const envio = enviosById.get(row.envioId) || {};\n    if (!mismoPeriodo(envio, requestedPeriod)) return false;",
  "    if (!mismoPeriodo(row, requestedPeriod)) return false;"
);

replaceRequired(
  'functions/api/titulos.js',
  "        revisorNombre: text(payload.coordinador || payload.nombreCoordinador),\n        accion: cambio ? 'CORREGIR_VALIDAR' : 'VALIDAR',",
  "        revisorNombre: text(payload.coordinador || payload.nombreCoordinador),\n        cedula: normalizeCedula(envio.cedula || envio.numeroIdentificacion),\n        estudiante: text(envio.nombres || envio.estudiante || envio.nombreCompleto),\n        carrera: text(envio.carreraNombre || envio.carrera),\n        periodoId: text(envio.periodoId),\n        periodo: text(envio.periodoLabel || envio.periodoNombre || envio.periodo || envio.periodoId),\n        tipoTrabajo: text(envio.tipoTrabajo),\n        accion: cambio ? 'CORREGIR_VALIDAR' : 'VALIDAR',"
);
replaceRequired(
  'functions/api/investigadores.js',
  "        revisorNombre: actual.nombre,\n        accion,\n        resultado,",
  "        revisorNombre: actual.nombre,\n        cedula: text(envio.cedula || envio.numeroIdentificacion),\n        estudiante: nombresEnvio(envio),\n        carrera: carreraEnvio(envio),\n        periodoId: text(envio.periodoId),\n        periodo: text(envio.periodoLabel || envio.periodoNombre || envio.periodo || envio.periodoId),\n        tipoTrabajo: text(envio.tipoTrabajo),\n        accion,\n        resultado,"
);

replaceAllRequired('administrador/ad-js/ad-servicios.app.js', "var VERSION='3.6.2';", `var VERSION='${VERSION}';`);
replaceRequired(
  'administrador/ad-js/ad-servicios.app.js',
  "    cargarComplemento('./ad-js/ad-estadisticas-control.patch.js','data-ad-estadisticas-control');\n",
  ''
);
replaceAllRequired('administrador/ad-js/ad-estadisticas-minimal.js', "var VERSION='3.6.2';", `var VERSION='${VERSION}';`);
replaceAllRequired('administrador/ad-js/ad-google-sheets.app.js', "var VERSION='3.6.0';", `var VERSION='${VERSION}';`);
replaceAllRequired('administrador/ad-js/ad-version.js', "var VERSION='3.6.0';", `var VERSION='${VERSION}';`);
replaceRequired(
  'administrador/ad-js/ad-google-sheets.app.js',
  "    if(id==='ad-seccion-estadisticas'&&!state.estadisticas&&state.periodos.length)cargarEstadisticas();",
  "    if(id==='ad-seccion-estadisticas'&&!window.ADAdminStatsMinimal&&!state.estadisticas&&state.periodos.length)cargarEstadisticas();"
);
replaceAllRequired('administrador/ad-js/ad-api.service.js', '?v=3.6.0', `?v=${VERSION}`);
replaceAllRequired('administrador/ad-js/ad-api.service.js', '?v=3.6.1', `?v=${VERSION}`);
replaceAllRequired('administrador/ad-index.html', '?v=3.6.0', `?v=${VERSION}`);

const pkg = JSON.parse(read('package.json'));
pkg.version = VERSION;
pkg.scripts['check:stats'] = 'node dev/verificar-estadisticas-minimal.mjs';
pkg.scripts.check = 'npm run check:syntax && npm run check:stats && npm run check:apps && npm run check:compatibility && npm run check:workflow && npm run check:quota && npm run check:outlook && npm run check:architecture && npm run check:firebase-auth && npm run check:access && npm run check:apps-script && npm run check:admin && npm run check:electron';
write('package.json', JSON.stringify(pkg, null, 2) + '\n');

const lock = JSON.parse(read('package-lock.json'));
lock.version = VERSION;
if (lock.packages && lock.packages['']) lock.packages[''].version = VERSION;
write('package-lock.json', JSON.stringify(lock, null, 2) + '\n');

let syntax = read('dev/verificar-sintaxis.mjs');
syntax = syntax.replace(
  "  'functions/_lib/estadisticas-admin.js',",
  "  'functions/_lib/estadisticas-admin.js',\n  'functions/_lib/admin-global-state.js',\n  'functions/_lib/revisiones-admin.js',"
);
syntax = syntax.replace(
  "  'administrador/ad-js/ad-estadisticas-dashboard.patch.js',",
  "  'administrador/ad-js/ad-estadisticas-minimal.js',"
);
write('dev/verificar-sintaxis.mjs', syntax);

let prep = read('dev/preparar-pages-administrador.mjs');
prep = prep.replace("const VERSION_ADMIN = '3.6.0';", `const VERSION_ADMIN = '${VERSION}';`);
prep = prep.replace(
  "  path.join(output, 'ad-js', 'ad-estadisticas-control.patch.js'),\n  path.join(output, 'ad-js', 'ad-estadisticas-dashboard.patch.js'),",
  "  path.join(output, 'ad-js', 'ad-estadisticas-minimal.js'),"
);
prep = prep.replace(
  'Incluye dashboard operativo de estadísticas, períodos, carreras, lista global, pendientes globales por coordinador, corrección administrativa de títulos, WhatsApp, Outlook, PDF y acciones administrativas para Trabajo de Titulación.',
  'Incluye estadísticas minimalistas con General, Coordinadores e Investigadores, reportes PDF por revisor, períodos, carreras, lista global, corrección administrativa de títulos, WhatsApp, Outlook y acciones administrativas para Trabajo de Titulación.'
);
write('dev/preparar-pages-administrador.mjs', prep);

const test = `import fs from 'node:fs';
import process from 'node:process';
import { estadoActualEnvio } from '../functions/_lib/admin-global-state.js';

const errors = [];
function expect(condition, message) { if (!condition) errors.push(message); }
function source(file) { return fs.readFileSync(file, 'utf8'); }

expect(estadoActualEnvio({ estadoProceso: 'PENDIENTE_INVESTIGADOR' }) === 'PENDIENTE_INVESTIGADOR', 'Se perdió PENDIENTE_INVESTIGADOR.');
expect(estadoActualEnvio({ estadoProceso: 'APROBADO_FINAL' }) === 'APROBADO_FINAL', 'Se perdió APROBADO_FINAL.');
expect(estadoActualEnvio({ estadoProceso: 'PENDIENTE_COORDINADOR' }) === 'PENDIENTE_COORDINADOR', 'Se perdió PENDIENTE_COORDINADOR.');

const servicios = source('administrador/ad-js/ad-servicios.app.js');
expect(servicios.includes('ad-estadisticas-minimal.js'), 'Administrador no carga estadísticas minimalistas.');
expect(!servicios.includes("cargarComplemento('./ad-js/ad-estadisticas-control.patch.js'"), 'El tablero antiguo de estadísticas sigue activo.');
expect(!servicios.includes("cargarComplemento('./ad-js/ad-estadisticas-dashboard.patch.js'"), 'El dashboard antiguo de estadísticas sigue activo.');

const base = source('administrador/ad-js/ad-google-sheets.app.js');
expect(base.includes('!window.ADAdminStatsMinimal'), 'La app base todavía puede duplicar la carga de estadísticas.');

const stats = source('functions/_lib/estadisticas-admin.js');
expect(stats.includes('reconcileAdminGlobalState'), 'Las estadísticas no reconcilian el estado real del envío.');

const reviews = source('functions/_lib/revisiones-admin.js');
expect(reviews.includes('event.cedula || envio.cedula'), 'El reporte no prioriza el contexto histórico del evento.');
expect(reviews.includes('Sin tipo registrado'), 'El reporte sigue clasificando tipos desconocidos como artículo.');
expect(reviews.includes('10.000 revisiones'), 'El reporte no protege contra truncado silencioso.');

const coordinator = source('functions/api/titulos.js');
const investigator = source('functions/api/investigadores.js');
expect(coordinator.includes('cedula: normalizeCedula(envio.cedula || envio.numeroIdentificacion)'), 'Coordinación no guarda snapshot histórico.');
expect(investigator.includes('estudiante: nombresEnvio(envio)'), 'Investigación no guarda snapshot histórico.');

const prep = source('dev/preparar-pages-administrador.mjs');
expect(prep.includes('ad-estadisticas-minimal.js'), 'El build no exige la nueva vista de estadísticas.');
expect(!prep.includes("path.join(output, 'ad-js', 'ad-estadisticas-dashboard.patch.js')"), 'El build todavía exige el dashboard antiguo.');

if (errors.length) {
  console.error('[Estadísticas] Auditoría fallida:');
  errors.forEach((error, index) => console.error((index + 1) + '. ' + error));
  process.exit(1);
}
console.log('[Estadísticas] Flujo minimalista, estados, trazabilidad y build verificados.');
`;
write('dev/verificar-estadisticas-minimal.mjs', test);

console.log('[Corrección estadísticas] Cambios auditados aplicados para versión ' + VERSION + '.');
