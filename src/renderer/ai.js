'use strict';
/* global icon, OpalSlash, OpalThinking */
// Opal AI panel. State comes from main; questions go to main, which talks to the chosen AI backend.

const api = window.opal;
const $ = (s) => document.querySelector(s);
let S = null;
let usePage = true;
const STATUS_WORDS = ['Reading the page…', 'Catching the light…', 'Cutting facets…', 'Turning the stone…', 'Sifting tabs…'];

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Small, safe Markdown: code blocks, inline code, bold, italic, links, lists, paragraphs.
function md(text) {
  const blocks = [];
  let src = String(text || '').replace(/```(\w*)\n?([\s\S]*?)(```|$)/g, (_m, _lang, code) => {
    blocks.push(`<pre><code>${esc(code.replace(/\n$/, ''))}</code></pre>`);
    return `\u0000${blocks.length - 1}\u0000`;
  });
  src = esc(src);
  const inline = (s) => s
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2">$1</a>');
  const out = [];
  let list = null;
  for (const line of src.split('\n')) {
    const ul = /^\s*[-*]\s+(.*)$/.exec(line);
    const ol = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    if (ul || ol) {
      const type = ul ? 'ul' : 'ol';
      if (!list || list.type !== type) { if (list) out.push(`</${list.type}>`); list = { type }; out.push(`<${type}>`); }
      out.push(`<li>${inline((ul || ol)[1])}</li>`);
      continue;
    }
    if (list) { out.push(`</${list.type}>`); list = null; }
    if (/^\u0000\d+\u0000$/.test(line.trim())) { out.push(line.trim()); continue; }
    if (line.trim()) out.push(`<p>${inline(line)}</p>`);
  }
  if (list) out.push(`</${list.type}>`);
  return out.join('').replace(/\u0000(\d+)\u0000/g, (_m, i) => blocks[Number(i)]);
}

function paintIcons() {
  $('#reopen').innerHTML = icon('sparkles', 18);
  $('#spark').innerHTML = icon('sparkles', 17);
  $('#new-chat').innerHTML = icon('square-pen', 15);
  $('#chats-btn').innerHTML = icon('history', 15);
  $('#collapse').innerHTML = icon('panel-right-close', 16);
  $('#r-ic').innerHTML = icon('book-open', 13);
  $('#send').innerHTML = icon('arrow-up', 16);
}

// ---------- rendering ----------
function render() {
  if (!S) return;
  document.documentElement.style.setProperty('--accent', S.accent);
  OpalThinking.configure({ oneColor: !!S.ai.oneColorDots, accent: S.accent });
  document.body.classList.toggle('collapsed', !!S.ai.collapsed);
  $('#strip').hidden = !S.ai.collapsed;
  const size = S.ai.width <= 340 ? 'S' : S.ai.width >= 500 ? 'L' : S.ai.width >= 390 && S.ai.width <= 410 ? 'M' : '';
  document.querySelectorAll('#sizes button').forEach((b) => b.classList.toggle('on', b.dataset.size === size));
  // Provider switch: only what the backend offers (Ollama has a single model, no switch).
  const offered = (S.llm && S.llm.providers) || [];
  const showSwitch = offered.includes('claude') || offered.includes('openai');
  $('#providers').hidden = !showSwitch;
  const current = S.ai.provider === 'both' ? (offered.includes('claude') && offered.includes('openai') ? 'both' : offered[0]) : (offered.includes(S.ai.provider) ? S.ai.provider : offered[0]);
  document.querySelectorAll('#providers button').forEach((b) => {
    const p = b.dataset.provider;
    b.hidden = p === 'both' ? !(offered.includes('claude') && offered.includes('openai')) : !offered.includes(p);
    b.classList.toggle('on', p === current);
  });
  // Reading strip
  const readable = S.page.readable;
  $('#reading').hidden = !readable;
  $('#r-title').textContent = S.page.title || S.page.url;
  $('#reading').classList.toggle('off', !usePage);
  $('#r-toggle').innerHTML = icon(usePage ? 'x' : 'plus', 13);
  $('#r-toggle').title = usePage ? "Don't use this page" : 'Use this page';
  // Offline
  const L = S.llm || {};
  $('#setup').hidden = !(L.setupNeeded && L.checked);
  const offline = !!L.backend && L.checked && !L.ready;
  $('#offline').hidden = !offline;
  if (offline) {
    const hints = {
      onyx: ['Onyx isn\'t running', 'Start Onyx, then try again. Or choose another backend in Settings.'],
      ollama: ['Ollama isn\'t ready', 'Start Ollama (ollama serve) and pull a model, for example: ollama pull llama3.2'],
      keys: ['Add an API key', 'Save a Claude or OpenAI API key in Settings.'],
      off: ['Opal AI is off', 'Turn it on in Settings.'],
    }[L.backend] || ['Opal AI isn\'t ready', ''];
    $('#o-title').textContent = L.backend === 'onyx' && /isn't running/.test(L.error || '') ? "Onyx isn't running" : hints[0];
    $('#o-body').textContent = hints[1];
    $('#o-detail').textContent = L.error && L.error !== hints[0] && !/isn't running/.test(L.error) ? L.error : '';
  }
  // Busy
  $('#stop').hidden = !S.busy && !(S.agent && S.agent.running);
  $('#send').disabled = !!S.busy;
  document.querySelectorAll('.quick button').forEach((b) => { b.disabled = !!S.busy; });
  setStatus(S.busy, S.busyLabel);
  renderMessages();
  renderAgent();
  renderChats();
}

let chatsOpen = false;
function renderChats() {
  const box = $('#chats');
  box.hidden = !chatsOpen;
  $('#chats-btn').classList.toggle('on', chatsOpen);
  if (!chatsOpen) return;
  const list = S.incognito ? [] : S.chats || [];
  box.innerHTML = list.length
    ? list.map((c) => `<div class="chat-row ${c.id === S.chat.id ? 'current' : ''}"><button class="chat-open" data-chat="${esc(c.id)}">${esc(c.title)}</button><button class="icon-btn small" data-del-chat="${esc(c.id)}" title="Delete chat" aria-label="Delete chat">${icon('x', 12)}</button></div>`).join('')
    : `<div class="muted">${S.incognito ? 'Chats aren\'t saved in incognito.' : 'No saved chats yet.'}</div>`;
}

let statusTimer = null;
let statusStart = 0;
function setStatus(busy, label) {
  const st = $('#status');
  const canvas = $('#thinking');
  const text = $('#status-text');
  if (busy) {
    if (st.hidden || !canvas.dataset.thinking) {
      statusStart = Date.now();
      st.hidden = false;
      delete canvas.dataset.doneAt;
      canvas.dataset.thinking = '24';
      OpalThinking.kick();
      let i = Math.max(0, STATUS_WORDS.indexOf(label));
      text.textContent = label || STATUS_WORDS[0];
      clearInterval(statusTimer);
      statusTimer = setInterval(() => { i = (i + 1) % STATUS_WORDS.length; text.textContent = STATUS_WORDS[i]; }, 3200);
    }
    text.classList.add('shimmer');
  } else if (!st.hidden && canvas.dataset.thinking && !canvas.dataset.doneAt) {
    clearInterval(statusTimer);
    OpalThinking.finish(canvas);
    text.classList.remove('shimmer');
    const secs = Math.max(1, Math.round((Date.now() - statusStart) / 1000));
    text.textContent = `Polished for ${secs}s`;
  }
}

let rendered = new Map(); // message id -> element
function messageEl(m) {
  const el = document.createElement('div');
  el.className = 'msg ' + m.role;
  el.dataset.id = m.id;
  fillMessage(el, m);
  return el;
}

function fillMessage(el, m) {
  if (m.role === 'user') { el.textContent = m.content; return; }
  el.innerHTML = (m.label ? `<div class="label">${esc(m.label)}</div>` : '')
    + `<div class="body">${md(m.content)}</div>`
    + (m.error ? `<div class="err">${esc(m.error)}</div>` : '')
    + (m.plan ? planHtml(m.plan) : '');
  bindPlan(el, m);
}

function planHtml(plan) {
  if (!plan.items.length) return '';
  return `<div class="plan">${plan.items.map((p) => `<div class="plan-row"><span class="dot" style="background:${esc(p.color)}"></span><span class="t">${esc(p.title)}</span><span class="muted">→ ${esc(p.space)}</span></div>`).join('')}
    <div class="acts">${plan.applied ? '<span class="muted">Moved.</span>' : '<button class="btn" data-plan="skip">Not now</button><button class="btn primary" data-plan="apply">Move tabs</button>'}</div></div>`;
}

function bindPlan(el, m) {
  el.querySelectorAll('[data-plan]').forEach((b) => b.addEventListener('click', () => {
    if (b.dataset.plan === 'apply') api.cmd('ai-apply-sort', { plan: m.plan.items.map((p) => ({ tabId: p.tabId, spaceId: p.spaceId })) });
    m.plan.applied = true;
    fillMessage(el, m);
  }));
}

function renderMessages() {
  const box = $('#messages');
  const msgs = S.chat.messages;
  if (!msgs.length) {
    rendered = new Map();
    box.innerHTML = `<div class="hello"><b>Ask about this page, your tabs, or anything else.</b><br>
      Opal AI reads the page only when you ask. Try a quick action below, or type / for commands.</div>`;
    return;
  }
  if (box.querySelector('.hello')) box.innerHTML = '';
  const ids = new Set(msgs.map((m) => m.id));
  for (const [id, el] of rendered) if (!ids.has(id)) { el.remove(); rendered.delete(id); }
  for (const m of msgs) {
    let el = rendered.get(m.id);
    if (!el) { el = messageEl(m); rendered.set(m.id, el); box.appendChild(el); } else if (!streaming.has(m.id)) fillMessage(el, m);
  }
  scrollDown();
}

function scrollDown() {
  const box = $('#messages');
  box.scrollTop = box.scrollHeight;
}

// ---------- agent log ----------
function renderAgent() {
  const a = S.agent;
  const box = $('#agent');
  if (!a || (!a.running && !a.steps.length)) { box.hidden = true; return; }
  box.hidden = false;
  const iconFor = { read_page: 'book-open', click: 'pin', type: 'keyboard', scroll: 'chevron-down', navigate: 'globe', new_tab: 'plus', switch_tab: 'layers', close_tab: 'x', submit: 'send', done: 'check', back: 'arrow-left', wait: 'loader', select: 'check', press: 'keyboard' };
  box.innerHTML = `<div class="a-head">${icon('sparkles', 14)}<span class="grow">Agent ${a.running ? 'working' : 'finished'}</span>${a.running ? '<button class="btn stop" id="a-stop">Stop</button>' : ''}</div>
    ${a.steps.map((s) => `<div class="a-step ${s.state}">${icon(s.state === 'blocked' || s.state === 'error' ? 'triangle-alert' : iconFor[s.action] || 'chevron-right', 13)}<span>${esc(s.text)}</span></div>`).join('')}
    ${a.confirm ? `<div class="confirm"><b>Confirm:</b> ${esc(a.confirm.text)}<div class="acts"><button class="btn" data-confirm="no">Don't</button><button class="btn primary" data-confirm="yes">Go ahead</button></div></div>` : ''}`;
  const stop = box.querySelector('#a-stop');
  if (stop) stop.addEventListener('click', () => api.cmd('ai-stop'));
  box.querySelectorAll('[data-confirm]').forEach((b) => b.addEventListener('click', () => api.cmd('ai-agent-confirm', { id: a.confirm.id, allow: b.dataset.confirm === 'yes' })));
  box.scrollTop = box.scrollHeight;
}

// ---------- streaming events ----------
const streaming = new Set();
api.on('ai', (ev) => {
  if (!S) return;
  if (ev.type === 'user') {
    S.chat.messages.push(ev.message);
    renderMessages();
  } else if (ev.type === 'start') {
    streaming.add(ev.message.id);
    S.chat.messages.push({ ...ev.message });
    renderMessages();
  } else if (ev.type === 'delta') {
    const m = S.chat.messages.find((x) => x.id === ev.id);
    if (!m) return;
    m.content += ev.text;
    const el = rendered.get(ev.id);
    if (el) el.querySelector('.body').innerHTML = md(m.content);
    scrollDown();
  } else if (ev.type === 'done' || ev.type === 'error') {
    streaming.delete(ev.id);
    const m = S.chat.messages.find((x) => x.id === ev.id);
    if (m && ev.type === 'error') { m.error = ev.message; m.offline = ev.offline; }
    if (m) { const el = rendered.get(ev.id); if (el) fillMessage(el, m); }
    scrollDown();
  }
});

api.on('state', (state) => {
  S = state;
  render();
});

// ---------- input ----------
const input = $('#input');
function autosize() {
  input.style.height = 'auto';
  input.style.height = Math.min(140, input.scrollHeight) + 'px';
}

function showSlashHints() {
  const hints = OpalSlash.suggestSlash(input.value);
  const box = $('#slash-hints');
  box.hidden = !hints.length || input.value.includes(' ');
  box.innerHTML = hints.map((h) => `<div><b>${esc(h.command)}</b><span>${esc(h.label)}</span></div>`).join('');
}

input.addEventListener('input', () => { autosize(); showSlashHints(); });
input.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); submit(); }
});
$('#composer').addEventListener('submit', (e) => { e.preventDefault(); submit(); });

function submit() {
  const text = input.value.trim();
  if (!text || S?.busy) return;
  const slash = OpalSlash.parseSlash(text);
  if (slash) {
    input.value = '';
    autosize();
    $('#slash-hints').hidden = true;
    if (slash.unknown) { flash(`Unknown command ${slash.command}. Try /hide, /collapse, /small, /medium or /large.`); return; }
    api.cmd('ai-set', slash.patch);
    return;
  }
  input.value = '';
  autosize();
  $('#slash-hints').hidden = true;
  if ($('#agent-mode').checked) api.cmd('ai-agent', { goal: text });
  else api.cmd('ai-ask', { text, includePage: usePage && !!S?.page.readable });
}

function flash(text) {
  const box = $('#messages');
  if (box.querySelector('.hello')) box.innerHTML = '';
  const el = document.createElement('div');
  el.className = 'msg assistant';
  el.innerHTML = `<div class="meta">${esc(text)}</div>`;
  box.appendChild(el);
  setTimeout(() => el.remove(), 5000);
  scrollDown();
}

// ---------- buttons ----------
document.addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.dataset.size) return api.cmd('ai-set', { size: b.dataset.size });
  if (b.dataset.chat) { chatsOpen = false; rendered = new Map(); $('#messages').innerHTML = ''; return api.cmd('ai-open-chat', { id: b.dataset.chat }); }
  if (b.dataset.delChat) return api.cmd('ai-delete-chat', { id: b.dataset.delChat });
  if (b.dataset.provider) return api.cmd('ai-set', { provider: b.dataset.provider });
  if (b.dataset.action) return api.cmd('ai-ask', { text: b.textContent, action: b.dataset.action, includePage: usePage });
  switch (b.id) {
    case 'chats-btn': chatsOpen = !chatsOpen; return renderChats();
    case 'reopen': return api.cmd('ai-set', { collapsed: false, open: true });
    case 'collapse': return api.cmd('ai-set', { collapsed: true });
    case 'new-chat': rendered = new Map(); $('#messages').innerHTML = ''; return api.cmd('ai-new-chat');
    case 'r-toggle': usePage = !usePage; return render();
    case 'retry':
    case 'setup-retry': return api.cmd('ai-retry-connection');
    case 'setup-open':
    case 'o-settings': return api.cmd('ai-setup');
    case 'stop': return api.cmd('ai-stop');
    default:
  }
});

// Links in answers open as tabs.
document.addEventListener('click', (e) => {
  const a = e.target.closest('a[href]');
  if (!a) return;
  e.preventDefault();
  api.cmd('new-tab', { url: a.href });
});

paintIcons();
autosize();
