'use strict';
(async () => {
  const items = await window.opal.call('shortcuts.list');
  const list = document.getElementById('list');
  for (const it of items) {
    const row = document.createElement('div');
    row.className = 'row';
    const label = document.createElement('span');
    label.className = 'grow';
    label.textContent = it.label;
    row.append(label);
    for (const k of it.keys) {
      const kbd = document.createElement('kbd');
      kbd.textContent = k;
      row.append(kbd);
    }
    list.append(row);
  }
})();
