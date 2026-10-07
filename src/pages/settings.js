'use strict';
const $ = (s) => document.querySelector(s);
let S = null;

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

let savedTimer = null;
function saved(text = 'Saved') {
  const el = $('#saved');
  el.textContent = text;
  el.classList.add('show');
  clearTimeout(savedTimer);
  savedTimer = setTimeout(() => el.classList.remove('show'), 1400);
}

async function set(key, value) {
  try {
    S = await window.opal.call('settings.set', { key, value });
    render();
    if (/^(aiBackend|ollama|anthropic|openai)/.test(key)) loadAI();
    saved();
  } catch (err) {
    saved(String(err.message || err).replace(/^.*Error: /, ''));
    render();
  }
}

function ago(t) {
  if (!t) return 'not yet';
  const s = Math.round((Date.now() - t) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  return new Date(t).toLocaleString();
}

function render() {
  if (!S) return;
  $('#searchEngine').innerHTML = S.engines.map((e) => `<option value="${e.id}" ${e.id === S.searchEngine ? 'selected' : ''}>${esc(e.name)}</option>`).join('');
  $('#translateTarget').innerHTML = S.langs.map((l) => `<option ${l === S.translateTarget ? 'selected' : ''}>${esc(l)}</option>`).join('');
  $('#restoreOnStartup').checked = S.restoreOnStartup;
  if (document.activeElement !== $('#homePage')) $('#homePage').value = S.homePage || '';
  $('#showBookmarksBar').checked = S.showBookmarksBar;
  $('#showBookmarksBar').disabled = S.incognito;
  $('#oneColorDots').checked = S.ai.oneColorDots;
  $('#downloadDir').textContent = S.downloadDir;
  $('#askWhereToSave').checked = S.askWhereToSave;
  document.querySelectorAll('#provider button').forEach((b) => b.classList.toggle('on', b.dataset.v === S.ai.provider));
  const size = S.ai.width <= 340 ? 'S' : S.ai.width >= 500 ? 'L' : S.ai.width >= 390 && S.ai.width <= 410 ? 'M' : '';
  document.querySelectorAll('#size button').forEach((b) => b.classList.toggle('on', b.dataset.v === size));
  if (document.activeElement !== $('#onyxUrl')) $('#onyxUrl').value = S.onyxUrl;
  if (document.activeElement !== $('#onyxTokenFile')) $('#onyxTokenFile').value = S.onyxTokenFile;
  $('#syncWithOnyx').checked = S.syncWithOnyx;
  const on = S.onyx.connected;
  $('#onyxDot').className = 'dot ' + (on ? 'ok' : S.onyx.checked ? 'bad' : '');
  $('#onyxState').textContent = on ? `Connected to Onyx${S.onyx.version ? ' ' + S.onyx.version : ''}` : S.onyx.checked ? (S.onyx.error || "Onyx isn't running") : 'Checking…';
  $('#syncState').textContent = S.syncWithOnyx
    ? (S.sync?.error ? `Last sync failed: ${S.sync.error}` : `Bookmarks, history, Opal AI chats and settings. Last synced ${ago(S.sync?.lastSyncAt)}.`)
    : 'Off. Nothing is sent to Onyx storage.';
  $('#syncNow').disabled = !S.syncWithOnyx || !on;
  $('#version').textContent = S.version;
  $('#autoUpdate').checked = S.autoUpdate;
}

async function loadProfiles() {
  const list = await window.opal.call('profiles.list');
  $('#profileList').innerHTML = list.map((p) => `<div class="set" data-id="${esc(p.id)}">
    <span class="p-dot" style="background:${esc(p.color)}">${esc(p.name.charAt(0).toUpperCase())}</span>
    <div class="lbl"><b>${esc(p.name)}</b><span>${p.name === S.profileName ? 'This window' : p.open ? 'Open' : ''}</span></div>
    <div class="row-acts">${p.name === S.profileName ? '' : '<button class="btn" data-p="open">Open</button>'}
    <button class="btn" data-p="rename">Rename</button>${list.length > 1 && !p.open ? '<button class="btn danger" data-p="remove">Remove</button>' : ''}</div>
  </div>`).join('');
}

async function loadSites() {
  const sites = await window.opal.call('sites.list');
  $('#sites').innerHTML = sites.length
    ? sites.map((s) => `<div class="set" data-origin="${esc(s.origin)}"><div class="lbl"><b>${esc(s.origin)}</b><span class="perm">${s.perms.map((p) => `${esc(p.label)}: ${p.value === 'allow' ? 'Allowed' : 'Blocked'}`).join(' · ')}</span></div><button class="btn" data-reset>Reset</button></div>`).join('')
    : '<div class="empty" style="padding:20px">Sites you allow or block (camera, microphone, location, notifications) appear here.</div>';
}

// ---------- events ----------
document.addEventListener('change', (e) => {
  const key = e.target.dataset.key;
  if (!key) return;
  set(key, e.target.type === 'checkbox' ? e.target.checked : e.target.value);
});

for (const id of ['homePage', 'onyxUrl', 'onyxTokenFile', 'ollamaUrl']) {
  const el = $('#' + id);
  const current = () => (id === 'ollamaUrl' ? (aiInfo && aiInfo.ollama.url) : S && S[id]) || '';
  const commit = () => { if (S && el.value.trim() !== current()) set(id, el.value.trim()); };
  el.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); el.blur(); } });
  el.addEventListener('blur', commit);
}

document.querySelectorAll('#provider button').forEach((b) => b.addEventListener('click', () => set('ai.provider', b.dataset.v)));
document.querySelectorAll('#size button').forEach((b) => b.addEventListener('click', () => set('ai.size', b.dataset.v)));
$('#pickDir').addEventListener('click', async () => { S = await window.opal.call('settings.pickDownloadDir'); render(); });
$('#resetDir').addEventListener('click', async () => { S = await window.opal.call('settings.resetDownloadDir'); render(); saved(); });
$('#onyxTest').addEventListener('click', async () => {
  $('#onyxTest').textContent = 'Testing…';
  await window.opal.call('onyx.test');
  S = await window.opal.call('settings.get');
  render();
  $('#onyxTest').textContent = 'Test connection';
  saved(S.onyx.connected ? 'Connected' : "Onyx isn't running");
});
$('#syncNow').addEventListener('click', async () => {
  $('#syncNow').textContent = 'Syncing…';
  await window.opal.call('sync.now');
  S = await window.opal.call('settings.get');
  render();
  $('#syncNow').textContent = 'Sync now';
  saved(S.sync?.error ? 'Sync failed' : 'Synced');
});
$('#clearData').addEventListener('click', () => window.opal.call('data.clearDialog'));

$('#profileList').addEventListener('click', async (e) => {
  const b = e.target.closest('[data-p]');
  if (!b) return;
  const id = b.closest('[data-id]').dataset.id;
  try {
    if (b.dataset.p === 'open') await window.opal.call('profiles.open', { id });
    if (b.dataset.p === 'rename') {
      const name = window.prompt('Profile name');
      if (name && name.trim()) await window.opal.call('profiles.update', { id, name: name.trim().slice(0, 40) });
    }
    if (b.dataset.p === 'remove' && window.confirm('Remove this profile and everything saved in it?')) await window.opal.call('profiles.remove', { id });
  } catch (err) { saved(String(err.message || err).replace(/^.*Error: /, '')); }
  loadProfiles();
});
$('#addProfile').addEventListener('click', async () => {
  const name = $('#newProfile').value.trim();
  if (!name) return;
  const colors = ['#2a4bc7', '#b44f0c', '#0f6b5c', '#6d3fb0', '#a8324a'];
  await window.opal.call('profiles.create', { name: name.slice(0, 40), color: colors[Math.floor(Math.random() * colors.length)] });
  $('#newProfile').value = '';
  loadProfiles();
  saved('Profile added');
});
$('#sites').addEventListener('click', async (e) => {
  const b = e.target.closest('[data-reset]');
  if (!b) return;
  await window.opal.call('sites.reset', { origin: b.closest('[data-origin]').dataset.origin });
  loadSites();
});

// Highlight the section in view.
const links = [...document.querySelectorAll('nav a')];
const spy = new IntersectionObserver((entries) => {
  for (const en of entries) if (en.isIntersecting) links.forEach((a) => a.classList.toggle('on', a.getAttribute('href') === '#' + en.target.id));
}, { rootMargin: '-20% 0px -70% 0px' });
document.querySelectorAll('section').forEach((s) => spy.observe(s));

// ---------- Opal AI backends ----------
let aiInfo = null;
const modelCache = {};
function fillSelect(sel, models, current, emptyLabel) {
  const list = models.slice();
  if (current && !list.includes(current)) list.unshift(current);
  sel.innerHTML = list.length ? list.map((m) => `<option ${m === current ? 'selected' : ''}>${esc(m)}</option>`).join('') : `<option value="">${esc(emptyLabel)}</option>`;
}
async function models(provider) {
  if (!modelCache[provider]) {
    const r = await window.opal.call('ai.listModels', { provider });
    modelCache[provider] = r.models || [];
  }
  return modelCache[provider];
}
async function loadAI(fresh) {
  aiInfo = await window.opal.call(fresh ? 'ai.refresh' : 'ai.info');
  const st = aiInfo.status;
  $('#aiBackend').value = st.setting;
  const using = st.backend === 'keys' ? 'your API key' : st.backend ? st.backend[0].toUpperCase() + st.backend.slice(1) : '';
  $('#aiStatus').textContent = st.setting === 'off' ? 'Off. Opal works fully without aiInfo.'
    : st.ready ? `Ready: using ${using}${st.model ? ` (${st.model})` : ''}.`
      : st.setupNeeded ? 'Not set up yet. Start Ollama or save an API key below.' : (st.error || 'Not ready');
  document.querySelectorAll('[data-for]').forEach((row) => { row.hidden = !row.dataset.for.split(' ').includes(st.setting); });
  if (document.activeElement !== $('#ollamaUrl')) $('#ollamaUrl').value = aiInfo.ollama.url;
  $('#ollamaState').textContent = aiInfo.ollama.reachable ? (aiInfo.ollama.models.length ? `${aiInfo.ollama.models.length} model(s) installed` : 'Running, but no models yet: ollama pull llama3.2') : "Ollama isn't running";
  fillSelect($('#ollamaModel'), aiInfo.ollama.models, aiInfo.ollama.model || aiInfo.ollama.models[0] || '', 'No models');
  for (const p of ['anthropic', 'openai']) {
    const k = aiInfo[p];
    $(`#${p}Remove`).hidden = !k.saved;
    $(`#${p}Key`).placeholder = k.saved ? 'Saved (hidden)' : (p === 'anthropic' ? 'sk-ant-…' : 'sk-…');
    $(`#${p}ModelRow`).hidden = $(`#${p}ModelRow`).hidden || !k.saved;
    if (k.saved) fillSelect($(`#${p}Model`), await models(p), k.model, 'Choose a model');
  }
  $('#weakRow').hidden = !aiInfo.storageWeak;
}
for (const p of ['anthropic', 'openai']) {
  $(`#${p}Save`).addEventListener('click', async () => {
    const key = $(`#${p}Key`).value.trim();
    if (!key) return;
    $(`#${p}Save`).textContent = 'Checking…';
    try {
      const r = await window.opal.call('ai.setKey', { provider: p, key });
      $(`#${p}Key`).value = '';
      delete modelCache[p];
      saved(r.check && !r.check.ok ? `Saved, but the check failed: ${r.check.error}` : 'Key saved');
    } catch (err) { saved(String(err.message || err).replace(/^.*Error: /, '')); }
    $(`#${p}Save`).textContent = 'Save';
    loadAI();
  });
  $(`#${p}Remove`).addEventListener('click', async () => {
    await window.opal.call('ai.setKey', { provider: p, key: '' });
    delete modelCache[p];
    saved('Key removed');
    loadAI();
  });
}

// ---------- default browser ----------
async function loadDefault() {
  const r = await window.opal.call('browser.defaultStatus');
  $('#defaultState').textContent = r.isDefault ? 'Opal is your default browser.' : r.supported ? 'Links from other apps open in your current default browser.' : (r.reason || "Can't change the default browser here.");
  $('#makeDefault').hidden = !!r.isDefault || !r.supported;
}
$('#makeDefault').addEventListener('click', async () => {
  const r = await window.opal.call('browser.makeDefault');
  saved(r.ok ? 'Opal is now your default browser' : (r.error || "Couldn't change the default browser"));
  loadDefault();
});

window.opal.on('settings', async () => { S = await window.opal.call('settings.get'); render(); });
window.opal.on('onyx', async () => { S = await window.opal.call('settings.get'); render(); });

(async () => {
  S = await window.opal.call('settings.get');
  render();
  loadProfiles();
  loadSites();
  loadAI();
  loadDefault();
  window.opal.call('update.status').then((u) => {
    $('#updateRow').hidden = !u.supported;
    if (u.supported) $('#updateState').textContent = u.status === 'ready' ? `Opal ${u.version} installs when you quit.` : u.status === 'downloading' ? `Downloading Opal ${u.version}…` : u.status === 'error' ? `Last check failed: ${u.error}` : 'Checks GitHub Releases every few hours.';
  });
  if (location.hash) document.querySelector(location.hash)?.scrollIntoView();
})();
