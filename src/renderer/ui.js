'use strict';
/* global icon, OpalThinking */
// Opal browser UI (rail, tabs column, toolbar, bookmarks bar).
// All state comes from the main process; this file only renders and sends commands.

const $ = (sel) => document.querySelector(sel);
const api = window.opal;
let S = null; // latest state snapshot from main
let addressDirty = false;

const SPACE_COLORS = ['#2a4bc7', '#b44f0c', '#0f6b5c', '#6d3fb0', '#a8324a', '#7a6a12', '#2f6f9a', '#3d4452'];

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function hostOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; }
}

function favHtml(url, favicon, title) {
  if (url && url.startsWith('opal:')) {
    const name = url.startsWith('opal://history') ? 'history' : url.startsWith('opal://downloads') ? 'download'
      : url.startsWith('opal://settings') ? 'settings' : url.startsWith('opal://bookmarks') ? 'bookmark'
      : url.startsWith('opal://extensions') ? 'puzzle' : url.startsWith('opal://reader') ? 'book-open' : 'globe';
    return `<span class="fav internal">${icon(name, 14)}</span>`;
  }
  const letter = (title || hostOf(url) || '?').trim().charAt(0).toUpperCase() || '?';
  const img = favicon && /^(https?|data):/.test(favicon) ? `<img src="${esc(favicon)}" alt="">` : '';
  return `<span class="fav" data-letter="${esc(letter)}" style="background:${img ? 'none' : letterColor(letter)}">${img || esc(letter)}</span>`;
}

function letterColor(ch) {
  const palette = ['#5a6170', '#2a4bc7', '#0f6b5c', '#b44f0c', '#6d3fb0', '#2f6f9a', '#7a6a12', '#a8324a'];
  return palette[(ch.charCodeAt(0) || 0) % palette.length];
}

// ---------- static icons ----------
function paintIcons() {
  $('[data-wc=close]').innerHTML = icon('x', 9);
  $('[data-wc=minimize]').innerHTML = icon('minus', 9);
  $('[data-wc=maximize]').innerHTML = icon('plus', 9);
  $('#add-space').innerHTML = icon('plus', 18);
  $('#incognito-btn').innerHTML = icon('venetian-mask', 18);
  $('#settings-btn').innerHTML = icon('settings', 18);
  $('.nt-icon').innerHTML = icon('plus', 16);
  $('#back').innerHTML = icon('arrow-left', 17);
  $('#forward').innerHTML = icon('arrow-right', 17);
  $('#reload').innerHTML = icon('rotate-cw', 16);
  $('#home').innerHTML = icon('house', 16);
  $('#translate-btn').innerHTML = icon('languages', 15);
  $('#passwords-btn').innerHTML = icon('key-round', 15);
  $('#star-btn').innerHTML = icon('star', 15);
  $('#extensions-btn').innerHTML = icon('puzzle', 16);
  $('#downloads-btn').insertAdjacentHTML('afterbegin', icon('download', 16));
  $('.ai-ic').innerHTML = icon('sparkles', 14);
  $('#menu-btn').innerHTML = icon('ellipsis-vertical', 17);
  $('.bm-ic').innerHTML = icon('folder', 14);
  $('#find-prev').innerHTML = icon('chevron-down', 15).replace('<svg', '<svg style="transform:rotate(180deg)"');
  $('#find-next').innerHTML = icon('chevron-down', 15);
  $('#find-close').innerHTML = icon('x', 15);
}

// ---------- render ----------
function render() {
  if (!S) return;
  const space = S.space;
  document.documentElement.style.setProperty('--accent', space.color);
  document.documentElement.style.setProperty('--accent-soft', hexA(space.color, 0.1));
  document.body.classList.toggle('html-fullscreen', !!S.htmlFullscreen);
  document.body.classList.toggle('no-bookmarks-bar', !S.showBookmarksBar);
  document.body.classList.toggle('incognito', !!S.incognito);
  document.title = S.active?.title ? `${S.active.title} - Opal` : 'Opal';
  renderRail();
  renderTabs();
  renderSaved();
  renderProfile();
  renderToolbar();
  renderBookmarksBar();
  renderInfobars();
  renderAi();
  renderContentMsg();
  renderSplit();
  sendLayout();
}

function hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

function renderRail() {
  $('[data-wc=maximize]').title = S.maximized ? 'Restore' : 'Maximise';
  $('#spaces').innerHTML = S.spaces.map((s) => `
    <button class="space-btn ${s.id === S.space.id ? 'current' : ''}" role="tab" aria-selected="${s.id === S.space.id}"
      data-space="${s.id}" title="${esc(s.name)}" style="background:${s.color};--space-color:${s.color}">
      ${esc(s.name.charAt(0).toUpperCase())}
      ${s.id !== S.space.id && s.tabCount ? `<span class="count">${s.tabCount}</span>` : ''}
    </button>`).join('');
  $('#add-space').hidden = !!S.incognito;
}

function renderTabs() {
  const space = S.space;
  $('#space-name').textContent = space.name;
  const n = space.tabs.length;
  $('#tab-count').textContent = `${n} ${n === 1 ? 'tab' : 'tabs'}`;
  $('#tab-list').innerHTML = space.tabs.map((t) => {
    const active = t.id === space.activeTabId;
    const panes = t.panes;
    const loading = panes.some((p) => p.loading);
    const audible = panes.some((p) => p.audible);
    const muted = panes.some((p) => p.muted);
    const title = panes.map((p) => p.title).join('  |  ');
    const progress = loading ? Math.min(...panes.filter((p) => p.loading).map((p) => p.progress || 0.1)) : 1;
    const favs = loading ? '<canvas class="tab-thinking" data-thinking="16" width="16" height="16" aria-hidden="true"></canvas>'
      : panes.length > 1 ? `<span class="favs">${panes.map((p) => favHtml(p.url, p.favicon, p.title)).join('')}</span>`
      : favHtml(panes[0].url, panes[0].favicon, panes[0].title);
    const audio = audible || muted
      ? `<span class="audio" data-mute="${t.id}" title="${muted ? 'Unmute' : 'Mute'}">${icon(muted ? 'volume-x' : 'volume-2', 13)}</span>` : '';
    return `<div class="tab ${active ? 'active' : ''}" role="tab" aria-selected="${active}" draggable="true" data-tab="${t.id}" title="${esc(title)}">
      ${favs}<span class="title">${esc(title)}</span>${audio}
      <button class="close" data-close="${t.id}" aria-label="Close tab" title="Close tab (Ctrl+W)">${icon('x', 13)}</button>
      ${loading ? `<span class="tab-progress" data-tab-progress="${t.id}"><span style="width:${Math.round(progress * 100)}%"></span></span>` : ''}
    </div>`;
  }).join('');
  const activeEl = $('.tab.active');
  if (activeEl) activeEl.scrollIntoView({ block: 'nearest' });
  OpalThinking.configure({ oneColor: !!S.ai?.oneColorDots, accent: space.color });
  if ($('#tab-list canvas[data-thinking]')) OpalThinking.kick();
}

function renderSaved() {
  const items = [];
  (function collect(nodes) {
    for (const n of nodes) { if (n.children) collect(n.children); else items.push(n); }
  })(S.space.bookmarks);
  $('#saved-list').innerHTML = items.length
    ? items.slice(0, 30).map((b) => `<button class="saved-item" data-bm="${b.id}" title="${esc(b.url)}">${favHtml(b.url, null, b.title)}<span class="title">${esc(b.title)}</span></button>`).join('')
    : '<div class="saved-empty muted">Star a page to save it here.</div>';
}

function renderProfile() {
  const p = S.profile;
  $('#profile-avatar').textContent = (p.name || 'P').charAt(0).toUpperCase();
  $('#profile-avatar').style.background = S.incognito ? '#3d4452' : p.color;
  $('#profile-name').textContent = S.incognito ? 'Incognito' : p.name;
  // Onyx is only mentioned when it is actually in use.
  const onyxUsed = S.onyx?.connected || S.llm?.backend === 'onyx';
  $('#profile-sub').textContent = profileLine(S);
  const dot = $('#profile-dot');
  dot.className = 'sync-dot ' + (S.onyx?.connected ? 'ok' : 'off');
  dot.hidden = !!S.incognito || !onyxUsed;
  dot.title = S.onyx?.connected ? 'Connected to Onyx' : 'Onyx is not running';
}

function renderToolbar() {
  const a = S.active || {};
  $('#back').disabled = !a.canGoBack;
  $('#forward').disabled = !a.canGoForward;
  $('#reload').innerHTML = icon(a.loading ? 'x' : 'rotate-cw', a.loading ? 17 : 16);
  $('#reload').title = a.loading ? 'Stop loading' : 'Reload (Ctrl+R)';
  const input = $('#address');
  if (S.search) input.placeholder = `Search ${S.search.name} or type a URL`;
  if (document.activeElement !== input || !addressDirty) {
    if (document.activeElement !== input) input.value = prettyUrl(a.display || '');
  }
  const info = $('#site-info');
  const sec = a.security;
  info.innerHTML = icon(sec === 'secure' ? 'lock' : sec === 'insecure' ? 'triangle-alert' : sec === 'internal' ? 'info' : 'search', 14);
  info.className = 'ob-icon' + (sec === 'insecure' ? ' insecure' : '');
  info.title = sec === 'secure' ? 'Connection is secure' : sec === 'insecure' ? 'Not secure' : sec === 'internal' ? 'Opal page' : '';
  $('#star-btn').classList.toggle('on', !!a.bookmarked);
  $('#star-btn').title = a.bookmarked ? 'Remove bookmark (Ctrl+D)' : 'Bookmark this page (Ctrl+D)';
  const zoom = Math.round((a.zoom || 1) * 100);
  $('#zoom-chip').hidden = zoom === 100;
  $('#zoom-chip').textContent = zoom + '%';
  const web = /^https?:/.test(a.url || '');
  $('#translate-btn').hidden = !web;
  $('#passwords-btn').hidden = !web;
  $('#star-btn').hidden = !a.display;
  // downloads ring
  const d = S.downloads || { active: 0, progress: 0, recent: false };
  const btn = $('#downloads-btn');
  btn.classList.toggle('active', d.active > 0);
  btn.querySelector('.ring-fg').style.strokeDashoffset = String(81.68 * (1 - Math.max(0.02, d.progress || 0)));
  let badge = btn.querySelector('.badge');
  if (d.recent && !d.active) { if (!badge) btn.insertAdjacentHTML('beforeend', '<span class="badge"></span>'); } else if (badge) badge.remove();
  btn.title = d.active ? `Downloading ${d.active} file${d.active > 1 ? 's' : ''}… ${Math.round((d.progress || 0) * 100)}%` : 'Downloads (Ctrl+J)';
  $('#extensions-btn').hidden = S.incognito;
  $('#ai-btn').classList.toggle('off', !(S.ai && S.ai.open && !S.ai.collapsed));
}

function prettyUrl(u) {
  if (!u) return '';
  return u.replace(/^https:\/\//, '').replace(/^([^/?#]+)\/$/, '$1');
}

function renderBookmarksBar() {
  const nodes = S.space.bookmarks;
  $('#bm-items').innerHTML = nodes.length ? nodes.map((n) => n.children
    ? `<button class="bm-item" data-folder="${n.id}" title="${esc(n.title)}"><span class="bm-ic">${icon('folder', 14)}</span><span class="t">${esc(n.title)}</span></button>`
    : `<button class="bm-item" data-bm="${n.id}" title="${esc(n.title)}\n${esc(n.url)}">${favHtml(n.url, null, n.title)}<span class="t">${esc(n.title)}</span></button>`).join('')
    : '<span class="bm-empty">Bookmarks in this space appear here. Press Ctrl+D to add one.</span>';
}

function renderInfobars() {
  const bars = S.infobars || [];
  $('#infobars').innerHTML = bars.map((b) => `
    <div class="infobar" data-infobar="${b.id}">
      ${icon(b.icon || 'shield', 16)}
      <div class="grow">${esc(b.text)}</div>
      ${(b.buttons || []).map((x) => `<button class="btn ${x.primary ? 'primary' : ''}" data-ib="${b.id}" data-ib-action="${x.action}">${esc(x.label)}</button>`).join('')}
    </div>`).join('');
}

function renderAi() {
  const ai = S.ai;
  const show = !!(ai && ai.open && !S.htmlFullscreen);
  $('#ai-slot').hidden = !show;
  // On narrow windows the panel shows as the collapsed strip so the page keeps room.
  const narrow = window.innerWidth < 1100;
  $('#ai-handle').hidden = !show || ai.collapsed || narrow;
  if (show) {
    $('#ai-slot').classList.toggle('collapsed', !!ai.collapsed || narrow);
    if (!resizing) document.documentElement.style.setProperty('--ai-w', ai.width + 'px');
  }
}

// Split view: a 2px accent marker above the focused pane.
function renderSplit() {
  const c = $('#content');
  let marker = $('#split-marker');
  const a = S.active;
  if (!a || !a.split || S.htmlFullscreen) { if (marker) marker.remove(); return; }
  if (!marker) {
    marker = document.createElement('div');
    marker.id = 'split-marker';
    c.appendChild(marker);
  }
  const W = c.getBoundingClientRect().width;
  const w1 = Math.floor((W - 8) * 0.5);
  marker.style.left = (a.focusedPane === 0 ? 0 : w1 + 8) + 'px';
  marker.style.width = (a.focusedPane === 0 ? w1 : W - w1 - 8) + 'px';
}

function renderContentMsg() {
  const msg = $('#content-msg');
  const panes = S.space.tabs.find((t) => t.id === S.space.activeTabId)?.panes || [];
  const crashed = panes.some((p) => p.crashed);
  const pip = panes.length === 1 && panes[0].pip;
  msg.hidden = !crashed && !pip;
  if (crashed) msg.innerHTML = '<div><h2>This page stopped working</h2><div>Reload to try again.</div><p><button class="btn primary" id="crash-reload">Reload</button></p></div>';
  else if (pip) msg.innerHTML = '<div><h2>Playing in picture in picture</h2><p><button class="btn" id="pip-back">Bring it back</button></p></div>';
}

// ---------- layout reporting ----------
let layoutQueued = false;
function sendLayout() {
  if (layoutQueued) return;
  layoutQueued = true;
  // A timer, not requestAnimationFrame: rAF stops while the window is hidden or
  // in the background, which would leave page views without a size.
  setTimeout(() => {
    layoutQueued = false;
    const r = $('#content').getBoundingClientRect();
    const ai = $('#ai-slot');
    const ar = ai.hidden ? null : ai.getBoundingClientRect();
    api.layout({
      content: { x: r.left, y: r.top, width: r.width, height: r.height },
      ai: ar ? { x: ar.left, y: ar.top, width: ar.width, height: ar.height } : null,
    });
  }, 0);
}
new ResizeObserver(sendLayout).observe($('#content'));
new ResizeObserver(sendLayout).observe($('#ai-slot'));
window.addEventListener('resize', () => { if (S) renderAi(); sendLayout(); });

// ---------- events ----------
document.addEventListener('click', (e) => {
  const t = e.target.closest('button, .tab, [data-bm]');
  if (!t) return;
  if (t.dataset.wc) return api.cmd('window-control', { action: t.dataset.wc });
  if (t.dataset.close) { e.stopPropagation(); return api.cmd('close-tab', { tabId: t.dataset.close }); }
  if (e.target.closest('[data-mute]')) return api.cmd('mute-tab', { tabId: e.target.closest('[data-mute]').dataset.mute });
  if (t.dataset.tab) return api.cmd('activate-tab', { tabId: t.dataset.tab });
  if (t.dataset.space) return api.cmd('activate-space', { spaceId: t.dataset.space });
  if (t.dataset.bm) return api.cmd('open-bookmark', { id: t.dataset.bm, newTab: e.ctrlKey });
  if (t.dataset.folder) { const r = t.getBoundingClientRect(); return api.cmd('bookmark-folder-menu', { id: t.dataset.folder, x: r.left, y: r.bottom + 2 }); }
  if (t.dataset.ib) return api.cmd('permission-reply', { id: t.dataset.ib, allow: t.dataset.ibAction === 'allow', remember: true });
  const anchor = (el) => { const r = el.getBoundingClientRect(); return { x: r.left, y: r.bottom + 4 }; };
  switch (t.id) {
    case 'new-tab': return api.cmd('new-tab', {});
    case 'back': return api.cmd('back');
    case 'forward': return api.cmd('forward');
    case 'reload': return api.cmd(S?.active?.loading ? 'stop' : 'reload');
    case 'home': return api.cmd('home');
    case 'star-btn': return api.cmd('bookmark-page');
    case 'bm-all': { const r = t.getBoundingClientRect(); return api.cmd('bookmark-folder-menu', { id: 'all', x: r.left, y: r.bottom + 2 }); }
    case 'add-space': return openSpaceEditor(null, t);
    case 'incognito-btn': return api.cmd('new-incognito-window');
    case 'settings-btn': return api.cmd('settings');
    case 'ai-btn': return api.cmd('toggle-ai');
    case 'menu-btn': { const r = t.getBoundingClientRect(); return api.cmd('open-menu', { x: r.right, y: r.bottom + 4 }); }
    case 'downloads-btn': { const a = anchor(t); return api.cmd('open-popover', { kind: 'downloads', x: t.getBoundingClientRect().right, y: a.y }); }
    case 'extensions-btn': return api.cmd('open-popover', { kind: 'extensions', x: t.getBoundingClientRect().right, ...{ y: anchor(t).y } });
    case 'translate-btn': return api.cmd('open-popover', { kind: 'translate', ...anchor(t) });
    case 'passwords-btn': return api.cmd('open-popover', { kind: 'passwords', ...anchor(t) });
    case 'site-info': return api.cmd('open-popover', { kind: 'site-info', ...anchor(t) });
    case 'profile-card': return openProfilePopover(t);
    case 'crash-reload': return api.cmd('reload');
    case 'pip-back': return api.cmd('pip');
    case 'find-next': return api.cmd('find-next');
    case 'find-prev': return api.cmd('find-previous');
    case 'find-close': return api.cmd('find-close');
    default:
  }
});

document.addEventListener('auxclick', (e) => {
  if (e.button !== 1) return;
  const tab = e.target.closest('.tab');
  if (tab) return api.cmd('close-tab', { tabId: tab.dataset.tab });
  const bm = e.target.closest('[data-bm]');
  if (bm) return api.cmd('open-bookmark', { id: bm.dataset.bm, newTab: true });
});

document.addEventListener('contextmenu', (e) => {
  const tab = e.target.closest('.tab');
  if (tab) { e.preventDefault(); return api.cmd('tab-context-menu', { tabId: tab.dataset.tab, x: e.clientX, y: e.clientY }); }
  const sp = e.target.closest('[data-space]');
  if (sp) { e.preventDefault(); return api.cmd('space-context-menu', { spaceId: sp.dataset.space, x: e.clientX, y: e.clientY }); }
  const bm = e.target.closest('[data-bm], [data-folder]');
  if (bm) { e.preventDefault(); return api.cmd('bookmark-context-menu', { id: bm.dataset.bm || bm.dataset.folder, x: e.clientX, y: e.clientY }); }
  if (!e.target.closest('input')) e.preventDefault();
});

// Double-click on empty tab-list space opens a new tab (like Chrome's tab strip).
$('#tab-list').addEventListener('dblclick', (e) => { if (e.target.id === 'tab-list') api.cmd('new-tab', {}); });

// ---------- tab drag and drop ----------
let dragTab = null;
$('#tab-list').addEventListener('dragstart', (e) => {
  const el = e.target.closest('.tab');
  if (!el) return;
  dragTab = el.dataset.tab;
  el.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', dragTab);
});
document.addEventListener('dragend', () => {
  dragTab = null;
  document.querySelectorAll('.dragging, .drop-before, .drop').forEach((n) => n.classList.remove('dragging', 'drop-before', 'drop'));
});
$('#tab-list').addEventListener('dragover', (e) => {
  if (!dragTab) return;
  e.preventDefault();
  document.querySelectorAll('.drop-before').forEach((n) => n.classList.remove('drop-before'));
  const el = e.target.closest('.tab');
  if (el) el.classList.add('drop-before');
});
$('#tab-list').addEventListener('drop', (e) => {
  if (!dragTab) return;
  e.preventDefault();
  const tabs = [...document.querySelectorAll('#tab-list .tab')].map((n) => n.dataset.tab);
  const el = e.target.closest('.tab');
  let to = el ? tabs.indexOf(el.dataset.tab) : tabs.length;
  const from = tabs.indexOf(dragTab);
  if (from < to) to -= 1;
  api.cmd('move-tab', { tabId: dragTab, toIndex: Math.max(0, to) });
});
$('#spaces').addEventListener('dragover', (e) => {
  const sp = e.target.closest('[data-space]');
  if (!dragTab || !sp) return;
  e.preventDefault();
  sp.classList.add('drop');
});
$('#spaces').addEventListener('dragleave', (e) => { const sp = e.target.closest('[data-space]'); if (sp) sp.classList.remove('drop'); });
$('#spaces').addEventListener('drop', (e) => {
  const sp = e.target.closest('[data-space]');
  if (!dragTab || !sp) return;
  e.preventDefault();
  api.cmd('move-tab', { tabId: dragTab, toIndex: 9999, spaceId: sp.dataset.space });
});

// ---------- address bar ----------
const address = $('#address');
address.addEventListener('focus', () => {
  $('#omnibox').classList.add('focus');
  if (S?.active?.display) address.value = S.active.display;
  addressDirty = false;
  setTimeout(() => address.select(), 0);
});
address.addEventListener('blur', () => {
  $('#omnibox').classList.remove('focus');
  addressDirty = false;
  api.cmd('omnibox-blur');
  renderToolbar();
});
function omniRect() {
  const r = $('#omnibox').getBoundingClientRect();
  return { x: r.left, y: r.top, width: r.width, height: r.height };
}
address.addEventListener('input', () => {
  addressDirty = true;
  api.cmd('omnibox-input', { text: address.value, rect: omniRect() });
});
address.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (addressDirty) { address.value = S?.active?.display || ''; addressDirty = false; address.select(); api.cmd('omnibox-input', { text: '', rect: omniRect() }); } else address.blur();
    e.preventDefault();
  } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    omniIndex = Math.max(-1, Math.min(omniCount - 1, omniIndex + (e.key === 'ArrowDown' ? 1 : -1)));
    api.cmd('omnibox-select', { index: omniIndex });
    e.preventDefault();
  }
});
let omniIndex = -1;
let omniCount = 0;
api.on('omnibox', (data) => {
  omniCount = data.count || 0;
  if (data.reset) omniIndex = -1;
  if (typeof data.fill === 'string') address.value = data.fill;
});
$('#omnibox').addEventListener('submit', (e) => {
  e.preventDefault();
  const text = address.value;
  addressDirty = false;
  address.blur();
  api.cmd('navigate', { input: text, newTab: false });
});
address.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.altKey) {
    e.preventDefault();
    addressDirty = false;
    api.cmd('navigate', { input: address.value, newTab: true });
    address.blur();
  }
});
api.on('focus-address', () => { address.focus(); address.select(); });

// ---------- find bar ----------
const findInput = $('#find-input');
api.on('find', (data) => {
  if (data.open === true) {
    $('#findbar').hidden = false;
    if (typeof data.text === 'string') findInput.value = data.text;
    findInput.focus();
    findInput.select();
    sendLayout();
  } else if (data.open === false) {
    $('#findbar').hidden = true;
    $('#find-count').textContent = '';
    sendLayout();
  }
  if (data.result) {
    $('#find-count').textContent = findInput.value ? (data.result.total ? `${data.result.active} of ${data.result.total}` : 'No results') : '';
  }
});
findInput.addEventListener('input', () => {
  if (!findInput.value) $('#find-count').textContent = '';
  api.cmd('find-query', { text: findInput.value });
});
findInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); api.cmd('find-query', { text: findInput.value, forward: !e.shiftKey, findNext: true }); }
  if (e.key === 'Escape') { e.preventDefault(); api.cmd('find-close'); }
});

// ---------- AI panel drag handle ----------
let resizing = false;
$('#ai-handle').addEventListener('pointerdown', (e) => {
  resizing = true;
  document.body.classList.add('resizing');
  $('#ai-handle').setPointerCapture(e.pointerId);
});
$('#ai-handle').addEventListener('pointermove', (e) => {
  if (!resizing) return;
  const right = window.innerWidth - 10;
  const w = Math.max(320, Math.min(520, Math.round(right - e.clientX - 6)));
  document.documentElement.style.setProperty('--ai-w', w + 'px');
  sendLayout();
});
$('#ai-handle').addEventListener('pointerup', (e) => {
  if (!resizing) return;
  resizing = false;
  document.body.classList.remove('resizing');
  $('#ai-handle').releasePointerCapture(e.pointerId);
  const w = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--ai-w'), 10);
  api.cmd('ai-set', { width: w });
});

// ---------- popovers (shown over the left columns) ----------
const pop = $('#popover');
function closePopover() { pop.hidden = true; pop.innerHTML = ''; }
document.addEventListener('mousedown', (e) => {
  if (!pop.hidden && !pop.contains(e.target) && !e.target.closest('#add-space, #profile-card')) closePopover();
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !pop.hidden) closePopover(); });

function placePopover(anchor, side = 'right') {
  const r = anchor.getBoundingClientRect();
  pop.hidden = false;
  const h = pop.offsetHeight;
  if (side === 'right') {
    pop.style.left = (r.right + 10) + 'px';
    pop.style.top = Math.min(r.top, window.innerHeight - h - 10) + 'px';
  } else {
    pop.style.left = r.left + 'px';
    pop.style.top = Math.max(10, r.top - h - 8) + 'px';
  }
}

function openSpaceEditor(spaceId, anchor) {
  const existing = spaceId ? S.spaces.find((s) => s.id === spaceId) : null;
  let color = existing ? existing.color : SPACE_COLORS.find((c) => !S.spaces.some((s) => s.color === c)) || SPACE_COLORS[3];
  pop.innerHTML = `
    <h3>${existing ? 'Edit space' : 'New space'}</h3>
    <input class="field" id="space-name-input" maxlength="40" placeholder="Name, e.g. Study" value="${esc(existing?.name || '')}">
    <div class="swatches">${SPACE_COLORS.map((c) => `<button class="swatch" data-color="${c}" style="background:${c};color:${c}" aria-label="Colour ${c}"></button>`).join('')}</div>
    <label class="custom-color"><input type="color" id="space-color-input" value="${color}"> Custom colour</label>
    <div class="pop-actions">
      <button class="btn" id="space-cancel">Cancel</button>
      <button class="btn primary" id="space-save">${existing ? 'Save' : 'Create space'}</button>
    </div>`;
  const mark = () => pop.querySelectorAll('.swatch').forEach((s) => s.classList.toggle('sel', s.dataset.color === color));
  mark();
  pop.querySelectorAll('.swatch').forEach((s) => s.addEventListener('click', () => { color = s.dataset.color; $('#space-color-input').value = color; mark(); }));
  $('#space-color-input').addEventListener('input', (e) => { color = e.target.value; mark(); });
  $('#space-cancel').addEventListener('click', closePopover);
  const save = () => {
    const name = $('#space-name-input').value.trim();
    if (!name) { $('#space-name-input').focus(); return; }
    if (existing) api.cmd('update-space', { spaceId: existing.id, name, color });
    else api.cmd('create-space', { name, color });
    closePopover();
  };
  $('#space-save').addEventListener('click', save);
  $('#space-name-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') save(); });
  placePopover(anchor, 'right');
  $('#space-name-input').focus();
}

function openProfilePopover(anchor) {
  const profiles = S.profiles || [S.profile];
  pop.innerHTML = `
    <h3>Profiles</h3>
    <div class="pop-list">
      ${profiles.map((p) => `<button class="pop-row" data-profile="${p.id}"><span class="avatar" style="background:${p.color}">${esc(p.name.charAt(0).toUpperCase())}</span>${esc(p.name)}${p.id === S.profile.id && !S.incognito ? `<span class="check">${icon('check', 14)}</span>` : ''}</button>`).join('')}
    </div>
    <div class="pop-sep"></div>
    <div class="pop-list">
      <button class="pop-row" id="pp-add">${icon('plus', 16)}Add profile</button>
      <button class="pop-row" id="pp-manage">${icon('settings', 16)}Manage profiles</button>
    </div>`;
  pop.querySelectorAll('[data-profile]').forEach((b) => b.addEventListener('click', () => { api.cmd('switch-profile', { profileId: b.dataset.profile }); closePopover(); }));
  $('#pp-add').addEventListener('click', () => openNewProfile(anchor));
  $('#pp-manage').addEventListener('click', () => { api.cmd('settings'); closePopover(); });
  placePopover(anchor, 'up');
}

function openNewProfile(anchor) {
  let color = SPACE_COLORS[3];
  pop.innerHTML = `
    <h3>New profile</h3>
    <input class="field" id="profile-name-input" maxlength="40" placeholder="Name, e.g. Work">
    <div class="swatches">${SPACE_COLORS.map((c) => `<button class="swatch" data-color="${c}" style="background:${c};color:${c}" aria-label="Colour ${c}"></button>`).join('')}</div>
    <div class="pop-actions"><button class="btn" id="np-cancel">Cancel</button><button class="btn primary" id="np-save">Create and open</button></div>`;
  const mark = () => pop.querySelectorAll('.swatch').forEach((s) => s.classList.toggle('sel', s.dataset.color === color));
  mark();
  pop.querySelectorAll('.swatch').forEach((s) => s.addEventListener('click', () => { color = s.dataset.color; mark(); }));
  $('#np-cancel').addEventListener('click', closePopover);
  $('#np-save').addEventListener('click', () => {
    const name = $('#profile-name-input').value.trim();
    if (!name) return $('#profile-name-input').focus();
    api.cmd('create-profile', { name, color });
    closePopover();
  });
  placePopover(anchor, 'up');
  $('#profile-name-input').focus();
}

// Main asks the UI to open the space editor (from the space context menu).
api.on('overlay', (data) => {
  if (data.kind === 'edit-space') {
    const btn = document.querySelector(`[data-space="${data.spaceId}"]`);
    if (btn) openSpaceEditor(data.spaceId, btn);
  }
});

let toastTimer = null;
api.on('toast', (data) => {
  const t = $('#toast');
  t.textContent = data.text;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, data.ms || 2600);
});

api.on('state', (state) => {
  S = state;
  render();
});

// Broken favicons fall back to the letter tile (inline handlers are blocked by the CSP).
document.addEventListener('error', (e) => {
  const img = e.target;
  if (img.tagName === 'IMG' && img.parentElement?.classList.contains('fav')) {
    const fav = img.parentElement;
    img.remove();
    const letter = fav.dataset.letter || '?';
    fav.textContent = letter;
    fav.style.background = letterColor(letter);
  }
}, true);

paintIcons();
api.ready();

// The line under the profile name: where this profile's data lives.
function profileLine(st) {
  if (st.incognito) return 'Nothing is saved';
  if (st.onyx?.connected && st.sync?.enabled !== false) return 'Synced through Onyx';
  if (st.llm?.backend === 'onyx' && !st.onyx?.connected) return 'Onyx is not running';
  return 'Saved on this computer';
}
