'use strict';
// Opal AI without Onyx: setup screen, Ollama, and the user's own API keys.
const { test, expect } = require('@playwright/test');
const { launch, waitFor, aiPage, win, snapshot } = require('./helpers');
const mockLlm = require('../../scripts/mock-llm');

let llm;
test.beforeAll(async () => { llm = await mockLlm.start(); });
test.afterAll(() => llm.close());

const settingsPage = async (app) => {
  await win(app, (w) => w.navigate('opal://settings/#ai'));
  return waitFor(() => app.windows().find((p) => p.url().startsWith('opal://settings')));
};

test('with no AI configured the browser works and Opal AI shows a setup screen', async () => {
  const { app, ui } = await launch();
  const ai = await aiPage(app);
  await expect(ai.locator('#setup')).toBeVisible();
  await expect(ai.locator('#setup')).toContainText('Set up Opal AI');
  await expect(ai.locator('#offline')).toBeHidden();
  await expect(ui.locator('#profile-sub')).toHaveText('Saved on this computer');
  await expect(ui.locator('#profile-dot')).toBeHidden();
  // Asking anyway explains what to do instead of failing silently.
  await ai.fill('#input', 'hello?');
  await ai.press('#input', 'Enter');
  await expect(ai.locator('.msg .err')).toContainText('Set up Opal AI');
  await ai.click('#setup-open');
  await waitFor(async () => (await snapshot(app)).active.url.startsWith('opal://settings'));
  await app.close();
});

test('your own API keys: Claude and OpenAI through Settings, stored encrypted, never sent to pages', async () => {
  const { app } = await launch({ env: { OPAL_ANTHROPIC_URL: llm.url, OPAL_OPENAI_URL: llm.url } });
  const page = await settingsPage(app);
  await page.selectOption('#aiBackend', 'keys');
  await page.fill('#anthropicKey', mockLlm.KEY);
  await page.click('#anthropicSave');
  await expect(page.locator('#anthropicRemove')).toBeVisible();
  await expect(page.locator('#anthropicModel option')).toHaveCount(3);
  await page.fill('#openaiKey', mockLlm.KEY);
  await page.click('#openaiSave');
  await expect(page.locator('#openaiModel option')).toHaveCount(2);
  await page.selectOption('#openaiModel', 'gpt-mock-mini');
  // Stored encrypted; the page only ever learns "saved".
  const stored = await app.evaluate(() => global.__opal.settings.get('aiKeys'));
  expect(JSON.stringify(stored)).not.toContain(mockLlm.KEY);
  const info = await page.evaluate(() => window.opal.call('ai.info'));
  expect(JSON.stringify(info)).not.toContain(mockLlm.KEY);
  await expect(page.locator('#aiStatus')).toContainText('Ready');
  const ai = await aiPage(app);
  await expect(ai.locator('#providers')).toBeVisible();
  await ai.click('#providers [data-provider=both]');
  await ai.fill('#input', 'which models?');
  await ai.press('#input', 'Enter');
  await expect(ai.locator('.msg.assistant .label')).toHaveText(['Claude', 'ChatGPT']);
  await expect(ai.locator('.msg.assistant').first()).toContainText('Claude (mock) here');
  await expect(ai.locator('.msg.assistant').last()).toContainText('ChatGPT (mock) here');
  const sent = llm.log.filter((l) => l.path === '/v1/chat/completions').at(-1);
  expect(sent.body.model).toBe('gpt-mock-mini');
  // Removing a key takes that provider away.
  await page.click('#openaiRemove');
  await expect(page.locator('#openaiRemove')).toBeHidden();
  await expect(ai.locator('#providers [data-provider=openai]')).toBeHidden();
  await app.close();
});

test('Ollama on this computer is picked automatically and answers with the page', async () => {
  const { app, ui } = await launch({ env: { OPAL_OLLAMA_URL: llm.url } });
  const ai = await aiPage(app);
  await expect(ai.locator('#setup')).toBeHidden();
  await expect(ai.locator('#providers')).toBeHidden(); // one local model, no provider switch
  await win(app, (w) => w.navigate('opal://settings/#ai'));
  const page = await waitFor(() => app.windows().find((p) => p.url().startsWith('opal://settings')));
  await expect(page.locator('#aiStatus')).toContainText('Ready: using Ollama');
  await page.selectOption('#ollamaModel', 'qwen2.5:7b');
  await ai.fill('#input', 'summarize please');
  await ai.press('#input', 'Enter');
  await expect(ai.locator('.msg.assistant .body').last()).toContainText('Ollama (mock) here');
  expect(llm.log.filter((l) => l.path === '/api/chat').at(-1).body.model).toBe('qwen2.5:7b');
  await expect(ui.locator('#profile-sub')).toHaveText('Saved on this computer');
  await app.close();
});
