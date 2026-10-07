'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { resolveOpalUrl } = require('../../src/main/protocol');

const root = path.join(__dirname, '../..');

test('opal:// pages map into src/pages', () => {
  assert.equal(resolveOpalUrl('opal://newtab'), path.join(root, 'src/pages/newtab.html'));
  assert.equal(resolveOpalUrl('opal://newtab/pages.css'), path.join(root, 'src/pages/pages.css'));
  assert.equal(resolveOpalUrl('opal://history/fonts/BricolageGrotesque-latin.woff2'), path.join(root, 'assets/fonts/BricolageGrotesque-latin.woff2'));
  assert.equal(resolveOpalUrl('opal://nope'), path.join(root, 'src/pages/notfound.html'));
});

test('path traversal is refused', () => {
  assert.equal(resolveOpalUrl('opal://history/..%2F..%2Fmain%2Fmain.js'), null);
  assert.equal(resolveOpalUrl('opal://history/%2e%2e/x'), path.join(root, 'src/pages/x')); // URL parser normalises it
  assert.equal(resolveOpalUrl('opal://history/a/b/c.js'), null);
  assert.equal(resolveOpalUrl('opal://history/.env'), null);
});
