#!/usr/bin/env node
'use strict';
// A fake Ollama + OpenAI + Anthropic API in one local server, for tests and for trying
// Opal AI without a real model. Accepts the API key "test-key" only.
//
//   GET  /api/tags              Ollama model list        POST /api/chat             Ollama NDJSON stream
//   GET  /v1/models             OpenAI (Bearer) or Anthropic (x-api-key) model list
//   POST /v1/chat/completions   OpenAI SSE stream        POST /v1/messages          Anthropic SSE stream
//
// Usage: node scripts/mock-llm.js [--port 11434]

const http = require('http');

const KEY = 'test-key';

// Demo answers for README screenshots (clearly a demo: see README).
const DEMO_SUMMARY = [
  '- **Opal is hydrated silica** (SiO2·nH2O), usually 3 to 21% water, without a true crystal structure, so it counts as a mineraloid.',
  "- **Play-of-colour** comes from tiny silica spheres stacked in a regular grid that diffract light into flashes of colour.",
  '- **Most precious opal comes from Australia**; it is the national gemstone, with other deposits in Ethiopia, Mexico and Brazil.',
  '- **It is soft and sensitive**, about 5.5 to 6.5 on the Mohs scale, and can crack if it dries out or heats quickly.',
  '',
  'Why it matters: the same light-diffraction idea inspires photonic crystals used in optics research.',
].join('\n');

function reply(who, body, demo) {
  if (demo) {
    const lastUser = [...(body.messages || [])].reverse().find((m) => m.role === 'user')?.content || '';
    if (/summari[sz]e/i.test(lastUser)) return DEMO_SUMMARY;
    return 'Here is what I found on this page.';
  }
  const msgs = body.messages || [];
  const last = [...msgs].reverse().find((m) => m.role === 'user')?.content || '';
  const sys = typeof body.system === 'string' ? body.system : (msgs.find((m) => m.role === 'system')?.content || '');
  if (/OPAL_AGENT/.test(sys)) return 'Done.\n```json\n{"action":"done","summary":"Nothing to do (mock)."}\n```';
  let text = `${who} (mock) here. You said: "${String(last).slice(0, 200)}".`;
  if (/<page>/.test(sys)) text += ' I can see the page text.';
  if (/refuse-me/.test(last)) text = '';
  return text;
}

function start({ port = 0, host = '127.0.0.1', delay = 5, demo = false } = {}) {
  const log = [];
  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => { raw += c; });
    req.on('end', async () => {
      let body = {};
      try { body = raw ? JSON.parse(raw) : {}; } catch { body = {}; }
      const url = new URL(req.url, 'http://x');
      log.push({ method: req.method, path: url.pathname, headers: req.headers, body });
      const json = (code, obj) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(obj)); };
      const chunks = (text) => text.match(/[\s\S]{1,10}/g) || [];
      const wait = () => new Promise((r) => setTimeout(r, delay));

      // ---- Ollama ----
      if (url.pathname === '/api/tags') return json(200, { models: [{ name: 'llama3.2:latest' }, { name: 'qwen2.5:7b' }] });
      if (url.pathname === '/api/chat') {
        if (!body.model) return json(400, { error: 'model is required' });
        res.writeHead(200, { 'content-type': 'application/x-ndjson' });
        for (const c of chunks(reply('Ollama', body, demo))) { res.write(JSON.stringify({ message: { role: 'assistant', content: c }, done: false }) + '\n'); await wait(); }
        return res.end(JSON.stringify({ message: { role: 'assistant', content: '' }, done: true }) + '\n');
      }

      // ---- Anthropic (x-api-key) ----
      if (req.headers['x-api-key'] !== undefined) {
        if (req.headers['x-api-key'] !== KEY) return json(401, { type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } });
        if (url.pathname === '/v1/models') {
          const data = ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-4-5'].map((id) => ({ id, type: 'model', display_name: id, created_at: '2026-01-01T00:00:00Z' }));
          return json(200, { data, has_more: false, first_id: data[0].id, last_id: data[data.length - 1].id });
        }
        if (url.pathname === '/v1/messages') {
          const text = reply('Claude', body, demo);
          res.writeHead(200, { 'content-type': 'text/event-stream' });
          const ev = (type, data) => res.write(`event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`);
          ev('message_start', { message: { id: 'msg_mock', type: 'message', role: 'assistant', model: body.model, content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 } } });
          ev('content_block_start', { index: 0, content_block: { type: 'text', text: '' } });
          for (const c of chunks(text)) { ev('content_block_delta', { index: 0, delta: { type: 'text_delta', text: c } }); await wait(); }
          ev('content_block_stop', { index: 0 });
          ev('message_delta', { delta: { stop_reason: text ? 'end_turn' : 'refusal', stop_sequence: null }, usage: { output_tokens: 5 } });
          ev('message_stop', {});
          return res.end();
        }
      }

      // ---- OpenAI (Bearer) ----
      if (url.pathname.startsWith('/v1/')) {
        if (req.headers.authorization !== `Bearer ${KEY}`) return json(401, { error: { message: 'Incorrect API key provided' } });
        if (url.pathname === '/v1/models') return json(200, { data: [{ id: 'gpt-mock-1' }, { id: 'gpt-mock-mini' }, { id: 'text-embedding-3-small' }] });
        if (url.pathname === '/v1/chat/completions') {
          res.writeHead(200, { 'content-type': 'text/event-stream' });
          for (const c of chunks(reply('ChatGPT', body, demo))) { res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: c } }] })}\n\n`); await wait(); }
          res.write('data: [DONE]\n\n');
          return res.end();
        }
      }
      return json(404, { error: 'not found' });
    });
  });
  return new Promise((resolve) => server.listen(port, host, () => resolve({
    url: `http://${host}:${server.address().port}`, log,
    close: () => new Promise((r) => { server.close(() => r()); server.closeAllConnections(); }),
  })));
}

if (require.main === module) {
  const i = process.argv.indexOf('--port');
  start({ port: i > 0 ? Number(process.argv[i + 1]) : 11434 }).then((s) => console.log(`Mock Ollama/OpenAI/Anthropic on ${s.url} (API key: ${KEY})`));
}

module.exports = { start, KEY };
