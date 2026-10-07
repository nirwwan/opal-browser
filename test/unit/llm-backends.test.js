'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const mock = require('../../scripts/mock-llm');
const b = require('../../src/main/llm-backends');

let s;
test.before(async () => { s = await mock.start(); });
test.after(() => s.close());

test('normalizeMessages merges same-role turns and starts with the user', () => {
  assert.deepEqual(b.normalizeMessages([{ role: 'assistant', content: 'x' }, { role: 'user', content: 'a' }, { role: 'user', content: 'b' }, { role: 'system', content: 's' }]),
    [{ role: 'user', content: 'a\n\nb' }]);
});

test('Ollama: lists models and streams a reply with the page text', async () => {
  assert.deepEqual(await b.listOllamaModels({ url: s.url }), ['llama3.2:latest', 'qwen2.5:7b']);
  let streamed = '';
  const text = await b.streamOllama({ url: s.url, model: 'llama3.2:latest', system: 'sys', pageText: 'PAGE', messages: [{ role: 'user', content: 'hi' }] }, (d) => { streamed += d; });
  assert.match(text, /Ollama \(mock\) here. You said: "hi". I can see the page text./);
  assert.equal(streamed, text);
  await assert.rejects(b.listOllamaModels({ url: 'http://127.0.0.1:9' }), (e) => e.code === 'offline');
});

test('OpenAI: models filtered to chat models, streamed reply, bad key is an auth error', async () => {
  assert.deepEqual(await b.listOpenAIModels({ apiKey: mock.KEY, baseUrl: s.url }), ['gpt-mock-1', 'gpt-mock-mini']);
  const text = await b.streamOpenAI({ apiKey: mock.KEY, baseUrl: s.url, model: 'gpt-mock-1', messages: [{ role: 'user', content: 'yo' }] });
  assert.match(text, /ChatGPT \(mock\) here. You said: "yo"/);
  await assert.rejects(b.streamOpenAI({ apiKey: 'wrong', baseUrl: s.url, model: 'gpt-mock-1', messages: [{ role: 'user', content: 'yo' }] }), (e) => e.code === 'auth');
});

test('Claude through the Anthropic SDK: models, streamed reply, fallbacks on, refusal handled', async () => {
  assert.deepEqual(await b.listClaudeModels({ apiKey: mock.KEY, baseUrl: s.url }), ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-4-5']);
  let streamed = '';
  const text = await b.streamClaude({ apiKey: mock.KEY, baseUrl: s.url, messages: [{ role: 'user', content: 'hello' }], system: 'sys' }, (d) => { streamed += d; });
  assert.match(text, /Claude \(mock\) here. You said: "hello"/);
  assert.equal(streamed, text);
  const req = s.log.filter((l) => l.path === '/v1/messages').at(-1);
  assert.equal(req.body.model, 'claude-opus-5-5');
  assert.equal(req.body.fallbacks, 'default');
  assert.match(req.headers['anthropic-beta'], /server-side-fallback-2026-07-01/);
  await assert.rejects(b.streamClaude({ apiKey: mock.KEY, baseUrl: s.url, messages: [{ role: 'user', content: 'refuse-me' }] }), (e) => e.code === 'refusal');
  await assert.rejects(b.streamClaude({ apiKey: 'nope', baseUrl: s.url, messages: [{ role: 'user', content: 'x' }] }), (e) => e.code === 'auth');
  // Abort
  const ac = new AbortController();
  const p = b.streamClaude({ apiKey: mock.KEY, baseUrl: s.url, messages: [{ role: 'user', content: 'x'.repeat(300) }], signal: ac.signal }, () => ac.abort());
  await assert.rejects(p, (e) => e.code === 'aborted');
});
