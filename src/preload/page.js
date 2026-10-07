'use strict';
// Preload for web content views. Ordinary web pages get nothing.
// Opal's own pages (opal://history, opal://settings ...) get a small call bridge;
// the main process also checks the sender's URL before answering.
const { contextBridge, ipcRenderer } = require('electron');

const EVENTS = ['downloads', 'history', 'settings', 'bookmarks', 'extensions', 'onyx'];

// Web pages see the same brands as Chrome in navigator.userAgentData (main process
// passes them in; Electron's own list says "Chromium" only). Runs before page scripts.
const uaArg = process.argv.find((a) => a.startsWith('--opal-ua-data='));
if (uaArg && /^https?:$/.test(location.protocol) && contextBridge.executeInMainWorld) {
  try {
    const data = JSON.parse(decodeURIComponent(uaArg.slice('--opal-ua-data='.length)));
    contextBridge.executeInMainWorld({ func: patchUserAgentData, args: [data] });
    contextBridge.executeInMainWorld({ func: addChromeObject });
  } catch { /* leave the defaults */ }
}

// Runs in the page's main world.
function patchUserAgentData(data) {
  const P = globalThis.NavigatorUAData && globalThis.NavigatorUAData.prototype;
  if (!P) return;
  const copy = (list) => list.map((b) => ({ brand: b.brand, version: b.version }));
  const own = new WeakSet();
  const nativeToString = Function.prototype.toString;
  const toString = function toString() {
    if (own.has(this)) return `function ${this.name.replace(/^bound /, '')}() { [native code] }`;
    return nativeToString.call(this);
  };
  own.add(toString);
  const brandsDesc = Object.getOwnPropertyDescriptor(P, 'brands');
  const hev = P.getHighEntropyValues;
  const toJSONOrig = P.toJSON;
  const get = { get brands() { return copy(data.brands); } };
  const brandsGetter = Object.getOwnPropertyDescriptor(get, 'brands').get;
  const methods = {
    getHighEntropyValues(hints) {
      return hev.call(this, hints).then((v) => {
        const out = { ...v, brands: copy(data.brands) };
        if ('fullVersionList' in v) out.fullVersionList = copy(data.fullVersionList);
        if ('uaFullVersion' in v) out.uaFullVersion = data.fullVersion;
        return out;
      });
    },
    toJSON() { const v = toJSONOrig.call(this); return { ...v, brands: copy(data.brands) }; },
  };
  for (const fn of [brandsGetter, methods.getHighEntropyValues, methods.toJSON]) own.add(fn);
  Object.defineProperty(P, 'brands', { ...brandsDesc, get: brandsGetter });
  Object.defineProperty(P, 'getHighEntropyValues', { ...Object.getOwnPropertyDescriptor(P, 'getHighEntropyValues'), value: methods.getHighEntropyValues });
  Object.defineProperty(P, 'toJSON', { ...Object.getOwnPropertyDescriptor(P, 'toJSON'), value: methods.toJSON });
  Object.defineProperty(Function.prototype, 'toString', { ...Object.getOwnPropertyDescriptor(Function.prototype, 'toString'), value: toString });
}

// Runs in the page's main world. Chrome pages have window.chrome.app, chrome.csi() and
// chrome.loadTimes(); Electron's window.chrome is empty, which marks it as an embedded browser.
function addChromeObject() {
  const chrome = globalThis.chrome || {};
  if (chrome.app && chrome.csi && chrome.loadTimes) return;
  const native = new WeakSet();
  const nativeToString = Function.prototype.toString;
  const fnToString = Object.getOwnPropertyDescriptor(Function.prototype, 'toString');
  const toString = function toString() { return native.has(this) ? `function ${this.name}() { [native code] }` : nativeToString.call(this); };
  native.add(toString);
  Object.defineProperty(Function.prototype, 'toString', { ...fnToString, value: toString });
  const fn = (name, impl) => { const f = { [name](...a) { return impl.apply(this, a); } }[name]; native.add(f); return f; };
  const nav = () => performance.getEntriesByType('navigation')[0] || {};
  const paint = () => (performance.getEntriesByName('first-paint')[0] || {}).startTime || 0;
  const origin = performance.timeOrigin;
  if (!chrome.app) {
    chrome.app = {
      isInstalled: false,
      InstallState: { DISABLED: 'disabled', INSTALLED: 'installed', NOT_INSTALLED: 'not_installed' },
      RunningState: { CANNOT_RUN: 'cannot_run', READY_TO_RUN: 'ready_to_run', RUNNING: 'running' },
      getDetails: fn('getDetails', () => null),
      getIsInstalled: fn('getIsInstalled', () => false),
      installState: fn('installState', (cb) => { if (typeof cb === 'function') setTimeout(() => cb('not_installed'), 0); }),
      runningState: fn('runningState', () => 'cannot_run'),
    };
  }
  if (!chrome.csi) {
    chrome.csi = fn('csi', () => ({ startE: Math.round(origin), onloadT: Math.round(origin + (nav().domContentLoadedEventEnd || 0)), pageT: performance.now(), tran: 15 }));
  }
  if (!chrome.loadTimes) {
    chrome.loadTimes = fn('loadTimes', () => {
      const n = nav();
      const proto = n.nextHopProtocol || 'http/1.1';
      return {
        requestTime: (origin + (n.requestStart || 0)) / 1000, startLoadTime: origin / 1000,
        commitLoadTime: (origin + (n.responseStart || 0)) / 1000, finishDocumentLoadTime: (origin + (n.domContentLoadedEventEnd || 0)) / 1000,
        finishLoadTime: (origin + (n.loadEventEnd || 0)) / 1000, firstPaintTime: (origin + paint()) / 1000, firstPaintAfterLoadTime: 0,
        navigationType: n.type === 'reload' ? 'Reload' : n.type === 'back_forward' ? 'BackForward' : 'Other',
        wasFetchedViaSpdy: proto === 'h2' || proto === 'h3', wasNpnNegotiated: proto === 'h2' || proto === 'h3', npnNegotiatedProtocol: proto,
        wasAlternateProtocolAvailable: false, connectionInfo: proto,
      };
    });
  }
  if (!globalThis.chrome) Object.defineProperty(globalThis, 'chrome', { value: chrome, writable: true, configurable: false, enumerable: true });
}

if (location.protocol === 'opal:') {
  contextBridge.exposeInMainWorld('opal', {
    call: (name, args) => ipcRenderer.invoke('page:call', String(name), args ?? {}),
    on: (event, cb) => {
      if (!EVENTS.includes(event)) throw new Error('Unknown event: ' + event);
      const handler = (_e, data) => cb(data);
      ipcRenderer.on('page:' + event, handler);
      return () => ipcRenderer.removeListener('page:' + event, handler);
    },
  });
}
