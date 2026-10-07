'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { matchShortcut } = require('../../src/shared/shortcuts');

const key = (k, mods = {}) => ({ type: 'keyDown', key: k, control: false, shift: false, alt: false, meta: false, ...mods });
const ctrl = (k, more = {}) => key(k, { control: true, ...more });

test('core Ctrl shortcuts from the brief', () => {
  assert.equal(matchShortcut(ctrl('t')), 'new-tab');
  assert.equal(matchShortcut(ctrl('w')), 'close-tab');
  assert.equal(matchShortcut(ctrl('l')), 'focus-address');
  assert.equal(matchShortcut(ctrl('r')), 'reload');
  assert.equal(matchShortcut(ctrl('n')), 'new-window');
  assert.equal(matchShortcut(ctrl('f')), 'find');
  assert.equal(matchShortcut(ctrl('h')), 'history');
  assert.equal(matchShortcut(ctrl('j')), 'downloads');
  assert.equal(matchShortcut(ctrl('p')), 'print');
  assert.equal(matchShortcut(ctrl('k')), 'command-bar');
});

test('Shift and Alt combinations', () => {
  assert.equal(matchShortcut(ctrl('N', { shift: true })), 'new-incognito-window');
  assert.equal(matchShortcut(ctrl('A', { shift: true })), 'toggle-ai');
  assert.equal(matchShortcut(ctrl('Tab')), 'next-tab');
  assert.equal(matchShortcut(ctrl('Tab', { shift: true })), 'previous-tab');
  assert.equal(matchShortcut(key('ArrowLeft', { alt: true })), 'back');
  assert.equal(matchShortcut(key('ArrowRight', { alt: true })), 'forward');
  assert.equal(matchShortcut(ctrl('Delete', { shift: true })), 'clear-data');
});

test('non-matches and key-up events are ignored', () => {
  assert.equal(matchShortcut(key('t')), null);
  assert.equal(matchShortcut({ ...ctrl('t'), type: 'keyUp' }), null);
  assert.equal(matchShortcut(ctrl('t', { meta: true })), null);
  assert.equal(matchShortcut(ctrl('q', { shift: true, alt: true })), null);
});

test('tab number shortcuts', () => {
  assert.equal(matchShortcut(ctrl('1')), 'select-tab-1');
  assert.equal(matchShortcut(ctrl('9')), 'select-last-tab');
});
