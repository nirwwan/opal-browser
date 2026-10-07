'use strict';
// Translate this page through Opal AI. The page's text nodes are numbered in an
// isolated world, sent to Onyx in chunks ("N<TAB>text" lines) and replaced in place
// as each chunk comes back. "Show original" puts the saved text back.

const WORLD = 1003;
const CHUNK = 3500;
const MAX_NODES = 1500;

const COLLECT = `(() => {
  const st = window.__opalTr || (window.__opalTr = { nodes: [], originals: [] });
  if (st.nodes.length) for (let i = 0; i < st.nodes.length; i++) st.nodes[i].nodeValue = st.originals[i];
  st.nodes = []; st.originals = [];
  const skip = /^(SCRIPT|STYLE|NOSCRIPT|CODE|PRE|TEXTAREA|KBD|SAMP|SVG|MATH)$/;
  const walker = document.createTreeWalker(document.body || document.documentElement, NodeFilter.SHOW_TEXT, {
    acceptNode(n) {
      if (!/\\p{L}/u.test(n.nodeValue)) return NodeFilter.FILTER_REJECT;
      for (let e = n.parentElement; e; e = e.parentElement) {
        if (skip.test(e.tagName) || e.isContentEditable || e.getAttribute('translate') === 'no') return NodeFilter.FILTER_REJECT;
      }
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  const out = [];
  let n;
  while ((n = walker.nextNode()) && out.length < ${MAX_NODES}) {
    st.nodes.push(n); st.originals.push(n.nodeValue);
    out.push(n.nodeValue.replace(/\\s+/g, ' ').trim());
  }
  return out;
})()`;

const applyCode = (pairs) => `(() => {
  const st = window.__opalTr; if (!st) return 0;
  let k = 0;
  for (const [i, text] of ${JSON.stringify(pairs)}) {
    const node = st.nodes[i]; if (!node) continue;
    const orig = st.originals[i];
    node.nodeValue = (orig.match(/^\\s*/)[0]) + text + (orig.match(/\\s*$/)[0]);
    k++;
  }
  return k;
})()`;

const RESTORE = `(() => {
  const st = window.__opalTr; if (!st) return 0;
  for (let i = 0; i < st.nodes.length; i++) st.nodes[i].nodeValue = st.originals[i];
  const k = st.nodes.length; st.nodes = []; st.originals = []; return k;
})()`;

// Splits numbered texts into chunks of about CHUNK characters.
function chunks(texts) {
  const out = [];
  let cur = [];
  let len = 0;
  texts.forEach((t, i) => {
    if (!t) return;
    const line = `${i}\t${t.replace(/\t/g, ' ')}`;
    if (len + line.length > CHUNK && cur.length) { out.push(cur); cur = []; len = 0; }
    cur.push(line);
    len += line.length + 1;
  });
  if (cur.length) out.push(cur);
  return out;
}

// Reads "N<TAB>translation" lines back; ignores anything else the model adds.
function parseLines(text, allowed) {
  const out = [];
  for (const line of String(text || '').split('\n')) {
    const m = /^\s*(\d+)\t(.*)$/.exec(line) || /^\s*(\d+)[:.)]\s+(.*)$/.exec(line);
    if (!m) continue;
    const i = Number(m[1]);
    if (allowed && !allowed.has(i)) continue;
    out.push([i, m[2].trim()]);
  }
  return out;
}

function system(lang) {
  return `You translate web page text into ${lang}. Each input line is "N<TAB>text". Reply with exactly the same `
    + `numbers, one line each: "N<TAB>translation". Translate meaning naturally, keep names, numbers, URLs and code `
    + 'unchanged, and if a line is already in the target language, copy it. Output nothing else.';
}

function install(opal) {
  async function translate(w, a) {
    const pane = w.activePane;
    if (!pane?.view || !/^https?:|^file:/.test(pane.url)) {
      w.send('toast', { text: 'Only web pages can be translated' });
      return;
    }
    opal.runCommand(w, 'close-overlay', {});
    const wc = pane.view.webContents;
    if (a.lang === 'Original') {
      pane.translateAbort?.abort();
      await wc.executeJavaScriptInIsolatedWorld(WORLD, [{ code: RESTORE }]).catch(() => 0);
      pane.translated = null;
      w.send('toast', { text: 'Showing the original page' });
      return;
    }
    if (pane.translating) { w.send('toast', { text: 'Already translating this page…' }); return; }
    const lang = a.lang || opal.settings.get('translateTarget') || 'English';
    if (a.lang) opal.settings.set('translateTarget', a.lang);
    let texts = [];
    try { texts = await wc.executeJavaScriptInIsolatedWorld(WORLD, [{ code: COLLECT }]); } catch { texts = []; }
    const parts = chunks(texts || []);
    if (!parts.length) { w.send('toast', { text: 'No text to translate on this page' }); return; }
    const provider = opal.ai.get().provider === 'both' ? 'claude' : opal.ai.get().provider;
    const ac = new AbortController();
    pane.translating = true;
    pane.translateAbort = ac;
    const url = pane.url;
    let done = 0;
    let failed = null;
    w.send('toast', { text: `Opal AI is translating to ${lang}…` });
    try {
      for (const part of parts) {
        if (ac.signal.aborted || pane.url !== url || wc.isDestroyed()) break;
        const allowed = new Set(part.map((l) => Number(l.split('\t')[0])));
        const reply = await opal.llm.chat({
          provider,
          system: system(lang),
          messages: [{ role: 'user', content: `Translate to ${lang}:\n${part.join('\n')}` }],
        }, () => {}, ac.signal);
        const pairs = parseLines(reply, allowed);
        if (pairs.length) await wc.executeJavaScriptInIsolatedWorld(WORLD, [{ code: applyCode(pairs) }]).catch(() => 0);
        done++;
      }
    } catch (err) {
      failed = err;
    } finally {
      pane.translating = false;
      pane.translateAbort = null;
    }
    if (failed && failed.code !== 'aborted') {
      const offline = ['offline', 'bad-config', 'not-configured'].includes(failed.code);
      w.send('toast', { text: offline ? `Can't translate: ${failed.message}` : `Translation stopped: ${failed.message}` });
      if (!done) return;
    }
    pane.translated = lang;
    wc.once('did-navigate', () => { pane.translated = null; });
    if (!failed) w.send('toast', { text: `Translated to ${lang}. Use Translate again to show the original.` });
  }

  opal.addCommands({ translate: (w, a) => { translate(w, a || {}); } });
  opal.popoverProviders.translate = (w) => ({
    target: opal.settings.get('translateTarget') || 'English',
    translated: w.activePane?.translated || null,
    busy: !!w.activePane?.translating,
  });
  opal.translatePage = translate;
}

module.exports = { install, chunks, parseLines };
