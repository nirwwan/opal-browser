'use strict';
// Chooses Opal AI's backend and routes every chat through it (panel, quick actions,
// translate, agent mode). Setting "aiBackend":
//   auto  - Onyx if it's running, else Ollama if it answers with a model, else saved API keys
//   onyx | ollama | keys | off
// API keys are encrypted with safeStorage and only ever decrypted here, in the main process.

const { safeStorage } = require('electron');
const B = require('./llm-backends');

const BACKENDS = ['auto', 'onyx', 'ollama', 'keys', 'off'];
const LABEL = { onyx: 'Onyx', ollama: 'Ollama', keys: 'your API key', off: 'Off' };
const PROVIDER_LABEL = { claude: 'Claude', openai: 'ChatGPT', ollama: 'Ollama' };

function install(opal) {
  const s = () => opal.settings;
  const backendSetting = () => (BACKENDS.includes(s().get('aiBackend')) ? s().get('aiBackend') : 'auto');
  const ollamaUrl = () => process.env.OPAL_OLLAMA_URL || s().get('ollamaUrl') || B.OLLAMA_URL;
  const anthropicUrl = () => process.env.OPAL_ANTHROPIC_URL || undefined;
  const openaiUrl = () => process.env.OPAL_OPENAI_URL || 'https://api.openai.com';
  let ollama = { reachable: false, models: [], checkedAt: 0, error: null };

  // ---------- keys (safeStorage) ----------
  const keyStore = () => s().get('aiKeys') || {};
  const storageWeak = () => {
    try { return safeStorage.getSelectedStorageBackend?.() === 'basic_text' || !safeStorage.isEncryptionAvailable(); } catch { return true; }
  };
  // Without a keyring (no GNOME Keyring / KWallet), Electron falls back to a fixed-key
  // "basic_text" backend and refuses to encrypt unless told to. Opal allows it and warns
  // in Settings (see storageWeak), rather than not letting people use their key at all.
  let plainAllowed = false;
  function allowWeakIfNeeded() {
    if (plainAllowed) return;
    plainAllowed = true;
    try {
      if (!safeStorage.isEncryptionAvailable() && safeStorage.getSelectedStorageBackend?.() === 'basic_text' && safeStorage.setUsePlainTextEncryption) {
        safeStorage.setUsePlainTextEncryption(true);
      }
    } catch { /* not supported */ }
  }
  function getKey(provider) {
    const enc = keyStore()[provider];
    if (!enc) return null;
    allowWeakIfNeeded();
    try { return safeStorage.decryptString(Buffer.from(enc, 'base64')); } catch { return null; }
  }
  function setKey(provider, key) {
    if (!['anthropic', 'openai'].includes(provider)) throw new Error('Unknown provider');
    const all = { ...keyStore() };
    if (key) {
      allowWeakIfNeeded();
      if (!safeStorage.isEncryptionAvailable()) throw new Error("This system can't encrypt the key (no keyring available)");
      all[provider] = safeStorage.encryptString(String(key).trim()).toString('base64');
    } else delete all[provider];
    s().set('aiKeys', all);
  }
  const hasKey = (p) => !!keyStore()[p];

  // ---------- which backend is in use ----------
  function keysProviders() {
    return [hasKey('anthropic') && 'claude', hasKey('openai') && 'openai'].filter(Boolean);
  }
  function resolve() {
    const want = backendSetting();
    const onyxUp = !!opal.onyx?.status?.connected;
    const ollamaUp = ollama.reachable && ollama.models.length > 0;
    if (want === 'off') return { backend: 'off', providers: [] };
    if (want === 'onyx' || (want === 'auto' && onyxUp)) return { backend: 'onyx', providers: ['claude', 'openai'] };
    if (want === 'ollama' || (want === 'auto' && ollamaUp)) return { backend: 'ollama', providers: ['ollama'] };
    if (want === 'keys' || (want === 'auto' && keysProviders().length)) return { backend: 'keys', providers: keysProviders() };
    return { backend: null, providers: [] };
  }

  // Status for the panel and settings: is AI ready, and if not, why.
  function status() {
    const want = backendSetting();
    const r = resolve();
    const st = { setting: want, backend: r.backend, providers: r.providers, label: LABEL[r.backend] || '', ready: false, error: null, setupNeeded: false, checked: true };
    if (r.backend === 'off') { st.error = 'Opal AI is turned off in Settings'; return st; }
    if (!r.backend) { st.setupNeeded = true; st.checked = !!opal.onyx?.status?.checked && ollama.checkedAt > 0; return st; }
    if (r.backend === 'onyx') {
      st.checked = !!opal.onyx?.status?.checked;
      st.ready = !!opal.onyx?.status?.connected;
      if (!st.ready) st.error = opal.onyx?.status?.error || "Onyx isn't running";
    } else if (r.backend === 'ollama') {
      st.checked = ollama.checkedAt > 0;
      st.ready = ollama.reachable && ollama.models.length > 0;
      st.model = s().get('ollamaModel') || ollama.models[0] || null;
      if (!ollama.reachable) st.error = ollama.error || "Ollama isn't running";
      else if (!ollama.models.length) st.error = 'Ollama has no models yet. Run: ollama pull llama3.2';
    } else if (r.backend === 'keys') {
      st.ready = r.providers.length > 0;
      if (!st.ready) st.error = 'Add a Claude or OpenAI API key in Settings';
    }
    return st;
  }

  async function checkOllama() {
    try {
      ollama = { reachable: true, models: await B.listOllamaModels({ url: ollamaUrl() }), checkedAt: Date.now(), error: null };
    } catch (err) {
      ollama = { reachable: false, models: [], checkedAt: Date.now(), error: err.code === 'offline' ? "Ollama isn't running" : err.message };
    }
    return ollama;
  }

  let last = '';
  function announce() {
    const now = JSON.stringify(status());
    if (now === last) return;
    last = now;
    for (const w of opal.windows) { w.pushState(); opal.ai?.pushPanel(w); }
    opal.emit('llm-status', status());
  }
  async function refresh() {
    await Promise.all([checkOllama(), opal.onyxCheck ? opal.onyxCheck() : null]);
    announce();
    return status();
  }

  opal.on('init', () => {
    refresh();
    const t = setInterval(() => { if (['auto', 'ollama'].includes(backendSetting())) checkOllama().then(announce); }, 30000);
    t.unref?.();
  });
  opal.on('onyx-status', announce);

  // ---------- chat ----------
  // provider: claude | openai | ollama (the panel's choice); falls back to what the backend offers.
  async function chat({ provider, messages, system, pageText }, onDelta, signal) {
    const st = status();
    if (st.setupNeeded) throw new B.LlmError('Set up Opal AI first: choose Ollama, your own API key or Onyx in Settings', 'not-configured');
    if (st.backend === 'off') throw new B.LlmError(st.error, 'not-configured');
    const p = st.providers.includes(provider) ? provider : st.providers[0];
    try {
      if (st.backend === 'onyx') return await opal.onyx.chat({ provider: p, messages, system, pageText }, onDelta, signal);
      if (st.backend === 'ollama') {
        if (!ollama.reachable) await checkOllama();
        const model = s().get('ollamaModel') || ollama.models[0];
        return await B.streamOllama({ url: ollamaUrl(), model, messages, system, pageText, signal }, onDelta);
      }
      if (p === 'claude') return await B.streamClaude({ apiKey: getKey('anthropic'), baseUrl: anthropicUrl(), model: s().get('anthropicModel') || B.DEFAULT_CLAUDE_MODEL, messages, system, pageText, signal }, onDelta);
      if (p === 'openai') return await B.streamOpenAI({ apiKey: getKey('openai'), baseUrl: openaiUrl(), model: s().get('openaiModel'), messages, system, pageText, signal }, onDelta);
      throw new B.LlmError('Add a Claude or OpenAI API key in Settings', 'not-configured');
    } catch (err) {
      if (err.code === 'offline') refresh();
      throw err;
    }
  }

  async function listModels(provider) {
    if (provider === 'ollama') return (await checkOllama()).models;
    if (provider === 'anthropic') return B.listClaudeModels({ apiKey: getKey('anthropic'), baseUrl: anthropicUrl() });
    if (provider === 'openai') return B.listOpenAIModels({ apiKey: getKey('openai'), baseUrl: openaiUrl() });
    return [];
  }

  function info() {
    return {
      status: status(),
      backends: BACKENDS,
      storageWeak: storageWeak(),
      ollama: { url: s().get('ollamaUrl') || B.OLLAMA_URL, model: s().get('ollamaModel') || '', models: ollama.models, reachable: ollama.reachable },
      anthropic: { saved: hasKey('anthropic'), model: s().get('anthropicModel') || B.DEFAULT_CLAUDE_MODEL },
      openai: { saved: hasKey('openai'), model: s().get('openaiModel') || '' },
    };
  }

  opal.llm = { chat, status, refresh, resolve, listModels, info, PROVIDER_LABEL, setKey, hasKey };

  opal.stateProviders.push(() => ({ llm: status() }));

  opal.addCommands({
    'ai-retry-connection': () => { refresh(); },
    'ai-setup': (w) => {
      require('./commands').openPage(w, 'opal://settings/#ai');
      const p = w.activePane;
      if (p?.view && p.url.startsWith('opal://settings')) p.view.webContents.executeJavaScript("location.hash = 'ai'").catch(() => {});
    },
  });

  opal.addPageCalls({
    'ai.info': () => info(),
    'ai.refresh': async () => { await refresh(); return info(); },
    'ai.setKey': async (a) => {
      setKey(a.provider, a.key);
      announce();
      // Check the key right away so a typo shows up here, not in the panel later.
      let check = null;
      if (a.key) { try { await listModels(a.provider); check = { ok: true }; } catch (err) { check = { ok: false, error: err.message }; } }
      return { ...info(), check };
    },
    'ai.listModels': async (a) => {
      try { return { models: await listModels(a.provider) }; } catch (err) { return { models: [], error: err.message }; }
    },
  });
}

module.exports = { install, BACKENDS };
