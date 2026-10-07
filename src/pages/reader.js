'use strict';
// Shows a Readability article. The HTML is cleaned before it's inserted, and the
// page's CSP blocks scripts and inline handlers anyway.
const ALLOWED_TAGS = new Set(['P', 'A', 'EM', 'STRONG', 'B', 'I', 'U', 'S', 'SUB', 'SUP', 'BR', 'HR', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6',
  'UL', 'OL', 'LI', 'BLOCKQUOTE', 'PRE', 'CODE', 'IMG', 'FIGURE', 'FIGCAPTION', 'TABLE', 'THEAD', 'TBODY', 'TR', 'TD', 'TH',
  'DIV', 'SPAN', 'SECTION', 'ARTICLE', 'DL', 'DT', 'DD', 'SMALL', 'MARK', 'ABBR', 'TIME', 'PICTURE', 'SOURCE', 'CAPTION']);
const ALLOWED_ATTRS = new Set(['href', 'src', 'alt', 'title', 'colspan', 'rowspan', 'srcset', 'datetime']);

function clean(html, base) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const walk = (node) => {
    for (const child of [...node.children]) {
      if (!ALLOWED_TAGS.has(child.tagName)) { child.replaceWith(...(['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'FORM'].includes(child.tagName) ? [] : child.childNodes)); continue; }
      for (const attr of [...child.attributes]) {
        const v = attr.value.trim().toLowerCase();
        if (!ALLOWED_ATTRS.has(attr.name) || v.startsWith('javascript:') || v.startsWith('data:text')) child.removeAttribute(attr.name);
      }
      if (child.tagName === 'A' && child.getAttribute('href')) {
        try { child.setAttribute('href', new URL(child.getAttribute('href'), base).href); } catch { child.removeAttribute('href'); }
      }
      if (child.tagName === 'IMG' && child.getAttribute('src')) {
        try { child.setAttribute('src', new URL(child.getAttribute('src'), base).href); } catch { child.remove(); continue; }
      }
      walk(child);
    }
  };
  walk(doc.body);
  return doc.body.innerHTML;
}

let size = 18;
async function main() {
  const a = await window.opal.call('reader.get');
  if (!a) {
    document.getElementById('title').textContent = 'This article is no longer available';
    document.getElementById('content').textContent = 'Open the page again and switch to reader mode.';
    return;
  }
  document.title = a.title || 'Reader';
  document.getElementById('title').textContent = a.title || '';
  document.getElementById('byline').textContent = a.byline || '';
  document.getElementById('site').textContent = a.siteName || new URL(a.url).hostname;
  document.getElementById('orig').href = a.url;
  document.getElementById('content').innerHTML = clean(a.content, a.url);
  if (a.lang) document.documentElement.lang = a.lang;
}
document.getElementById('exit').addEventListener('click', () => history.back());
document.getElementById('bigger').addEventListener('click', () => { size = Math.min(26, size + 1); document.querySelector('article').style.fontSize = size + 'px'; });
document.getElementById('smaller').addEventListener('click', () => { size = Math.max(14, size - 1); document.querySelector('article').style.fontSize = size + 'px'; });
main();
