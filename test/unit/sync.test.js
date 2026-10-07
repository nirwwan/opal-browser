'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { serializeChat, chatTitle, mergeChats, mergeHistory, mergeBookmarks } = require('../../src/main/sync');

test('chat title is the first question, shortened', () => {
  assert.strictEqual(chatTitle({ messages: [{ role: 'user', content: 'What is  Opal?' }] }), 'What is Opal?');
  assert.ok(chatTitle({ messages: [{ role: 'user', content: 'x'.repeat(100) }] }).endsWith('…'));
  const s = serializeChat({ id: 'c1', startedAt: 1, messages: [{ id: 'm', role: 'assistant', content: '', plan: {} }, { id: 'n', role: 'user', content: 'hi' }] });
  assert.strictEqual(s.messages.length, 1);
  assert.strictEqual(s.messages[0].content, 'hi');
});

test('mergeChats keeps the newest copy of each chat', () => {
  const out = mergeChats([{ id: 'a', updatedAt: 5, title: 'local' }], [{ id: 'a', updatedAt: 9, title: 'remote' }, { id: 'b', updatedAt: 1 }]);
  assert.deepStrictEqual(out.map((c) => c.title || c.id), ['remote', 'b']);
});

test('mergeHistory unions by id in time order', () => {
  const out = mergeHistory([{ id: 'h1', url: 'a', visitedAt: 2 }], [{ id: 'h1', url: 'a', visitedAt: 2 }, { id: 'h0', url: 'b', visitedAt: 1 }]);
  assert.deepStrictEqual(out.map((e) => e.id), ['h0', 'h1']);
});

test('mergeBookmarks takes remote bookmarks per space and keeps unknown spaces', () => {
  const out = mergeBookmarks([{ id: 's1', name: 'P', color: '#000000', bookmarks: [] }], [{ id: 's1', bookmarks: [{ id: 'b' }] }, { id: 's2', name: 'W', color: '#111111', bookmarks: [] }]);
  assert.strictEqual(out[0].bookmarks.length, 1);
  assert.strictEqual(out[0].name, 'P');
  assert.strictEqual(out[1].id, 's2');
});
