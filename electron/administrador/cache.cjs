'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { safeStorage } = require('electron');

const FILE_VERSION = 1;
const DEFAULT_TTL_MS = 5 * 60 * 1000;
const MAX_STALE_MS = 7 * 24 * 60 * 60 * 1000;

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

class AdminCacheStore {
  constructor(userDataPath, options = {}) {
    this.filePath = path.join(userDataPath, 'administrador-cache-v1.dat');
    this.maxEntries = Number(options.maxEntries || 250);
    this.entries = new Map();
    this.saveTimer = null;
    this.persistent = false;
  }

  init() {
    this.persistent = Boolean(safeStorage && safeStorage.isEncryptionAvailable());
    this.load();
    return this;
  }

  load() {
    if (!this.persistent || !fs.existsSync(this.filePath)) return;
    try {
      const wrapper = JSON.parse(fs.readFileSync(this.filePath, 'utf8'));
      if (!wrapper || wrapper.version !== FILE_VERSION || !wrapper.encrypted) return;
      const decrypted = safeStorage.decryptString(Buffer.from(wrapper.encrypted, 'base64'));
      const payload = JSON.parse(decrypted);
      const now = Date.now();
      Object.entries(payload.entries || {}).forEach(([key, entry]) => {
        if (!entry || typeof entry !== 'object') return;
        if (Number(entry.savedAt || 0) + MAX_STALE_MS < now) return;
        this.entries.set(key, entry);
      });
      this.prune();
    } catch (_error) {
      this.entries.clear();
    }
  }

  get(key) {
    const entry = this.entries.get(String(key || ''));
    if (!entry) return { hit: false, stale: false, persistent: this.persistent };
    return {
      hit: true,
      stale: Number(entry.expiresAt || 0) <= Date.now(),
      value: cloneJson(entry.value),
      savedAt: Number(entry.savedAt || 0),
      expiresAt: Number(entry.expiresAt || 0),
      persistent: this.persistent
    };
  }

  set(key, value, ttlMs = DEFAULT_TTL_MS) {
    const normalizedKey = String(key || '').trim();
    if (!normalizedKey) throw new Error('La clave de caché está vacía.');
    const now = Date.now();
    this.entries.set(normalizedKey, {
      value: cloneJson(value),
      savedAt: now,
      expiresAt: now + Math.max(1000, Number(ttlMs || DEFAULT_TTL_MS))
    });
    this.prune();
    this.scheduleSave();
    return this.get(normalizedKey);
  }

  remove(key) {
    const removed = this.entries.delete(String(key || ''));
    if (removed) this.scheduleSave();
    return { ok: true, removed };
  }

  clearPrefix(prefix) {
    const normalized = String(prefix || '');
    let removed = 0;
    for (const key of this.entries.keys()) {
      if (!normalized || key.startsWith(normalized)) {
        this.entries.delete(key);
        removed += 1;
      }
    }
    if (removed) this.scheduleSave();
    return { ok: true, removed };
  }

  clear() {
    const removed = this.entries.size;
    this.entries.clear();
    this.scheduleSave();
    return { ok: true, removed };
  }

  stats() {
    return {
      entries: this.entries.size,
      persistent: this.persistent,
      filePath: this.persistent ? this.filePath : ''
    };
  }

  prune() {
    const now = Date.now();
    for (const [key, entry] of this.entries.entries()) {
      if (Number(entry.savedAt || 0) + MAX_STALE_MS < now) this.entries.delete(key);
    }
    if (this.entries.size <= this.maxEntries) return;
    const ordered = [...this.entries.entries()].sort(
      (a, b) => Number(a[1].savedAt || 0) - Number(b[1].savedAt || 0)
    );
    while (ordered.length && this.entries.size > this.maxEntries) {
      const [key] = ordered.shift();
      this.entries.delete(key);
    }
  }

  scheduleSave() {
    if (!this.persistent) return;
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      this.flush();
    }, 200);
  }

  flush() {
    if (!this.persistent) return false;
    try {
      fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
      const entries = Object.fromEntries(this.entries.entries());
      const encrypted = safeStorage.encryptString(JSON.stringify({ entries }));
      const wrapper = JSON.stringify({
        version: FILE_VERSION,
        encrypted: encrypted.toString('base64')
      });
      const temporary = `${this.filePath}.tmp`;
      fs.writeFileSync(temporary, wrapper, { encoding: 'utf8', mode: 0o600 });
      fs.rmSync(this.filePath, { force: true });
      fs.renameSync(temporary, this.filePath);
      return true;
    } catch (_error) {
      return false;
    }
  }
}

module.exports = { AdminCacheStore };
