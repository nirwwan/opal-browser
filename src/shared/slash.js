'use strict';
// Opal AI slash commands. Loaded by the panel page (as a script) and by tests (require).
(function (root) {
  const COMMANDS = {
    '/hide': { patch: { open: false }, label: 'Hide the panel' },
    '/collapse': { patch: { collapsed: true }, label: 'Collapse to a strip' },
    '/small': { patch: { size: 'S' }, label: 'Small (320px)' },
    '/narrow': { patch: { size: 'S' }, label: 'Small (320px)' },
    '/medium': { patch: { size: 'M' }, label: 'Medium (400px)' },
    '/large': { patch: { size: 'L' }, label: 'Large (520px)' },
    '/wide': { patch: { size: 'L' }, label: 'Large (520px)' },
  };

  // Returns { patch } for a known command, { unknown: true } for another
  // "/word", or null when the text is a normal message.
  function parseSlash(text) {
    const t = String(text || '').trim().toLowerCase();
    if (!/^\/[a-z]+$/.test(t)) return null;
    const c = COMMANDS[t];
    return c ? { command: t, patch: { ...c.patch } } : { command: t, unknown: true };
  }

  // Commands that start with what's typed (for the hint list).
  function suggestSlash(text) {
    const t = String(text || '').trim().toLowerCase();
    if (!t.startsWith('/')) return [];
    return Object.entries(COMMANDS).filter(([k]) => k.startsWith(t)).map(([k, v]) => ({ command: k, label: v.label }));
  }

  const api = { parseSlash, suggestSlash, COMMANDS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.OpalSlash = api;
})(typeof window !== 'undefined' ? window : globalThis);
