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
assert(packageJson.devDependencies && /^\d+\.\d+\.\d+$/.test(packageJson.devDependencies.electron || ''), 'Electron no está fijado a una versión exacta.');
assert(/administrador['"],\s*['"]ad-index\.html/.test(main), 'Electron no abre administrador/ad-index.html.');
assert(!/estudiantes-mvp|coordinadores-mvp/.test(main), 'Electron incluye una aplicación distinta de Administrador.');
assert(/contextIsolation:\s*true/.test(main), 'Electron debe activar contextIsolation.');
assert(/nodeIntegration:\s*false/.test(main), 'Electron debe desactivar nodeIntegration.');
assert(/sandbox:\s*true/.test(main), 'Electron debe activar sandbox.');
assert(/webSecurity:\s*true/.test(main), 'Electron debe mantener webSecurity.');
assert(/setPermissionRequestHandler/.test(main), 'Electron no bloquea solicitudes de permisos.');
assert(/setPermissionCheckHandler/.test(main), 'Electron no bloquea comprobaciones de permisos.');
assert(/setDevicePermissionHandler/.test(main), 'Electron no bloquea permisos de dispositivos.');
assert(/will-attach-webview/.test(main), 'Electron no bloquea webviews adjuntos.');
assert(/senderUrl\s*===\s*ADMIN_FILE_URL/.test(main), 'IPC no está limitado al archivo exacto del Administrador.');
assert(/AdminElectron/.test(preload) && /contextBridge/.test(preload), 'El preload no expone el puente seguro de caché.');
assert(/safeStorage/.test(cache), 'La caché persistente no usa cifrado de Electron.');
assert(/getSelectedStorageBackend/.test(cache) && /basic_text/.test(cache), 'La caché no evita persistir cuando Linux usa cifrado básico inseguro.');
assert(/MAX_VALUE_BYTES/.test(cache), 'La caché no limita el tamaño de cada valor.');
assert(/new Map\(\)/.test(cache), 'La caché no incluye memoria RAM.');
assert(/AdminElectron/.test(adminApi) && /solicitarConCache/.test(adminApi), 'El Administrador web no utiliza la caché de Electron.');
assert(/limpiarCache/.test(adminApi) && /escritura\(/.test(adminApi), 'La caché no se invalida después de escrituras.');
assert(/cacheGeneration/.test(adminApi), 'La caché no protege contra respuestas antiguas después de una invalidación.');
assert(/enCurso\.get\(key\)===task/.test(adminApi), 'Una consulta antigua podría eliminar una consulta nueva en curso.');
assert(/ad-cache-warning/.test(adminApi), 'La interfaz no avisa cuando muestra datos desactualizados.');
assert(/permitirRespaldo:false/.test(adminApi), 'El diagnóstico podría aceptar datos antiguos de la caché.');

if (errors.length) {
  console.error('\n[Electron Administrador] Se encontraron errores:\n');
  errors.forEach((error, index) => console.error(`${index + 1}. ${error}`));
  console.error('');
  process.exit(1);
}

console.log('[Electron Administrador] Correcto: npm start abre solo Administrador con caché segura, invalidación y permisos bloqueados.');
