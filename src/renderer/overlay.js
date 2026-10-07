'use strict';
/* global icon */
// Overlay view: ⋮ menu, address-bar suggestions, Ctrl+K command bar and popovers.

const api = window.opal;
const root = document.getElementById('root');
const backdrop = document.getElementById('backdrop');
let current = null; // current payload
let kbItems = []; // keyboard-navigable elements
let kbIndex = -1;

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function close() {
  api.cmd('close-overlay');
}

function run(cmd, args) {
  close();
  api.cmd(cmd, args || {});
}

backdrop.addEventListener('mousedown', close);

document.addEventListener('keydown', (e) => {
  if (!current) return;
  if (e.key === 'Escape') { e.preventDefault(); close(); return; }
  if (current.kind === 'command') return; // handled by the command bar input
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    if (!kbItems.length) return;
    kbIndex = (kbIndex + (e.key === 'ArrowDown' ? 1 : -1) + kbItems.length) % kbItems.length;
    kbItems.forEach((el, i) => el.classList.toggle('kb', i === kbIndex));
    kbItems[kbIndex].focus();
  } else if (e.key === 'ArrowRight' && kbItems[kbIndex]?.dataset.sub) {
    kbItems[kbIndex].dispatchEvent(new MouseEvent('mouseenter'));
  }
});

// ---------- ⋮ menu ----------
function menuModel(d) {
  const h = d.hints;
  const spacesSub = [
    ...d.spaces.map((s) => ({ dot: s.color, label: s.name + (s.id === d.activeSpaceId ? '  (current)' : ''), cmd: 'activate-space', args: { spaceId: s.id } })),
    { sep: true },
    ...d.spaces.filter((s) => s.id !== d.activeSpaceId).map((s) => ({ icon: 'layers', label: 'Move this tab to ' + s.name, cmd: 'move-tab', args: { tabId: d.activeTabId, toIndex: 9999, spaceId: s.id } })),
    { icon: 'columns-2', label: d.split ? 'Separate split view' : 'Open split view', cmd: d.split ? 'unsplit-tab' : 'split-view' },
  ];
  return [
    { icon: 'plus', label: 'New tab', hint: h['new-tab'], cmd: 'new-tab' },
    { icon: 'square', label: 'New window', hint: h['new-window'], cmd: 'new-window' },
    { icon: 'venetian-mask', label: 'New incognito window', hint: h['new-incognito-window'], cmd: 'new-incognito-window' },
    { sep: true },
    { icon: 'key-round', label: 'Passwords and autofill', cmd: 'passwords' },
    { icon: 'history', label: 'History', hint: h.history, cmd: 'history' },
    { icon: 'download', label: 'Downloads', hint: h.downloads, cmd: 'downloads' },
    { icon: 'star', label: 'Bookmarks and lists', sub: [
      { icon: 'star', label: 'Bookmark this tab', hint: h['bookmark-page'], cmd: 'bookmark-page', disabled: !d.isWeb },
      { icon: 'bookmark', label: d.showBookmarksBar ? 'Hide bookmarks bar' : 'Show bookmarks bar', hint: 'Ctrl+Shift+B', cmd: 'toggle-bookmarks-bar' },
      { icon: 'folder-open', label: 'Bookmark manager', hint: h.bookmarks, cmd: 'bookmarks' },
    ] },
    { icon: 'layers', label: 'Spaces and tab groups', sub: spacesSub },
    { icon: 'puzzle', label: 'Extensions', sub: [
      { icon: 'puzzle', label: 'Manage extensions', cmd: 'extensions' },
      { icon: 'folder-open', label: 'Load unpacked extension…', cmd: 'extensions', args: {} },
    ], disabled: d.incognito },
    { icon: 'trash-2', label: 'Delete browsing data', hint: h['clear-data'], cmd: 'clear-data' },
    { sep: true },
    { zoom: true },
    { sep: true },
    { icon: 'printer', label: 'Print…', hint: h.print, cmd: 'print' },
    { icon: 'languages', label: 'Translate this page', cmd: 'translate', disabled: !d.isWeb },
    { icon: 'sparkles', label: d.aiOpen ? 'Hide Opal AI' : 'Show Opal AI', hint: h['toggle-ai'], cmd: 'toggle-ai' },
    { icon: 'search', label: 'Find and edit', sub: [
      { icon: 'search', label: 'Find…', hint: h.find, cmd: 'find' },
      { icon: 'command', label: 'Command bar', hint: h['command-bar'], cmd: 'command-bar' },
    ] },
    { icon: 'share-2', label: 'Cast, save and share', sub: [
      { icon: 'file-down', label: 'Save page as…', hint: h['save-page'], cmd: 'save-page', disabled: !d.isWeb },
      { icon: 'file-text', label: 'Save as PDF…', cmd: 'save-pdf', disabled: !d.isWeb },
      { icon: 'link', label: 'Copy link', cmd: 'copy-link' },
      { icon: 'share-2', label: 'Cast… (not available yet)', disabled: true },
    ] },
    { icon: 'settings', label: 'More tools', sub: [
      { icon: 'book-open', label: 'Reader mode', hint: h['reader-mode'], cmd: 'reader-mode', disabled: !d.isWeb },
      { icon: 'columns-2', label: d.split ? 'Separate split view' : 'Split view', hint: h['split-view'], cmd: d.split ? 'unsplit-tab' : 'split-view' },
      { icon: 'picture-in-picture-2', label: 'Picture in picture', cmd: 'pip', disabled: !d.isWeb },
      { sep: true },
      { icon: 'file-text', label: 'View page source', hint: 'Ctrl+U', cmd: 'view-source', disabled: !d.isWeb },
      { icon: 'square-pen', label: 'Developer tools', hint: h.devtools, cmd: 'devtools' },
    ] },
    { sep: true },
    { icon: 'circle-help', label: 'Help', sub: [
      { icon: 'keyboard', label: 'Keyboard shortcuts', cmd: 'help' },
      { icon: 'info', label: 'About Opal', cmd: 'about' },
    ] },
    { icon: 'settings', label: 'Settings', cmd: 'settings' },
    { icon: 'info', label: 'About Opal', cmd: 'about' },
  ];
}

function itemHtml(it, i) {
  if (it.sep) return '<div class="m-sep"></div>';
  const lead = it.dot ? `<span class="dot" style="background:${it.dot}"></span>` : icon(it.icon || 'globe', 16);
  return `<button class="m-item" data-i="${i}" ${it.sub ? 'data-sub="1"' : ''} ${it.disabled ? 'disabled' : ''}>
    ${lead}<span class="label">${esc(it.label)}</span>
    ${it.hint ? `<span class="hint">${esc(it.hint)}</span>` : ''}
    ${it.sub ? `<span class="chev">${icon('chevron-right', 14)}</span>` : ''}
  </button>`;
}

let subEl = null;
function openSub(items, anchorEl, menuEl) {
  if (subEl) subEl.remove();
  subEl = document.createElement('div');
  subEl.className = 'card sub-menu';
  subEl.innerHTML = items.map(itemHtml).join('');
  document.body.appendChild(subEl);
  const r = anchorEl.getBoundingClientRect();
  const m = menuEl.getBoundingClientRect();
  const left = m.left - subEl.offsetWidth - 4 >= 6 ? m.left - subEl.offsetWidth - 4 : m.right + 4;
  subEl.style.left = left + 'px';
  subEl.style.top = Math.max(6, Math.min(r.top - 6, window.innerHeight - subEl.offsetHeight - 6)) + 'px';
  bindItems(subEl, items);
}

function bindItems(container, items) {
  container.querySelectorAll('.m-item').forEach((el) => {
    const it = items[Number(el.dataset.i)];
    if (it.sub) {
      el.addEventListener('mouseenter', () => openSub(it.sub, el, container));
      el.addEventListener('click', () => openSub(it.sub, el, container));
    } else {
      el.addEventListener('mouseenter', () => { if (container === root.firstElementChild && subEl) { subEl.remove(); subEl = null; } });
      el.addEventListener('click', () => { if (it.cmd) run(it.cmd, it.args); });
    }
  });
}

function renderMenu(p) {
  const d = p.data;
  const items = menuModel(d);
  const name = d.incognito ? 'Incognito' : d.profile.name;
  const color = d.incognito ? '#3d4452' : d.profile.color;
  const syncLine = d.incognito ? 'Nothing from this window is saved' : (d.onyx && d.onyx.connected && d.syncEnabled !== false ? 'Synced through Onyx' : d.llmBackend === 'onyx' && !(d.onyx && d.onyx.connected) ? 'Onyx is not running' : 'Saved on this computer');
  root.innerHTML = `<div class="card menu" role="menu">
    <div class="m-head">
      <span class="avatar" style="background:${color}">${esc(name.charAt(0).toUpperCase())}</span>
      <span class="who"><span class="name">${esc(name)}</span><span class="sub-t">${esc(syncLine)}</span></span>
      <button class="btn" id="switch">Switch</button>
    </div>
    ${items.map((it, i) => (it.zoom ? `<div class="m-zoom"><span class="label">${icon('zoom-in', 16)}Zoom</span>
      <button class="sq" id="z-out" title="Zoom out (Ctrl+-)">${icon('minus', 15)}</button>
      <span class="val" id="z-val">${d.zoom}%</span>
      <button class="sq" id="z-in" title="Zoom in (Ctrl+=)">${icon('plus', 15)}</button>
      <button class="sq" id="z-full" title="Full screen (F11)">${icon('maximize', 15)}</button></div>` : itemHtml(it, i))).join('')}
  </div>`;
  const menu = root.firstElementChild;
  const ax = Math.min(p.anchor.x, window.innerWidth - 8);
  menu.style.left = Math.max(8, ax - menu.offsetWidth) + 'px';
  menu.style.top = Math.max(8, Math.min(p.anchor.y, window.innerHeight - menu.offsetHeight - 8)) + 'px';
  bindItems(menu, items);
  document.getElementById('z-out').addEventListener('click', () => { api.cmd('zoom-out'); bumpZoom(-1); });
  document.getElementById('z-in').addEventListener('click', () => { api.cmd('zoom-in'); bumpZoom(1); });
  document.getElementById('z-full').addEventListener('click', () => run('fullscreen'));
  document.getElementById('switch').addEventListener('click', (e) => {
    const profiles = d.profiles.map((pr) => ({ dot: pr.color, label: pr.name + (pr.id === d.profile.id && !d.incognito ? '  (current)' : ''), cmd: 'switch-profile', args: { profileId: pr.id } }));
    profiles.push({ sep: true }, { icon: 'plus', label: 'Add profile…', cmd: 'settings' }, { icon: 'venetian-mask', label: 'Incognito window', cmd: 'new-incognito-window' });
    openSub(profiles, e.currentTarget, menu);
  });
  kbItems = [...menu.querySelectorAll('.m-item:not(:disabled)')];
  kbIndex = -1;
  menu.querySelector('.m-item').focus({ preventScroll: true });
  menu.querySelector('.m-item').blur();
}

const ZOOMS = [25, 33, 50, 67, 75, 80, 90, 100, 110, 125, 150, 175, 200, 250, 300, 400, 500];
function bumpZoom(dir) {
  const el = document.getElementById('z-val');
  const z = parseInt(el.textContent, 10);
  const next = dir > 0 ? ZOOMS.find((s) => s > z) || z : [...ZOOMS].reverse().find((s) => s < z) || z;
  el.textContent = next + '%';
}

// ---------- address bar suggestions ----------
function renderOmnibox(p) {
  const iconFor = { search: 'search', url: 'globe', bookmark: 'star', history: 'history' };
  root.innerHTML = `<div class="card omni" role="listbox">${p.items.map((it, i) => `
    <div class="o-row ${i === p.selected ? 'sel' : ''}" data-i="${i}" role="option">
      ${icon(iconFor[it.kind] || 'globe', 16)}
      <span class="t">${esc(it.title)}</span>
      <span class="u">${it.kind === 'search' ? '— ' + esc(it.sub) : esc(it.sub && it.sub !== it.title ? it.sub : '')}</span>
    </div>`).join('')}</div>`;
  root.querySelectorAll('.o-row').forEach((el) => el.addEventListener('mousedown', (e) => {
    e.preventDefault();
    const it = p.items[Number(el.dataset.i)];
    run('navigate', { input: it.url, newTab: e.ctrlKey || e.button === 1 });
  }));
}

// ---------- Ctrl+K command bar ----------
let cmdState = null;
function commandList(p) {
  const h = p.hints;
  const list = [
    ['New tab', 'new-tab', 'plus', h['new-tab']],
    ['New window', 'new-window', 'square', h['new-window']],
    ['New incognito window', 'new-incognito-window', 'venetian-mask', h['new-incognito-window']],
    ['Toggle Opal AI', 'toggle-ai', 'sparkles', h['toggle-ai']],
    ['History', 'history', 'history', h.history],
    ['Downloads', 'downloads', 'download', h.downloads],
    ['Bookmark manager', 'bookmarks', 'folder-open', h.bookmarks],
    ['Bookmark this page', 'bookmark-page', 'star', h['bookmark-page']],
    ['Find in page', 'find', 'search', h.find],
    ['Reader mode', 'reader-mode', 'book-open', h['reader-mode']],
    ['Split view', 'split-view', 'columns-2', h['split-view']],
    ['Picture in picture', 'pip', 'picture-in-picture-2', ''],
    ['Translate this page', 'translate', 'languages', ''],
    ['Print', 'print', 'printer', h.print],
    ['Save as PDF', 'save-pdf', 'file-text', ''],
    ['Save page as', 'save-page', 'file-down', h['save-page']],
    ['Copy link', 'copy-link', 'link', ''],
    ['Zoom in', 'zoom-in', 'zoom-in', 'Ctrl+='],
    ['Zoom out', 'zoom-out', 'zoom-out', 'Ctrl+-'],
    ['Reset zoom', 'zoom-reset', 'search', 'Ctrl+0'],
    ['Full screen', 'fullscreen', 'maximize', 'F11'],
    ['Reopen closed tab', 'reopen-closed-tab', 'history', 'Ctrl+Shift+T'],
    ['Toggle bookmarks bar', 'toggle-bookmarks-bar', 'bookmark', 'Ctrl+Shift+B'],
    ['Delete browsing data', 'clear-data', 'trash-2', h['clear-data']],
    ['Extensions', 'extensions', 'puzzle', ''],
    ['Passwords and autofill', 'passwords', 'key-round', ''],
    ['Settings', 'settings', 'settings', ''],
    ['Keyboard shortcuts', 'help', 'keyboard', ''],
    ['About Opal', 'about', 'info', ''],
    ['Developer tools', 'devtools', 'square-pen', h.devtools],
  ];
  return list.map(([title, cmd, ic, hint]) => ({ type: 'command', title, cmd, icon: ic, hint }));
}

function renderCommand(p) {
  cmdState = { p, commands: commandList(p), history: [], sel: 0, rows: [] };
  root.innerHTML = `<div class="card cmd" role="dialog" aria-label="Command bar">
    <input id="cmd-input" placeholder="Search tabs, bookmarks, history and commands" spellcheck="false" autocomplete="off">
    <div class="list" id="cmd-list"></div>
    <div class="c-foot"><span>↑↓ to move</span><span>Enter to open</span><span>Esc to close</span></div>
  </div>`;
  const input = document.getElementById('cmd-input');
  input.addEventListener('input', () => {
    cmdState.sel = 0;
    renderCommandRows();
    if (input.value.trim()) api.cmd('omnibox-input', { text: input.value });
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const n = cmdState.rows.length;
      if (!n) return;
      cmdState.sel = (cmdState.sel + (e.key === 'ArrowDown' ? 1 : -1) + n) % n;
      highlight();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const row = cmdState.rows[cmdState.sel];
      if (row) pick(row, e.ctrlKey);
    }
  });
  renderCommandRows();
  setTimeout(() => input.focus(), 0);
}

function matches(q, ...fields) {
  return fields.some((f) => (f || '').toLowerCase().includes(q));
}

function renderCommandRows() {
  const q = document.getElementById('cmd-input').value.trim().toLowerCase();
  const { p } = cmdState;
  const groups = [];
  const tabs = p.tabs.filter((t) => !q || matches(q, t.title, t.url, t.space)).slice(0, q ? 8 : 6).map((t) => ({ type: 'tab', ...t }));
  const commands = cmdState.commands.filter((c) => !q || matches(q, c.title)).slice(0, q ? 8 : 6);
  const spaces = p.spaces.filter((s) => q && matches(q, s.name)).map((s) => ({ type: 'space', title: 'Switch to ' + s.name, spaceId: s.id, color: s.color }));
  const bookmarks = q ? p.bookmarks.filter((b) => matches(q, b.title, b.url)).slice(0, 6).map((b) => ({ type: 'url', icon: 'star', ...b })) : [];
  const seen = new Set(bookmarks.map((b) => b.url));
  const history = q ? cmdState.history.filter((h) => !seen.has(h.url)).slice(0, 6).map((h) => ({ type: 'url', icon: 'history', title: h.title, url: h.url })) : [];
  if (q) groups.push(['', [{ type: 'search', title: document.getElementById('cmd-input').value.trim(), icon: 'search' }]]);
  if (tabs.length) groups.push(['Open tabs', tabs]);
  if (spaces.length) groups.push(['Spaces', spaces]);
  if (commands.length) groups.push(['Commands', commands]);
  if (bookmarks.length) groups.push(['Bookmarks', bookmarks]);
  if (history.length) groups.push(['History', history]);
  cmdState.rows = groups.flatMap(([, rows]) => rows);
  let i = 0;
  document.getElementById('cmd-list').innerHTML = groups.map(([label, rows]) => `
    ${label ? `<div class="c-group">${esc(label)}</div>` : ''}
    ${rows.map((r) => {
      const idx = i++;
      const lead = r.type === 'tab' || r.type === 'space' ? `<span class="dot" style="background:${r.color}"></span>` : icon(r.icon || 'globe', 16);
      const right = r.type === 'command' ? `<span class="hint">${esc(r.hint || '')}</span>`
        : r.type === 'tab' ? `<span class="u">${esc(r.space)}</span>`
        : r.type === 'search' ? '<span class="u">Search the web or open a URL</span>'
        : r.url ? `<span class="u">${esc(r.url)}</span>` : '';
      return `<button class="c-row" data-i="${idx}">${lead}<span class="t">${esc(r.title)}</span>${right}</button>`;
    }).join('')}`).join('') || '<div class="empty">No matches</div>';
  document.querySelectorAll('.c-row').forEach((el) => {
    el.addEventListener('mousemove', () => { cmdState.sel = Number(el.dataset.i); highlight(); });
    el.addEventListener('click', (e) => pick(cmdState.rows[Number(el.dataset.i)], e.ctrlKey));
  });
  highlight();
}

function highlight() {
  document.querySelectorAll('.c-row').forEach((el) => el.classList.toggle('sel', Number(el.dataset.i) === cmdState.sel));
  const el = document.querySelector('.c-row.sel');
  if (el) el.scrollIntoView({ block: 'nearest' });
}

function pick(row, newTab) {
  if (row.type === 'command') run(row.cmd);
  else if (row.type === 'tab') run('activate-tab', { tabId: row.tabId });
  else if (row.type === 'space') run('activate-space', { spaceId: row.spaceId });
  else if (row.type === 'url') run('navigate', { input: row.url, newTab: !!newTab });
  else if (row.type === 'search') run('navigate', { input: row.title, newTab: !!newTab });
}

// ---------- popovers (filled by feature modules) ----------
const popovers = {};
window.registerPopover = (kind, fn) => { popovers[kind] = fn; };

function placeCard(card, anchor, align = 'right') {
  const w = card.offsetWidth;
  const left = align === 'right' ? anchor.x - w : anchor.x - 12;
  card.style.left = Math.max(8, Math.min(left, window.innerWidth - w - 8)) + 'px';
  card.style.top = Math.max(8, Math.min(anchor.y, window.innerHeight - card.offsetHeight - 8)) + 'px';
}
window.overlayHelpers = { esc, run, close, placeCard, api };

// ---------- dispatch ----------
api.on('overlay', (p) => {
  if (p.kind === 'command-results') {
    if (cmdState) { cmdState.history = p.history || []; renderCommandRows(); }
    return;
  }
  if (p.kind === 'omnibox' && current?.kind === 'omnibox') {
    current = p;
    renderOmnibox(p);
    return;
  }
  current = p.kind ? p : null;
  if (subEl) { subEl.remove(); subEl = null; }
  root.innerHTML = '';
  cmdState = null;
  kbItems = [];
  document.body.className = '';
  if (!p.kind) return;
  if (p.accent) {
    document.documentElement.style.setProperty('--accent', p.accent);
  }
  if (p.kind === 'menu') renderMenu(p);
  else if (p.kind === 'omnibox') { document.body.classList.add('region'); renderOmnibox(p); }
  else if (p.kind === 'command') { document.body.classList.add('dim'); renderCommand(p); }
  else if (popovers[p.kind]) {
    if (p.dim) document.body.classList.add('dim');
    popovers[p.kind](p, root);
  }
});
