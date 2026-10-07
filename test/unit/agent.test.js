'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { parseAction, describeStep, SYSTEM } = require('../../src/main/agent');

test('parseAction reads fenced and bare JSON actions', () => {
  assert.deepStrictEqual(parseAction('Ok.\n```json\n{"action":"click","index":3}\n```'), { action: 'click', index: 3 });
  assert.deepStrictEqual(parseAction('I will {"action":"scroll","direction":"down"} now'), { action: 'scroll', direction: 'down' });
  assert.strictEqual(parseAction('no action here'), null);
  assert.strictEqual(parseAction('{"foo":1}'), null);
});

test('describeStep names steps for the action log', () => {
  assert.strictEqual(describeStep({ action: 'type', text: 'hi' }, { text: 'Search' }), 'Typing "hi" into "Search"');
  assert.strictEqual(describeStep({ action: 'type', text: 'secret' }, { text: 'pw', password: true }), 'Typing into a password field');
  assert.strictEqual(describeStep({ action: 'navigate', url: 'https://a.b' }), 'Opening https://a.b');
});

test('the agent prompt says passwords are never typed', () => {
  assert.match(SYSTEM, /never type passwords/);
  assert.match(SYSTEM, /OPAL_AGENT/);
});
