'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { start } = require('../../scripts/mock-onyx');
const { OnyxClient, readConnection } = require('../../src/main/onyx');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'opal-onyx-'));
test.after(() => fs.rmSync(dir, { recursive: true, force: true }));

test('client streams chat, reads storage and reports health', async () => {
  const file = path.join(dir, 'a.json');
  const s = await start({ port: 0, file, delay: 0 });
  try {
    const c = new OnyxClient({ tokenFile: file });
    const h = await c.health();
    assert.equal(h.connected, true);
    const pieces = [];
    const text = await c.chat({ provider: 'openai', messages: [{ role: 'user', content: 'hello' }] }, (d) => pieces.push(d));
    assert.ok(pieces.length > 1, 'reply arrives in pieces');
    assert.match(text, /ChatGPT \(mock\)/);
    await c.putStorage('settings', { a: 1 });
    assert.deepEqual((await c.getStorage('settings')).data, { a: 1 });
  } finally {
    await s.close();
  }
});

test('offline Onyx is reported clearly', async () => {
  const c = new OnyxClient({ tokenFile: path.join(dir, 'missing.json') });
  // No file at the override path; make sure the default locations don't point anywhere live either.
  const prev = process.env.XDG_RUNTIME_DIR;
  process.env.XDG_RUNTIME_DIR = dir;
  const prevHome = process.env.HOME;
  process.env.HOME = dir;
  try {
    const h = await c.health();
    assert.equal(h.connected, false);
    assert.match(h.error, /isn't running/);
  } finally {
    process.env.XDG_RUNTIME_DIR = prev;
    process.env.HOME = prevHome;
  }
});

test('token files readable by others and remote URLs are refused', () => {
  const loose = path.join(dir, 'loose.json');
  fs.writeFileSync(loose, JSON.stringify({ url: 'http://127.0.0.1:7777', token: 'x' }), { mode: 0o644 });
  fs.chmodSync(loose, 0o644);
  assert.throws(() => readConnection(loose), /readable by other users/);
  const remote = path.join(dir, 'remote.json');
  fs.writeFileSync(remote, JSON.stringify({ url: 'http://evil.example:7777', token: 'x' }), { mode: 0o600 });
  assert.throws(() => readConnection(remote), /127\.0\.0\.1/);
});

test('stopping a chat aborts the request', async () => {
  const file = path.join(dir, 'b.json');
  const s = await start({ port: 0, file, delay: 30 });
  try {
    const c = new OnyxClient({ tokenFile: file });
    const ac = new AbortController();
    let got = 0;
    const p = c.chat({ provider: 'claude', messages: [{ role: 'user', content: 'x'.repeat(300) }] }, () => { if (++got === 2) ac.abort(); }, ac.signal);
    await assert.rejects(p, (e) => e.code === 'aborted' || /Stopped|isn't running/.test(e.message));
    assert.ok(got >= 2 && got < 10);
  } finally {
    await s.close();
  }
});
