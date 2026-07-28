'use strict';

const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { app, BrowserWindow, dialog, ipcMain, screen, shell, session } = require('electron');
const { AdminCacheStore } = require('./cache.cjs');

const APP_ID = 'ec.itsqmet.titulacion.administrador';
const CACHE_PREFIX = 'admin-api:';
const ROOT = path.resolve(__dirname, '..', '..');
const ADMIN_HTML = path.join(ROOT, 'administrador', 'ad-index.html');
const ADMIN_FILE_URL = pathToFileURL(ADMIN_HTML).toString();
const PARTITION = 'persist:administrador-titulacion';
const MIN_WIDTH = 900;
const MIN_HEIGHT = 600;
const SMOKE_TEST = process.argv.includes('--smoke-test');

let mainWindow = null;
let cacheStore = null;

function senderAllowed(event) {
  const senderUrl = String(
    event && event.senderFrame && event.senderFrame.url ||
    event && event.sender && event.sender.getURL && event.sender.getURL() ||
    ''
  );
  return senderUrl === ADMIN_FILE_URL || senderUrl.startsWith(`${ADMIN_FILE_URL}#`);
}

function validCacheKey(value, allowElectron = false) {
  const key = String(value || '').trim();
  if (key.startsWith(CACHE_PREFIX)) return key;
  if (allowElectron && key.startsWith('electron:')) return key;
  throw new Error('Clave de caché no permitida.');
}

function registerIpc() {
  ipcMain.handle('admin-cache:get', (event, payload) => {
    if (!senderAllowed(event)) throw new Error('Origen no permitido.');
    return cacheStore.get(validCacheKey(payload && payload.key));
  });
  ipcMain.handle('admin-cache:set', (event, payload) => {
    if (!senderAllowed(event)) throw new Error('Origen no permitido.');
    return cacheStore.set(
      validCacheKey(payload && payload.key),
      payload && payload.value,
      payload && payload.ttlMs
    );
  });
  ipcMain.handle('admin-cache:remove', (event, payload) => {
    if (!senderAllowed(event)) throw new Error('Origen no permitido.');
    return cacheStore.remove(validCacheKey(payload && payload.key));
  });
  ipcMain.handle('admin-cache:clear-prefix', (event, payload) => {
    if (!senderAllowed(event)) throw new Error('Origen no permitido.');
    const prefix = String(payload && payload.prefix || CACHE_PREFIX);
    if (!prefix.startsWith(CACHE_PREFIX)) throw new Error('Prefijo de caché no permitido.');
    return cacheStore.clearPrefix(prefix);
  });
  ipcMain.handle('admin-cache:clear', (event) => {
    if (!senderAllowed(event)) throw new Error('Origen no permitido.');
    return cacheStore.clearPrefix(CACHE_PREFIX);
  });
  ipcMain.handle('admin-cache:stats', (event) => {
    if (!senderAllowed(event)) throw new Error('Origen no permitido.');
    return cacheStore.stats();
  });
}

function openExternal(value) {
  try {
    const url = new URL(String(value || ''));
    if (!['https:', 'mailto:'].includes(url.protocol)) return;
    shell.openExternal(url.toString()).catch(() => {});
  } catch (_error) {}
}

function finiteOr(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizedBounds(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const candidate = {
    x: finiteOr(source.x, 0),
    y: finiteOr(source.y, 0),
    width: Math.max(MIN_WIDTH, finiteOr(source.width, 1480)),
    height: Math.max(MIN_HEIGHT, finiteOr(source.height, 920))
  };
  const display = screen.getDisplayMatching(candidate);
  const area = display && display.workArea || { x: 0, y: 0, width: 1480, height: 920 };
  const width = Math.min(candidate.width, Math.max(MIN_WIDTH, area.width));
  const height = Math.min(candidate.height, Math.max(MIN_HEIGHT, area.height));
  const x = Math.min(Math.max(candidate.x, area.x), area.x + Math.max(0, area.width - width));
  const y = Math.min(Math.max(candidate.y, area.y), area.y + Math.max(0, area.height - height));
  return { x, y, width, height };
}

function hardenSession(targetSession) {
  targetSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
  targetSession.setPermissionCheckHandler(() => false);
  targetSession.setDevicePermissionHandler(() => false);
}

function createWindow() {
  const savedBounds = cacheStore.get('electron:window-bounds');
  const bounds = normalizedBounds(savedBounds.hit ? savedBounds.value : null);

  mainWindow = new BrowserWindow({
    ...bounds,
    minWidth: MIN_WIDTH,
    minHeight: MIN_HEIGHT,
    show: false,
    backgroundColor: '#f5f7fb',
    title: 'Administrador de Titulación',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      devTools: !SMOKE_TEST && process.env.ELECTRON_DEVTOOLS === '1',
      partition: PARTITION
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (url === ADMIN_FILE_URL || url.startsWith(`${ADMIN_FILE_URL}#`)) return;
    event.preventDefault();
    openExternal(url);
  });

  mainWindow.webContents.on('will-attach-webview', (event) => event.preventDefault());
  mainWindow.once('ready-to-show', () => {
    if (!SMOKE_TEST && mainWindow) mainWindow.show();
  });
  mainWindow.on('close', () => {
    if (!mainWindow) return;
    cacheStore.set('electron:window-bounds', mainWindow.getBounds(), 365 * 24 * 60 * 60 * 1000);
    cacheStore.flush();
  });
  mainWindow.on('closed', () => { mainWindow = null; });

  const smokeTimer = SMOKE_TEST
    ? setTimeout(() => {
        console.error('[Electron administrador] La prueba de arranque superó 15 segundos.');
        process.exitCode = 1;
        app.quit();
      }, 15000)
    : null;

  mainWindow.loadFile(ADMIN_HTML).then(() => {
    if (!SMOKE_TEST) return;
    clearTimeout(smokeTimer);
    console.log('[Electron administrador] Prueba de arranque correcta.');
    setTimeout(() => app.quit(), 250);
  }).catch((error) => {
    if (smokeTimer) clearTimeout(smokeTimer);
    console.error('[Electron administrador] No se pudo abrir el Administrador:', error);
    if (SMOKE_TEST) {
      process.exitCode = 1;
      app.quit();
      return;
    }
    if (mainWindow) mainWindow.show();
    dialog.showErrorBox(
      'Administrador de Titulación',
      'No se pudo abrir la interfaz del Administrador. Verifica que el repositorio esté completo y vuelve a ejecutar npm start.'
    );
  });
}

const hasLock = app.requestSingleInstanceLock();
if (!hasLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  });

  app.whenReady().then(() => {
    app.setAppUserModelId(APP_ID);
    cacheStore = new AdminCacheStore(app.getPath('userData')).init();
    registerIpc();
    hardenSession(session.fromPartition(PARTITION));

    createWindow();
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('before-quit', () => {
    if (cacheStore) cacheStore.flush();
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
