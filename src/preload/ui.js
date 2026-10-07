'use strict';
// Preload for Opal's own UI views (browser chrome, overlay, AI panel).
// Exposes a minimal, allow-listed bridge. Arguments are validated again in main.
const { contextBridge, ipcRenderer } = require('electron');

const EVENTS = ['state', 'focus-address', 'find', 'overlay', 'omnibox', 'ai', 'toast'];

contextBridge.exposeInMainWorld('opal', {
  cmd: (name, args) => ipcRenderer.send('ui:cmd', String(name), args ?? {}),
  layout: (rects) => ipcRenderer.send('ui:layout', rects),
  ready: () => ipcRenderer.send('ui:ready'),
  on: (event, cb) => {
    if (!EVENTS.includes(event)) throw new Error('Unknown event: ' + event);
    const handler = (_e, data) => cb(data);
    ipcRenderer.on('ev:' + event, handler);
    return () => ipcRenderer.removeListener('ev:' + event, handler);
  },
});
