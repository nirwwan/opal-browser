'use strict';
// Reader mode: Mozilla Readability runs in an isolated world of the page, and
// the article is shown on opal://reader in the same tab (Back returns).

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const READABILITY = path.join(__dirname, '../../node_modules/@mozilla/readability/Readability.js');
let source = null;

function readabilitySource() {
  if (!source) source = fs.readFileSync(READABILITY, 'utf8');
  return source;
}

// Runs Readability on a webContents. Returns the article or null.
async function extract(wc) {
  const code = `${readabilitySource()}
    ;(() => {
      try {
        const doc = document.cloneNode(true);
        const a = new Readability(doc, { charThreshold: 300 }).parse();
        return a ? { title: a.title, byline: a.byline, siteName: a.siteName, content: a.content, textContent: a.textContent, excerpt: a.excerpt, lang: a.lang } : null;
      } catch (e) { return null; }
    })()`;
  return wc.executeJavaScriptInIsolatedWorld(1001, [{ code }], false);
}

// Script results can wait a long time while a page is still loading; never let a
// question hang on that.
function withTimeout(p, ms, fallback) {
  return Promise.race([p, new Promise((r) => setTimeout(() => r(fallback), ms))]);
}

// Plain page text for the AI panel (no Readability needed for short pages).
// Gives up after ~5s (the question then goes without page text).
async function pageText(wc, max = 60000) {
  return withTimeout(pageTextNow(wc, max), 5000, '');
}

async function pageTextNow(wc, max) {
  let text = '';
  try {
    const art = await extract(wc);
    text = art?.textContent || '';
  } catch { /* fall through */ }
  if (text.trim().length < 200) {
    try { text = await wc.executeJavaScriptInIsolatedWorld(1002, [{ code: 'document.body ? document.body.innerText : ""' }], false); } catch { text = ''; }
  }
  return text.replace(/\n{3,}/g, '\n\n').trim().slice(0, max);
}

function install(opal) {
  const articles = new Map(); // id -> article (kept for the session only)

  opal.reader = { extract, pageText };

  opal.addCommands({
    'reader-mode': async (w) => {
      const pane = w.activePane;
      if (!pane?.view) return;
      const wc = pane.view.webContents;
      if (pane.url.startsWith('opal://reader')) {
        if (wc.navigationHistory.canGoBack()) wc.navigationHistory.goBack();
        return;
      }
      if (!/^https?:/.test(pane.url)) return;
      let article = null;
      try { article = await extract(wc); } catch { article = null; }
      if (!article || !article.content) {
        w.send('toast', { text: "Reader mode isn't available for this page" });
        return;
      }
      const id = crypto.randomBytes(8).toString('hex');
      articles.set(id, { ...article, url: pane.url });
      if (articles.size > 50) articles.delete(articles.keys().next().value);
      wc.loadURL('opal://reader/?id=' + id).catch(() => {});
    },
  });

  opal.addPageCalls({
    'reader.get': (_a, ctx) => {
      const id = new URL(ctx.url).searchParams.get('id');
      return articles.get(id) || null;
    },
  });
}

module.exports = { install, extract, pageText };
