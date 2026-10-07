'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('module');

// permissions.js only needs newId from profile.js; stub electron for the require chain.
const origLoad = Module._load;
Module._load = function (req, ...rest) { if (req === 'electron') return {}; return origLoad.call(this, req, ...rest); };
const { describe } = require('../../src/main/permissions');
Module._load = origLoad;

test('media requests split into camera and microphone', () => {
  assert.deepEqual(describe('media', { mediaTypes: ['video', 'audio'] }).keys, ['camera', 'microphone']);
  assert.equal(describe('media', { mediaTypes: ['audio'] }).text, 'wants to use your microphone');
  assert.equal(describe('media', { mediaTypes: [] }), null);
});

test('location and notifications are asked; unknown permissions are not', () => {
  assert.deepEqual(describe('geolocation').keys, ['location']);
  assert.deepEqual(describe('notifications').keys, ['notifications']);
  assert.equal(describe('usb'), null);
});
