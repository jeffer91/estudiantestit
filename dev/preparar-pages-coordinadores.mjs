import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const source = path.join(root, 'coordinadores-mvp');
const output = path.join(root, '.pages-coordinadores');

if (!fs.existsSync(source) || !fs.statSync(source).isDirectory()) {
  throw new Error('No se encontró la carpeta coordinadores-mvp.');
}

const coordinatorEntry = path.join(source, 'coordinador.html');
if (!fs.existsSync(coordinatorEntry)) {
  throw new Error('No se encontró coordinadores-mvp/coordinador.html.');
}

fs.rmSync(output, { recursive: true, force: true });
fs.cpSync(source, output, {
  recursive: true,
  force: true
});

/*
  La aplicación se sirve directamente desde la raíz del dominio:
  https://titulos-coordinadores.pages.dev/
*/
fs.copyFileSync(
  path.join(output, 'coordinador.html'),
  path.join(output, 'index.html')
);

const notFoundHtml = `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta http-equiv="refresh" content="0;url=/">
  <title>Coordinadores de Titulación</title>
</head>
<body>
  <p>Abriendo Coordinadores de Titulación…</p>
  <p><a href="/">Continuar</a></p>
</body>
</html>`;

const headers = `/*
  Cache-Control: no-store, no-cache, must-revalidate
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=()
  X-Frame-Options: SAMEORIGIN
`;

const redirects = `/coordinador / 302
/coordinadores / 302
/coordinadores/ / 302
`;

fs.writeFileSync(path.join(output, '404.html'), notFoundHtml, 'utf8');
fs.writeFileSync(path.join(output, '_headers'), headers, 'utf8');
fs.writeFileSync(path.join(output, '_redirects'), redirects, 'utf8');

const required = [
  path.join(output, 'index.html'),
  path.join(output, 'css', 'coordinador.css'),
  path.join(output, 'js', 'coordinador.bootstrap.independiente.js')
];

for (const file of required) {
  if (!fs.existsSync(file)) {
    throw new Error(`Falta un archivo obligatorio para Coordinadores: ${file}`);
  }
}

const forbidden = [
  path.join(output, 'estudiantes-mvp'),
  path.join(output, 'administrador')
];

for (const directory of forbidden) {
  if (fs.existsSync(directory)) {
    throw new Error(`Se incluyó una aplicación no autorizada por error: ${directory}`);
  }
}

console.log('[Pages coordinadores] Carpeta preparada en .pages-coordinadores.');
console.log('[Pages coordinadores] Ruta pública principal: /');
console.log('[Pages coordinadores] Coordinador disponible también en /coordinador.html.');
console.log('[Pages coordinadores] Estudiantes y administrador no fueron copiados.');
console.log('[Pages coordinadores] La carpeta functions permanece en la raíz para habilitar /api/*.');
