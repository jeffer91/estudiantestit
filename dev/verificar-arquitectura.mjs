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

assert(!/firebase-app|firebase-firestore/i.test(studentHtml), 'El estudiante no debe cargar Firebase directamente en el navegador.');
assert(!/firebase-app|firebase-firestore/i.test(coordinatorHtml), 'Coordinadores no debe cargar Firebase directamente en el navegador.');
assert(!/firebase-app|firebase-firestore/i.test(adminHtml), 'Administrador no debe cargar Firebase directamente en el navegador.');

[
  'functions/_lib/http.js',
  'functions/_lib/firestore.js',
  'functions/_lib/requisitos-firebase.js',
  'functions/_lib/titulos-firebase.js',
  'functions/_lib/ia-firebase.js',
  'functions/_lib/claves.js',
  'functions/api/claves.js',
  'functions/api/titulos.js',
  'functions/api/requisitos.js',
  'functions/api/ia.js',
  'estudiantes-mvp/js/requisitos.estudiantes.service.js',
  'estudiantes-mvp/js/titulos.cola.service.js',
  'coordinadores-mvp/js/coordinador.sheets.primary.js',
  'coordinadores-mvp/js/coordinador.app.js',
  'administrador/ad-js/ad-api.service.js',
  'administrador/ad-js/ad-google-sheets.app.js'
].forEach(read);

const firestore = read('functions/_lib/firestore.js');
const requirements = read('functions/_lib/requisitos-firebase.js');
const titles = read('functions/_lib/titulos-firebase.js');
const ai = read('functions/_lib/ia-firebase.js');
const claves = read('functions/_lib/claves.js');
const titlesApi = read('functions/api/titulos.js');
const requirementsApi = read('functions/api/requisitos.js');
const aiApi = read('functions/api/ia.js');
const adminApi = read('administrador/ad-js/ad-api.service.js');

assert(/titulos-ec2fa/.test(firestore), 'No está configurado Firebase Títulos titulos-ec2fa.');
assert(/utet-4387a/.test(firestore), 'No está configurado Firebase UTET utet-4387a.');
assert(/Estudiantes/.test(requirements), 'La consulta UTET no usa la colección Estudiantes.');
assert(/numeroIdentificacion/.test(requirements) && /Nombres/.test(requirements) && /NombreCarrera/.test(requirements), 'La consulta UTET no normaliza cédula, nombre y carrera.');
assert(/includePhone/.test(requirements), 'La consulta UTET no contempla el celular exclusivo del administrador.');
assert(/versiones_envio/.test(titles) && /resoluciones/.test(titles), 'Títulos no usa colecciones principales para versiones y resoluciones.');
assert(/ENVIO_ESTUDIANTE/.test(titles) && /GUARDAR_RESOLUCION/.test(titles), 'Títulos no implementa envío y resolución.');
assert(/listProviders/.test(ai) && /generateWithProvider/.test(ai), 'IA no está conectada a Firebase Títulos.');
assert(/executeTitulosAction/.test(claves) && /pullRequisitos/.test(claves), 'La fachada no enruta hacia las dos Firebase.');
assert(!/CLAVES_APPS_SCRIPT_URL|script\.google\.com/.test(claves + titles + requirements + ai), 'La capa activa todavía depende de Apps Script.');
assert(/runService\s*\(\s*env\s*,\s*['"]TITULOS['"]/.test(titlesApi), 'La API de Títulos no usa la fachada Firebase.');
assert(/runService\s*\(\s*env\s*,\s*['"]REQUISITOS['"]/.test(requirementsApi), 'La API de Requisitos no usa la fachada Firebase.');
assert(/generateAi/.test(aiApi), 'La API de IA no usa el motor Firebase.');
assert(/CONSULTAR_ESTUDIANTE/.test(adminApi), 'Administrador no consulta el estudiante con el rol que permite devolver celular.');

if (errors.length) {
  console.error('\n[Arquitectura] Se encontraron errores:\n');
  errors.forEach((error, index) => console.error((index + 1) + '. ' + error));
  console.error('');
  process.exit(1);
}

console.log('[Arquitectura] Correcta: UTET=datos mínimos del estudiante; Títulos=envíos, coordinación, administración e IA.');
console.log('[Arquitectura] Las tres aplicaciones acceden por Cloudflare Functions y no exponen Firebase directamente en el navegador.');
