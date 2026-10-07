'use strict';
/* global icon */
const call = (n, a) => window.opal.call(n, a);
let spaces = [];
let sel = { spaceId: null, folderId: null };
let editing = new URLSearchParams(location.search).get('edit');
const q = document.getElementById('q');

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

function findNode(id) {
  for (const s of spaces) {
    const stack = s.bookmarks.map((n) => ({ n, s, path: [] }));
    while (stack.length) {
      const it = stack.shift();
      if (it.n.id === id) return it;
      if (it.n.children) for (const c of it.n.children) stack.push({ n: c, s: it.s, path: [...it.path, it.n] });
    }
  }
  return null;
}

function currentList() {
  const space = spaces.find((s) => s.id === sel.spaceId);
  if (!space) return [];
  if (!sel.folderId) return space.bookmarks;
  const f = findNode(sel.folderId);
  return f && f.n.children ? f.n.children : space.bookmarks;
}

function destinations() {
  const out = [];
  for (const s of spaces) {
    out.push({ label: s.name, spaceId: s.id, parentId: undefined });
    (function walk(nodes, prefix) {
      for (const n of nodes) {
        if (!n.children) continue;
        out.push({ label: `${prefix} / ${n.title}`, spaceId: s.id, parentId: n.id });
        walk(n.children, `${prefix} / ${n.title}`);
      }
    })(s.bookmarks, s.name);
  }
  return out;
}

function renderSide() {
  const side = document.getElementById('side');
  side.replaceChildren();
  for (const s of spaces) {
    const b = el('button', !sel.folderId && sel.spaceId === s.id && !q.value ? 'sel' : '');
    const dot = el('span', 'dot');
    dot.style.background = s.color;
    b.append(dot, el('span', 'ellipsis', s.name));
    b.addEventListener('click', () => { q.value = ''; sel = { spaceId: s.id, folderId: null }; render(); });
    side.append(b);
    if (s.id !== sel.spaceId) continue;
    (function walk(nodes, depth) {
      for (const n of nodes) {
        if (!n.children) continue;
        const fb = el('button', sel.folderId === n.id ? 'sel' : '');
        fb.style.paddingLeft = (10 + depth * 16) + 'px';
        fb.insertAdjacentHTML('afterbegin', icon('folder', 15));
        fb.append(el('span', 'ellipsis', n.title));
        fb.addEventListener('click', () => { q.value = ''; sel = { spaceId: s.id, folderId: n.id }; render(); });
        side.append(fb);
        walk(n.children, depth + 1);
      }
    })(s.bookmarks, 1);
  }
}

function renderCrumbs() {
  const c = document.getElementById('crumbs');
  c.replaceChildren();
  if (q.value) { c.textContent = 'Search results'; return; }
  const space = spaces.find((s) => s.id === sel.spaceId);
  if (!space) return;
  const a = el('a', '', space.name);
  a.addEventListener('click', () => { sel.folderId = null; render(); });
  c.append(a);
  if (sel.folderId) {
    const f = findNode(sel.folderId);
    for (const p of [...(f?.path || []), f?.n].filter(Boolean)) {
      c.append(el('span', '', '/'));
      const pa = el('a', '', p.title);
      pa.addEventListener('click', () => { sel.folderId = p.id; render(); });
      c.append(pa);
    }
  }
}

function row(n, spaceName) {
  const r = el('div', 'b-row');
  r.dataset.id = n.id;
  if (editing === n.id) return editRow(n);
  r.insertAdjacentHTML('afterbegin', icon(n.children ? 'folder' : 'globe', 16));
  const main = el('div', 'main');
  main.append(el('div', 't ellipsis', n.title || n.url));
  if (!n.children) main.append(el('div', 'u ellipsis', (spaceName ? spaceName + ' — ' : '') + n.url));
  else main.append(el('div', 'u', `${n.children.length} item${n.children.length === 1 ? '' : 's'}`));
  main.addEventListener('click', () => {
    if (n.children) { sel = { spaceId: findNode(n.id).s.id, folderId: n.id }; q.value = ''; render(); } else location.href = n.url;
  });
  const edit = el('button', 'icon-btn');
  edit.title = 'Edit';
  edit.innerHTML = icon('pencil', 14);
  edit.addEventListener('click', () => { editing = n.id; render(); });
  const del = el('button', 'icon-btn');
  del.title = 'Delete';
  del.innerHTML = icon('trash-2', 14);
  del.addEventListener('click', () => call('bookmarks.remove', { id: n.id }));
  r.append(main, edit, del);
  return r;
}

function editRow(n) {
  const r = el('div', 'b-row editing');
  const title = el('input', 'field');
  title.value = n.title;
  title.placeholder = 'Name';
  r.append(title);
  let url = null;
  if (!n.children) {
    url = el('input', 'field');
    url.value = n.url;
    url.placeholder = 'https://';
    r.append(url);
  }
  const move = el('select', 'field');
  const here = findNode(n.id);
  for (const d of destinations()) {
    if (d.parentId === n.id) continue;
    const o = el('option', '', d.label);
    o.value = JSON.stringify(d);
    if (d.spaceId === here.s.id && d.parentId === here.path[here.path.length - 1]?.id) o.selected = true;
    move.append(o);
  }
  const save = el('button', 'btn primary', 'Save');
  const cancel = el('button', 'btn', 'Cancel');
  const msg = el('span', 'muted');
  save.addEventListener('click', async () => {
    try {
      await call('bookmarks.update', { id: n.id, title: title.value.trim() || n.title, ...(url ? { url: url.value.trim() } : {}) });
      const d = JSON.parse(move.value);
      const curParent = here.path[here.path.length - 1]?.id;
      if (d.spaceId !== here.s.id || d.parentId !== curParent) await call('bookmarks.move', { id: n.id, spaceId: d.spaceId, ...(d.parentId ? { parentId: d.parentId } : {}) });
      editing = null;
      load();
    } catch (e) { msg.textContent = String(e.message || e).replace(/^.*Error: /, ''); }
  });
  cancel.addEventListener('click', () => { editing = null; render(); });
  r.append(move, save, cancel, msg);
  setTimeout(() => title.focus(), 0);
  return r;
}

function render() {
  if (!sel.spaceId && spaces[0]) sel.spaceId = spaces[0].id;
  renderSide();
  renderCrumbs();
  const list = document.getElementById('list');
  list.replaceChildren();
  let items;
  if (q.value) {
    const t = q.value.toLowerCase();
    items = [];
    for (const s of spaces) {
      (function walk(nodes) {
        for (const n of nodes) {
          if (n.children) walk(n.children);
          else if ((n.title + ' ' + n.url).toLowerCase().includes(t)) items.push([n, s.name]);
        }
      })(s.bookmarks);
    }
  } else items = currentList().map((n) => [n]);
  if (!items.length) list.append(el('div', 'empty', q.value ? 'No bookmarks match.' : 'This folder is empty.'));
  for (const [n, sn] of items) list.append(row(n, sn));
}

async function load() {
  spaces = await call('bookmarks.list');
  if (editing) {
    const f = findNode(editing);
    if (f) sel = { spaceId: f.s.id, folderId: f.path[f.path.length - 1]?.id || null };
  }
  render();
}

document.getElementById('add-bm').addEventListener('click', async () => {
  const node = await call('bookmarks.add', { spaceId: sel.spaceId, title: 'New bookmark', url: 'https://', ...(sel.folderId ? { parentId: sel.folderId } : {}) });
  editing = node.id;
  load();
});
document.getElementById('add-folder').addEventListener('click', async () => {
  const node = await call('bookmarks.add', { spaceId: sel.spaceId, title: 'New folder', folder: true, ...(sel.folderId ? { parentId: sel.folderId } : {}) });
  editing = node.id;
  load();
});
q.addEventListener('input', render);
window.opal.on('bookmarks', load);
load();
