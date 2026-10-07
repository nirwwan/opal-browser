'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { UI_COMMANDS, PAGE_CALLS, validate } = require('../../src/main/schema');
const { TABLE } = require('../../src/shared/shortcuts');

test('valid commands pass, malformed ones are rejected', () => {
  assert.equal(validate(UI_COMMANDS, 'new-tab', {}), true);
  assert.equal(validate(UI_COMMANDS, 'new-tab', { url: 'https://a.com' }), true);
  assert.equal(validate(UI_COMMANDS, 'new-tab', { url: 5 }), false);
  assert.equal(validate(UI_COMMANDS, 'new-tab', { url: 'x', extra: 1 }), false);
  assert.equal(validate(UI_COMMANDS, 'activate-tab', {}), false);
  assert.equal(validate(UI_COMMANDS, 'activate-tab', { tabId: '../etc' }), false);
  assert.equal(validate(UI_COMMANDS, 'create-space', { name: 'Study', color: '#6d3fb0' }), true);
  assert.equal(validate(UI_COMMANDS, 'create-space', { name: 'Study', color: 'red' }), false);
  assert.equal(validate(UI_COMMANDS, 'no-such-command', {}), false);
  assert.equal(validate(UI_COMMANDS, '__proto__', {}), false);
  assert.equal(validate(PAGE_CALLS, 'history.list', { query: 'a', limit: 10 }), true);
  assert.equal(validate(PAGE_CALLS, 'history.list', { limit: 0 }), false);
});

test('every shortcut maps to an allowed UI command', () => {
  for (const [, , cmd] of TABLE) assert.ok(cmd in UI_COMMANDS, cmd);
});

test('preloads only expose allow-listed channels', () => {
  for (const f of ['ui.js', 'page.js']) {
    const src = fs.readFileSync(path.join(__dirname, '../../src/preload', f), 'utf8');
    assert.ok(!/require\((?!'electron'\))/.test(src), f + ' only requires electron');
    assert.ok(!/ipcRenderer\s*[,}]/.test(src.split('contextBridge.exposeInMainWorld')[1] || ''), f + ' does not leak ipcRenderer');
  }
});
