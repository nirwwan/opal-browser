'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { chunks, parseLines } = require('../../src/main/translate');

test('chunks numbers texts, skips empty ones and splits long input', () => {
  const c = chunks(['Hello', '', 'World\there']);
  assert.deepStrictEqual(c, [['0\tHello', '2\tWorld here']]);
  const many = chunks(Array.from({ length: 200 }, () => 'x'.repeat(100)));
  assert.ok(many.length > 1);
  assert.strictEqual(many.flat().length, 200);
});

test('parseLines reads numbered lines and drops unknown numbers', () => {
  const got = parseLines('Sure:\n0\tHola\n2\tMundo\n9\tExtra\n3: Tres', new Set([0, 2, 3]));
  assert.deepStrictEqual(got, [[0, 'Hola'], [2, 'Mundo'], [3, 'Tres']]);
});
