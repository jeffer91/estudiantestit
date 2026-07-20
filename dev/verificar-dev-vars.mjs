import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const envPath = path.join(process.cwd(), '.dev.vars');
function fail(message) {
  console.error('\n[Configuración local] ' + message + '\n');
  process.exit(1);
}
if (!fs.existsSync(envPath)) {
  fail('No existe .dev.vars. Ejecuta: Copy-Item .dev.vars.example .dev.vars');
}
const values = {};
for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
  const clean = line.trim();
  if (!clean || clean.startsWith('#')) continue;
  const index = clean.indexOf('=');
  if (index < 1) continue;
  let value = clean.slice(index + 1).trim();
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
  values[clean.slice(0, index).trim()] = value;
}
const endpoint = String(values.CLAVES_APPS_SCRIPT_URL || '').trim();
const access = String(values.CLAVES_ACCESS_TOKEN || '').trim();
if (!endpoint || /PEGA_AQUI|XXXXXXXX/.test(endpoint)) fail('Configura CLAVES_APPS_SCRIPT_URL con la URL /exec real.');
let url;
try { url = new URL(endpoint); } catch { fail('CLAVES_APPS_SCRIPT_URL no es válida.'); }
if (url.protocol !== 'https:' || !['script.google.com','script.googleusercontent.com'].includes(url.hostname) || !url.pathname.endsWith('/exec')) fail('CLAVES_APPS_SCRIPT_URL debe ser una URL HTTPS de Apps Script terminada en /exec.');
if (!access || /PEGA_AQUI|XXXXXXXX/.test(access)) fail('Configura CLAVES_ACCESS_TOKEN con el valor ACCESO_PROXY de la hoja Claves.');
console.log('[Configuración local] Claves configurado. Títulos, Requisitos e IA se resolverán desde Google Sheets.');
