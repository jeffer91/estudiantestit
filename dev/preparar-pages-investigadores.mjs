import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const source = path.join(root, 'investigadores-mvp');
const output = path.join(root, '.pages-investigadores');

if (!fs.existsSync(source) || !fs.statSync(source).isDirectory()) {
  throw new Error('No se encontró la carpeta investigadores-mvp.');
}
for (const required of [
  path.join(source, 'index.html'),
  path.join(source, 'css', 'investigadores.css'),
  path.join(source, 'js', 'investigadores.app.js')
]) {
  if (!fs.existsSync(required)) throw new Error('Falta un archivo obligatorio de Investigadores: ' + required);
}

fs.rmSync(output, { recursive: true, force: true });
fs.cpSync(source, output, { recursive: true, force: true });

const headers = `/*
  Cache-Control: no-store, no-cache, must-revalidate
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=()
  X-Frame-Options: SAMEORIGIN
`;
fs.writeFileSync(path.join(output, '_headers'), headers, 'utf8');

console.log('[Pages investigadores] Carpeta preparada en .pages-investigadores.');
console.log('[Pages investigadores] Ruta pública principal: /.');
console.log('[Pages investigadores] API esperada: /api/investigadores.');
