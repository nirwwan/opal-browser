'use strict';
(async () => {
  const i = await window.opal.call('about.info');
  const rows = [['Version', i.version], ['Opal AI', i.ai], ['Electron', i.electron], ['Chromium', i.chrome], ['Node.js', i.node], ['V8', i.v8], ['Profile folder', i.userData]];
  const dl = document.getElementById('info');
  for (const [k, v] of rows) {
    const dt = document.createElement('dt'); dt.textContent = k;
    const dd = document.createElement('dd'); dd.textContent = v;
    dl.append(dt, dd);
  }
  if (i.logo) {
    const img = document.getElementById('logo');
    const dark = matchMedia('(prefers-color-scheme: dark)').matches;
    img.src = dark ? 'logo-dark.png' : 'logo-light.png';
    if (i.logo.wordmark) { img.classList.add('wordmark'); document.getElementById('name').hidden = true; }
    img.hidden = false;
  }
})();
