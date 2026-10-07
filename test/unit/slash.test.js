'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseSlash, suggestSlash } = require('../../src/shared/slash');

test('slash commands map to panel changes', () => {
  assert.deepEqual(parseSlash('/hide').patch, { open: false });
  assert.deepEqual(parseSlash('/collapse').patch, { collapsed: true });
  assert.deepEqual(parseSlash('/small').patch, { size: 'S' });
  assert.deepEqual(parseSlash('/narrow').patch, { size: 'S' });
  assert.deepEqual(parseSlash('/medium').patch, { size: 'M' });
  assert.deepEqual(parseSlash(' /LARGE ').patch, { size: 'L' });
  assert.deepEqual(parseSlash('/wide').patch, { size: 'L' });
});

test('other text is not a command', () => {
  assert.equal(parseSlash('hello'), null);
  assert.equal(parseSlash('/hide this please'), null);
  assert.equal(parseSlash('what is /etc/hosts'), null);
  assert.deepEqual(parseSlash('/bogus'), { command: '/bogus', unknown: true });
});

test('suggestions', () => {
  assert.deepEqual(suggestSlash('/s').map((s) => s.command), ['/small']);
  assert.equal(suggestSlash('/').length, 7);
  assert.deepEqual(suggestSlash('hi'), []);
});
