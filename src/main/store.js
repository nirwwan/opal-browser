'use strict';
// Small JSON file store with atomic, debounced writes.
// Each file is written to "<file>.tmp" and renamed, so a crash mid-write
// never leaves a half-written file behind.

const fs = require('fs');
const path = require('path');

class JsonStore {
  constructor(file, defaults = {}, { delay = 400, memory = false } = {}) {
    this.file = file;
    this.delay = delay;
    this.memory = memory; // incognito: never touch the disk
    this.timer = null;
    this.data = structuredClone(defaults);
    if (!memory) this.data = { ...this.data, ...readJson(file) };
  }

  get(key) {
    return this.data[key];
  }

  set(key, value) {
    this.data[key] = value;
    this.save();
  }

  // Schedule a write. Many changes in a short time become one write.
  save() {
    if (this.memory) return;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), this.delay);
  }

  flush() {
    if (this.memory) return;
    clearTimeout(this.timer);
    this.timer = null;
    writeJsonAtomic(this.file, this.data);
  }
}

function readJson(file) {
  for (const f of [file, file + '.bak']) {
    try {
      const v = JSON.parse(fs.readFileSync(f, 'utf8'));
      if (v && typeof v === 'object') return v;
    } catch { /* missing or corrupt: try the backup, then defaults */ }
  }
  return {};
}

function writeJsonAtomic(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + '.tmp';
  const fd = fs.openSync(tmp, 'w', 0o600);
  try {
    fs.writeSync(fd, JSON.stringify(data));
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  // Keep the previous good version as a backup before replacing it.
  try { fs.copyFileSync(file, file + '.bak'); } catch { /* first write */ }
  fs.renameSync(tmp, file);
}

module.exports = { JsonStore, readJson, writeJsonAtomic };
