'use strict';

const { contextBridge, ipcRenderer } = require('electron');

function invoke(channel, payload) {
  return ipcRenderer.invoke(channel, payload || {});
}

function subscribe(channel, callback) {
  if (typeof callback !== 'function') return () => {};
  const handler = (_event, payload) => callback(payload || {});
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
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
  }),
  graph: Object.freeze({
    status: (config) => invoke('admin-graph:status', { config }),
    connect: (config) => invoke('admin-graph:connect', { config }),
    signOut: (config) => invoke('admin-graph:sign-out', { config }),
    createDrafts: (config, message) => invoke('admin-graph:create-drafts', Object.assign({ config }, message || {})),
    onDeviceCode: (callback) => subscribe('admin-graph:device-code', callback),
    onProgress: (callback) => subscribe('admin-graph:progress', callback)
  })
}));
