import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const output = path.join(root, '.pages-local');
const VERSION_ESTUDIANTES = '2.4.4';
const VERSION_ADMIN = '3.3.3';
const HISTORY_FILE = 'js/titulos.historial.publico.js';
const LEGACY_SCRIPTS = [
  'estudiante.consulta.optimizada.js',
  'estudiante.devolucion.runtime.js',
  'estudiante.resolucion.patch.js'
];

const staticDirectories = [
  'estudiantes-mvp',
  'trabajo-titulacion-mvp',
  'coordinadores-mvp',
  'administrador',
  'shared',
  'assets',
  'img',
  'css',
  'js'
];

const staticFiles = [
  'index.html',
  '404.html',
  '_headers',
  '_redirects',
  'favicon.ico',
  'favicon.png'
];

function copyDirectory(name) {
  const source = path.join(root, name);
  const destination = path.join(output, name);
  if (!fs.existsSync(source) || !fs.statSync(source).isDirectory()) return false;
  fs.cpSync(source, destination, { recursive: true, force: true });
  return true;
}

function copyFile(name) {
  const source = path.join(root, name);
  const destination = path.join(output, name);
  if (!fs.existsSync(source) || !fs.statSync(source).isFile()) return false;
  fs.copyFileSync(source, destination);
  return true;
}

function injectScript(html, sourcePath) {
  if (html.includes(sourcePath)) return html;
  if (!html.includes('</body>')) {
    throw new Error('No se encontró </body> para insertar el historial local.');
  }
  const script = `  <script src="${sourcePath}?v=${VERSION_ESTUDIANTES}"></script>\n`;
  return html.replace('</body>', script + '</body>');
}

function prepararEstudiantesLocal() {
  const entry = path.join(output, 'estudiantes-mvp', 'estudiante.html');
  if (!fs.existsSync(entry)) return;
  let html = fs.readFileSync(entry, 'utf8');
  for (const legacy of LEGACY_SCRIPTS) {
    if (html.includes(legacy)) {
      throw new Error('El HTML local de Estudiantes todavía carga un controlador antiguo: ' + legacy);
    }
  }
  if (!html.includes('estudiante.consulta.revision.js')) {
    throw new Error('El HTML local de Estudiantes no carga la consulta unificada.');
  }
  html = html.replace(/\?v=\d+\.\d+\.\d+/g, `?v=${VERSION_ESTUDIANTES}`);
  html = injectScript(html, HISTORY_FILE);
  fs.writeFileSync(entry, html, 'utf8');
}

function prepararTrabajoLocal() {
  const entry = path.join(output, 'trabajo-titulacion-mvp', 'index.html');
  const history = path.join(output, 'estudiantes-mvp', HISTORY_FILE);
  if (!fs.existsSync(entry)) return;
  if (!fs.existsSync(history)) {
    throw new Error('No se encontró el historial público para Trabajo de Titulación.');
  }
  let html = fs.readFileSync(entry, 'utf8');
  html = injectScript(html, '/estudiantes-mvp/' + HISTORY_FILE);
  fs.writeFileSync(entry, html, 'utf8');
}

function prepararAdministradorLocal() {
  const entry = path.join(output, 'administrador', 'ad-index.html');
  if (!fs.existsSync(entry)) return;
  let html = fs.readFileSync(entry, 'utf8');
  html = html.replace(/\?v=\d+\.\d+\.\d+/g, `?v=${VERSION_ADMIN}`);
  html = html.replace(/>v\d+\.\d+\.\d+</g, `>v${VERSION_ADMIN}<`);
  fs.writeFileSync(entry, html, 'utf8');
}

fs.rmSync(output, { recursive: true, force: true });
fs.mkdirSync(output, { recursive: true });

const copiedDirectories = staticDirectories.filter(copyDirectory);
const copiedFiles = staticFiles.filter(copyFile);

for (const required of ['estudiantes-mvp', 'trabajo-titulacion-mvp', 'coordinadores-mvp', 'administrador']) {
  if (!copiedDirectories.includes(required)) {
    throw new Error('No se encontró ' + required + ' para preparar Pages local.');
  }
}

prepararEstudiantesLocal();
prepararTrabajoLocal();
prepararAdministradorLocal();

if (!copiedFiles.includes('index.html')) {
  const index = `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Titulación local</title>
</head>
<body>
  <h1>Titulación local</h1>
  <p><a href="/estudiantes-mvp/estudiante.html">Artículos académicos</a></p>
  <p><a href="/trabajo-titulacion-mvp/">Trabajo de Titulación</a></p>
  <p><a href="/coordinadores-mvp/coordinador.html">Coordinadores</a></p>
  <p><a href="/administrador/ad-index.html">Administrador</a></p>
</body>
</html>`;
  fs.writeFileSync(path.join(output, 'index.html'), index, 'utf8');
}

console.log('[Pages local] Entorno preparado en .pages-local.');
console.log(`[Pages local] Estudiantes ${VERSION_ESTUDIANTES}: UTET → Sheets → Títulos.`);
console.log('[Pages local] Historial activo en Artículos y Trabajo de Titulación.');
console.log('[Pages local] Trabajo de Titulación disponible en /trabajo-titulacion-mvp/.');
console.log('[Pages local] Coordinadores: artículos y Trabajos de Titulación.');
console.log('[Pages local] Administrador: dos Firebase y reporte PDF.');
