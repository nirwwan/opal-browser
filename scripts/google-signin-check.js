'use strict';
// Google sign-in check, run inside a normally launched Opal (no Playwright: Playwright
// itself makes navigator.webdriver true, which Google rejects).
//
//   OPAL_SELFTEST=scripts/google-signin-check.js OPAL_USER_DATA=$(mktemp -d) OPAL_MULTI_INSTANCE=1 \
//     OPAL_SIGNIN_EMAIL=someone@gmail.com npx electron .
//
// It opens accounts.google.com in a normal tab, types the address into the identifier
// step, presses Next, and writes what Google answered to OPAL_SELFTEST_OUT (or prints it).
// It never types a password.
const fs = require('fs');
const { app } = require('electron');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

module.exports = async function run(opal) {
  const email = process.env.OPAL_SIGNIN_EMAIL || 'opal.signin.check.does.not.exist.73915@gmail.com';
  const out = { email, steps: [] };
  const finish = (result) => {
    Object.assign(out, result);
    const text = JSON.stringify(out, null, 2);
    if (process.env.OPAL_SELFTEST_OUT) fs.writeFileSync(process.env.OPAL_SELFTEST_OUT, text); else console.log(text);
    setTimeout(() => app.quit(), 500);
  };
  try {
    await sleep(2500);
    const w = [...opal.windows][0];
    w.navigate('https://accounts.google.com/');
    const js = (code) => w.activePane.view.webContents.executeJavaScript(code);
    const waitFor = async (code, ms = 30000) => {
      const end = Date.now() + ms;
      while (Date.now() < end) { try { if (await js(code)) return true; } catch { /* navigating */ } await sleep(500); }
      return false;
    };
    if (!(await waitFor('!!document.querySelector("#identifierId, input[name=identifier], input[type=email], input[autocomplete=username]")'))) return finish({ result: 'no-identifier-field', text: (await js('document.body.innerText')).slice(0, 600) });
    out.steps.push({ url: w.activePane.url, title: w.activePane.title, isTab: !!w.findPaneByContents(w.activePane.view.webContents), webdriver: await js('navigator.webdriver') });
    const wc = w.activePane.view.webContents;
    await js('document.querySelector("#identifierId, input[name=identifier], input[type=email], input[autocomplete=username]").focus()');
    wc.insertText(email);
    await sleep(600);
    // Press Enter like a person would.
    wc.sendInputEvent({ type: 'keyDown', keyCode: 'Enter' });
    wc.sendInputEvent({ type: 'char', keyCode: '\r' });
    wc.sendInputEvent({ type: 'keyUp', keyCode: 'Enter' });
    const outcome = `(() => {
      const t = document.body.innerText;
      if (location.pathname.includes('/signin/rejected') && /sign you in|not be secure/i.test(t)) return 'blocked-insecure-browser';
      if (location.pathname.includes('/signin/rejected')) return '';
      if (/may not be secure|not be secure|browser or app may not/i.test(t)) return 'blocked-insecure-browser';
      if (/couldn.t find (this|your google) account|enter a valid email/i.test(t)) return 'account-not-found';
      if ([...document.querySelectorAll('input[type=password]')].some((i) => i.offsetParent)) return 'password-step';
      if (/verify it.s you|2-step|check your phone/i.test(t)) return 'verification-step';
      return '';
    })()`;
    const end = Date.now() + 30000;
    let result = '';
    while (!result && Date.now() < end) { await sleep(700); try { result = await js(outcome); } catch { /* navigating */ } }
    await sleep(1500);
    finish({ result: result || 'unknown', url: w.activePane.url, text: (await js('document.body.innerText')).replace(/\s+/g, ' ').slice(0, 500) });
  } catch (err) {
    finish({ result: 'error', error: String(err && err.stack || err) });
  }
};
