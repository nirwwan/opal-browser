'use strict';
// The Opal AI panel: a WebContentsView beside the page, chat through the chosen backend (src/main/llm.js).
// Open/collapsed/size are remembered between launches. Page text is only sent
// when the user actually asks something.

const path = require('path');
const { WebContentsView } = require('electron');
const { matchShortcut } = require('../shared/shortcuts');
const { newId } = require('./profile');

const UI_PRELOAD = path.join(__dirname, '../preload/ui.js');
const SIZES = { S: 320, M: 400, L: 520 };
const MIN = 320;
const MAX = 520;
const COLLAPSED = 52;
const CHAT_LIMIT = 40;

const SYSTEM = [
  'You are Opal AI, the assistant built into the Opal web browser. Always call yourself Opal AI.',
  "Answer clearly and briefly. When page text is provided, it is the user's current",
  "page: use it, and say so if the answer isn't on the page. Use Markdown for lists and code.",
].join(' ');

const PROVIDER_LABEL = { claude: 'Claude', openai: 'ChatGPT', ollama: 'Ollama' };

function clampWidth(w) {
  return Math.max(MIN, Math.min(MAX, Math.round(w)));
}

function install(opal) {
  const get = () => ({ open: true, collapsed: false, width: SIZES.M, provider: 'claude', oneColorDots: false, ...(opal.settings.get('ai') || {}) });
  const set = (patch) => {
    const next = { ...get(), ...patch };
    next.width = clampWidth(next.width);
    opal.settings.set('ai', next);
    for (const w of opal.windows) { w.pushState(); pushPanel(w); w.layout(); }
    return next;
  };

  // ---------- the view ----------
  function ensureView(w) {
    if (w.aiView) return w.aiView;
    const view = new WebContentsView({
      webPreferences: { preload: UI_PRELOAD, contextIsolation: true, sandbox: true, nodeIntegration: false, spellcheck: true },
    });
    view.setBackgroundColor('#ffffff');
    if (view.setBorderRadius) view.setBorderRadius(12);
    w.aiView = view;
    const wc = view.webContents;
    wc.setWindowOpenHandler(({ url }) => {
      if (/^https?:/.test(url)) w.newTab({ url });
      return { action: 'deny' };
    });
    wc.on('will-navigate', (e, url) => {
      e.preventDefault();
      if (/^https?:/.test(url)) w.newTab({ url });
    });
    wc.on('before-input-event', (e, input) => {
      const cmd = matchShortcut(input);
      if (!cmd || cmd === 'escape') return;
      e.preventDefault();
      opal.runCommand(w, cmd, {});
    });
    wc.on('did-finish-load', () => pushPanel(w, true));
    wc.loadFile(path.join(__dirname, '../renderer/ai.html'));
    return view;
  }

  function placeView(w) {
    const a = get();
    const r = w.aiRect;
    const show = a.open && r && r.width > 0 && !w.htmlFullscreen;
    if (!show) {
      if (w.aiView) w.detach(w.aiView);
      return;
    }
    const view = ensureView(w);
    view.setBounds({ x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) });
    w.attach(view);
    if (w.overlayKind && w.overlayView) w.win.contentView.addChildView(w.overlayView);
  }

  opal.on('ui-layout', (w, rects) => {
    w.aiRect = rects.ai || null;
    placeView(w);
  });
  opal.on('layout', (w) => placeView(w));

  // ---------- panel state ----------
  function chatOf(w) {
    if (!w.aiChat) w.aiChat = { id: newId('c'), messages: [], startedAt: Date.now() };
    return w.aiChat;
  }

  function panelState(w) {
    const pane = w.activePane;
    const url = pane ? (pane.errorFor?.url || pane.url) : '';
    const space = w.profile.space(w.activeSpaceId);
    return {
      ai: get(),
      accent: space?.color || '#2a4bc7',
      onyx: opal.onyx?.status || { connected: false },
      llm: opal.llm ? opal.llm.status() : null,
      page: { title: pane?.title || '', url, readable: /^https?:|^file:/.test(url) },
      chat: chatOf(w),
      busy: !!w.aiBusy,
      busyLabel: w.aiBusyLabel || '',
      incognito: w.incognito,
      agent: w.agent ? w.agent.public() : null,
      chats: opal.chats ? opal.chats.list(w.profile).slice(0, 30).map((c) => ({ id: c.id, title: c.title, updatedAt: c.updatedAt })) : [],
      reducedMotion: false,
    };
  }

  function pushPanel(w, full = false) {
    if (!w.aiView || w.aiView.webContents.isDestroyed()) return;
    if (w.aiView.webContents.isLoading() && !full) return;
    w.aiView.webContents.send('ev:state', panelState(w));
  }

  function event(w, data) {
    if (w.aiView && !w.aiView.webContents.isDestroyed()) w.aiView.webContents.send('ev:ai', data);
  }

  opal.on('navigated', (w) => pushPanel(w));
  opal.on('onyx-status', () => { for (const w of opal.windows) pushPanel(w); });
  opal.on('llm-status', () => { for (const w of opal.windows) pushPanel(w); });
  // Page title / tab changes: keep the "Reading this page" strip current.
  const origPush = opal.stateProviders;
  origPush.push((w) => { setImmediate(() => pushPanel(w)); return { ai: get() }; });

  // ---------- asking ----------
  async function pageTextFor(w) {
    const pane = w.activePane;
    if (!pane?.view || !/^https?:|^file:/.test(pane.url)) return null;
    try { return await opal.reader.pageText(pane.view.webContents); } catch { return null; }
  }

  // Runs one provider's reply into the chat, streaming to the panel.
  async function runReply(w, provider, messages, { system, pageText, label, signal }) {
    const chat = chatOf(w);
    const msg = { id: newId('m'), role: 'assistant', provider, label, content: '', startedAt: Date.now() };
    chat.messages.push(msg);
    event(w, { type: 'start', message: msg });
    try {
      const text = await opal.llm.chat({ provider, messages, system, pageText }, (d) => {
        msg.content += d;
        event(w, { type: 'delta', id: msg.id, text: d });
      }, signal);
      msg.content = text || msg.content;
      msg.ms = Date.now() - msg.startedAt;
      event(w, { type: 'done', id: msg.id, ms: msg.ms });
      return msg;
    } catch (err) {
      msg.error = err.code === 'aborted' ? 'Stopped' : err.message;
      msg.offline = ['offline', 'bad-config', 'not-configured', 'auth'].includes(err.code);
      msg.ms = Date.now() - msg.startedAt;
      event(w, { type: 'error', id: msg.id, message: msg.error, offline: msg.offline });
      if (msg.offline) opal.llm?.refresh();
      throw err;
    }
  }

  // Sends a question. opts: { includePage, display, system, provider, statusLabel }
  async function ask(w, text, opts = {}) {
    if (w.aiBusy) return null;
    const a = get();
    const chat = chatOf(w);
    const user = { id: newId('m'), role: 'user', content: opts.display || text, at: Date.now() };
    chat.messages.push(user);
    w.aiBusy = true;
    w.aiBusyLabel = opts.statusLabel || (opts.includePage !== false ? 'Reading the page…' : 'Catching the light…');
    const ac = new AbortController();
    w.aiAbort = ac;
    pushPanel(w);
    event(w, { type: 'user', message: user });
    let pageText = null;
    const replies = [];
    try {
      if (opts.includePage !== false && !opts.pageText) pageText = await pageTextFor(w);
      if (opts.pageText) pageText = opts.pageText;
      const pane = w.activePane;
      const history = chat.messages
        .filter((m) => m !== user && !m.error && (m.role === 'user' || m.role === 'assistant'))
        .slice(-12)
        .map((m) => ({ role: m.role, content: m.role === 'assistant' && m.label ? `[${m.label}] ${m.content}` : m.content }));
      const prompt = pageText
        ? `${text}\n\n(Current page: ${pane?.title || ''} — ${pane?.url || ''})`
        : text;
      const messages = [...history, { role: 'user', content: prompt }];
      const system = opts.system || SYSTEM;
      // Which providers answer: the panel's choice, limited to what the backend offers.
      const offered = opal.llm.status().providers;
      const want = opts.provider || a.provider;
      let providers = want === 'both' ? offered.filter((p) => p === 'claude' || p === 'openai') : [offered.includes(want) ? want : offered[0]];
      if (!providers.length || !providers[0]) providers = [want === 'both' ? 'claude' : want];
      for (const p of providers) {
        if (ac.signal.aborted) break;
        replies.push(await runReply(w, p, messages, { system, pageText, label: providers.length > 1 ? PROVIDER_LABEL[p] : null, signal: ac.signal }));
      }
    } catch {
      // The error is already shown on the message.
    } finally {
      w.aiBusy = false;
      w.aiBusyLabel = '';
      w.aiAbort = null;
      if (chat.messages.length > CHAT_LIMIT * 2) chat.messages.splice(0, chat.messages.length - CHAT_LIMIT * 2);
      opal.emit('ai-chat-updated', w, chat);
      pushPanel(w);
    }
    return replies;
  }

  opal.ai = { get, set, ask, chatOf, pushPanel, event, SIZES, COLLAPSED, SYSTEM, pageTextFor, runReply };

  opal.addCommands({
    // The toolbar button and Ctrl+Shift+A: show the full panel, or hide it.
    'toggle-ai': () => {
      const a = get();
      if (a.open && !a.collapsed) set({ open: false });
      else set({ open: true, collapsed: false });
    },
    'ai-set': (_w, a) => {
      const patch = {};
      if (a.open !== undefined) patch.open = a.open;
      if (a.collapsed !== undefined) patch.collapsed = a.collapsed;
      if (a.width !== undefined) patch.width = a.width;
      if (a.size) { patch.width = SIZES[a.size]; patch.collapsed = false; patch.open = true; }
      if (a.provider) patch.provider = a.provider;
      if (a.oneColorDots !== undefined) patch.oneColorDots = a.oneColorDots;
      set(patch);
    },
    'ai-ask': (w, a) => {
      if (!get().open || get().collapsed) set({ open: true, collapsed: false });
      if (a.action && opal.aiActions?.[a.action]) return opal.aiActions[a.action](w, a);
      return ask(w, a.text, { includePage: a.includePage !== false });
    },
    'ai-stop': (w) => { w.aiAbort?.abort(); w.agent?.stop(); },
    'ai-new-chat': (w) => {
      if (w.aiBusy) w.aiAbort?.abort();
      w.aiChat = null;
      pushPanel(w);
    },
  });
}

module.exports = { install, clampWidth, SIZES, COLLAPSED };
