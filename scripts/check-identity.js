#!/usr/bin/env node
'use strict';
// Launches Opal normally (no Playwright, no debugging port) and checks that it presents
// as stable Chrome: navigator.webdriver false, Chrome brands in navigator.userAgentData,
// Chrome user agent, and no automation switches on any Opal process.
//
// Usage: xvfb-run -a node scripts/check-identity.js [path to opal binary]
//        (default: the development app via node_modules/electron)

const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const binary = process.argv[2];

const PAGE = `<!doctype html><title>check</title><script>
(async () => {
  const d = navigator.userAgentData;
  const hi = d ? await d.getHighEntropyValues(['fullVersionList', 'uaFullVersion']) : null;
  const r = { webdriver: navigator.webdriver, ua: navigator.userAgent, brands: d && d.brands, fullVersionList: hi && hi.fullVersionList,
    languages: navigator.languages, brandsGetter: Object.getOwnPropertyDescriptor(NavigatorUAData.prototype, 'brands').get.toString() };
  fetch('/report', { method: 'POST', body: JSON.stringify(r) });
})();
</script>`;

function main() {
  const userData = fs.mkdtempSync(path.join(ROOT, '.test-tmp', 'identity-'));
  let child;
  let headers = null;
  const server = http.createServer((req, res) => {
    if (req.url === '/') { headers = req.headers; res.writeHead(200, { 'content-type': 'text/html' }); res.end(PAGE); return; }
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      res.end('ok');
      if (req.url !== '/report') return;
      const r = JSON.parse(body);
      const flags = processFlags(child.pid);
      const problems = [];
      if (r.webdriver !== false) problems.push(`navigator.webdriver is ${r.webdriver}`);
      if (/Electron|opal/i.test(r.ua)) problems.push('user agent has Electron/Opal tokens');
      if (!/Chrome\/\d+\.0\.0\.0 Safari/.test(r.ua)) problems.push('user agent is not the reduced Chrome form');
      if (!r.brands || !r.brands.some((b) => b.brand === 'Google Chrome')) problems.push('no "Google Chrome" brand');
      if (JSON.stringify(r.brands).includes('Electron')) problems.push('"Electron" in brands');
      if (!/\[native code\]/.test(r.brandsGetter)) problems.push('brands getter does not look native');
      if (!headers['sec-ch-ua'] || !headers['sec-ch-ua'].includes('Google Chrome')) problems.push('no Sec-CH-UA header with Google Chrome');
      if (flags.length) problems.push('automation switches: ' + flags.join(' '));
      console.log(JSON.stringify({ page: r, secChUa: headers['sec-ch-ua'], acceptLanguage: headers['accept-language'], automationFlags: flags }, null, 2));
      console.log(problems.length ? 'FAIL\n- ' + problems.join('\n- ') : 'PASS: Opal presents as stable Chrome');
      child.kill();
      server.close();
      setTimeout(() => { fs.rmSync(userData, { recursive: true, force: true }); process.exit(problems.length ? 1 : 0); }, 1500);
    });
  });
  server.listen(0, '127.0.0.1', () => {
    const url = `http://localhost:${server.address().port}/`;
    const env = { ...process.env, OPAL_USER_DATA: userData, OPAL_MULTI_INSTANCE: '1', OPAL_ONYX_DISABLED: '1', OPAL_NO_RESTORE: '1' };
    delete env.OPAL_ALLOW_AUTOMATION;
    const cmd = binary || require(path.join(ROOT, 'node_modules/electron'));
    const args = binary ? [url] : [ROOT, url];
    child = spawn(cmd, ['--ozone-platform=x11', ...args], { env, stdio: 'ignore' });
    setTimeout(() => { console.log('FAIL: no report within 60s'); child.kill(); process.exit(1); }, 60000).unref();
  });
}

// Automation switches on the Opal process and all its children (renderers, GPU, utility).
function processFlags(rootPid) {
  const bad = /--(enable-automation|remote-debugging-port|remote-debugging-pipe|headless|inspect(-brk)?)(=|\b)/;
  const found = new Set();
  let pids = [String(rootPid)];
  try {
    const all = execFileSync('ps', ['-eo', 'pid=,ppid='], { encoding: 'utf8' }).trim().split('\n').map((l) => l.trim().split(/\s+/));
    for (let i = 0; i < 5; i++) pids = [...new Set([...pids, ...all.filter(([, pp]) => pids.includes(pp)).map(([p]) => p)])];
  } catch { /* ps missing: check the root only */ }
  for (const pid of pids) {
    try {
      const args = fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8').split('\0');
      for (const a of args) if (bad.test(a)) found.add(a);
    } catch { /* exited */ }
  }
  return [...found];
}

fs.mkdirSync(path.join(ROOT, '.test-tmp'), { recursive: true });
if (os.platform() === 'linux') main();
