import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const output = path.join(root, '.pages-local');

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

  if (!fs.existsSync(source)) return false;
  if (!fs.statSync(source).isDirectory()) return false;

  fs.cpSync(source, destination, {
    recursive: true,
    force: true
  });

  return true;
}

function copyFile(name) {
  const source = path.join(root, name);
  const destination = path.join(output, name);

  if (!fs.existsSync(source)) return false;
  if (!fs.statSync(source).isFile()) return false;

  fs.copyFileSync(source, destination);
  return true;
}

fs.rmSync(output, { recursive: true, force: true });
fs.mkdirSync(output, { recursive: true });

const copiedDirectories = staticDirectories.filter(copyDirectory);
const copiedFiles = staticFiles.filter(copyFile);

if (!copiedDirectories.includes('estudiantes-mvp')) {
  throw new Error('No se encontró estudiantes-mvp para preparar Pages local.');
}
if (!copiedDirectories.includes('coordinadores-mvp')) {
  throw new Error('No se encontró coordinadores-mvp para preparar Pages local.');
}
if (!copiedDirectories.includes('administrador')) {
  throw new Error('No se encontró administrador para preparar Pages local.');
}

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
console.log('[Pages local] La carpeta functions permanece fuera de los archivos estáticos para habilitar /api/*.');
