'use strict';

const { contextBridge, ipcRenderer } = require('electron');

function invoke(channel, payload) {
  return ipcRenderer.invoke(channel, payload || {});
}

contextBridge.exposeInMainWorld('AdminElectron', Object.freeze({
  isElectron: true,
  platform: process.platform,
  cache: Object.freeze({
    get: (key) => invoke('admin-cache:get', { key }),
    set: (key, value, ttlMs) => invoke('admin-cache:set', { key, value, ttlMs }),
    remove: (key) => invoke('admin-cache:remove', { key }),
    clearPrefix: (prefix) => invoke('admin-cache:clear-prefix', { prefix }),
    clear: () => invoke('admin-cache:clear'),
    stats: () => invoke('admin-cache:stats')
  })
}));
