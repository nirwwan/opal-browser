'use strict';
const { test, expect } = require('@playwright/test');
const { launch, waitFor, startServer, win, startMockOnyx, aiPage, snapshot } = require('./helpers');

let server;
test.beforeAll(async () => { server = await startServer(); });
test.afterAll(() => server.close());

test('Opal AI panel: header, streamed answer with page text, providers, Both labelled', async () => {
  const onyx = await startMockOnyx();
  const { app, ui } = await launch({ env: { OPAL_ONYX_FILE: onyx.file } });
  await win(app, (w, u) => w.navigate(u), `${server.url}/article`);
  await expect(ui.locator('.tab.active .title')).toHaveText('Long read');
  const ai = await aiPage(app);
  await expect(ai.locator('.head h1')).toHaveText('Opal AI');
  await expect(ai.locator('#input')).toHaveAttribute('placeholder', 'Ask, or type /hide, /small, /large');
  await expect(ai.locator('#r-title')).toHaveText('Long read');
  await expect(ui.locator('#profile-dot')).toHaveClass(/ok/);
  await ai.fill('#input', 'What is this page about?');
  await ai.press('#input', 'Enter');
  await expect(ai.locator('.msg.user')).toHaveText('What is this page about?');
  await expect(ai.locator('.msg.assistant .body')).toContainText('Claude (mock) here');
  await expect(ai.locator('.msg.assistant .body')).toContainText('characters of the page');
  await expect(ai.locator('#status-text')).toContainText('Polished for');
  // Page text was sent with the question.
  const chat = onyx.log.find((l) => l.path === '/ai/chat');
  expect(chat.body.pageText).toContain('Opal reader mode keeps the article text');
  expect(chat.body.system).toContain('Opal AI');
  // Both providers, labelled.
  await ai.click('#providers [data-provider=both]');
  await ai.fill('#input', 'second question');
  await ai.press('#input', 'Enter');
  await expect(ai.locator('.msg.assistant .label')).toHaveText(['Claude', 'ChatGPT']);
  await expect(ai.locator('.msg.assistant').last()).toContainText('ChatGPT (mock)');
  // Turning the page off means no page text is sent.
  await ai.click('#r-toggle');
  const before = onyx.log.length;
  await ai.click('#providers [data-provider=claude]');
  await ai.fill('#input', 'no page please');
  await ai.press('#input', 'Enter');
  await expect(ai.locator('.msg.user').last()).toHaveText('no page please');
  await waitFor(() => onyx.log.length > before);
  await expect(ai.locator('#status-text')).toContainText('Polished for');
  expect(onyx.log.at(-1).body.pageText).toBeFalsy();
  await app.close();
  await onyx.close();
});

test('slash commands, size switch, collapse strip, remembered between launches', async () => {
  const onyx = await startMockOnyx();
  const first = await launch({ env: { OPAL_ONYX_FILE: onyx.file } });
  const ai = await aiPage(first.app);
  await ai.fill('#input', '/large');
  await ai.press('#input', 'Enter');
  await waitFor(async () => (await snapshot(first.app)).ai.width === 520);
  await ai.click('#sizes [data-size=S]');
  await waitFor(async () => (await snapshot(first.app)).ai.width === 320);
  await ai.fill('#input', '/collapse');
  await ai.press('#input', 'Enter');
  await expect(ai.locator('#strip')).toBeVisible();
  await expect(first.ui.locator('#ai-slot')).toHaveClass(/collapsed/);
  const w = await first.ui.locator('#ai-slot').evaluate((el) => el.getBoundingClientRect().width);
  expect(Math.round(w)).toBe(52);
  await ai.click('#reopen');
  await expect(ai.locator('#strip')).toBeHidden();
  await ai.fill('#input', '/hide');
  await ai.press('#input', 'Enter');
  await expect(first.ui.locator('#ai-slot')).toBeHidden();
  await expect(first.ui.locator('#ai-btn')).toHaveClass(/off/);
  await first.app.close();
  const second = await launch({ userData: first.dir, env: { OPAL_ONYX_FILE: onyx.file } });
  const s = await snapshot(second.app);
  expect(s.ai).toMatchObject({ open: false, width: 320 });
  await expect(second.ui.locator('#ai-slot')).toBeHidden();
  // Ctrl+Shift+A brings it back.
  await second.app.evaluate(() => { const w = [...global.__opal.windows][0]; w.ui.focus(); w.ui.sendInputEvent({ type: 'keyDown', keyCode: 'A', modifiers: ['control', 'shift'] }); });
  await expect(second.ui.locator('#ai-slot')).toBeVisible();
  await second.app.close();
  await onyx.close();
});

test('clear message when Onyx is not running', async () => {
  const onyx = await startMockOnyx();
  const file = onyx.file;
  await onyx.close(); // removes the discovery file
  const { app, ui } = await launch({ env: { OPAL_ONYX_FILE: file } });
  await app.evaluate(() => { global.__opal.settings.set('aiBackend', 'onyx'); return global.__opal.llm.refresh(); });
  const ai = await aiPage(app);
  await expect(ai.locator('#offline')).toBeVisible();
  await expect(ai.locator('#offline')).toContainText("Onyx isn't running");
  await expect(ui.locator('#profile-sub')).toHaveText('Onyx is not running');
  await ai.fill('#input', 'hello?');
  await ai.press('#input', 'Enter');
  await expect(ai.locator('.msg .err')).toContainText("Onyx isn't running");
  // Start it again and retry.
  const again = await require('../../scripts/mock-onyx').start({ port: 0, file, delay: 5 });
  await ai.click('#retry');
  await expect(ai.locator('#offline')).toBeHidden();
  await app.close();
  await again.close();
});

test('quick actions: summarize, compare tabs, sort tabs with an apply step', async () => {
  const onyx = await startMockOnyx();
  const { app, ui } = await launch({ env: { OPAL_ONYX_FILE: onyx.file } });
  await win(app, (w, u) => w.navigate(u), `${server.url}/article`);
  await expect(ui.locator('.tab.active .title')).toHaveText('Long read');
  const ai = await aiPage(app);
  await ai.click('[data-action=summarize]');
  await expect(ai.locator('.msg.user').last()).toHaveText('Summarize page');
  await expect(ai.locator('.msg.assistant .body').last()).toContainText('characters of the page');
  // Compare: a second tab, both pages' text is sent.
  await win(app, (w, u) => w.newTab({ url: u }), `${server.url}/page?title=Second&body=Another%20page%20body`);
  await expect(ui.locator('.tab.active .title')).toHaveText('Second');
  await ai.click('[data-action=compare-tabs]');
  await expect(ai.locator('.msg.user').last()).toHaveText('Compare my tabs');
  await waitFor(() => onyx.log.filter((l) => l.path === '/ai/chat').length >= 2);
  const cmp = onyx.log.filter((l) => l.path === '/ai/chat').at(-1);
  expect(cmp.body.pageText).toContain('Tab 1: Long read');
  expect(cmp.body.pageText).toContain('Another page body');
  await expect(ai.locator('#status-text')).toContainText('Polished for');
  // Sort: a plan card, nothing moves until "Move tabs".
  await ai.click('[data-action=sort-tabs]');
  await expect(ai.locator('.plan .plan-row')).toHaveCount(1);
  await expect(ai.locator('.msg.assistant .body').last()).not.toContainText('tabId');
  const before = await snapshot(app);
  await ai.click('[data-plan=apply]');
  await waitFor(async () => (await snapshot(app)).space.tabs.length === before.space.tabs.length - 1);
  await expect(ai.locator('.plan')).toContainText('Moved.');
  await app.close();
  await onyx.close();
});

test('loading tab shows the 16px thinking indicator and a progress bar', async () => {
  const { app, ui } = await launch();
  await win(app, (w, u) => w.navigate(u), `${server.url}/slow?ms=4000`);
  await expect(ui.locator('.tab.active canvas[data-thinking="16"]')).toBeVisible();
  await expect(ui.locator('.tab.active .tab-progress span')).toBeVisible();
  await expect(ui.locator('.tab.active .tab-progress span')).toHaveCSS('background-color', 'rgb(42, 75, 199)');
  await expect(ui.locator('.tab.active .tab-progress')).toHaveCount(0, { timeout: 15000 });
  await expect(ui.locator('.tab.active canvas')).toHaveCount(0);
  await app.close();
});

test('translate this page through Opal AI, then show the original', async () => {
  const onyx = await startMockOnyx();
  const { app, ui } = await launch({ env: { OPAL_ONYX_FILE: onyx.file } });
  await win(app, (w, u) => w.navigate(u), `${server.url}/page?title=Bonjour&body=Le%20chat%20dort`);
  await expect(ui.locator('.tab.active .title')).toHaveText('Bonjour');
  const text = () => win(app, (w) => w.activePane.view.webContents.executeJavaScript('document.body.innerText'));
  await win(app, (w, _a, opal) => opal.runCommand(w, 'translate', { lang: 'English' }));
  await waitFor(async () => (await text()).includes('[T] Le chat dort'));
  const req = onyx.log.find((l) => l.path === '/ai/chat');
  expect(req.body.system).toContain('into English');
  expect(await win(app, (w) => w.activePane.translated)).toBe('English');
  await win(app, (w, _a, opal) => opal.runCommand(w, 'translate', { lang: 'Original' }));
  await waitFor(async () => !(await text()).includes('[T]'));
  expect(await text()).toContain('Le chat dort');
  await app.close();
  await onyx.close();
});

test('agent mode: action log, password blocked, confirmation before submitting', async () => {
  const onyx = await startMockOnyx();
  const { app, ui } = await launch({ env: { OPAL_ONYX_FILE: onyx.file } });
  await win(app, (w, u) => w.navigate(u), `${server.url}/form`);
  await expect(ui.locator('.tab.active .title')).toHaveText('Form');
  const ai = await aiPage(app);
  await ai.check('#agent-mode');
  await ai.fill('#input', 'agent-test: read; type #q=hello; click #b; password #pw; submit #f');
  await ai.press('#input', 'Enter');
  await expect(ai.locator('#agent .a-step')).toHaveCount(5, { timeout: 20000 });
  await expect(ui.locator('.tab.active .title')).toHaveText('Clicked hello');
  await expect(ai.locator('#agent .a-step.blocked')).toContainText('never types passwords');
  await expect(ai.locator('#agent')).not.toContainText('hunter2');
  // The submit waits for the user.
  await expect(ai.locator('#agent .confirm')).toContainText('Submit a form');
  expect(await win(app, (w) => w.activePane.view.webContents.executeJavaScript('document.getElementById("pw").value'))).toBe('');
  await ai.click('[data-confirm=yes]');
  await expect(ui.locator('.tab.active .title')).toHaveText('Submitted');
  await expect(ai.locator('#agent .a-head')).toContainText('Agent finished');
  await expect(ai.locator('.msg.assistant').last()).toContainText('Finished 5 step(s).');
  // The page snapshot never carried password values; system prompt marks agent mode.
  const turns = onyx.log.filter((l) => l.path === '/ai/chat');
  expect(turns[0].body.system).toContain('OPAL_AGENT');
  // What Opal sends never contains the password the model tried to type.
  const sent = turns.flatMap((t) => t.body.messages.filter((m) => m.role === 'user').map((m) => m.content)).join('\n');
  expect(sent).not.toContain('hunter2');
  await app.close();
  await onyx.close();
});

test('agent mode: Stop and declining a confirmation', async () => {
  const onyx = await startMockOnyx();
  const { app, ui } = await launch({ env: { OPAL_ONYX_FILE: onyx.file } });
  await win(app, (w, u) => w.navigate(u), `${server.url}/form`);
  await expect(ui.locator('.tab.active .title')).toHaveText('Form');
  const ai = await aiPage(app);
  await ai.check('#agent-mode');
  await ai.fill('#input', 'agent-test: submit #f; read');
  await ai.press('#input', 'Enter');
  await expect(ai.locator('#agent .confirm')).toBeVisible({ timeout: 20000 });
  await ai.click('[data-confirm=no]');
  await expect(ai.locator('#agent .a-step.blocked')).toContainText('the user said no');
  await expect(ai.locator('#agent .a-head')).toContainText('Agent finished', { timeout: 20000 });
  await expect(ui.locator('.tab.active .title')).toHaveText('Form');
  // A long run can be stopped.
  await ai.fill('#input', 'agent-test: wait; wait; wait; wait; wait; wait');
  await ai.press('#input', 'Enter');
  await expect(ai.locator('#a-stop')).toBeVisible();
  await ai.click('#a-stop');
  await expect(ai.locator('#agent')).toContainText('Stopped by you');
  await expect(ai.locator('#a-stop')).toHaveCount(0);
  await app.close();
  await onyx.close();
});

test('chats are saved, reopened after a restart, and everything syncs to Onyx storage', async () => {
  const onyx = await startMockOnyx();
  const first = await launch({ env: { OPAL_ONYX_FILE: onyx.file } });
  await win(first.app, (w, u) => w.navigate(u), `${server.url}/page?title=Synced%20page`);
  await expect(first.ui.locator('.tab.active .title')).toHaveText('Synced page');
  const ai = await aiPage(first.app);
  await ai.fill('#input', 'remember this chat');
  await ai.press('#input', 'Enter');
  await expect(ai.locator('#status-text')).toContainText('Polished for');
  // Pushed to Onyx: every kind, under this profile.
  await waitFor(() => ['bookmarks', 'history', 'chats', 'settings'].every((k) => onyx.store.has(k)), { timeout: 20000 });
  await waitFor(() => (onyx.store.get('chats').data.profiles.default?.data || []).some((c) => c.title === 'remember this chat'), { timeout: 20000 });
  await waitFor(() => (onyx.store.get('history').data.profiles.default?.data || []).some((e) => e.title === 'Synced page'), { timeout: 20000 });
  expect(onyx.store.get('settings').data.app.data.searchEngine).toBe('google');
  expect(onyx.store.get('bookmarks').data.profiles.default.data.length).toBeGreaterThan(0);
  await first.app.close();

  // Onyx has a newer chat from elsewhere: it is pulled in on the next start.
  const remote = onyx.store.get('chats');
  remote.data.profiles.default.data.unshift({ id: 'cremote1', title: 'From Onyx', startedAt: 1, updatedAt: Date.now() + 1000, messages: [{ id: 'm1', role: 'user', content: 'From Onyx' }] });
  remote.data.profiles.default.updatedAt = Date.now() + 1000;
  const second = await launch({ userData: first.dir, env: { OPAL_ONYX_FILE: onyx.file } });
  const ai2 = await aiPage(second.app);
  await ai2.click('#chats-btn');
  await expect(ai2.locator('.chat-open')).toContainText(['From Onyx', 'remember this chat'], { timeout: 20000 });
  await ai2.locator('.chat-open', { hasText: 'remember this chat' }).click();
  await expect(ai2.locator('.msg.user')).toHaveText('remember this chat');
  await expect(ai2.locator('.msg.assistant .body')).toContainText('Claude (mock) here');
  await second.app.close();
  await onyx.close();
});
