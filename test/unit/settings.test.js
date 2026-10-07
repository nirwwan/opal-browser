'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { cleanSetting } = require('../../src/main/settings-page');

test('settings: only listed keys with valid values', () => {
  assert.strictEqual(cleanSetting('searchEngine', 'bing'), 'bing');
  assert.strictEqual(cleanSetting('searchEngine', 'yahoo'), undefined);
  assert.strictEqual(cleanSetting('homePage', ''), 'opal://newtab');
  assert.strictEqual(cleanSetting('homePage', 'example.com/x'), 'https://example.com/x');
  assert.strictEqual(cleanSetting('homePage', 'javascript:alert(1)'), undefined);
  assert.strictEqual(cleanSetting('onyxUrl', 'http://127.0.0.1:7777/'), 'http://127.0.0.1:7777');
  assert.strictEqual(cleanSetting('onyxUrl', 'http://example.com:7777'), undefined);
  assert.strictEqual(cleanSetting('onyxTokenFile', 'relative/path'), undefined);
  assert.strictEqual(cleanSetting('ai.provider', 'both'), 'both');
  assert.strictEqual(cleanSetting('restoreOnStartup', 'yes'), undefined);
  assert.strictEqual(cleanSetting('nodeIntegration', true), undefined);
});
