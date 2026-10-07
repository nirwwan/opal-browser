'use strict';
// New tab page: search goes through the address-bar parser (so URLs work too);
// without the bridge it falls back to a plain form submit to the selected engine.
const form = document.getElementById('search');
const q = document.getElementById('q');

form.addEventListener('submit', (e) => {
  if (!window.opal) return;
  e.preventDefault();
  const text = q.value.trim();
  if (text) window.opal.call('page.navigate', { input: text });
});

function tile(site) {
  const a = document.createElement('a');
  a.className = 'pin';
  a.href = site.url;
  const t = document.createElement('span');
  t.className = 'tile';
  let host = '';
  try { host = new URL(site.url).hostname.replace(/^www\./, ''); } catch { /* ignore */ }
  t.textContent = (site.title || host || '?').charAt(0).toUpperCase();
  const n = document.createElement('span');
  n.className = 'name';
  n.textContent = site.title || host;
  a.append(t, n);
  return a;
}

async function loadEngine() {
  if (!window.opal) return;
  const e = await window.opal.call('search.info');
  form.action = e.action;
  q.setAttribute('aria-label', `Search the web with ${e.name}`);
}
loadEngine();

async function loadPinned() {
  if (!window.opal) return;
  const sites = await window.opal.call('pinned.list');
  const nav = document.getElementById('pinned');
  nav.replaceChildren(...sites.slice(0, 8).map(tile));
}
loadPinned();
q.focus();
