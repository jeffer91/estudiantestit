import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const source = path.join(root, 'estudiantes-mvp');
const workSource = path.join(root, 'trabajo-titulacion-mvp');
const output = path.join(root, '.pages-estudiantes');
const publicStudent = path.join(output, 'estudiantes');
const publicWork = path.join(output, 'trabajo-titulacion');
const VERSION = '2.4.4';
const HISTORY_FILE = 'js/titulos.historial.publico.js';
const LEGACY_SCRIPTS = [
  'estudiante.consulta.optimizada.js',
  'estudiante.devolucion.runtime.js',
  'estudiante.resolucion.patch.js'
];

if (!fs.existsSync(source) || !fs.statSync(source).isDirectory()) {
  throw new Error('No se encontró la carpeta estudiantes-mvp.');
}
if (!fs.existsSync(workSource) || !fs.statSync(workSource).isDirectory()) {
  throw new Error('No se encontró la carpeta trabajo-titulacion-mvp.');
}

const studentEntry = path.join(source, 'estudiante.html');
const workEntry = path.join(workSource, 'index.html');
if (!fs.existsSync(studentEntry)) {
  throw new Error('No se encontró estudiantes-mvp/estudiante.html.');
}
if (!fs.existsSync(workEntry)) {
  throw new Error('No se encontró trabajo-titulacion-mvp/index.html.');
}

fs.rmSync(output, { recursive: true, force: true });
fs.mkdirSync(output, { recursive: true });
fs.cpSync(source, publicStudent, { recursive: true, force: true });
fs.cpSync(workSource, publicWork, { recursive: true, force: true });

function injectScript(html, sourcePath) {
  if (html.includes(sourcePath)) return html;
  const script = `  <script src="${sourcePath}?v=${VERSION}"></script>\n`;
  if (!html.includes('</body>')) throw new Error('No se encontró </body> para insertar el historial.');
  return html.replace('</body>', script + '</body>');
}

const copiedEntry = path.join(publicStudent, 'estudiante.html');
let studentHtml = fs.readFileSync(copiedEntry, 'utf8');

for (const legacy of LEGACY_SCRIPTS) {
  if (studentHtml.includes(legacy)) {
    throw new Error('El HTML de Estudiantes todavía carga un controlador antiguo: ' + legacy);
  }
}

if (!studentHtml.includes('estudiante.consulta.revision.js')) {
  throw new Error('El HTML de Estudiantes no carga la consulta unificada.');
}

studentHtml = studentHtml.replace(/\?v=\d+\.\d+\.\d+/g, `?v=${VERSION}`);
studentHtml = injectScript(studentHtml, HISTORY_FILE);
fs.writeFileSync(copiedEntry, studentHtml, 'utf8');

const copiedWorkEntry = path.join(publicWork, 'index.html');
let workHtml = fs.readFileSync(copiedWorkEntry, 'utf8');
workHtml = injectScript(workHtml, '/estudiantes/' + HISTORY_FILE);
fs.writeFileSync(copiedWorkEntry, workHtml, 'utf8');

const indexHtml = `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Registro de Titulación</title>
</head>
<body>
  <h1>Registro de Titulación</h1>
  <p><a href="/estudiantes/estudiante">Registrar títulos de artículo académico</a></p>
  <p><a href="/trabajo-titulacion/">Registrar títulos de Trabajo de Titulación</a></p>
</body>
</html>`;

const notFoundHtml = `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Página no encontrada</title>
</head>
<body>
  <h1>Página no encontrada</h1>
  <p><a href="/">Ir al registro de titulación</a></p>
</body>
</html>`;

const headers = `/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=()
  Cache-Control: no-cache, no-store, must-revalidate

/estudiantes/*
  Cache-Control: no-cache, no-store, must-revalidate

/trabajo-titulacion/*
  Cache-Control: no-cache, no-store, must-revalidate
`;

fs.writeFileSync(path.join(output, 'index.html'), indexHtml, 'utf8');
fs.writeFileSync(path.join(output, '404.html'), notFoundHtml, 'utf8');
fs.writeFileSync(path.join(output, '_headers'), headers, 'utf8');

const required = [
  path.join(publicStudent, 'estudiante.html'),
  path.join(publicStudent, HISTORY_FILE),
  path.join(publicWork, 'index.html'),
  path.join(publicWork, 'css', 'trabajo-titulacion.css'),
  path.join(publicWork, 'js', 'trabajo-titulacion.js')
];
for (const file of required) {
  if (!fs.existsSync(file)) {
    throw new Error('Falta un archivo obligatorio: ' + file);
  }
}

for (const directory of ['coordinadores-mvp', 'administrador']) {
  const forbidden = path.join(output, directory);
  if (fs.existsSync(forbidden)) {
    throw new Error('Se incluyó una carpeta privada por error: ' + forbidden);
  }
}

console.log('[Pages estudiantes] Carpeta preparada en .pages-estudiantes.');
console.log('[Pages estudiantes] Artículos: /estudiantes/estudiante');
console.log('[Pages estudiantes] Trabajo de Titulación: /trabajo-titulacion/');
console.log(`[Pages estudiantes] Consulta secuencial e historial activos (${VERSION}).`);
console.log('[Pages estudiantes] Firebase UTET → Google Sheets Estudiantes → Firebase Títulos.');
console.log('[Pages estudiantes] Coordinadores y administrador no fueron copiados.');
console.log('[Pages estudiantes] La carpeta functions permanece en la raíz para habilitar /api/*.');
