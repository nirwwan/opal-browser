'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { start } = require('../../scripts/mock-onyx');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'opal-mock-'));
test.after(() => fs.rmSync(dir, { recursive: true, force: true }));

test('mock Onyx: token file, auth, no CORS, streaming chat, storage', async () => {
  const file = path.join(dir, 'onyx-opal.json');
  const s = await start({ port: 0, file, delay: 0 });
  try {
    assert.equal(fs.statSync(file).mode & 0o777, 0o600);
    const info = JSON.parse(fs.readFileSync(file, 'utf8'));
    assert.equal(info.token, s.token);
    const auth = { authorization: 'Bearer ' + s.token };
    assert.equal((await fetch(s.url + '/health')).status, 401);
    assert.equal((await fetch(s.url + '/health', { headers: { ...auth, origin: 'https://evil.example' } })).status, 403);
    const h = await (await fetch(s.url + '/health', { headers: auth })).json();
    assert.equal(h.ok, true);
    const r = await fetch(s.url + '/ai/chat', { method: 'POST', headers: { ...auth, 'content-type': 'application/json' }, body: JSON.stringify({ provider: 'claude', messages: [{ role: 'user', content: 'hi' }], pageText: 'abc' }) });
    const lines = (await r.text()).trim().split('\n').map((l) => JSON.parse(l));
    assert.equal(lines.at(-1).type, 'done');
    const text = lines.filter((l) => l.type === 'delta').map((l) => l.text).join('');
    assert.match(text, /You said: "hi"/);
    assert.match(text, /3 characters/);
    await fetch(s.url + '/storage/bookmarks', { method: 'PUT', headers: { ...auth, 'content-type': 'application/json' }, body: JSON.stringify({ data: [1, 2] }) });
    const got = await (await fetch(s.url + '/storage/bookmarks', { headers: auth })).json();
    assert.deepEqual(got.data, [1, 2]);
    assert.equal((await fetch(s.url + '/storage/secrets', { headers: auth })).status, 404);
  } finally {
    await s.close();
  }
  assert.equal(fs.existsSync(file), false);
});
