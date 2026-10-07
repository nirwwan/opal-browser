'use strict';
// Keeps Opal connected to Onyx: health checks, status for the UI, settings.

const { OnyxClient } = require('./onyx');

const POLL_MS = 15000;

function install(opal) {
  let timer = null;

  function makeClient() {
    opal.onyx = new OnyxClient({
      tokenFile: opal.settings.get('onyxTokenFile') || undefined,
      url: opal.settings.get('onyxUrl'),
      disabled: process.env.OPAL_ONYX_DISABLED === '1' && !process.env.OPAL_ONYX_FILE,
    });
  }

  async function check() {
    const before = JSON.stringify(opal.onyx.status);
    const st = await opal.onyx.health();
    if (JSON.stringify(st) !== before) {
      for (const w of opal.windows) w.pushState();
      opal.emit('onyx-status', st);
    }
    return st;
  }

  opal.on('init', () => {
    makeClient();
    check();
    timer = setInterval(check, POLL_MS);
    timer.unref?.();
  });

  opal.onyxCheck = check;
  opal.onyxReset = () => { makeClient(); return check(); };

  opal.stateProviders.push(() => {
    const st = opal.onyx?.status || {};
    return { onyx: { connected: !!st.connected, checked: !!st.checked, error: st.error || null, version: st.version || null } };
  });

  opal.addCommands({
    'ai-retry-connection': () => check(),
  });

  opal.addPageCalls({
    'onyx.status': () => opal.onyx.status,
    'onyx.test': () => check(),
  });
}

module.exports = { install };
