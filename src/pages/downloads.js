'use strict';
/* global icon */
const listEl = document.getElementById('list');

function size(n) {
  if (!n) return '0 B';
  const u = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
  return `${n.toFixed(i && n < 10 ? 1 : 0)} ${u[i]}`;
}

function button(label, action, id) {
  const b = document.createElement('button');
  b.className = 'btn';
  b.textContent = label;
  b.addEventListener('click', () => window.opal.call('downloads.action', { id, action }));
  return b;
}

async function load() {
  const items = await window.opal.call('downloads.list');
  listEl.replaceChildren();
  if (!items.length) {
    const e = document.createElement('div');
    e.className = 'empty';
    e.textContent = 'Files you download appear here.';
    listEl.append(e);
    return;
  }
  for (const d of items) {
    const row = document.createElement('div');
    row.className = 'd-row';
    row.dataset.state = d.state;
    row.insertAdjacentHTML('afterbegin', icon(d.state === 'completed' ? 'file-down' : d.state === 'progressing' ? 'download' : 'triangle-alert', 20));
    const info = document.createElement('div');
    info.className = 'grow';
    const name = document.createElement('div');
    name.className = 'name ellipsis' + (d.exists === false ? ' gone' : '');
    name.textContent = d.filename;
    const meta = document.createElement('div');
    meta.className = 'meta';
    const when = new Date(d.startedAt).toLocaleString();
    meta.textContent = d.state === 'progressing' ? `${size(d.received)} of ${d.total ? size(d.total) : '?'}${d.paused ? ' — paused' : ''}`
      : d.state === 'completed' ? `${size(d.total)} — ${when}${d.exists === false ? ' — deleted' : ''}`
      : `${d.state === 'cancelled' ? 'Cancelled' : 'Failed'} — ${when}`;
    const url = document.createElement('div');
    url.className = 'url ellipsis';
    url.textContent = d.url;
    info.append(name, meta, url);
    if (d.state === 'progressing') {
      const bar = document.createElement('div');
      bar.className = 'bar';
      bar.innerHTML = `<span style="width:${d.total ? Math.round((d.received / d.total) * 100) : 5}%"></span>`;
      info.append(bar);
    }
    const acts = document.createElement('div');
    acts.className = 'acts';
    if (d.state === 'progressing') acts.append(button(d.paused ? 'Resume' : 'Pause', d.paused ? 'resume' : 'pause', d.id), button('Cancel', 'cancel', d.id));
    else if (d.state === 'completed' && d.exists !== false) acts.append(button('Open', 'open', d.id), button('Show in folder', 'show', d.id));
    else acts.append(button('Retry', 'retry', d.id));
    const rm = document.createElement('button');
    rm.className = 'icon-btn';
    rm.title = 'Remove from list';
    rm.innerHTML = icon('x', 14);
    rm.addEventListener('click', () => window.opal.call('downloads.action', { id: d.id, action: 'remove' }));
    acts.append(rm);
    row.append(info, acts);
    listEl.append(row);
  }
}

document.getElementById('clear').addEventListener('click', () => window.opal.call('downloads.clear'));
window.opal.on('downloads', load);
load();
