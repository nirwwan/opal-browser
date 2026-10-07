'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { chromeUserAgent, chromeBrands, brandHeader, clientHintHeaders, parseAcceptCH } = require('../../src/shared/chrome-identity');

test('reduced Chrome user agent with no Electron or Opal tokens', () => {
  const ua = chromeUserAgent('152.0.7977.130');
  assert.equal(ua, 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36');
  assert.doesNotMatch(ua, /Electron|opal/i);
});

test('brand list follows Chromium: GREASE brand and order seeded by the major version', () => {
  // Matches what Electron 44 (Chromium 152) itself generates for the greased brand: "Not?A_Brand";v="24".
  assert.equal(brandHeader(chromeBrands('152.0.7977.130')), '"Chromium";v="152", "Not?A_Brand";v="24", "Google Chrome";v="152"');
  assert.equal(brandHeader(chromeBrands('152.0.7977.130', { full: true })), '"Chromium";v="152.0.7977.130", "Not?A_Brand";v="24.0.0.0", "Google Chrome";v="152.0.7977.130"');
  // Known real Chrome 120 value: "Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120".
  assert.equal(brandHeader(chromeBrands('120.0.6099.109')), '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"');
  for (const v of ['120.0.1.2', '152.0.7977.130', '160.0.0.0']) assert.ok(!JSON.stringify(chromeBrands(v)).includes('Electron'));
});

test('client hint headers: defaults always, high-entropy ones only when asked for', () => {
  const h = clientHintHeaders('152.0.7977.130');
  assert.deepEqual(Object.keys(h).sort(), ['sec-ch-ua', 'sec-ch-ua-mobile', 'sec-ch-ua-platform']);
  assert.equal(h['sec-ch-ua-platform'], '"Linux"');
  const full = clientHintHeaders('152.0.7977.130', new Set(parseAcceptCH('Sec-CH-UA-Full-Version-List, Sec-CH-UA-Arch, Viewport-Width')));
  assert.match(full['sec-ch-ua-full-version-list'], /"Google Chrome";v="152.0.7977.130"/);
  assert.equal(full['sec-ch-ua-arch'], '"x86"');
  assert.equal(full['viewport-width'], undefined);
});

test('accept languages like Chrome, without junk locales', () => {
  const { acceptLanguages } = require('../../src/main/identity');
  assert.deepEqual(acceptLanguages(['en-US', 'c']), ['en-US', 'en']);
  assert.deepEqual(acceptLanguages(['C', 'POSIX']), ['en-US', 'en']);
  assert.deepEqual(acceptLanguages(['de_DE.UTF-8', 'en-GB']), ['de-DE', 'de', 'en-GB', 'en']);
});
