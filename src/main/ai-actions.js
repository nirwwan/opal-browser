'use strict';
// Opal AI quick actions: Summarize page, Compare my tabs, Sort tabs into spaces.
// Sorting only proposes a plan; nothing moves until the user presses "Move tabs".

const TAB_TEXT = 6000;
const MAX_TABS = 12;

// Pulls the first JSON array out of a model reply (fenced or bare).
function parsePlan(text) {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text || '');
  const candidates = [fenced && fenced[1], (/\[[\s\S]*\]/.exec(text || '') || [])[0]].filter(Boolean);
  for (const c of candidates) {
    try {
      const v = JSON.parse(c.trim());
      if (Array.isArray(v)) return v.filter((x) => x && typeof x.tabId === 'string' && typeof x.spaceId === 'string');
    } catch { /* try the next one */ }
  }
  return [];
}

function install(opal) {
  const tabTitle = (tab) => tab.panes[0]?.title || tab.panes[0]?.url || 'Untitled';
  const tabUrl = (tab) => tab.panes[0]?.url || '';
  const isWeb = (url) => /^https?:|^file:/.test(url);

  async function summarize(w, a) {
    return opal.ai.ask(w, 'Summarize this page in a few short bullet points, then one line on why it matters.', {
      display: 'Summarize page',
      includePage: a.includePage !== false,
      statusLabel: 'Reading the page…',
    });
  }

  async function compareTabs(w) {
    const tabs = w.current.tabs.filter((t) => isWeb(tabUrl(t))).slice(0, MAX_TABS);
    if (tabs.length < 2) {
      w.send('toast', { text: 'Open at least two web pages in this space to compare them' });
      return null;
    }
    const parts = [];
    for (const [i, tab] of tabs.entries()) {
      const pane = tab.panes[0];
      let text = '';
      if (pane.view && !pane.view.webContents.isDestroyed()) {
        try { text = await opal.reader.pageText(pane.view.webContents, TAB_TEXT); } catch { text = ''; }
      }
      parts.push(`## Tab ${i + 1}: ${tabTitle(tab)}\n${tabUrl(tab)}\n${text || '(not loaded yet; only the title and address are known)'}`);
    }
    return opal.ai.ask(w, `Compare these ${tabs.length} open tabs. Say what each one offers, how they differ, and which is best for what. Use a short list or a small table.`, {
      display: 'Compare my tabs',
      pageText: parts.join('\n\n'),
      statusLabel: 'Sifting tabs…',
    });
  }

  async function sortTabs(w) {
    const spaces = w.profile.spaces;
    const tabs = [];
    for (const [spaceId, st] of w.spaceTabs) for (const t of st.tabs) if (isWeb(tabUrl(t))) tabs.push({ t, spaceId });
    if (!tabs.length) {
      w.send('toast', { text: 'No web pages to sort yet' });
      return null;
    }
    if (spaces.length < 2) {
      w.send('toast', { text: 'Add another space first, then Opal AI can sort tabs into it' });
      return null;
    }
    const prompt = [
      'Sort my open tabs into spaces. Spaces:',
      ...spaces.map((s) => `- space:${s.id} "${s.name}"`),
      'Tabs:',
      ...tabs.map(({ t, spaceId }) => `- tab:${t.id} "${tabTitle(t)}" ${tabUrl(t)} (now in space:${spaceId})`),
      'Reply with one sentence, then a JSON array in a ```json block: [{"tabId":"…","spaceId":"…"}] for every tab that should move. Use only the ids above.',
    ].join('\n');
    const replies = await opal.ai.ask(w, prompt, { display: 'Sort tabs into spaces', includePage: false, statusLabel: 'Sifting tabs…' });
    const reply = replies && replies.find((r) => !r.error);
    if (!reply) return replies;
    const known = new Map(tabs.map(({ t, spaceId }) => [t.id, { t, spaceId }]));
    const items = [];
    for (const p of parsePlan(reply.content)) {
      const tab = known.get(p.tabId);
      const space = w.profile.space(p.spaceId);
      if (!tab || !space || tab.spaceId === space.id || items.some((x) => x.tabId === p.tabId)) continue;
      items.push({ tabId: p.tabId, spaceId: space.id, title: tabTitle(tab.t), space: space.name, color: space.color });
    }
    reply.plan = { items, applied: false };
    // Hide the raw JSON; the plan card shows it instead.
    reply.content = reply.content.replace(/```(?:json)?[\s\S]*?```/gi, '').trim()
      || (items.length ? 'Here is a plan.' : '');
    if (!items.length) reply.content = (reply.content ? reply.content + '\n\n' : '') + 'Every tab is already in a good space.';
    opal.ai.pushPanel(w);
    return replies;
  }

  opal.aiActions = { summarize, 'compare-tabs': compareTabs, 'sort-tabs': sortTabs };

  opal.addCommands({
    'ai-apply-sort': (w, a) => {
      let moved = 0;
      for (const { tabId, spaceId } of a.plan) {
        if (!w.findTab(tabId) || !w.profile.space(spaceId)) continue;
        w.moveTab(tabId, 100000, spaceId);
        moved++;
      }
      for (const m of opal.ai.chatOf(w).messages) if (m.plan && !m.plan.applied) m.plan.applied = true;
      w.send('toast', { text: moved ? `Moved ${moved} tab${moved > 1 ? 's' : ''}` : 'Nothing to move' });
      opal.ai.pushPanel(w);
    },
  });
}

module.exports = { install, parsePlan };
