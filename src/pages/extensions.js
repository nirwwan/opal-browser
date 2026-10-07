'use strict';
const listEl = document.getElementById('list');
const errEl = document.getElementById('err');

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function render(res) {
  errEl.hidden = !res.error;
  errEl.textContent = res.error || '';
  if (res.incognito) {
    listEl.innerHTML = '<div class="card empty" style="grid-column:1/-1">Extensions are turned off in incognito windows.</div>';
    document.querySelectorAll('.page-head .btn').forEach((b) => { b.disabled = true; });
    return;
  }
  if (!res.items.length) {
    listEl.innerHTML = '<div class="card empty" style="grid-column:1/-1">No extensions yet. Add some from the Chrome Web Store, or load an unpacked folder.</div>';
    return;
  }
  listEl.innerHTML = res.items.map((x) => `<div class="ext-card ${x.enabled ? '' : 'off'}" data-id="${esc(x.id)}">
    <div class="ext-top">
      <div class="ext-ic ${x.icon ? 'has-img' : ''}">${x.icon ? `<img src="${esc(x.icon)}" alt="">` : esc(x.name.charAt(0).toUpperCase())}</div>
      <div style="min-width:0">
        <div class="name">${esc(x.name)}${x.unpacked ? '<span class="tag">Unpacked</span>' : ''}</div>
        <div class="desc">${esc(x.description)}</div>
        <div class="meta">Version ${esc(x.version)} · ID ${esc(x.id)}</div>
      </div>
    </div>
    <div class="ext-acts">
      ${x.optionsUrl && x.enabled ? '<button class="btn" data-act="options">Options</button>' : ''}
      ${x.unpacked && x.enabled ? '<button class="btn" data-act="reload">Reload</button>' : ''}
      <button class="btn danger" data-act="remove">Remove</button>
      <span class="grow"></span>
      <label class="switch" title="${x.enabled ? 'Turn off' : 'Turn on'}"><input type="checkbox" ${x.enabled ? 'checked' : ''} aria-label="On"><span></span></label>
    </div>
  </div>`).join('');
}

async function load() { render(await window.opal.call('extensions.list')); }

listEl.addEventListener('click', async (e) => {
  const card = e.target.closest('.ext-card');
  if (!card) return;
  const id = card.dataset.id;
  const b = e.target.closest('[data-act]');
  if (!b) return;
  if (b.dataset.act === 'remove') {
    const name = card.querySelector('.name').firstChild.textContent;
    if (!window.confirm(`Remove "${name}" from Opal?`)) return;
    render(await window.opal.call('extensions.remove', { id }));
  } else if (b.dataset.act === 'reload') {
    render(await window.opal.call('extensions.reload', { id }));
  } else if (b.dataset.act === 'options') {
    window.opal.call('extensions.options', { id });
  }
});

listEl.addEventListener('change', async (e) => {
  const card = e.target.closest('.ext-card');
  if (!card || !e.target.matches('.switch input')) return;
  render(await window.opal.call('extensions.setEnabled', { id: card.dataset.id, enabled: e.target.checked }));
});

document.getElementById('load').addEventListener('click', async () => render(await window.opal.call('extensions.load')));
document.getElementById('store').addEventListener('click', () => window.opal.call('extensions.webStore'));
document.getElementById('update').addEventListener('click', async (e) => {
  e.target.disabled = true;
  e.target.textContent = 'Checking…';
  render(await window.opal.call('extensions.update'));
  e.target.disabled = false;
  e.target.textContent = 'Update';
});

window.opal.on('extensions', load);
load();
