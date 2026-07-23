import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const output = path.join(root, '.pages-local');
const VERSION_ESTUDIANTES = '2.4.2';
const LEGACY_SCRIPTS = [
  'estudiante.consulta.optimizada.js',
  'estudiante.devolucion.runtime.js',
  'estudiante.resolucion.patch.js'
];

const staticDirectories = [
  'estudiantes-mvp',
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
  fs.writeFileSync(entry, html, 'utf8');
}

fs.rmSync(output, { recursive: true, force: true });
fs.mkdirSync(output, { recursive: true });

const copiedDirectories = staticDirectories.filter(copyDirectory);
const copiedFiles = staticFiles.filter(copyFile);

for (const required of ['estudiantes-mvp', 'coordinadores-mvp', 'administrador']) {
  if (!copiedDirectories.includes(required)) {
    throw new Error('No se encontró ' + required + ' para preparar Pages local.');
  }
}

prepararEstudiantesLocal();

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
  <p><a href="/estudiantes-mvp/estudiante.html">Estudiantes</a></p>
  <p><a href="/coordinadores-mvp/coordinador.html">Coordinadores</a></p>
  <p><a href="/administrador/ad-index.html">Administrador</a></p>
</body>
</html>`;
  fs.writeFileSync(path.join(output, 'index.html'), index, 'utf8');
}

console.log('[Pages local] Carpeta estática preparada en .pages-local.');
console.log(`[Pages local] Consulta unificada de estudiantes activa (${VERSION_ESTUDIANTES}).`);
console.log('[Pages local] Modal inmediato y flujo publicado de Títulos activos.');
console.log('[Pages local] Sin controladores duplicados ni parches de runtime.');
console.log('[Pages local] La carpeta functions permanece fuera de los archivos estáticos para habilitar /api/*.');
