'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseInput, displayUrl, securityState, searchQueryOf } = require('../../src/shared/omnibox');

const g = (q) => 'https://www.google.com/search?q=' + encodeURIComponent(q);
const ddg = (q) => 'https://duckduckgo.com/?q=' + encodeURIComponent(q);

test('empty input gives null', () => {
  assert.equal(parseInput(''), null);
  assert.equal(parseInput('   '), null);
});

test('URLs with a scheme load as typed', () => {
  assert.equal(parseInput('https://example.com/a?b=1'), 'https://example.com/a?b=1');
  assert.equal(parseInput('http://example.com'), 'http://example.com');
  assert.equal(parseInput('file:///home/me/x.html'), 'file:///home/me/x.html');
  assert.equal(parseInput('opal://history'), 'opal://history');
});

test('bare hosts get https, local hosts get http', () => {
  assert.equal(parseInput('example.com'), 'https://example.com');
  assert.equal(parseInput('news.ycombinator.com/item?id=1'), 'https://news.ycombinator.com/item?id=1');
  assert.equal(parseInput('localhost:3000'), 'http://localhost:3000');
  assert.equal(parseInput('localhost'), 'http://localhost');
  assert.equal(parseInput('192.168.1.10:8080/x'), 'http://192.168.1.10:8080/x');
  assert.equal(parseInput('example.co.uk#top'), 'https://example.co.uk#top');
});

test('everything else is a search with the selected engine (Google by default)', () => {
  assert.equal(parseInput('how to bake bread'), g('how to bake bread'));
  assert.equal(parseInput('electron'), g('electron'));
  assert.equal(parseInput('foo.bar1'), g('foo.bar1'));
  assert.equal(parseInput('what is 1.5'), g('what is 1.5'));
  assert.equal(parseInput('c++'), g('c++'));
  assert.equal(parseInput('cats', 'duckduckgo'), ddg('cats'));
  assert.equal(parseInput('cats', 'bing'), 'https://www.bing.com/search?q=cats');
  assert.equal(parseInput('cats', 'brave'), 'https://search.brave.com/search?q=cats');
  assert.equal(parseInput('cats', 'nonsense'), g('cats'));
});

test('DuckDuckGo bangs only work when DuckDuckGo is selected', () => {
  assert.equal(parseInput('!w Linux', 'duckduckgo'), ddg('!w Linux'));
  assert.equal(parseInput('!yt lofi', 'duckduckgo'), ddg('!yt lofi'));
  assert.equal(parseInput('!gh', 'duckduckgo'), ddg('!gh'));
  assert.equal(parseInput('!w Linux'), g('w Linux'));
  assert.equal(parseInput('!w Linux', 'bing'), 'https://www.bing.com/search?q=w%20Linux');
});

test('chrome:// and about: map to opal://', () => {
  assert.equal(parseInput('chrome://settings'), 'opal://settings');
  assert.equal(parseInput('about:history'), 'opal://history');
  assert.equal(parseInput('about:blank'), 'about:blank');
});

test('display and security helpers', () => {
  assert.equal(displayUrl('opal://newtab'), '');
  assert.equal(displayUrl('https://a.com/'), 'https://a.com/');
  assert.equal(securityState('https://a.com'), 'secure');
  assert.equal(securityState('http://a.com'), 'insecure');
  assert.equal(securityState('http://localhost:3000'), 'local');
  assert.equal(securityState('opal://history'), 'internal');
  assert.equal(searchQueryOf(ddg('cats & dogs')), 'cats & dogs');
  assert.equal(searchQueryOf(g('opal')), 'opal');
  assert.equal(searchQueryOf('https://example.com/?q=1'), null);
});
