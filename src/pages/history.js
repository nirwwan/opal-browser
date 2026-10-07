'use strict';
/* global icon */
const list = document.getElementById('list');
const q = document.getElementById('q');
const del = document.getElementById('del');
const selected = new Set();
let entries = [];

function host(u) { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } }
function dayLabel(ts) {
  const d = new Date(ts);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const diff = Math.round((today - new Date(d.getFullYear(), d.getMonth(), d.getDate())) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  return d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

function render() {
  list.replaceChildren();
  if (!entries.length) {
    const e = document.createElement('div');
    e.className = 'empty';
    e.textContent = q.value ? 'No history matches your search.' : 'Pages you visit appear here.';
    list.append(e);
  }
  let lastDay = '';
  for (const h of entries) {
    const day = dayLabel(h.visitedAt);
    if (day !== lastDay) {
      const d = document.createElement('div');
      d.className = 'day';
      d.textContent = day;
      list.append(d);
      lastDay = day;
    }
    const row = document.createElement('div');
    row.className = 'h-row';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = selected.has(h.id);
    cb.addEventListener('change', () => { cb.checked ? selected.add(h.id) : selected.delete(h.id); del.hidden = !selected.size; });
    const time = document.createElement('span');
    time.className = 'time';
    time.textContent = new Date(h.visitedAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    const fav = document.createElement('span');
    fav.className = 'fav';
    fav.textContent = (h.title || host(h.url) || '?').charAt(0).toUpperCase();
    const a = document.createElement('a');
    a.className = 'ellipsis';
    a.href = h.url;
    a.textContent = h.title || h.url;
    a.title = h.url;
    const hs = document.createElement('span');
    hs.className = 'host ellipsis';
    hs.textContent = host(h.url);
    const rm = document.createElement('button');
    rm.className = 'icon-btn';
    rm.title = 'Remove from history';
    rm.innerHTML = icon('x', 14);
    rm.addEventListener('click', async () => { await window.opal.call('history.remove', { ids: [h.id] }); load(); });
    row.append(cb, time, fav, a, hs, rm);
    list.append(row);
  }
  document.getElementById('more-wrap').hidden = entries.length < limit;
}

let limit = 300;
async function load() {
  entries = await window.opal.call('history.list', { query: q.value || undefined, limit });
  render();
}
let t = null;
q.addEventListener('input', () => { clearTimeout(t); t = setTimeout(load, 120); });
del.addEventListener('click', async () => {
  await window.opal.call('history.remove', { ids: [...selected] });
  selected.clear();
  del.hidden = true;
  load();
});
document.getElementById('more').addEventListener('click', () => { limit += 300; load(); });
document.getElementById('clear').addEventListener('click', () => window.opal.call('data.clearDialog'));
load();
