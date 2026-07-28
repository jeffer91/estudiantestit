import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const errors = [];

function read(relativePath) {
  const absolute = path.join(root, relativePath);
  if (!fs.existsSync(absolute)) {
    errors.push('Falta: ' + relativePath);
    return '';
  }
  return fs.readFileSync(absolute, 'utf8');
}

function assert(condition, message) {
  if (!condition) errors.push(message);
}

const packageJson = JSON.parse(read('package.json') || '{}');
const main = read('electron/administrador/main.cjs');
const preload = read('electron/administrador/preload.cjs');
const cache = read('electron/administrador/cache.cjs');
const adminApi = read('administrador/ad-js/ad-api.service.js');

assert(packageJson.main === 'electron/administrador/main.cjs', 'package.json no apunta al Electron del Administrador.');
assert(packageJson.scripts && packageJson.scripts.start === 'electron .', 'npm start no abre Electron.');
assert(packageJson.devDependencies && packageJson.devDependencies.electron, 'Electron no está declarado como dependencia de desarrollo.');
assert(/administrador['"],\s*['"]ad-index\.html/.test(main), 'Electron no abre administrador/ad-index.html.');
assert(!/estudiantes-mvp|coordinadores-mvp/.test(main), 'Electron incluye una aplicación distinta de Administrador.');
assert(/contextIsolation:\s*true/.test(main), 'Electron debe activar contextIsolation.');
assert(/nodeIntegration:\s*false/.test(main), 'Electron debe desactivar nodeIntegration.');
assert(/sandbox:\s*true/.test(main), 'Electron debe activar sandbox.');
assert(/setPermissionRequestHandler/.test(main), 'Electron no bloquea permisos del navegador.');
assert(/AdminElectron/.test(preload) && /contextBridge/.test(preload), 'El preload no expone el puente seguro de caché.');
assert(/safeStorage/.test(cache), 'La caché persistente no usa cifrado de Electron.');
assert(/new Map\(\)/.test(cache), 'La caché no incluye memoria RAM.');
assert(/AdminElectron/.test(adminApi) && /solicitarConCache/.test(adminApi), 'El Administrador web no utiliza la caché de Electron.');
assert(/limpiarCache/.test(adminApi) && /escritura\(/.test(adminApi), 'La caché no se invalida después de escrituras.');

if (errors.length) {
  console.error('\n[Electron Administrador] Se encontraron errores:\n');
  errors.forEach((error, index) => console.error(`${index + 1}. ${error}`));
  console.error('');
  process.exit(1);
}

console.log('[Electron Administrador] Correcto: npm start abre solo Administrador con caché RAM y persistencia cifrada.');
