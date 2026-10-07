'use strict';
// Launches Opal with a throwaway user-data folder for each test.
const { _electron: electron } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '../..');
// Test profiles go on disk (not /tmp, which is RAM-backed on some systems) and are removed afterwards.
const TMP = path.join(ROOT, '.test-tmp');
fs.mkdirSync(TMP, { recursive: true });
const made = [];
function tempDir(prefix) {
  const d = fs.mkdtempSync(path.join(TMP, prefix));
  made.push(d);
  return d;
}
process.on('exit', () => { for (const d of made) fs.rmSync(d, { recursive: true, force: true }); });

async function launch({ userData, env = {}, args = [] } = {}) {
  const dir = userData || tempDir('opal-e2e-');
  // OPAL_PACKAGED=<path to the built binary> runs the tests against the packaged app.
  const packaged = process.env.OPAL_PACKAGED;
  const app = await electron.launch({
    ...(packaged ? { executablePath: packaged } : {}),
    args: packaged ? ['--ozone-platform=x11', ...args] : ['--ozone-platform=x11', ROOT, ...args],
    cwd: ROOT,
    env: {
      ...process.env,
      WAYLAND_DISPLAY: '',
      OPAL_USER_DATA: dir,
      OPAL_MULTI_INSTANCE: '1',
      OPAL_ALLOW_AUTOMATION: '1', // Playwright drives Opal through the remote debugging port
      OPAL_ONYX_DISABLED: env.OPAL_ONYX_DISABLED ?? '1',
      OPAL_OLLAMA_URL: env.OPAL_OLLAMA_URL ?? 'http://127.0.0.1:9', // never a real local Ollama in tests
      ...env,
    },
  });
  const ui = await uiPage(app);
  return { app, ui, dir };
}

// The browser chrome page (src/renderer/index.html).
async function uiPage(app, index = 0) {
  for (let i = 0; i < 400; i++) { // up to 40s: slow machines take a while to show the first window
    const pages = app.windows().filter((p) => p.url().includes('/src/renderer/index.html'));
    if (pages[index]) {
      await pages[index].waitForSelector('.tab', { timeout: 30000 });
      return pages[index];
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('UI window did not appear');
}

// Reads main-process state through the test hook.
function mainState(app, fn, arg) {
  return app.evaluate(fn, arg);
}

async function snapshot(app, i = 0) {
  return app.evaluate((_e, idx) => [...global.__opal.windows][idx].snapshot(), i);
}

async function waitFor(fn, { timeout = 15000, interval = 100 } = {}) {
  const end = Date.now() + timeout;
  let last;
  while (Date.now() < end) {
    try { last = await fn(); if (last) return last; } catch (e) { last = e; }
    await new Promise((r) => setTimeout(r, interval));
  }
  throw new Error('waitFor timed out' + (last instanceof Error ? ': ' + last.message : ''));
}

module.exports = { launch, uiPage, mainState, snapshot, waitFor, ROOT, tempDir };

// A tiny local web server so tests never depend on the internet.
function startServer() {
  const http = require('http');
  const server = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    const title = u.searchParams.get('title') || 'Test page';
    const body = u.searchParams.get('body') || '';
    let html = `<!doctype html><title>${title}</title><body><h1>${title}</h1><p>${body}</p>`;
    if (u.pathname === '/blank') html += '<a id="lnk" href="/page?title=Opened" target="_blank">open</a>';
    if (u.pathname === '/popup') html += '<button id="b" onclick="window.open(\'/page?title=Popup\')">pop</button>';
    if (u.pathname === '/ua') html = `<title>${req.headers['user-agent']}</title>`;
    if (u.pathname === '/download') {
      res.writeHead(200, { 'content-type': 'application/octet-stream', 'content-disposition': 'attachment; filename="opal-test.bin"', 'content-length': 200000 });
      res.end(Buffer.alloc(200000, 7));
      return;
    }
    if (u.pathname === '/form') {
      html = `<!doctype html><title>Form</title><body><input id="q" placeholder="Search"><button id="b" onclick="document.title='Clicked '+document.getElementById('q').value">Go</button>
        <form id="f" action="/page"><input name="title" value="Submitted"><input id="pw" type="password" autocomplete="current-password"><button type="submit">Send</button></form></body>`;
    }
    if (u.pathname === '/slow') {
      // Sends the head now and the rest later, so the tab stays loading for a while.
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.write('<!doctype html><title>Slow</title><body>start ');
      setTimeout(() => res.end('done</body>'), Number(u.searchParams.get('ms') || 3000));
      return;
    }
    if (u.pathname === '/article') {
      html = `<!doctype html><title>Long read</title><body><nav>menu menu</nav><article><h1>Long read</h1>${'<p>Opal reader mode keeps the article text and drops the clutter around it. '.repeat(3) + 'This paragraph is long enough to count as content.</p>'.repeat(12)}</article><footer>footer</footer>`;
    }
    if (u.pathname === '/video') html = `<title>Video</title><video id="v" src="/nope.webm" width="320" height="180"></video>`;
    if (u.pathname === '/perm') html = `<title>Perm</title><button id="b" onclick="Notification.requestPermission().then((r) => { document.title = r; })">go</button>`;
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(html);
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => {
    resolve({ url: `http://127.0.0.1:${server.address().port}`, close: () => server.close() });
  }));
}

module.exports.startServer = startServer;

// The overlay page (menus, suggestions, command bar).
async function overlayPage(app) {
  return waitFor(() => app.windows().find((p) => p.url().includes('/src/renderer/overlay.html')));
}

// Runs a main-process method on the first window: win(app, (w, arg) => ..., arg)
function win(app, fn, arg) {
  return app.evaluate((_e, [src, a]) => {
    const w = [...global.__opal.windows][0];
     
    return new Function('w', 'a', 'opal', `return (${src})(w, a, opal)`)(w, a, global.__opal);
  }, [fn.toString(), arg]);
}

module.exports.overlayPage = overlayPage;
module.exports.win = win;

// Starts the mock Onyx server with its discovery file in a temp folder.
async function startMockOnyx(opts = {}) {
  const mock = require('../../scripts/mock-onyx');
  const file = path.join(tempDir('onyx-'), 'onyx-opal.json');
  const m = await mock.start({ port: 0, file, delay: 10, ...opts });
  return { ...m, file };
}

async function aiPage(app) {
  return waitFor(() => app.windows().find((p) => p.url().includes('/src/renderer/ai.html')));
}

module.exports.startMockOnyx = startMockOnyx;
module.exports.aiPage = aiPage;
