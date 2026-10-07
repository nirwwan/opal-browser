'use strict';
// Opal AI agent mode. The model (through Onyx) gets the goal and a snapshot of the
// page, and replies with one JSON action per turn; Opal carries it out with
// webContents APIs and shows each step in the panel, with Stop.
//
// Safety rules enforced here, not left to the model:
// - Never types into password fields, and never reads their values (snapshots skip them).
// - Asks before submitting forms, pressing Enter in a form, clicking submit / buy / pay /
//   sign-in style buttons, or typing into payment fields.

const { newId } = require('./profile');

const WORLD = 1004;
const MAX_TURNS = 30;
const MAX_BAD_REPLIES = 3;
const PAGE_TEXT = 8000;

const SYSTEM = [
  'OPAL_AGENT. You are Opal AI in agent mode inside the Opal web browser. You act on web pages for the user,',
  'one step at a time. Each turn you get the current page: URL, title, numbered interactive elements and some text.',
  'Reply with a short sentence, then exactly one JSON action in a ```json block. Actions:',
  '{"action":"read_page"} full page text;',
  '{"action":"click","index":N} (or "selector":"css");',
  '{"action":"type","index":N,"text":"…","clear":true};',
  '{"action":"press","key":"Enter|Tab|Escape|ArrowDown|ArrowUp|Backspace"};',
  '{"action":"select","index":N,"value":"option text or value"};',
  '{"action":"scroll","direction":"down|up|top|bottom"};',
  '{"action":"submit","index":N} submits the form containing that element;',
  '{"action":"navigate","url":"https://…"}; {"action":"back"};',
  '{"action":"new_tab","url":"…"}; {"action":"switch_tab","tabId":"…"}; {"action":"close_tab","tabId":"…"};',
  '{"action":"wait","ms":1000}; {"action":"done","summary":"what you did and found"}.',
  'Rules: never type passwords (Opal blocks it; ask the user to type it themselves). Opal will ask the user before',
  'submitting forms, purchases or payments. Stop with "done" when the goal is reached or impossible.',
].join(' ');

const RISKY_TEXT = /\b(buy|purchase|order|checkout|check out|pay|payment|place order|subscribe|donate|transfer|send money|sign in|log ?in|sign up|register|delete|remove account|confirm|book now|reserve)\b/i;

// ---- page scripts (isolated world) ----
const SNAPSHOT = `(() => {
  const st = window.__opalAgent = { els: [] };
  const sel = 'a[href],button,input,select,textarea,summary,[role=button],[role=link],[role=checkbox],[role=radio],[role=tab],[role=menuitem],[role=option],[role=combobox],[role=textbox],[contenteditable=""],[contenteditable=true],[onclick]';
  const items = [];
  const clip = (s, n) => String(s || '').replace(/\\s+/g, ' ').trim().slice(0, n);
  for (const el of document.querySelectorAll(sel)) {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    if (r.width < 1 || r.height < 1 || cs.visibility === 'hidden' || cs.display === 'none' || el.disabled) continue;
    if (el.type === 'hidden') continue;
    const i = st.els.push(el) - 1;
    const tag = el.tagName.toLowerCase();
    const isPw = el.type === 'password';
    const label = clip(el.getAttribute('aria-label') || (tag === 'input' || tag === 'textarea' || tag === 'select' ? '' : el.innerText)
      || el.placeholder || el.title || el.alt || (el.labels && el.labels[0] && el.labels[0].innerText) || el.name || '', 80);
    let extra = '';
    if (tag === 'a' && el.href) extra += ' -> ' + clip(el.href, 120);
    if ((tag === 'input' || tag === 'textarea') && !isPw && el.value) extra += ' value="' + clip(el.value, 60) + '"';
    if (isPw) extra += ' (password field: the user must type it)';
    if (el.type === 'checkbox' || el.type === 'radio') extra += el.checked ? ' checked' : ' unchecked';
    if (tag === 'select') extra += ' options: ' + [...el.options].slice(0, 12).map((o) => clip(o.text, 30)).join(' | ');
    const inView = r.bottom > 0 && r.top < innerHeight;
    items.push('[' + i + '] ' + tag + (el.type && tag === 'input' ? ' type=' + el.type : '') + ' "' + label + '"' + extra + (inView ? '' : ' (off screen)'));
    if (items.length >= 160) break;
  }
  const text = clip(document.body ? document.body.innerText : '', 2500);
  return { url: location.href, title: document.title, elements: items, text,
    scroll: Math.round(scrollY), scrollMax: Math.max(0, Math.round(document.documentElement.scrollHeight - innerHeight)) };
})()`;

// Resolves an element by index or selector and describes it for the safety checks.
const describeCode = (target) => `(() => {
  const st = window.__opalAgent || (window.__opalAgent = { els: [] });
  const t = ${JSON.stringify(target)};
  let el = null;
  if (typeof t.index === 'number') el = st.els[t.index] || null;
  if (!el && t.selector) { try { el = document.querySelector(t.selector); } catch (e) { return { error: 'Bad selector' }; } }
  if (!el) return { error: 'Element not found. Take a fresh look at the page.' };
  const i = st.els.indexOf(el) >= 0 ? st.els.indexOf(el) : st.els.push(el) - 1;
  el.scrollIntoView({ block: 'center', inline: 'center' });
  const r = el.getBoundingClientRect();
  const ac = (el.getAttribute('autocomplete') || '').toLowerCase();
  const nm = ((el.name || '') + ' ' + (el.id || '')).toLowerCase();
  const form = el.form || el.closest('form');
  const tag = el.tagName.toLowerCase();
  return {
    index: i, tag, type: (el.type || '').toLowerCase(),
    text: String(el.getAttribute('aria-label') || el.innerText || el.value && tag !== 'input' && el.value || el.title || '').replace(/\\s+/g, ' ').trim().slice(0, 80),
    password: el.type === 'password' || /password|passwd|current-password|new-password/.test(ac) || /pass(word|wd)|pin\\b/.test(nm),
    payment: /^cc-|card|cvc|cvv|iban/.test(ac) || /card.?(num|no)|cvc|cvv|expir|iban|routing|account.?num/.test(nm),
    inForm: !!form,
    isSubmit: (tag === 'button' && (el.type || 'submit') === 'submit' && !!form) || (tag === 'input' && (el.type === 'submit' || el.type === 'image')),
    editable: tag === 'textarea' || el.isContentEditable || (tag === 'input' && !/^(button|submit|reset|checkbox|radio|file|image|range|color)$/.test(el.type)),
    x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), w: r.width, h: r.height,
  };
})()`;

const elCode = (index, body) => `(() => { const el = (window.__opalAgent || { els: [] }).els[${Number(index)}]; if (!el) return false; ${body} })()`;

// Pulls one JSON action out of a model reply.
function parseAction(text) {
  const src = String(text || '');
  const tries = [];
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(src);
  if (fenced) tries.push(fenced[1]);
  const start = src.indexOf('{');
  const end = src.lastIndexOf('}');
  if (start >= 0 && end > start) tries.push(src.slice(start, end + 1));
  for (const t of tries) {
    try {
      const v = JSON.parse(t.trim());
      if (v && typeof v.action === 'string') return v;
    } catch { /* next */ }
  }
  return null;
}

// What the step looks like in the panel log.
function describeStep(a, el) {
  const name = el ? (el.text ? `"${el.text}"` : el.tag) : (a.selector || (a.index !== undefined ? `#${a.index}` : ''));
  switch (a.action) {
    case 'read_page': return 'Reading the page';
    case 'click': return `Clicking ${name}`;
    case 'type': return el && (el.password || el.payment) ? `Typing into ${el.password ? 'a password' : 'a payment'} field` : `Typing "${String(a.text || '').slice(0, 60)}" into ${name}`;
    case 'press': return `Pressing ${a.key}`;
    case 'select': return `Choosing "${a.value}" in ${name}`;
    case 'scroll': return `Scrolling ${a.direction || 'down'}`;
    case 'submit': return `Submitting the form (${name})`;
    case 'navigate': return `Opening ${a.url}`;
    case 'back': return 'Going back';
    case 'new_tab': return `New tab${a.url ? ': ' + a.url : ''}`;
    case 'switch_tab': return 'Switching tab';
    case 'close_tab': return 'Closing a tab';
    case 'wait': return 'Waiting for the page';
    case 'done': return a.summary || 'Done';
    default: return a.action;
  }
}

class Agent {
  constructor(opal, w, goal) {
    this.opal = opal;
    this.w = w;
    this.goal = goal;
    this.id = newId('a');
    this.running = true;
    this.steps = [];
    this.confirm = null;
    this.ac = new AbortController();
  }

  public() {
    return {
      running: this.running,
      steps: this.steps.slice(-40).map((s) => ({ action: s.action, text: s.text, state: s.state })),
      confirm: this.confirm ? { id: this.confirm.id, text: this.confirm.text } : null,
    };
  }

  push() { this.opal.ai.pushPanel(this.w); }

  step(action, text, state = 'running') {
    const s = { action, text, state };
    this.steps.push(s);
    this.push();
    return s;
  }

  stop() {
    if (!this.running) return;
    this.stopped = true;
    this.ac.abort();
    if (this.confirm) this.confirm.resolve(false);
  }

  askConfirm(text) {
    return new Promise((resolve) => {
      this.confirm = { id: newId('k'), text, resolve: (v) => { this.confirm = null; this.push(); resolve(v); } };
      this.push();
    });
  }

  get wc() {
    const pane = this.w.activePane;
    return pane?.view && !pane.view.webContents.isDestroyed() ? pane.view.webContents : null;
  }

  async run(wc, code) {
    if (!wc) throw new Error('No page is open');
    return wc.executeJavaScriptInIsolatedWorld(WORLD, [{ code }], true);
  }

  async observe() {
    const w = this.w;
    const tabs = w.current.tabs.map((t) => `${t.id}${t.id === w.activeTab?.id ? ' (active)' : ''}: ${t.panes[0]?.title || ''} ${t.panes[0]?.url || ''}`);
    const wc = this.wc;
    let snap = null;
    if (wc && /^https?:|^file:/.test(this.w.activePane.url)) {
      await this.settle(wc);
      try { snap = await this.run(wc, SNAPSHOT); } catch { snap = null; }
    }
    const lines = [`Tabs in this space:\n${tabs.join('\n')}`];
    if (!snap) lines.push(`Current page: ${this.w.activePane?.url || 'none'} (not a web page; navigate somewhere first)`);
    else {
      lines.push(`Current page: ${snap.title}\n${snap.url}\nScrolled ${snap.scroll} of ${snap.scrollMax}px`);
      lines.push(`Interactive elements:\n${snap.elements.join('\n') || '(none)'}`);
      lines.push(`Visible text (start):\n${snap.text}`);
    }
    return lines.join('\n\n');
  }

  // Waits (briefly) for the page to finish loading.
  async settle(wc, ms = 8000) {
    if (!wc.isLoading()) return;
    await new Promise((resolve) => {
      const t = setTimeout(resolve, ms);
      wc.once('did-stop-loading', () => { clearTimeout(t); setTimeout(resolve, 150); });
    });
  }

  async element(a) {
    if (typeof a.index !== 'number' && typeof a.selector !== 'string') throw new Error('Give an element index or selector');
    const info = await this.run(this.wc, describeCode({ index: a.index, selector: a.selector }));
    if (!info || info.error) throw new Error(info?.error || 'Element not found');
    return info;
  }

  async mouseClick(wc, el) {
    if (el.w >= 1 && el.h >= 1 && el.x >= 0 && el.y >= 0) {
      for (const type of ['mouseMove', 'mouseDown', 'mouseUp']) {
        wc.sendInputEvent({ type, x: el.x, y: el.y, button: 'left', clickCount: 1 });
      }
    } else {
      await this.run(wc, elCode(el.index, 'el.click(); return true;'));
    }
  }

  // Carries out one action. Returns the text result sent back to the model.
  async act(a) {
    const w = this.w;
    const wc = this.wc;
    let el = null;
    if (['click', 'type', 'select', 'submit'].includes(a.action) && (a.index !== undefined || a.selector)) el = await this.element(a);
    const s = this.step(a.action, describeStep(a, el));
    const ok = (msg = 'OK') => { s.state = 'done'; this.push(); return msg; };
    const blocked = (msg) => { s.state = 'blocked'; s.text += ` (${msg})`; this.push(); return `Blocked: ${msg}`; };
    const confirm = async (why) => {
      s.state = 'waiting';
      const yes = await this.askConfirm(`${why}: ${s.text}`);
      if (!yes) return false;
      s.state = 'running';
      this.push();
      return true;
    };

    switch (a.action) {
      case 'read_page': {
        const text = wc ? await this.opal.reader.pageText(wc, PAGE_TEXT) : '';
        return ok(`Page text:\n${text || '(empty)'}`);
      }
      case 'click': {
        if (!el) throw new Error('Which element?');
        if (el.password) return blocked('Opal AI never clicks into password fields for you');
        if (el.isSubmit && !(await confirm('Submit a form'))) return blocked('the user said no');
        else if (!el.isSubmit && RISKY_TEXT.test(el.text) && !(await confirm('This may buy, pay, sign in or change something'))) return blocked('the user said no');
        await this.mouseClick(wc, el);
        await new Promise((r) => setTimeout(r, 400));
        return ok();
      }
      case 'type': {
        if (!el) throw new Error('Which field?');
        if (el.password) return blocked('Opal AI never types passwords; please type it yourself');
        if (!el.editable) throw new Error('That element is not a text field');
        if (el.payment && !(await confirm('Enter payment details'))) return blocked('the user said no');
        await this.run(wc, elCode(el.index, `el.focus(); if (${a.clear !== false}) { if (el.select) el.select(); else document.execCommand('selectAll'); } return true;`));
        wc.focus();
        wc.insertText(String(a.text ?? ''));
        return ok();
      }
      case 'press': {
        const key = String(a.key || '');
        if (!/^(Enter|Tab|Escape|ArrowDown|ArrowUp|ArrowLeft|ArrowRight|Backspace|Space|PageDown|PageUp)$/.test(key)) throw new Error('Unsupported key');
        if (key === 'Enter') {
          const inForm = await this.run(wc, '(() => { const e = document.activeElement; return !!(e && (e.form || e.closest && e.closest("form"))); })()');
          const pw = await this.run(wc, '(() => { const e = document.activeElement; return !!(e && e.type === "password"); })()');
          if (pw) return blocked('the focus is in a password field');
          if (inForm && !(await confirm('Pressing Enter will submit a form'))) return blocked('the user said no');
        }
        const keyCode = key === 'Space' ? ' ' : key;
        wc.sendInputEvent({ type: 'keyDown', keyCode });
        if (key === 'Enter' || key === 'Space') wc.sendInputEvent({ type: 'char', keyCode: key === 'Enter' ? '\r' : ' ' });
        wc.sendInputEvent({ type: 'keyUp', keyCode });
        await new Promise((r) => setTimeout(r, 300));
        return ok();
      }
      case 'select': {
        if (!el || el.tag !== 'select') throw new Error('That element is not a list');
        const done = await this.run(wc, elCode(el.index, `const v = ${JSON.stringify(String(a.value ?? ''))}.toLowerCase();
          const o = [...el.options].find((x) => x.value.toLowerCase() === v || x.text.trim().toLowerCase() === v);
          if (!o) return false; el.value = o.value; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); return true;`));
        if (!done) throw new Error('No such option');
        return ok();
      }
      case 'scroll': {
        const d = a.direction || 'down';
        const js = { down: 'scrollBy(0, innerHeight * 0.8)', up: 'scrollBy(0, -innerHeight * 0.8)', top: 'scrollTo(0, 0)', bottom: 'scrollTo(0, document.documentElement.scrollHeight)' }[d];
        if (!js) throw new Error('direction must be down, up, top or bottom');
        await this.run(wc, js);
        return ok();
      }
      case 'submit': {
        if (!el || !el.inForm) throw new Error('That element is not in a form');
        if (!(await confirm('Submit a form'))) return blocked('the user said no');
        await this.run(wc, elCode(el.index, 'const f = el.form || el.closest("form"); if (!f) return false; if (f.requestSubmit) f.requestSubmit(); else f.submit(); return true;'));
        await new Promise((r) => setTimeout(r, 400));
        return ok();
      }
      case 'navigate': {
        const url = String(a.url || '');
        if (!/^https?:\/\//i.test(url)) throw new Error('Only http(s) addresses');
        w.navigate(url);
        return ok();
      }
      case 'back': w.back(); return ok();
      case 'new_tab': {
        const url = a.url && /^https?:\/\//i.test(a.url) ? a.url : undefined;
        w.newTab({ url });
        return ok(`Opened tab ${w.activeTab?.id}`);
      }
      case 'switch_tab': {
        if (!w.findTab(String(a.tabId || ''))) throw new Error('No such tab');
        w.activateTab(a.tabId);
        return ok();
      }
      case 'close_tab': {
        if (!w.findTab(String(a.tabId || ''))) throw new Error('No such tab');
        w.closeTab(a.tabId, { wholeTab: true });
        return ok();
      }
      case 'wait':
        await new Promise((r) => setTimeout(r, Math.min(5000, Math.max(200, Number(a.ms) || 1000))));
        return ok();
      default:
        throw new Error(`Unknown action "${a.action}"`);
    }
  }

  async loop() {
    const { opal, w } = this;
    const provider = opal.ai.get().provider === 'both' ? 'claude' : opal.ai.get().provider;
    const messages = [{ role: 'user', content: `Goal: ${this.goal}\n\n${await this.observe()}` }];
    let bad = 0;
    let summary = null;
    try {
      for (let turn = 0; turn < MAX_TURNS && !this.stopped; turn++) {
        const reply = await opal.llm.chat({ provider, system: SYSTEM, messages }, () => {}, this.ac.signal);
        if (this.stopped) break;
        messages.push({ role: 'assistant', content: reply });
        const a = parseAction(reply);
        let result;
        if (!a) {
          if (++bad >= MAX_BAD_REPLIES) throw new Error("Opal AI didn't reply with an action");
          result = 'Reply with exactly one JSON action in a ```json block.';
        } else if (a.action === 'done') {
          summary = String(a.summary || 'Done.');
          this.step('done', summary, 'done');
          break;
        } else {
          try {
            result = await this.act(a);
          } catch (err) {
            const last = this.steps.at(-1);
            if (last && last.state === 'running') { last.state = 'error'; last.text += ` (${err.message})`; } else this.step(a.action, `${describeStep(a)} (${err.message})`, 'error');
            this.push();
            result = `Error: ${err.message}`;
          }
        }
        if (this.stopped) break;
        // Older observations are trimmed so the conversation stays small.
        for (const m of messages) if (m.role === 'user' && m.content.length > 1500 && m !== messages[0]) m.content = m.content.slice(0, 600) + '\n(older page snapshot trimmed)';
        messages.push({ role: 'user', content: `Result: ${String(result).slice(0, PAGE_TEXT + 200)}\n\n${await this.observe()}` });
      }
      if (!summary && !this.stopped) summary = 'Stopped after the step limit.';
    } catch (err) {
      if (!this.stopped) {
        this.step('done', `Stopped: ${err.message}`, 'error');
      }
    }
    if (this.stopped) this.step('done', 'Stopped by you', 'blocked');
    this.running = false;
    const chat = opal.ai.chatOf(w);
    chat.messages.push({ id: newId('m'), role: 'assistant', content: summary ? `**Agent:** ${summary}` : '**Agent stopped.**', at: Date.now() });
    w.aiBusy = false;
    w.aiBusyLabel = '';
    opal.emit('ai-chat-updated', w, chat);
    this.push();
  }
}

function install(opal) {
  opal.addCommands({
    'ai-agent': (w, a) => {
      if (w.aiBusy || w.agent?.running) return;
      const ai = opal.ai.get();
      if (!ai.open || ai.collapsed) opal.ai.set({ open: true, collapsed: false });
      const chat = opal.ai.chatOf(w);
      chat.messages.push({ id: newId('m'), role: 'user', content: a.goal, at: Date.now() });
      w.agent = new Agent(opal, w, a.goal);
      w.aiBusy = true;
      w.aiBusyLabel = 'Turning the stone…';
      opal.ai.pushPanel(w);
      w.agent.loop();
    },
    'ai-agent-confirm': (w, a) => {
      const c = w.agent?.confirm;
      if (c && c.id === a.id) c.resolve(!!a.allow);
    },
  });
}

module.exports = { install, parseAction, describeStep, Agent, SYSTEM };
