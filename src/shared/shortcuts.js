'use strict';
// Keyboard shortcuts, matched from Electron "before-input-event" input objects
// so they work while a web page has focus. Pure module, unit tested.

// [modifiers, key, command]. Modifiers: c = Ctrl, s = Shift, a = Alt.
const TABLE = [
  ['c', 't', 'new-tab'],
  ['c', 'w', 'close-tab'],
  ['c', 'F4', 'close-tab'],
  ['cs', 't', 'reopen-closed-tab'],
  ['c', 'l', 'focus-address'],
  ['a', 'd', 'focus-address'],
  ['', 'F6', 'focus-address'],
  ['c', 'r', 'reload'],
  ['', 'F5', 'reload'],
  ['cs', 'r', 'hard-reload'],
  ['c', 'F5', 'hard-reload'],
  ['c', 'n', 'new-window'],
  ['cs', 'n', 'new-incognito-window'],
  ['c', 'f', 'find'],
  ['', 'F3', 'find-next'],
  ['c', 'g', 'find-next'],
  ['s', 'F3', 'find-previous'],
  ['cs', 'g', 'find-previous'],
  ['c', 'h', 'history'],
  ['c', 'j', 'downloads'],
  ['c', 'p', 'print'],
  ['c', 's', 'save-page'],
  ['c', 'u', 'view-source'],
  ['c', 'd', 'bookmark-page'],
  ['cs', 'b', 'toggle-bookmarks-bar'],
  ['cs', 'o', 'bookmarks'],
  ['c', 'Tab', 'next-tab'],
  ['c', 'PageDown', 'next-tab'],
  ['cs', 'Tab', 'previous-tab'],
  ['c', 'PageUp', 'previous-tab'],
  ['a', 'ArrowLeft', 'back'],
  ['a', 'ArrowRight', 'forward'],
  ['', 'BrowserBack', 'back'],
  ['', 'BrowserForward', 'forward'],
  ['a', 'Home', 'home'],
  ['c', 'k', 'command-bar'],
  ['cs', 'a', 'toggle-ai'],
  ['cs', 'Delete', 'clear-data'],
  ['c', '=', 'zoom-in'],
  ['c', '+', 'zoom-in'],
  ['cs', '+', 'zoom-in'],
  ['cs', '=', 'zoom-in'],
  ['c', '-', 'zoom-out'],
  ['cs', '_', 'zoom-out'],
  ['c', '0', 'zoom-reset'],
  ['', 'F11', 'fullscreen'],
  ['', 'F12', 'devtools'],
  ['cs', 'i', 'devtools'],
  ['ca', 'r', 'reader-mode'],
  ['cs', 's', 'split-view'],
  ['', 'Escape', 'escape'],
];

for (let i = 1; i <= 8; i++) TABLE.push(['c', String(i), 'select-tab-' + i]);
TABLE.push(['c', '9', 'select-last-tab']);

function modsOf(input) {
  return (input.control ? 'c' : '') + (input.shift ? 's' : '') + (input.alt ? 'a' : '');
}

function normKey(key) {
  if (!key) return '';
  return key.length === 1 ? key.toLowerCase() : key;
}

// Returns the command name for a keyDown input, or null.
function matchShortcut(input) {
  if (!input || input.type !== 'keyDown' || input.meta) return null;
  const mods = modsOf(input);
  const key = normKey(input.key);
  for (const [m, k, cmd] of TABLE) {
    if (m === mods && normKey(k) === key) return cmd;
  }
  return null;
}

// Human-readable hints used in menus and tooltips.
const HINTS = {
  'new-tab': 'Ctrl+T',
  'new-window': 'Ctrl+N',
  'new-incognito-window': 'Ctrl+Shift+N',
  history: 'Ctrl+H',
  downloads: 'Ctrl+J',
  'clear-data': 'Ctrl+Shift+Del',
  print: 'Ctrl+P',
  find: 'Ctrl+F',
  'command-bar': 'Ctrl+K',
  'toggle-ai': 'Ctrl+Shift+A',
  'bookmark-page': 'Ctrl+D',
  'bookmarks': 'Ctrl+Shift+O',
  'save-page': 'Ctrl+S',
  'reader-mode': 'Ctrl+Alt+R',
  'split-view': 'Ctrl+Shift+S',
  fullscreen: 'F11',
  devtools: 'Ctrl+Shift+I',
  'focus-address': 'Ctrl+L',
  reload: 'Ctrl+R',
  'close-tab': 'Ctrl+W',
  back: 'Alt+Left',
  forward: 'Alt+Right',
};

module.exports = { matchShortcut, HINTS, TABLE };
