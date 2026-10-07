'use strict';
/* global icon, registerPopover, overlayHelpers */
// Toolbar popovers shown in the overlay (downloads, extensions, site info, translate, passwords).
(() => {
  const { esc, run, placeCard, api } = overlayHelpers;

  function size(n) {
    if (!n) return '0 B';
    const u = ['B', 'KB', 'MB', 'GB'];
    let i = 0;
    while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
    return `${n.toFixed(i && n < 10 ? 1 : 0)} ${u[i]}`;
  }

  function dlMeta(d) {
    if (d.state === 'progressing') return d.paused ? 'Paused' : `${size(d.received)} of ${d.total ? size(d.total) : '?'}`;
    if (d.state === 'completed') return d.exists === false ? 'Deleted' : size(d.total);
    if (d.state === 'cancelled') return 'Cancelled';
    return 'Failed';
  }

  registerPopover('downloads', (p, root) => {
    root.innerHTML = `<div class="card pop" role="dialog" aria-label="Downloads">
      <h3><span class="grow">Recent downloads</span><button class="icon-btn" id="dl-page" title="Open downloads page">${icon('external-link', 15)}</button></h3>
      ${p.items.length ? p.items.map((d) => `<div class="dl" data-id="${d.id}">
        ${icon(d.state === 'completed' ? 'file-down' : d.state === 'progressing' ? 'download' : 'triangle-alert', 18)}
        <div class="info"><div class="name">${esc(d.filename)}</div><div class="meta">${esc(dlMeta(d))}</div>
          ${d.state === 'progressing' ? `<div class="bar"><span style="width:${d.total ? Math.round((d.received / d.total) * 100) : 5}%"></span></div>` : ''}</div>
        ${d.state === 'progressing'
    ? `<button class="icon-btn" data-act="${d.paused ? 'resume' : 'pause'}" title="${d.paused ? 'Resume' : 'Pause'}">${icon(d.paused ? 'download' : 'minus', 15)}</button><button class="icon-btn" data-act="cancel" title="Cancel">${icon('x', 15)}</button>`
    : d.state === 'completed' && d.exists !== false ? `<button class="icon-btn" data-act="show" title="Show in folder">${icon('folder-open', 15)}</button>`
      : `<button class="icon-btn" data-act="retry" title="Retry">${icon('refresh-cw', 15)}</button>`}
      </div>`).join('') : '<div class="empty">No downloads yet.</div>'}
      <div class="actions"><button class="btn" id="dl-all">Show all downloads</button></div>
    </div>`;
    placeCard(root.firstElementChild, p.anchor, 'right');
    root.querySelectorAll('.dl').forEach((row) => {
      row.querySelector('.info').addEventListener('click', () => {
        const d = p.items.find((x) => x.id === row.dataset.id);
        if (d.state === 'completed') run('download-action', { id: d.id, action: 'open' });
      });
      row.querySelectorAll('[data-act]').forEach((b) => b.addEventListener('click', () => api.cmd('download-action', { id: row.dataset.id, action: b.dataset.act })));
    });
    root.querySelector('#dl-all').addEventListener('click', () => run('downloads'));
    root.querySelector('#dl-page').addEventListener('click', () => run('downloads'));
  });

  registerPopover('clear-data', (p, root) => {
    root.innerHTML = `<div class="card dialog" role="dialog" aria-label="Delete browsing data">
      <h3>Delete browsing data</h3>
      <p>Choose what to delete from this profile.</p>
      <label class="muted" for="cd-range">Time range</label>
      <select class="field" id="cd-range" style="width:100%;margin:6px 0 4px">
        <option value="hour">Last hour</option><option value="day">Last 24 hours</option>
        <option value="week">Last 7 days</option><option value="month">Last 4 weeks</option>
        <option value="all" selected>All time</option>
      </select>
      <div class="checks">
        <label><input type="checkbox" id="cd-history" checked> Browsing history</label>
        <label><input type="checkbox" id="cd-cookies" checked> Cookies and other site data</label>
        <label><input type="checkbox" id="cd-cache" checked> Cached images and files</label>
        <label><input type="checkbox" id="cd-downloads"> Download history</label>
      </div>
      <p id="cd-note" class="muted" hidden>Cookies and site data are deleted for all time; Electron can't delete them by date.</p>
      <div class="actions"><button class="btn" id="cd-cancel">Cancel</button><button class="btn primary" id="cd-go">Delete data</button></div>
    </div>`;
    const $ = (s) => root.querySelector(s);
    const note = () => { $('#cd-note').hidden = !($('#cd-cookies').checked && $('#cd-range').value !== 'all'); };
    $('#cd-range').addEventListener('change', note);
    $('#cd-cookies').addEventListener('change', note);
    $('#cd-cancel').addEventListener('click', () => api.cmd('close-overlay'));
    $('#cd-go').addEventListener('click', () => run('clear-data-run', {
      range: $('#cd-range').value,
      history: $('#cd-history').checked,
      cookies: $('#cd-cookies').checked,
      cache: $('#cd-cache').checked,
      downloads: $('#cd-downloads').checked,
    }));
    $('#cd-go').focus();
  });
  registerPopover('site-info', (p, root) => {
    const sec = p.security === 'secure'
      ? `${icon('lock', 16)}<span>Connection is secure</span>`
      : p.security === 'insecure' ? `${icon('triangle-alert', 16)}<span>Connection is not secure. Don't enter passwords or payment details here.</span>`
        : `${icon('info', 16)}<span>This is an Opal page</span>`;
    root.innerHTML = `<div class="card pop" role="dialog" aria-label="Site information">
      <h3><span class="grow">${esc(p.host || 'Site information')}</span></h3>
      <div class="perm-row">${sec}</div>
      ${p.perms.length ? `<div class="pop-sep"></div><p>Permissions for this site</p>${p.perms.map((x) => `<div class="perm-row"><span class="grow">${esc(x.label)}</span><span class="muted">${x.value === 'allow' ? 'Allowed' : 'Blocked'}</span><button class="link" data-reset="${esc(x.key)}">Reset</button></div>`).join('')}` : ''}
      <div class="actions"><button class="btn" id="si-settings">Site settings</button></div>
    </div>`;
    placeCard(root.firstElementChild, p.anchor, 'left');
    root.querySelectorAll('[data-reset]').forEach((b) => b.addEventListener('click', () => api.cmd('site-reset-permission', { origin: p.origin, permission: b.dataset.reset })));
    root.querySelector('#si-settings').addEventListener('click', () => run('settings'));
  });

  registerPopover('passwords', (p, root) => {
    root.innerHTML = `<div class="card pop" role="dialog" aria-label="Passwords">
      <h3>${icon('key-round', 16)}<span class="grow">Passwords</span></h3>
      <p>Opal doesn't save passwords yet: the Electron engine has no built-in password manager.</p>
      <p>Use your password manager's app or extension for now.</p>
      <div class="actions"><button class="btn" id="pw-more">Learn more</button></div>
    </div>`;
    placeCard(root.firstElementChild, p.anchor, 'left');
    root.querySelector('#pw-more').addEventListener('click', () => run('passwords'));
  });

  registerPopover('translate', (p, root) => {
    const langs = ['English', 'Spanish', 'French', 'German', 'Italian', 'Portuguese', 'Dutch', 'Polish', 'Ukrainian', 'Russian', 'Turkish', 'Arabic', 'Hindi', 'Chinese (Simplified)', 'Japanese', 'Korean'];
    root.innerHTML = `<div class="card pop" role="dialog" aria-label="Translate">
      <h3>${icon('languages', 16)}<span class="grow">Translate this page</span></h3>
      <p>${p.translated ? `Translated to ${esc(p.translated)} by Opal AI.` : p.busy ? 'Opal AI is translating this page…' : 'Opal AI translates the page text in place.'}</p>
      <select class="field" id="tr-lang" style="width:100%">${langs.map((l) => `<option ${l === p.target ? 'selected' : ''}>${l}</option>`).join('')}</select>
      <div class="actions">${p.translated || p.busy ? '<button class="btn" id="tr-orig">Show original</button>' : '<button class="btn" id="tr-cancel">Cancel</button>'}<button class="btn primary" id="tr-go">Translate</button></div>
    </div>`;
    placeCard(root.firstElementChild, p.anchor, 'left');
    root.querySelector('#tr-cancel')?.addEventListener('click', () => api.cmd('close-overlay'));
    root.querySelector('#tr-orig')?.addEventListener('click', () => run('translate', { lang: 'Original' }));
    root.querySelector('#tr-go').addEventListener('click', () => run('translate', { lang: root.querySelector('#tr-lang').value }));
  });

  registerPopover('extensions', (p, root) => {
    const empty = p.incognito ? '<p>Extensions are turned off in incognito windows.</p>' : '<p>No extensions yet. Add some from the Chrome Web Store.</p>';
    root.innerHTML = `<div class="card pop ext-pop" role="dialog" aria-label="Extensions">
      <h3>${icon('puzzle', 16)}<span class="grow">Extensions</span></h3>
      ${p.items.length ? `<div class="ext-list">${p.items.map((x) => `<button class="ext-item" data-ext="${esc(x.id)}" title="${esc(x.title || x.name)}">
          <span class="ext-ic">${x.icon ? `<img src="${esc(x.icon)}" alt="">` : esc(x.name.charAt(0).toUpperCase())}${x.badge ? `<span class="ext-badge" style="background:${esc(x.badgeColor)}">${esc(x.badge)}</span>` : ''}</span>
          <span class="grow">${esc(x.name)}</span>${x.hasAction ? '' : '<span class="muted small">no button</span>'}</button>`).join('')}</div>` : empty}
      <div class="actions">${p.incognito ? '' : '<button class="btn" id="ex-store">Chrome Web Store</button>'}<button class="btn" id="ex-manage">Manage extensions</button></div>
    </div>`;
    placeCard(root.firstElementChild, p.anchor, 'right');
    root.querySelector('#ex-manage').addEventListener('click', () => run('extensions'));
    root.querySelector('#ex-store')?.addEventListener('click', () => run('open-web-store'));
    root.querySelectorAll('[data-ext]').forEach((b) => b.addEventListener('click', () => run('extension-action', { id: b.dataset.ext, x: p.anchor.x, y: p.anchor.y })));
  });
})();
