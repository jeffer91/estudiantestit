import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const source = path.join(root, 'estudiantes-mvp');
const output = path.join(root, '.pages-estudiantes');
const publicStudent = path.join(output, 'estudiantes');
const VERSION = '2.4.3';
const LEGACY_SCRIPTS = [
  'estudiante.consulta.optimizada.js',
  'estudiante.devolucion.runtime.js',
  'estudiante.resolucion.patch.js'
];

if (!fs.existsSync(source) || !fs.statSync(source).isDirectory()) {
  throw new Error('No se encontró la carpeta estudiantes-mvp.');
}

const studentEntry = path.join(source, 'estudiante.html');
if (!fs.existsSync(studentEntry)) {
  throw new Error('No se encontró estudiantes-mvp/estudiante.html.');
}

fs.rmSync(output, { recursive: true, force: true });
fs.mkdirSync(output, { recursive: true });
fs.cpSync(source, publicStudent, { recursive: true, force: true });

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
fs.writeFileSync(copiedEntry, studentHtml, 'utf8');

const indexHtml = `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta http-equiv="refresh" content="0;url=/estudiantes/estudiante">
  <title>Registro de Títulos Académicos</title>
  <link rel="canonical" href="/estudiantes/estudiante">
</head>
<body>
  <p>Abriendo el registro de títulos académicos…</p>
  <p><a href="/estudiantes/estudiante">Continuar al formulario</a></p>
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
  <p><a href="/estudiantes/estudiante">Ir al registro de títulos académicos</a></p>
</body>
</html>`;

const headers = `/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=()
  Cache-Control: no-cache, no-store, must-revalidate

/estudiantes/*
  Cache-Control: no-cache, no-store, must-revalidate
`;

fs.writeFileSync(path.join(output, 'index.html'), indexHtml, 'utf8');
fs.writeFileSync(path.join(output, '404.html'), notFoundHtml, 'utf8');
fs.writeFileSync(path.join(output, '_headers'), headers, 'utf8');

for (const directory of ['coordinadores-mvp', 'administrador']) {
  const forbidden = path.join(output, directory);
  if (fs.existsSync(forbidden)) {
    throw new Error('Se incluyó una carpeta privada por error: ' + forbidden);
  }
}

console.log('[Pages estudiantes] Carpeta preparada en .pages-estudiantes.');
console.log('[Pages estudiantes] Ruta pública: /estudiantes/estudiante');
console.log(`[Pages estudiantes] Consulta unificada activa (${VERSION}).`);
console.log('[Pages estudiantes] Un solo modal de consulta y flujo publicado de Títulos activos.');
console.log('[Pages estudiantes] Sin controladores duplicados ni parches de runtime.');
console.log('[Pages estudiantes] Coordinadores y administrador no fueron copiados.');
console.log('[Pages estudiantes] La carpeta functions permanece en la raíz para habilitar /api/*.');
