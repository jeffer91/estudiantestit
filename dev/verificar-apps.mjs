import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import {
  cedulaEstricta,
  coincidePeriodoTrabajo
} from '../functions/_lib/trabajo-titulacion-unificado.js';

const root = process.cwd();
const errors = [];

function read(relativePath) {
  const absolute = path.join(root, relativePath);
  if (!fs.existsSync(absolute)) {
    errors.push(`No existe: ${relativePath}`);
    return '';
  }
  return fs.readFileSync(absolute, 'utf8');
}

function assert(condition, message) {
  if (!condition) errors.push(message);
}

function withoutComments(source) {
  return String(source || '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function checkAssets(htmlPath) {
  const html = read(htmlPath);
  const directory = path.dirname(htmlPath);
  const regex = /<(?:script|link)\b[^>]*(?:src|href)=["']([^"']+)["'][^>]*>/gi;
  let match;
  while ((match = regex.exec(html))) {
    const raw = String(match[1] || '').trim();
    if (!raw || /^(?:https?:|data:|#|\/\/|\/)/i.test(raw)) continue;
    const clean = raw.split(/[?#]/)[0];
    const asset = path.normalize(path.join(directory, clean));
    assert(fs.existsSync(path.join(root, asset)), `${htmlPath} referencia un archivo inexistente: ${asset}`);
  }
  return html;
}

function requireIds(html, ids, appName) {
  ids.forEach((id) => {
    const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    assert(new RegExp(`id=["']${escaped}["']`).test(html), `${appName} no contiene #${id}.`);
  });
}

const studentHtml = checkAssets('estudiantes-mvp/estudiante.html');
const workHtml = checkAssets('trabajo-titulacion-mvp/index.html');
const coordinatorHtml = checkAssets('coordinadores-mvp/coordinador.html');
const investigatorHtml = checkAssets('investigadores-mvp/index.html');
const adminHtml = checkAssets('administrador/ad-index.html');

requireIds(studentHtml, ['formConsulta', 'cedulaInput', 'formEnvio'], 'Estudiantes');
requireIds(workHtml, ['consultaForm', 'registroExistente', 'existenteTitulos', 'propuestasForm', 'enviarBtn'], 'Trabajo de Titulación');
requireIds(coordinatorHtml, [
  'coordinadorSelect', 'estadoPrincipal', 'tablaEstudiantesBody', 'detalleModal',
  'tituloFinalInput', 'comentarioCoordinadorInput', 'btnAprobarEnvio', 'btnDevolverEnvio'
], 'Coordinadores');
requireIds(investigatorHtml, [
  'loginForm', 'cedulaInput', 'pinInput', 'dashboardView', 'carrerasBody',
  'pendientesBody', 'reviewView', 'tituloFinalInput', 'observacionInput',
  'aprobarBtn', 'corregirAprobarBtn', 'devolverBtn'
], 'Investigación');
requireIds(adminHtml, ['ad-seccion-titulos', 'ad-seccion-estadisticas', 'ad-diagnostico-salida'], 'Administrador');

const coordinatorBootstrap = read('coordinadores-mvp/js/coordinador.bootstrap.independiente.js');
const coordinatorSource = read('coordinadores-mvp/js/coordinador.sheets.primary.js');
const coordinatorCatalog = read('coordinadores-mvp/js/coordinador.envios.carreras.js');
const coordinatorState = read('coordinadores-mvp/js/coordinador.state.js');
const coordinatorUi = read('coordinadores-mvp/js/coordinador.ui.js');
const coordinatorApp = read('coordinadores-mvp/js/coordinador.app.js');
const workScript = read('trabajo-titulacion-mvp/js/trabajo-titulacion.js');
const workApi = read('functions/api/trabajo-titulacion.js');
const unifiedWork = read('functions/_lib/trabajo-titulacion-unificado.js');
const titlesV6 = read('functions/_lib/titulos-firebase-v6.js');
const titlesV7 = read('functions/_lib/titulos-firebase-v7.js');
const adminGlobal = read('functions/_lib/admin-global-v6.js');
const adminApi = read('administrador/ad-js/ad-api.service.js');
const adminPdf = read('administrador/ad-js/ad-pdf-firebase.js');
const studentRequirements = read('estudiantes-mvp/js/requisitos.estudiantes.service.js');
const studentSheets = read('estudiantes-mvp/js/sheets.service.js');
const studentAccess = read('functions/api/acceso-estudiante.js');
const studentFirebaseFast = read('functions/_lib/requisitos-firebase-fast.js');
const studentFirebaseFastCode = withoutComments(studentFirebaseFast);
const studentSheetsFallback = read('functions/_lib/requisitos-sheets-fallback.js');
const appsScriptFast = read('google-apps-script/REQUISITOS_CONSULTA_RAPIDA.gs');
const studentBuild = read('dev/preparar-pages-estudiantes.mjs');
const localBuild = read('dev/preparar-pages-local.mjs');
const coordinatorBuild = read('dev/preparar-pages-coordinadores.mjs');
const investigatorBuild = read('dev/preparar-pages-investigadores.mjs');
const investigatorApi = read('functions/api/investigadores.js');
const investigatorApp = read('investigadores-mvp/js/investigadores.app.js');
const adminBuild = read('dev/preparar-pages-administrador.mjs');

assert(/v3\.0\.0/.test(coordinatorHtml) && /VERSION=['"]3\.0\.0['"]/.test(coordinatorBootstrap) && /VERSION=['"]3\.0\.0['"]/.test(coordinatorSource), 'Coordinadores no usa de forma uniforme la versión 3.0.0.');
assert(!/id=["']periodoSelect["']/.test(coordinatorHtml), 'Coordinadores todavía muestra selector de período.');
assert(/<th>Período<\/th>/.test(coordinatorHtml), 'La tabla no informa el período de cada envío.');
assert(!/data-vista=["']faltantes["']/.test(coordinatorHtml), 'Coordinadores todavía muestra estudiantes sin envío.');

const coordinatorRuntime = [coordinatorSource, coordinatorCatalog, coordinatorState, coordinatorUi, coordinatorApp, coordinatorBootstrap].join('\n');
assert(/\/api\/titulos/.test(coordinatorSource), 'Coordinadores no consulta /api/titulos.');
assert(/LISTAR_ENVIOS_POR_CARRERA/.test(coordinatorSource), 'Coordinadores no consulta la colección unificada mediante Firebase Títulos.');
assert(!/Promise\.allSettled\(\[articulosPromise,trabajosPromise\]/.test(coordinatorSource), 'Coordinadores todavía duplica las fuentes de envíos.');
assert(/obtenerDiagnosticoConsulta/.test(coordinatorSource), 'Coordinadores no informa el diagnóstico por tipo de trabajo.');
assert(!/\/api\/requisitos/.test(coordinatorRuntime), 'Coordinadores todavía consulta /api/requisitos.');
assert(!/EstudiantesPeriodo|UTET_MAS_FIREBASE_TITULOS|FIREBASE_UTET/.test(coordinatorRuntime), 'Coordinadores todavía contiene integración activa con Firebase UTET.');
assert(/carreras:carreras/.test(coordinatorSource) && /incluirTodos:false/.test(coordinatorSource), 'Coordinadores no limita la consulta a las carreras asignadas.');
assert(/obtenerCoordinadorActual/.test(coordinatorApp) && /carreras:coordinador\.carreras/.test(coordinatorApp), 'Coordinadores carga envíos antes de conocer las carreras asignadas.');
assert(!/coincidePeriodo|delPeriodo/.test(coordinatorState), 'El estado todavía filtra los envíos por período.');
assert(/deCarreras/.test(coordinatorState) && /delEstado/.test(coordinatorState), 'Coordinadores no filtra por carreras y estado.');

assert(/registroExistente/.test(workHtml) && /renderExisting/.test(workScript), 'Trabajo de Titulación no muestra los títulos ya registrados.');
assert(/pattern="\[0-9\]\{10\}"/.test(workHtml), 'Trabajo de Titulación no exige una cédula de exactamente 10 dígitos.');
assert(/digits\.length===10\?digits:''/.test(workScript), 'El JavaScript de Trabajo de Titulación todavía completa cédulas de 9 dígitos.');
assert(cedulaEstricta('1752222404') === '1752222404', 'La validación estricta rechazó una cédula de 10 dígitos.');
assert(cedulaEstricta('175222240') === '', 'La validación estricta aceptó una cédula de 9 dígitos.');
const periodoPrueba = { periodoId: '2026-10', periodoNombre: 'Octubre 2025 a Marzo 2026' };
assert(coincidePeriodoTrabajo(periodoPrueba, ['2026-10']), 'No coincide el código institucional del período.');
assert(coincidePeriodoTrabajo(periodoPrueba, ['Octubre 2025 a Marzo 2026']), 'No coincide el nombre institucional del período.');
assert(!coincidePeriodoTrabajo(periodoPrueba, ['Abril 2026 a Septiembre 2026']), 'Se confundieron dos períodos diferentes.');
assert(/logo-itsqmet\.png/.test(workHtml), 'Trabajo de Titulación no usa el logo institucional.');
assert(/\/api\/requisitos/.test(workScript) && /CONSULTAR_ESTUDIANTE_TITULACION/.test(workScript), 'Trabajo de Titulación no utiliza el lector académico compartido.');
assert(/getStudentBasic/.test(workApi), 'Trabajo de Titulación no revalida al estudiante con Firebase UTET antes de guardar.');
assert(/COLECCION_ENVIOS/.test(workApi) && /'envios'/.test(unifiedWork), 'Trabajo de Titulación no guarda en la colección envios.');
assert(/envios_trabajo_titulacion/.test(unifiedWork) && /migrarTrabajosTitulacionLegados/.test(unifiedWork), 'No existe migración de los registros históricos de Trabajo de Titulación.');
assert(/coincidePeriodoTrabajo/.test(workApi) && /coincidePeriodoTrabajo/.test(titlesV6) && /queryPeriodRows/.test(adminGlobal) && /samePeriod/.test(adminGlobal), 'La coincidencia de períodos no está aplicada en Trabajo de Titulación, Títulos y Administrador.');
assert(/ENABLE_LEGACY_TITULOS_MIGRATION/.test(unifiedWork), 'La migración histórica no requiere una habilitación explícita.');
assert(!/migrarTrabajosTitulacionLegados/.test(titlesV6), 'Firebase Títulos todavía ejecuta migraciones completas durante consultas normales.');
assert(!/migrarTrabajosTitulacionLegados/.test(adminGlobal), 'Administrador todavía ejecuta migraciones completas durante consultas normales.');
assert(!/listCollection\('TITULOS', 'resoluciones'/.test(titlesV7), 'El historial todavía descarga toda la colección resoluciones.');
assert(/queryEqual\('TITULOS', 'resoluciones', 'envioId'/.test(titlesV7), 'El historial no se consulta por el envío específico.');
assert(/segundaLecturaEnviosEliminada:\s*true/.test(adminGlobal), 'Administrador no confirma la eliminación de la segunda lectura de envíos.');

assert(/\/api\/acceso-estudiante/.test(read('estudiantes-mvp/js/estudiante.consulta.revision.js')), 'Estudiantes no usa la consulta unificada.');
assert(/getStudentBasicFast/.test(studentAccess), 'La consulta unificada no usa la lectura rápida de Firebase UTET.');
assert(/getStudentFromSheets/.test(studentAccess), 'La consulta unificada no tiene respaldo en Google Sheets.');
assert(!/Promise\.allSettled/.test(studentAccess), 'Estudiantes todavía consulta UTET y Títulos en paralelo.');
assert(studentAccess.indexOf('lookupAcademic') < studentAccess.indexOf('queryTitles'), 'Firebase Títulos se consulta antes de conocer los datos académicos.');
assert(/CONSULTAR_ENVIO_CEDULA/.test(studentAccess) && /scope:\s*'period'/.test(studentAccess), 'Firebase Títulos no se consulta por cédula y período exactos.');
assert(/GOOGLE_SHEETS_ESTUDIANTES/.test(studentAccess), 'La respuesta no identifica el respaldo institucional.');

assert(/getDocument\('UTET', 'Estudiante', id/.test(studentFirebaseFastCode), 'Firebase UTET no prioriza Estudiante/{cedula}.');
assert(/getDocument\('UTET', 'Estudiantes', id/.test(studentFirebaseFastCode), 'No existe compatibilidad temporal con la colección Estudiantes.');
assert(/queryField\('UTET', 'matriculas'/.test(studentFirebaseFastCode), 'La consulta académica no resuelve el período desde matriculas.');
assert(/listCollection\('UTET', 'matriculas'/.test(studentFirebaseFastCode), 'La consulta académica no contempla matrículas con referencias o IDs compuestos.');
assert(!/currentPeriod\s*\(/.test(studentFirebaseFastCode), 'La consulta académica todavía asigna un período global sin una matrícula del estudiante.');
assert(/nombreCarreraActual/.test(studentFirebaseFast) && /codigoCarreraActual/.test(studentFirebaseFast), 'El lector de estudiantes no reconoce los campos vigentes de carrera.');
assert(/payloadJson/.test(studentFirebaseFast), 'La consulta rápida no aprovecha payloadJson.');
assert(/consultar_estudiante_rapido/.test(studentSheetsFallback), 'El respaldo no usa la acción rápida de Apps Script.');
assert(/sheetName:\s*'Estudiantes'/.test(studentSheetsFallback), 'El respaldo no está limitado a la hoja Estudiantes.');
assert(!/pull_bl2|MatriculasPeriodo|Requisitos|Notas/.test(studentSheetsFallback), 'El respaldo descarga tablas que no necesita.');
assert(/getSheetByName\("Estudiantes"\)/.test(appsScriptFast), 'Apps Script no consulta únicamente la hoja Estudiantes.');
assert(/createTextFinder/.test(appsScriptFast), 'Apps Script no busca la cédula con TextFinder.');
assert(!/ensureAllSheets_|handlePullBL2_/.test(appsScriptFast), 'La consulta rápida de Apps Script ejecuta procesos pesados.');
assert(/VERSION\s*=\s*'2\.5\.0'/.test(studentBuild), 'El build de Estudiantes no usa la versión 2.5.0.');
assert(/VERSION_ESTUDIANTES\s*=\s*'2\.5\.0'/.test(localBuild), 'El entorno local no usa Estudiantes 2.5.0.');

assert(/currentEnrollments/.test(adminGlobal) && /queryPeriodRows\('UTET', 'matriculas'/.test(adminGlobal), 'Administrador no construye la población desde matriculas.');
assert(
  /batchGetDocuments\('UTET'/.test(adminGlobal) &&
  /collectionName: 'Estudiante'/.test(adminGlobal) &&
  /collectionName: 'Estudiantes'/.test(adminGlobal),
  'Administrador no agrupa los datos maestros de Estudiante con compatibilidad temporal.'
);
assert(!/getDocument\('UTET', 'Estudiante'/.test(adminGlobal), 'Administrador volvió a consultar un documento por estudiante.');
assert(/nombreCarreraActual/.test(adminGlobal) && /codigoCarreraActual/.test(adminGlobal), 'Administrador no reconoce los campos actuales de carrera.');
assert(/correoInstitucional/.test(adminGlobal) && /correoPersonal/.test(adminGlobal), 'Administrador no conserva los correos actuales para los recordatorios.');
assert(/UTET_MATRICULAS_Y_ESTUDIANTE/.test(adminGlobal), 'Administrador no identifica la nueva fuente de población académica.');
assert(/NO_ENVIADO/.test(adminGlobal) && /DEVUELTO/.test(adminGlobal) && /APROBADO/.test(adminGlobal), 'Administrador no cruza correctamente población y estados de Títulos.');

assert(/\/api\/requisitos/.test(studentRequirements), 'Estudiantes debe conservar la API de Firebase UTET.');
assert(/\/api\/titulos/.test(studentSheets), 'Estudiantes no utiliza Firebase Títulos para envíos.');
assert(/ADMIN_REPORTE_FIREBASE_TITULOS/.test(adminApi), 'Administrador no expone el reporte de Firebase Títulos.');
assert(/Generar PDF Firebase Títulos/.test(adminPdf), 'Administrador no muestra el botón del PDF.');
assert(/\.pages-coordinadores/.test(coordinatorBuild), 'No existe build independiente de Coordinadores.');
assert(/\.pages-investigadores/.test(investigatorBuild), 'No existe build independiente de Investigación.');
assert(/PENDIENTE_INVESTIGADOR/.test(investigatorApi) && /APROBADO_FINAL/.test(investigatorApi), 'Investigación no implementa el flujo de validación final.');
assert(/REGISTRAR_PIN/.test(investigatorApi) && /investigacion_bloqueos/.test(investigatorApi), 'Investigación no protege acceso y concurrencia.');
assert(/LISTAR_CARRERAS/.test(investigatorApp) && /TOMAR_REVISION/.test(investigatorApp), 'La app de Investigación no consume la cola compartida.');
assert(/\.pages-administrador/.test(adminBuild), 'No existe build independiente de Administrador.');

if (errors.length) {
  console.error('\n[Apps] Se encontraron errores:\n');
  errors.forEach((error, index) => console.error(`${index + 1}. ${error}`));
  console.error('');
  process.exit(1);
}

console.log('[Apps] Estudiantes: Estudiante + matriculas en Firebase UTET, con Google Sheets como respaldo y Títulos al final.');
console.log('[Apps] Trabajo de Titulación: comparte el lector académico de UTET y guarda envíos unificados.');
console.log('[Apps] Coordinadores: permanece aislado de UTET y trabaja únicamente sobre Firebase Títulos.');
console.log('[Apps] Investigación: cola compartida sobre Firebase Títulos, PIN y bloqueo concurrente.');
console.log('[Apps] Administrador: población desde matriculas + Estudiante, cruzada con Títulos por período e Investigación.');
