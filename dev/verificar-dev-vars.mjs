import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const envPath = path.join(root, '.dev.vars');
const examplePath = path.join(root, '.dev.vars.example');

function fail(message) {
  console.error('\n[Configuración local] ' + message + '\n');
  process.exit(1);
}

if (!fs.existsSync(envPath)) {
  fail(
    'No existe el archivo .dev.vars en la raíz del proyecto. ' +
    'Ejecuta: Copy-Item .dev.vars.example .dev.vars y luego reemplaza APPS_SCRIPT_URL con la URL /exec real de Apps Script.'
  );
}

const raw = fs.readFileSync(envPath, 'utf8');
const lines = raw.split(/\r?\n/);
const values = {};

for (const line of lines) {
  const clean = line.trim();
  if (!clean || clean.startsWith('#')) continue;
  const index = clean.indexOf('=');
  if (index < 1) continue;
  const key = clean.slice(0, index).trim();
  let value = clean.slice(index + 1).trim();
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1);
  }
  values[key] = value;
}

const endpoint = String(values.APPS_SCRIPT_URL || '').trim();

if (!endpoint) {
  fail('APPS_SCRIPT_URL está vacío en .dev.vars. Pega la URL de la implementación web de Apps Script.');
}

if (endpoint.includes('PEGA_AQUI') || endpoint.includes('XXXXXXXX')) {
  fail('APPS_SCRIPT_URL todavía contiene el texto de ejemplo. Reemplázalo por la URL real que termina en /exec.');
}

let url;
try {
  url = new URL(endpoint);
} catch {
  fail('APPS_SCRIPT_URL no es una URL válida.');
}

if (
  url.protocol !== 'https:' ||
  !['script.google.com', 'script.googleusercontent.com'].includes(url.hostname) ||
  !url.pathname.endsWith('/exec')
) {
  fail('APPS_SCRIPT_URL debe ser una URL HTTPS de Google Apps Script y terminar en /exec.');
}

if (!fs.existsSync(examplePath)) {
  console.warn('[Configuración local] Aviso: no existe .dev.vars.example.');
}

console.log('[Configuración local] .dev.vars encontrado y APPS_SCRIPT_URL es válida.');
