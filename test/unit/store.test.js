'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { JsonStore } = require('../../src/main/store');

const made = [];
function tmpdir() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'opal-store-'));
  made.push(d);
  return d;
}
test.after(() => { for (const d of made) fs.rmSync(d, { recursive: true, force: true }); });

test('store keeps defaults and saves atomically', () => {
  const dir = tmpdir();
  const file = path.join(dir, 'a', 'state.json');
  const s = new JsonStore(file, { n: 1, list: [] });
  assert.equal(s.get('n'), 1);
  s.set('n', 2);
  s.flush();
  assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).n, 2);
  assert.equal(fs.statSync(file).mode & 0o777, 0o600);
  const again = new JsonStore(file, { n: 1, list: [] });
  assert.equal(again.get('n'), 2);
  assert.deepEqual(again.get('list'), []);
});

test('corrupt file falls back to the backup', () => {
  const dir = tmpdir();
  const file = path.join(dir, 'state.json');
  const s = new JsonStore(file, {});
  s.set('v', 'first'); s.flush();
  s.set('v', 'second'); s.flush();
  fs.writeFileSync(file, '{"v": "trunc');
  const r = new JsonStore(file, {});
  assert.equal(r.get('v'), 'first');
});

test('memory store never writes', () => {
  const dir = tmpdir();
  const file = path.join(dir, 'state.json');
  const s = new JsonStore(file, {}, { memory: true });
  s.set('v', 1); s.flush();
  assert.equal(fs.existsSync(file), false);
});
