'use strict';
// Client for Onyx's local server. Only the main process talks to Onyx: the token
// is read here and never sent to any renderer or web page.

const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');

class OnyxError extends Error {
  constructor(message, code) {
    super(message);
    this.code = code; // 'offline' | 'auth' | 'http' | 'aborted' | 'bad-config'
  }
}

// Where Onyx writes {url, token}. Settings can override it (onyxTokenFile).
function discoveryFiles(override) {
  const files = [];
  if (override) files.push(override);
  if (process.env.OPAL_ONYX_FILE) files.push(process.env.OPAL_ONYX_FILE);
  if (process.env.XDG_RUNTIME_DIR) files.push(path.join(process.env.XDG_RUNTIME_DIR, 'onyx-opal.json'));
  files.push(path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'), 'onyx', 'onyx-opal.json'));
  return files;
}

// Reads the discovery file. Refuses files other users can read and URLs that
// aren't on this machine, so the token can't leak.
function readConnection(override, fallbackUrl = 'http://127.0.0.1:7777') {
  for (const file of discoveryFiles(override)) {
    let st;
    try { st = fs.statSync(file); } catch { continue; }
    if ((st.mode & 0o077) !== 0) throw new OnyxError(`${file} is readable by other users; Onyx should create it with mode 600`, 'bad-config');
    let info;
    try { info = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { throw new OnyxError(`${file} is not valid JSON`, 'bad-config'); }
    const url = new URL(info.url || fallbackUrl);
    if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) || url.protocol !== 'http:') {
      throw new OnyxError('Onyx must run on 127.0.0.1', 'bad-config');
    }
    if (!info.token || typeof info.token !== 'string') throw new OnyxError(`${file} has no token`, 'bad-config');
    return { url: url.origin, token: info.token, file };
  }
  return null;
}

class OnyxClient {
  constructor({ tokenFile, url, disabled = false } = {}) {
    this.tokenFile = tokenFile;
    this.fallbackUrl = url;
    this.disabled = disabled;
    this.status = { connected: false, checked: false, error: null };
  }

  connection() {
    if (this.disabled) throw new OnyxError('Onyx connection is turned off', 'offline');
    const c = readConnection(this.tokenFile, this.fallbackUrl);
    if (!c) throw new OnyxError("Onyx isn't running", 'offline');
    return c;
  }

  // Low-level request. onLine (optional) gets each NDJSON line of a streamed reply.
  request(method, urlPath, body, { timeout = 10000, signal, onLine } = {}) {
    return new Promise((resolve, reject) => {
      let c;
      try { c = this.connection(); } catch (e) { reject(e); return; }
      const u = new URL(urlPath, c.url);
      const data = body === undefined ? null : Buffer.from(JSON.stringify(body));
      const req = http.request(u, {
        method,
        headers: {
          authorization: `Bearer ${c.token}`,
          accept: onLine ? 'application/x-ndjson' : 'application/json',
          ...(data ? { 'content-type': 'application/json', 'content-length': data.length } : {}),
        },
        timeout,
      }, (res) => {
        if (res.statusCode === 401 || res.statusCode === 403) {
          res.resume();
          reject(new OnyxError('Onyx refused the token. Restart Onyx, then try again.', 'auth'));
          return;
        }
        if (res.statusCode >= 400) {
          let t = '';
          res.on('data', (d) => { t += d; });
          res.on('end', () => {
            let msg = `Onyx error ${res.statusCode}`;
            try { msg = JSON.parse(t).error || msg; } catch { /* plain text */ }
            reject(new OnyxError(msg, 'http'));
          });
          return;
        }
        res.setEncoding('utf8');
        if (onLine) {
          let buf = '';
          res.on('data', (chunk) => {
            buf += chunk;
            let i;
            while ((i = buf.indexOf('\n')) >= 0) {
              const line = buf.slice(0, i).trim();
              buf = buf.slice(i + 1);
              if (line) { try { onLine(JSON.parse(line)); } catch { /* ignore a bad line */ } }
            }
          });
          res.on('end', () => {
            if (buf.trim()) { try { onLine(JSON.parse(buf)); } catch { /* ignore */ } }
            resolve(null);
          });
          res.on('error', (e) => reject(signal?.aborted ? new OnyxError('Stopped', 'aborted') : new OnyxError(e.message, 'offline')));
        } else {
          let t = '';
          res.on('data', (d) => { t += d; });
          res.on('end', () => { try { resolve(t ? JSON.parse(t) : null); } catch { reject(new OnyxError('Onyx sent a bad reply', 'http')); } });
        }
      });
      req.on('timeout', () => req.destroy(new OnyxError('Onyx did not answer in time', 'offline')));
      req.on('error', (e) => {
        if (e instanceof OnyxError) reject(e);
        else if (signal?.aborted) reject(new OnyxError('Stopped', 'aborted'));
        else reject(new OnyxError("Onyx isn't running", 'offline'));
      });
      if (signal) {
        if (signal.aborted) { req.destroy(); return; }
        signal.addEventListener('abort', () => req.destroy(), { once: true });
      }
      if (data) req.write(data);
      req.end();
    });
  }

  async health() {
    try {
      const h = await this.request('GET', '/health', undefined, { timeout: 2500 });
      this.status = { connected: !!h?.ok, checked: true, error: null, version: h?.version, providers: h?.providers || {} };
    } catch (e) {
      this.status = { connected: false, checked: true, error: e.message, code: e.code };
    }
    return this.status;
  }

  // Streams a chat reply. onDelta(text) is called for each piece; resolves with the full text.
  async chat({ provider, messages, system, pageText }, onDelta, signal) {
    let full = '';
    let error = null;
    await this.request('POST', '/ai/chat', { provider, messages, system, pageText }, {
      timeout: 300000,
      signal,
      onLine: (ev) => {
        if (ev.type === 'delta' && typeof ev.text === 'string') { full += ev.text; onDelta?.(ev.text); }
        else if (ev.type === 'error') error = ev.message || 'Onyx reported an error';
      },
    });
    if (error) throw new OnyxError(error, 'http');
    return full;
  }

  getStorage(kind) {
    return this.request('GET', '/storage/' + kind);
  }

  putStorage(kind, data) {
    return this.request('PUT', '/storage/' + kind, { data }, { timeout: 15000 });
  }
}

module.exports = { OnyxClient, OnyxError, readConnection, discoveryFiles };
