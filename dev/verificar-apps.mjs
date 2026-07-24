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

function checkAssets(htmlPath) {
  const html = read(htmlPath);
  const directory = path.dirname(htmlPath);
  const regex = /<(?:script|link)\b[^>]*(?:src|href)=["']([^"']+)["'][^>]*>/gi;
  let match;
  while ((match = regex.exec(html))) {
    const raw = String(match[1] || '').trim();
    if (!raw || /^(?:https?:|data:|#|\/\/)/i.test(raw)) continue;
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
const coordinatorHtml = checkAssets('coordinadores-mvp/coordinador.html');
const adminHtml = checkAssets('administrador/ad-index.html');

requireIds(studentHtml, ['formConsulta', 'cedulaInput', 'formEnvio'], 'Estudiantes');
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
const adminApi = read('administrador/ad-js/ad-api.service.js');
const adminPdf = read('administrador/ad-js/ad-pdf-firebase.js');
const studentRequirements = read('estudiantes-mvp/js/requisitos.estudiantes.service.js');
const studentSheets = read('estudiantes-mvp/js/sheets.service.js');
const coordinatorBuild = read('dev/preparar-pages-coordinadores.mjs');
const adminBuild = read('dev/preparar-pages-administrador.mjs');

assert(/2\.9\.2/.test(coordinatorHtml) && /2\.9\.2/.test(coordinatorBootstrap), 'Coordinadores no usa la versión 2.9.2.');
assert(!/id=["']periodoSelect["']/.test(coordinatorHtml), 'Coordinadores todavía muestra selector de período.');
assert(/<th>Período<\/th>/.test(coordinatorHtml), 'La tabla no informa el período de cada envío.');
assert(!/data-vista=["']faltantes["']/.test(coordinatorHtml), 'Coordinadores todavía muestra estudiantes sin envío.');
assert(!/coordinador\.faltantes\.runtime\.js/.test(coordinatorBootstrap), 'El bootstrap todavía carga la integración con UTET.');
assert(!fs.existsSync(path.join(root, 'coordinadores-mvp/js/coordinador.faltantes.runtime.js')), 'Todavía existe el runtime de población UTET.');

const coordinatorRuntime = [coordinatorSource, coordinatorCatalog, coordinatorState, coordinatorUi, coordinatorApp, coordinatorBootstrap].join('\n');
assert(/\/api\/titulos/.test(coordinatorSource), 'Coordinadores no consulta /api/titulos.');
assert(!/\/api\/requisitos/.test(coordinatorRuntime), 'Coordinadores todavía consulta /api/requisitos.');
assert(!/EstudiantesPeriodo|UTET_MAS_FIREBASE_TITULOS|FIREBASE_UTET/.test(coordinatorRuntime), 'Coordinadores todavía contiene integración activa con Firebase UTET.');
assert(!/incluirFaltantes/.test(coordinatorSource + coordinatorCatalog), 'Coordinadores todavía solicita población sin envío.');
assert(/incluirTodos/.test(coordinatorSource) && /incluirTodos/.test(coordinatorCatalog), 'Coordinadores no solicita todos los envíos de Firebase Títulos.');
assert(/todos los envíos de Firebase Títulos/i.test(coordinatorApp), 'La aplicación no carga todos los envíos.');
assert(!/coincidePeriodo|delPeriodo/.test(coordinatorState), 'El estado todavía filtra los envíos por período.');
assert(/deCarreras/.test(coordinatorState) && /delEstado/.test(coordinatorState), 'Coordinadores no filtra por carreras y estado.');
assert(/sin limitar por período/i.test(coordinatorUi), 'La interfaz no informa que muestra todos los períodos.');
assert(/FIREBASE_TITULOS/.test(coordinatorSource) && /FIREBASE_TITULOS/.test(coordinatorApp), 'La fuente principal no está marcada como Firebase Títulos.');

assert(/\/api\/requisitos/.test(studentRequirements), 'Estudiantes debe conservar su consulta a Firebase UTET.');
assert(/\/api\/titulos/.test(studentSheets), 'Estudiantes no utiliza Firebase Títulos.');
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

console.log('[Apps] Estudiantes: conserva Firebase UTET para datos iniciales y Firebase Títulos para envíos.');
console.log('[Apps] Coordinadores: consulta exclusivamente Firebase Títulos y muestra todos los envíos sin filtrar por período.');
console.log('[Apps] Administrador: mantiene estadísticas y PDF de Firebase Títulos.');
