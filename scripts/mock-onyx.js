#!/usr/bin/env node
'use strict';
// A small stand-in for Onyx's local server, used until the real one exists and
// for automated tests. Same protocol as the real server:
//
//   Discovery file: $XDG_RUNTIME_DIR/onyx-opal.json (mode 0600)
//                   {"url":"http://127.0.0.1:7777","token":"…","pid":123,"version":"…"}
//   Every request:  Authorization: Bearer <token>. Requests with an Origin header are refused (no CORS).
//   GET  /health                 -> {"ok":true,"name":"onyx","version":"…","providers":{"claude":true,"openai":true}}
//   POST /ai/chat                {provider:"claude"|"openai", messages:[{role,content}], system?, pageText?}
//                                -> application/x-ndjson stream:
//                                   {"type":"delta","text":"…"} … {"type":"done"} | {"type":"error","message":"…"}
//   GET  /storage/<kind>         -> {"kind":…, "data":…, "updatedAt":…}     kind: bookmarks|history|chats|settings
//   PUT  /storage/<kind>         {data} -> {"ok":true,"updatedAt":…}
//
// Usage: node scripts/mock-onyx.js [--port 7777] [--file path] [--delay ms]

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const KINDS = new Set(['bookmarks', 'history', 'chats', 'settings']);

function defaultFile() {
  const dir = process.env.XDG_RUNTIME_DIR || path.join(require('os').homedir(), '.config', 'onyx');
  return path.join(dir, 'onyx-opal.json');
}

// Deterministic replies so tests can check them. Agent-mode requests (system
// prompt mentions OPAL_AGENT) get scripted JSON actions.
function reply(body) {
  const msgs = body.messages || [];
  const last = [...msgs].reverse().find((m) => m.role === 'user')?.content || '';
  const who = body.provider === 'openai' ? 'ChatGPT' : 'Claude';
  if ((body.system || '').includes('OPAL_AGENT')) return agentReply(msgs, last);
  if (/translate/i.test(body.system || '') || /^Translate/i.test(last)) {
    // Translation: echo each numbered line back with a marker.
    const lines = (body.pageText || last).split('\n').filter((l) => /^\d+\t/.test(l));
    return lines.map((l) => l.replace(/^(\d+)\t(.*)$/, '$1\t[T] $2')).join('\n');
  }
  let text = `${who} (mock) here. You said: "${last.slice(0, 200)}".`;
  if (body.pageText) text += ` I read ${body.pageText.length} characters of the page.`;
  if (/sort.*tabs.*spaces/i.test(last)) {
    const ids = [...last.matchAll(/tab:([a-z0-9]+)/gi)].map((m) => m[1]);
    const spaces = [...last.matchAll(/space:([a-z0-9]+)/gi)].map((m) => m[1]);
    text = 'Here is a plan.\n```json\n' + JSON.stringify(ids.map((id, i) => ({ tabId: id, spaceId: spaces[i % Math.max(1, spaces.length)] }))) + '\n```';
  }
  return text;
}

function agentReply(msgs, last) {
  const turns = msgs.filter((m) => m.role === 'assistant').length;
  const goal = msgs.find((m) => m.role === 'user')?.content || '';
  const m = /agent-test:\s*(.*)$/m.exec(goal);
  if (!m) return JSON.stringify({ action: 'done', summary: 'Nothing to do (mock).' });
  const steps = m[1].split(';').map((s) => s.trim()).filter(Boolean);
  if (turns >= steps.length) return JSON.stringify({ action: 'done', summary: `Finished ${steps.length} step(s).` });
  const [verb, ...rest] = steps[turns].split(' ');
  const arg = rest.join(' ');
  const a = { read: { action: 'read_page' }, click: { action: 'click', selector: arg }, type: { action: 'type', selector: arg.split('=')[0], text: arg.split('=').slice(1).join('=') },
    scroll: { action: 'scroll', direction: arg || 'down' }, navigate: { action: 'navigate', url: arg }, submit: { action: 'submit', selector: arg },
    newtab: { action: 'new_tab', url: arg }, wait: { action: 'wait', ms: 1500 }, password: { action: 'type', selector: arg, text: 'hunter2' } }[verb] || { action: 'done', summary: 'Unknown step' };
  return 'Working on it.\n```json\n' + JSON.stringify(a) + '\n```' + (last ? '' : '');
}

function start({ port = 7777, file = defaultFile(), delay = 15, host = '127.0.0.1' } = {}) {
  const token = crypto.randomBytes(24).toString('hex');
  const store = new Map();
  const log = [];

  const server = http.createServer((req, res) => {
    const send = (code, obj) => {
      res.writeHead(code, { 'content-type': 'application/json' });
      res.end(JSON.stringify(obj));
    };
    if (req.headers.origin) return send(403, { error: 'Origin not allowed' });
    if (req.headers.authorization !== `Bearer ${token}`) return send(401, { error: 'Bad token' });
    const url = new URL(req.url, 'http://x');
    let raw = '';
    req.on('data', (c) => { raw += c; if (raw.length > 8e6) req.destroy(); });
    req.on('end', async () => {
      let body = {};
      try { body = raw ? JSON.parse(raw) : {}; } catch { return send(400, { error: 'Bad JSON' }); }
      log.push({ method: req.method, path: url.pathname, body });
      if (req.method === 'GET' && url.pathname === '/health') {
        return send(200, { ok: true, name: 'onyx', version: 'mock', providers: { claude: true, openai: true } });
      }
      if (req.method === 'POST' && url.pathname === '/ai/chat') {
        if (!['claude', 'openai'].includes(body.provider) || !Array.isArray(body.messages)) return send(400, { error: 'provider and messages are required' });
        res.writeHead(200, { 'content-type': 'application/x-ndjson' });
        const text = reply(body);
        const parts = text.match(/[\s\S]{1,12}/g) || [];
        let closed = false;
        res.on('close', () => { closed = true; });
        for (const p of parts) {
          if (closed) return;
          res.write(JSON.stringify({ type: 'delta', text: p }) + '\n');
          await new Promise((r) => setTimeout(r, delay));
        }
        res.end(JSON.stringify({ type: 'done' }) + '\n');
        return;
      }
      const sm = /^\/storage\/([a-z]+)$/.exec(url.pathname);
      if (sm && KINDS.has(sm[1])) {
        if (req.method === 'GET') return send(200, { kind: sm[1], ...(store.get(sm[1]) || { data: null, updatedAt: 0 }) });
        if (req.method === 'PUT') {
          const updatedAt = Date.now();
          store.set(sm[1], { data: body.data ?? null, updatedAt });
          return send(200, { ok: true, updatedAt });
        }
      }
      return send(404, { error: 'Not found' });
    });
  });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      const actual = server.address().port;
      const info = { url: `http://${host}:${actual}`, token, pid: process.pid, version: 'mock' };
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, JSON.stringify(info), { mode: 0o600 });
      fs.chmodSync(file, 0o600);
      resolve({
        url: info.url, token, file, log, store,
        close: () => new Promise((r) => { try { fs.unlinkSync(file); } catch { /* gone */ } server.close(() => r()); server.closeAllConnections(); }),
      });
    });
  });
}

if (require.main === module) {
  const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1] : d; };
  start({ port: Number(arg('port', 7777)), file: arg('file', defaultFile()), delay: Number(arg('delay', 15)) })
    .then((s) => console.log(`Mock Onyx on ${s.url}, token file ${s.file}`))
    .catch((e) => { console.error(e.message); process.exit(1); });
}

module.exports = { start, defaultFile };
