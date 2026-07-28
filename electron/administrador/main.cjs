'use strict';

const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { app, BrowserWindow, ipcMain, shell, session } = require('electron');
const { AdminCacheStore } = require('./cache.cjs');

const APP_ID = 'ec.itsqmet.titulacion.administrador';
const CACHE_PREFIX = 'admin-api:';
const ROOT = path.resolve(__dirname, '..', '..');
const ADMIN_HTML = path.join(ROOT, 'administrador', 'ad-index.html');
const ADMIN_FILE_URL = pathToFileURL(ADMIN_HTML).toString();
const ALLOWED_EXTERNAL = /^(https?:|mailto:)/i;

let mainWindow = null;
let cacheStore = null;

function senderAllowed(event) {
  const senderUrl = String(
    event && event.senderFrame && event.senderFrame.url ||
    event && event.sender && event.sender.getURL && event.sender.getURL() ||
    ''
  );
  return senderUrl.startsWith('file:') || senderUrl.startsWith('https://titulos-administrador.pages.dev');
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

function openExternal(url) {
  if (ALLOWED_EXTERNAL.test(String(url || ''))) shell.openExternal(url).catch(() => {});
}

function createWindow() {
  const savedBounds = cacheStore.get('electron:window-bounds');
  const bounds = savedBounds.hit && savedBounds.value && typeof savedBounds.value === 'object'
    ? savedBounds.value
    : {};

  mainWindow = new BrowserWindow({
    width: Number(bounds.width || 1480),
    height: Number(bounds.height || 920),
    x: Number.isFinite(Number(bounds.x)) ? Number(bounds.x) : undefined,
    y: Number.isFinite(Number(bounds.y)) ? Number(bounds.y) : undefined,
    minWidth: 1080,
    minHeight: 700,
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
      devTools: process.env.ELECTRON_DEVTOOLS === '1',
      partition: 'persist:administrador-titulacion'
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

  mainWindow.once('ready-to-show', () => mainWindow && mainWindow.show());
  mainWindow.on('close', () => {
    if (!mainWindow) return;
    cacheStore.set('electron:window-bounds', mainWindow.getBounds(), 365 * 24 * 60 * 60 * 1000);
    cacheStore.flush();
  });
  mainWindow.on('closed', () => { mainWindow = null; });

  mainWindow.loadFile(ADMIN_HTML).catch((error) => {
    console.error('[Electron administrador] No se pudo abrir el Administrador:', error);
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

    session.fromPartition('persist:administrador-titulacion').setPermissionRequestHandler(
      (_webContents, _permission, callback) => callback(false)
    );

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
