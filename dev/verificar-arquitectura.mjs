import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const errors = [];

function read(relativePath) {
  const absolutePath = path.join(root, relativePath);
  if (!fs.existsSync(absolutePath)) {
    errors.push('Falta: ' + relativePath);
    return '';
  }
  return fs.readFileSync(absolutePath, 'utf8');
}

function assert(condition, message) {
  if (!condition) errors.push(message);
}

const apps = [
  ['estudiantes-mvp', 'estudiante.html'],
  ['coordinadores-mvp', 'coordinador.html'],
  ['administrador', 'ad-index.html']
];

for (const [directory, expected] of apps) {
  const absolute = path.join(root, directory);
  const htmlFiles = fs.existsSync(absolute)
    ? fs.readdirSync(absolute).filter((name) => name.toLowerCase().endsWith('.html'))
    : [];
  assert(htmlFiles.length === 1, directory + ' debe contener exactamente un HTML. Encontrados: ' + htmlFiles.join(', '));
  assert(htmlFiles[0] === expected, directory + ' debe usar ' + expected + '.');
}

const studentHtml = read('estudiantes-mvp/estudiante.html');
const coordinatorHtml = read('coordinadores-mvp/coordinador.html');
const adminHtml = read('administrador/ad-index.html');

assert(!/firebase/i.test(studentHtml), 'estudiante.html todavía contiene referencias Firebase.');
assert(!/firebase/i.test(coordinatorHtml), 'coordinador.html todavía contiene referencias Firebase.');
assert(!/firebase/i.test(adminHtml), 'ad-index.html todavía contiene referencias Firebase.');

[
  'functions/_lib/http.js',
  'functions/_lib/claves.js',
  'functions/api/claves.js',
  'functions/api/titulos.js',
  'functions/api/requisitos.js',
  'functions/api/ia.js',
  'google-apps-script/CLAVES_01_CONFIG.gs',
  'google-apps-script/CLAVES_02_RELAY.gs',
  'estudiantes-mvp/js/requisitos.estudiantes.service.js',
  'estudiantes-mvp/js/titulos.cola.service.js',
  'estudiantes-mvp/js/ia.config.service.js',
  'coordinadores-mvp/js/coordinador.sheets.primary.js',
  'coordinadores-mvp/js/coordinador.app.js',
  'administrador/ad-js/ad-api.service.js',
  'administrador/ad-js/ad-google-sheets.app.js',
  'administrador/ad-js/ad-servicios.app.js'
].forEach(read);

[
  'functions/_lib/firestore.js',
  'estudiantes-mvp/js/firebase.core.service.js',
  'estudiantes-mvp/js/firebase.estudiantes.service.js',
  'estudiantes-mvp/js/firebase.ia.service.js',
  'estudiantes-mvp/js/firebase.envios.service.js',
  'administrador/ad-js/ad-firebase.service.js'
].forEach((relativePath) => {
  assert(!fs.existsSync(path.join(root, relativePath)), 'Archivo Firebase obsoleto presente: ' + relativePath);
});

const titulosApi = read('functions/api/titulos.js');
const requisitosApi = read('functions/api/requisitos.js');
const iaApi = read('functions/api/ia.js');
const clavesApi = read('functions/api/claves.js');
const clavesLib = read('functions/_lib/claves.js');
const clavesRelay = read('google-apps-script/CLAVES_02_RELAY.gs');
const devExample = read('.dev.vars.example');

assert(/runService\s*\(\s*env\s*,\s*['"]TITULOS['"]/.test(titulosApi), 'La API de Títulos no está conectada a Claves.');
assert(/runService\s*\(\s*env\s*,\s*['"]REQUISITOS['"]/.test(requisitosApi), 'La API de Requisitos no está conectada a Claves.');
assert(/REQUISITOS_BDLOCAL_SYNC es de solo consulta/.test(requisitosApi), 'La API de Requisitos no declara modo solo consulta.');
assert(/generateAi/.test(iaApi), 'La API de IA no usa la generación central de Claves.');
assert(/LISTAR_SERVICIOS_ADMIN/.test(clavesApi + clavesRelay), 'Claves no permite administrar los servicios de forma segura.');
assert(/GUARDAR_SERVICIO/.test(clavesApi + clavesRelay), 'Claves no permite guardar endpoints, tokens y estados.');
assert(/pull_bl2/.test(clavesRelay) && /ping/.test(clavesRelay) && /solo consulta/.test(clavesRelay), 'El relay no limita Requisitos a operaciones de consulta.');
assert(!/firestore|firebase/i.test(titulosApi + requisitosApi + iaApi + clavesApi + clavesLib), 'El backend activo todavía contiene Firebase o Firestore.');
assert(/CLAVES_APPS_SCRIPT_URL/.test(devExample), '.dev.vars.example no contiene CLAVES_APPS_SCRIPT_URL.');
assert(/CLAVES_ACCESS_TOKEN/.test(devExample), '.dev.vars.example no contiene CLAVES_ACCESS_TOKEN.');

if (errors.length) {
  console.error('\n[Arquitectura] Se encontraron errores:\n');
  errors.forEach((error, index) => console.error((index + 1) + '. ' + error));
  console.error('');
  process.exit(1);
}

console.log('[Arquitectura] Correcta: Requisitos=consulta, Títulos=operación, Claves=configuración/IA.');
console.log('[Arquitectura] Firebase y Firestore no están cargados por las tres aplicaciones.');
