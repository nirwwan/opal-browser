'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { parsePlan } = require('../../src/main/ai-actions');

test('parsePlan reads a fenced JSON plan', () => {
  const text = 'Here is a plan.\n```json\n[{"tabId":"t1","spaceId":"sab"},{"bad":1}]\n```';
  assert.deepStrictEqual(parsePlan(text), [{ tabId: 't1', spaceId: 'sab' }]);
});

test('parsePlan reads a bare array and ignores junk', () => {
  assert.deepStrictEqual(parsePlan('ok [{"tabId":"t2","spaceId":"s1"}] done'), [{ tabId: 't2', spaceId: 's1' }]);
  assert.deepStrictEqual(parsePlan('no plan here'), []);
  assert.deepStrictEqual(parsePlan('```json\n{not json\n```'), []);
});
