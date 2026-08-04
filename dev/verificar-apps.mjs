import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

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
const adminHtml = checkAssets('administrador/ad-index.html');

requireIds(studentHtml, ['formConsulta', 'cedulaInput', 'formEnvio'], 'Estudiantes');
requireIds(workHtml, ['consultaForm', 'registroExistente', 'existenteTitulos', 'propuestasForm', 'enviarBtn'], 'Trabajo de Titulación');
requireIds(coordinatorHtml, [
  'coordinadorSelect', 'estadoPrincipal', 'tablaEstudiantesBody', 'detalleModal',
  'tituloFinalInput', 'comentarioCoordinadorInput', 'btnAprobarEnvio', 'btnDevolverEnvio'
], 'Coordinadores');
requireIds(adminHtml, ['ad-seccion-titulos', 'ad-seccion-estadisticas', 'ad-diagnostico-salida'], 'Administrador');

const coordinatorBootstrap = read('coordinadores-mvp/js/coordinador.bootstrap.independiente.js');
const coordinatorSource = read('coordinadores-mvp/js/coordinador.sheets.primary.js');
const coordinatorCatalog = read('coordinadores-mvp/js/coordinador.envios.carreras.js');
const coordinatorState = read('coordinadores-mvp/js/coordinador.state.js');
const coordinatorUi = read('coordinadores-mvp/js/coordinador.ui.js');
const coordinatorApp = read('coordinadores-mvp/js/coordinador.app.js');
const workScript = read('trabajo-titulacion-mvp/js/trabajo-titulacion.js');
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
const adminBuild = read('dev/preparar-pages-administrador.mjs');

assert(/v2\.9\.5/.test(coordinatorHtml) && /VERSION=['"]2\.9\.5['"]/.test(coordinatorBootstrap) && /VERSION=['"]2\.9\.5['"]/.test(coordinatorSource), 'Coordinadores no usa de forma uniforme la versión 2.9.5.');
assert(!/id=["']periodoSelect["']/.test(coordinatorHtml), 'Coordinadores todavía muestra selector de período.');
assert(/<th>Período<\/th>/.test(coordinatorHtml), 'La tabla no informa el período de cada envío.');
assert(!/data-vista=["']faltantes["']/.test(coordinatorHtml), 'Coordinadores todavía muestra estudiantes sin envío.');

const coordinatorRuntime = [coordinatorSource, coordinatorCatalog, coordinatorState, coordinatorUi, coordinatorApp, coordinatorBootstrap].join('\n');
assert(/\/api\/titulos/.test(coordinatorSource), 'Coordinadores no consulta /api/titulos.');
assert(/\/api\/trabajo-titulacion/.test(coordinatorSource), 'Coordinadores no consulta /api/trabajo-titulacion.');
assert(/Promise\.allSettled/.test(coordinatorSource) && /obtenerDiagnosticoConsulta/.test(coordinatorSource), 'Coordinadores no separa el diagnóstico de artículos y Trabajos de Titulación.');
assert(!/\/api\/requisitos/.test(coordinatorRuntime), 'Coordinadores todavía consulta /api/requisitos.');
assert(!/EstudiantesPeriodo|UTET_MAS_FIREBASE_TITULOS|FIREBASE_UTET/.test(coordinatorRuntime), 'Coordinadores todavía contiene integración activa con Firebase UTET.');
assert(/incluirTodos/.test(coordinatorSource) && /incluirTodos/.test(coordinatorCatalog), 'Coordinadores no solicita todos los envíos de Firebase Títulos.');
assert(!/coincidePeriodo|delPeriodo/.test(coordinatorState), 'El estado todavía filtra los envíos por período.');
assert(/deCarreras/.test(coordinatorState) && /delEstado/.test(coordinatorState), 'Coordinadores no filtra por carreras y estado.');

assert(/registroExistente/.test(workHtml) && /renderExisting/.test(workScript), 'Trabajo de Titulación no muestra los títulos ya registrados.');
assert(/logo-itsqmet\.png/.test(workHtml), 'Trabajo de Titulación no usa el logo institucional.');

assert(/\/api\/acceso-estudiante/.test(read('estudiantes-mvp/js/estudiante.consulta.revision.js')), 'Estudiantes no usa la consulta unificada.');
assert(/getStudentBasicFast/.test(studentAccess), 'La consulta unificada no usa la lectura rápida de Firebase UTET.');
assert(/getStudentFromSheets/.test(studentAccess), 'La consulta unificada no tiene respaldo en Google Sheets.');
assert(!/Promise\.allSettled/.test(studentAccess), 'Estudiantes todavía consulta UTET y Títulos en paralelo.');
assert(studentAccess.indexOf('lookupAcademic') < studentAccess.indexOf('queryTitles'), 'Firebase Títulos se consulta antes de conocer los datos académicos.');
assert(/CONSULTAR_ENVIO_CEDULA/.test(studentAccess) && /scope:\s*'period'/.test(studentAccess), 'Firebase Títulos no se consulta por cédula y período exactos.');
assert(/GOOGLE_SHEETS_ESTUDIANTES/.test(studentAccess), 'La respuesta no identifica el respaldo institucional.');

assert(/getDocument\('UTET', 'Estudiantes', canonical/.test(studentFirebaseFastCode), 'Firebase UTET no consulta el documento directo por cédula.');
assert(!/queryEqual|EstudiantesPeriodo|listCollection\('TITULOS'/.test(studentFirebaseFastCode), 'La consulta rápida de UTET realiza lecturas adicionales.');
assert(/payloadJson/.test(studentFirebaseFast), 'La consulta rápida no aprovecha payloadJson.');
assert(/consultar_estudiante_rapido/.test(studentSheetsFallback), 'El respaldo no usa la acción rápida de Apps Script.');
assert(/sheetName:\s*'Estudiantes'/.test(studentSheetsFallback), 'El respaldo no está limitado a la hoja Estudiantes.');
assert(!/pull_bl2|MatriculasPeriodo|Requisitos|Notas/.test(studentSheetsFallback), 'El respaldo descarga tablas que no necesita.');
assert(/getSheetByName\("Estudiantes"\)/.test(appsScriptFast), 'Apps Script no consulta únicamente la hoja Estudiantes.');
assert(/createTextFinder/.test(appsScriptFast), 'Apps Script no busca la cédula con TextFinder.');
assert(!/ensureAllSheets_|handlePullBL2_/.test(appsScriptFast), 'La consulta rápida de Apps Script ejecuta procesos pesados.');
assert(/VERSION\s*=\s*'2\.4\.4'/.test(studentBuild), 'El build de Estudiantes no usa la versión 2.4.4.');
assert(/VERSION_ESTUDIANTES\s*=\s*'2\.4\.4'/.test(localBuild), 'El entorno local no usa Estudiantes 2.4.4.');

assert(/\/api\/requisitos/.test(studentRequirements), 'Estudiantes debe conservar la API de Firebase UTET.');
assert(/\/api\/titulos/.test(studentSheets), 'Estudiantes no utiliza Firebase Títulos para envíos.');
assert(/ADMIN_REPORTE_FIREBASE_TITULOS/.test(adminApi), 'Administrador no expone el reporte de Firebase Títulos.');
assert(/Generar PDF Firebase Títulos/.test(adminPdf), 'Administrador no muestra el botón del PDF.');
assert(/\.pages-coordinadores/.test(coordinatorBuild), 'No existe build independiente de Coordinadores.');
assert(/\.pages-administrador/.test(adminBuild), 'No existe build independiente de Administrador.');

if (errors.length) {
  console.error('\n[Apps] Se encontraron errores:\n');
  errors.forEach((error, index) => console.error(`${index + 1}. ${error}`));
  console.error('');
  process.exit(1);
}

console.log('[Apps] Estudiantes: Firebase UTET directo, Google Sheets Estudiantes como respaldo y Firebase Títulos al final.');
console.log('[Apps] Trabajo de Titulación: muestra registros existentes y usa el logo institucional.');
console.log('[Apps] Coordinadores: consulta artículos y Trabajos de Titulación con diagnóstico separado.');
console.log('[Apps] Administrador: mantiene estadísticas y PDF de Firebase Títulos.');
