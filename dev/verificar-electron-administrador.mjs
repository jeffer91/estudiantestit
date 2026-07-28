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
const graph = read('electron/administrador/microsoft-graph.cjs');
const adminApi = read('administrador/ad-js/ad-api.service.js');

assert(packageJson.main === 'electron/administrador/main.cjs', 'package.json no apunta al Electron del Administrador.');
assert(packageJson.scripts && packageJson.scripts.start === 'electron .', 'npm start no abre Electron.');
assert(packageJson.devDependencies && /^\d+\.\d+\.\d+$/.test(packageJson.devDependencies.electron || ''), 'Electron no está fijado a una versión exacta.');
assert(packageJson.dependencies && /^\d+\.\d+\.\d+$/.test(packageJson.dependencies['@azure/msal-node'] || ''), 'MSAL Node no está fijado a una versión exacta.');
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

assert(/MicrosoftGraphDrafts/.test(main), 'Electron no inicializa el servicio de Microsoft Graph.');
assert(/admin-graph:status/.test(main) && /admin-graph:connect/.test(main), 'Electron no registra la conexión con Microsoft 365.');
assert(/admin-graph:create-drafts/.test(main), 'Electron no registra la creación de borradores.');
assert(/admin-graph:sign-out/.test(main), 'Electron no permite cerrar la sesión de Microsoft.');
assert(/graph:\s*Object\.freeze/.test(preload), 'El preload no expone Microsoft Graph de forma aislada.');
assert(/onDeviceCode/.test(preload) && /onProgress/.test(preload), 'El preload no expone eventos controlados de autenticación y progreso.');
assert(/PublicClientApplication/.test(graph), 'Microsoft Graph no usa una aplicación cliente pública de MSAL.');
assert(/acquireTokenSilent/.test(graph) && /acquireTokenByDeviceCode/.test(graph), 'La autenticación no reutiliza sesión ni ofrece código de dispositivo.');
assert(/TOKEN_CACHE_TTL_MS/.test(graph) && /tokenCache\.serialize/.test(graph), 'El token de Microsoft no se conserva mediante la caché cifrada.');
assert(/piiLoggingEnabled:\s*false/.test(graph), 'MSAL no desactiva el registro de información personal.');
assert(/MAX_RECIPIENTS_PER_DRAFT\s*=\s*50/.test(graph), 'Microsoft Graph no limita los destinatarios por borrador.');
assert(/bccRecipients/.test(graph), 'Microsoft Graph no coloca los destinatarios en CCO.');
assert(!/clientSecret/i.test(graph), 'Una aplicación de escritorio no debe almacenar Client Secret.');
assert(!/\/send\b/.test(graph), 'La aplicación no debe enviar automáticamente los borradores.');

if (errors.length) {
  console.error('\n[Electron Administrador] Se encontraron errores:\n');
  errors.forEach((error, index) => console.error(`${index + 1}. ${error}`));
  console.error('');
  process.exit(1);
}

console.log('[Electron Administrador] Correcto: Administrador seguro con caché y borradores reales de Microsoft Graph.');
