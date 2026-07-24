import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const source = path.join(root, 'administrador');
const output = path.join(root, '.pages-administrador');

if (!fs.existsSync(source) || !fs.statSync(source).isDirectory()) {
  throw new Error('No se encontró la carpeta administrador.');
}

const entry = path.join(source, 'ad-index.html');
if (!fs.existsSync(entry)) {
  throw new Error('No se encontró administrador/ad-index.html.');
}

fs.rmSync(output, { recursive: true, force: true });
fs.cpSync(source, output, { recursive: true, force: true });
fs.copyFileSync(path.join(output, 'ad-index.html'), path.join(output, 'index.html'));

const notFoundHtml = `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta http-equiv="refresh" content="0;url=/">
  <title>Administrador de Titulación</title>
</head>
<body>
  <p>Abriendo el Administrador de Titulación…</p>
  <p><a href="/">Continuar</a></p>
</body>
</html>`;

const headers = `/*
  Cache-Control: no-store, no-cache, must-revalidate
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=()
  X-Frame-Options: DENY
`;

const redirects = `/administrador / 302
/ad-index / 302
/ad-index.html / 302
`;

fs.writeFileSync(path.join(output, '404.html'), notFoundHtml, 'utf8');
fs.writeFileSync(path.join(output, '_headers'), headers, 'utf8');
fs.writeFileSync(path.join(output, '_redirects'), redirects, 'utf8');

for (const required of [
  path.join(output, 'index.html'),
  path.join(output, 'ad-css', 'ad-admin.css'),
  path.join(output, 'ad-css', 'ad-titulos-estadisticas.css'),
  path.join(output, 'ad-js', 'ad-api.service.js'),
  path.join(output, 'ad-js', 'ad-google-sheets.app.js'),
  path.join(output, 'ad-js', 'ad-administracion-global.js'),
  path.join(output, 'ad-js', 'ad-correo-outlook.js')
]) {
  if (!fs.existsSync(required)) {
    throw new Error(`Falta un archivo obligatorio para Administrador: ${required}`);
  }
}

for (const directory of [
  path.join(output, 'estudiantes-mvp'),
  path.join(output, 'coordinadores-mvp')
]) {
  if (fs.existsSync(directory)) {
    throw new Error(`Se incluyó una aplicación no autorizada por error: ${directory}`);
  }
}

console.log('[Pages administrador] Carpeta preparada en .pages-administrador.');
console.log('[Pages administrador] Ruta pública principal: /.');
console.log('[Pages administrador] Incluye períodos, carreras, lista global, estadísticas, WhatsApp y Outlook.');
console.log('[Pages administrador] La carpeta functions permanece en la raíz para habilitar /api/*.');
console.log('[Pages administrador] Protege este proyecto con Cloudflare Access antes de usarlo en producción.');
