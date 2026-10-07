<!-- Original design brief for Opal, kept for reference. Some details changed later: see PROGRESS.md (Decisions). -->

# Opal: project brief

Opal is a desktop web browser for Linux, built with Electron. It is part of my own app family
alongside Onyx (a Cursor-style editor). This is the original design brief Opal was built from.
You may run npm, node, git and normal shell commands in this project folder. Ask before
installing system packages with sudo or deleting anything outside this folder.
If this folder already has a starter Electron browser (main.js, preload.js, renderer.js,
index.html, style.css, start.html), build on it; otherwise start fresh.

Naming: the app is "Opal" everywhere users see it (window title, start page, menus, About,
desktop entry). Package name "opal-browser", app ID "dev.opal.browser", user data in ~/.config/Opal.
The AI assistant is "Opal AI" everywhere users see it (panel header, menus, settings, tooltips,
the Ctrl+Shift+A hint, About). Onyx is only the backend that powers it (e.g. the "Synced through Onyx"
profile card, the Onyx connection settings); never show Onyx as the assistant's name.

## Progress tracking and crash recovery (do this first, and always)
Work may stop without warning, so nothing should depend on memory of the session.

1. Create and maintain PROGRESS.md in the project root with these sections:
   - **Current phase and step**: exactly what you're working on right now.
   - **Done**: a checklist of completed steps (`- [x]`), with the files touched.
   - **Next**: the ordered list of remaining steps (`- [ ]`) for the current phase.
   - **Decisions**: anything we decided that isn't in CLAUDE.md, and why.
   - **Known issues**: bugs, open questions, things that don't work yet.
   - **How to run and test**: the commands that currently work.
2. Create and maintain LOG.md: an append-only log. Add an entry with date and time
   (`date "+%Y-%m-%d %H:%M"`) every time you start a step, finish a step, hit an error,
   or change direction. Include the commands you ran and short error messages.
   Never rewrite or delete old entries.
3. Update PROGRESS.md before starting each step (mark it "in progress") and immediately after
   finishing it. Small, frequent updates — never batch them up.
4. Use git. Initialise a repo if there isn't one, add a sensible .gitignore (node_modules, dist,
   build output). Commit after every completed step with a clear message, and include
   PROGRESS.md and LOG.md in each commit.
5. At the start of EVERY session (including after a crash), before doing anything else:
   read CLAUDE.md, PROGRESS.md and the last ~30 entries of LOG.md; run `git status` and
   `git log --oneline -10`. If there are uncommitted changes, figure out which step they belong
   to, check whether that step is half done, and either finish it or restore it cleanly.
   Then tell me in a few lines where we are and what you'll do next, and continue.
6. Never leave the project in a broken state between steps: if a step is large, split it
   so each commit still runs with `npm start`.

## Core decisions
- Electron (Chromium engine). Use WebContentsView in the main process for web pages
  (not <webview>), so tabs, split view and the AI panel are separate views laid out by the main process.
- Search engine: default Google via its normal results page (https://www.google.com/search?q=...).
  A "Search engine" setting offers Google, DuckDuckGo, Bing and Brave, remembered between launches;
  the address bar, new tab page and Opal AI searches all use it. No search API. The address bar treats
  URLs as URLs and everything else as a search; DuckDuckGo bangs (!w, !yt) only when DuckDuckGo is selected.
- Strip "Electron/x" and the app name from the user agent so sites treat Opal like Chrome.
- Security: contextIsolation on, sandbox on, nodeIntegration off, a minimal preload with a typed IPC
  allow-list, a permission request handler that asks the user (camera, mic, location, notifications),
  and window.open/target=_blank opening as new tabs.

## Design: "Studio" layout (match closely)
Light, calm, premium. No gradients, no emoji, no glow effects.
- Font: Bricolage Grotesque, bundled locally as woff2 (Opal must work offline). UI text is 13px.
- Colors: window frame #e6e9ee; spaces rail #dde1e8; panels and pages #ffffff; text #141821;
  secondary text #5a6170; body text #2a2f3a; hairlines #edf0f3; input borders #d7dce4.
- Space colors: Personal #2a4bc7, Work #b44f0c, Linux #0f6b5c (user-pickable, e.g. #6d3fb0).
  The current space's color is the accent: the active tab outline, the AI button, chat bubbles, the bookmark star.
- Radii: panels 12px, tabs 10px, buttons 8px. Soft shadow: 0 2px 6px rgba(20,24,33,.06).
- Layout, left to right, with 10px outer padding:
  1. Spaces rail (68px): window controls, one rounded-square button per space (letter + color;
     the current one has a ring), "add space", then incognito and settings at the bottom.
  2. Tabs column (236px): space name (26px, weight 500), tab count, "New tab Ctrl T",
     a vertical tab list (active tab white with a 1px accent outline), "Saved in this space"
     bookmarks, and a profile card at the bottom ("Synced through Onyx").
  3. Page pane (flexible, white, 12px radius) containing:
     - Toolbar (46px): back, forward, reload, home; a rounded address bar showing a lock icon
       plus translate, saved-passwords and bookmark-star buttons; extensions; downloads
       (with a progress ring); an "AI" toggle button; the ⋮ menu.
     - Bookmarks bar (32px) with folders and "All bookmarks" at the right.
     - Web content.
  4. Opal AI panel (right side, white, 12px radius), with a 12px drag handle between it and the page.
- New tab page: the word "Opal" in Bricolage Grotesque, a large search field ("Search the web")
  that uses the selected search engine, and a small row of pinned sites. Nothing else.
- Logo (final, don't design a new one): the PNGs in build/icons (16–1024px) are the window icon,
  AppImage, .deb and desktop entry icon. The About screen uses build/icons/1024x1024.png until
  build/opal-logo-light.png and build/opal-logo-dark.png (logo with the "opal" wordmark) exist,
  then switches to them.
- Thinking animation (Opal AI status, and loading tabs at 16px plus a 2px progress bar in the space color):
  a 24×24px indicator next to the status text, alternating two phases of ~4.4s each, collapsing into one
  center point for 0.35s between them.
  - Square phase: four dots (#5b7cf0, #2fb59a, #f08a3c, #a77bf0) at a square's corners; every 1.1s the
    square flips 180° in 3D around a diagonal (0.6s, ease-in-out), alternating diagonals.
  - Orbit phase: three dots on a 3D circle 120° apart spinning ~2.6 rad/s; the orbit plane tilts
    1.0 ± 0.55 rad over ~7s and turns 0.5 rad/s.
  - Perspective in both: nearer dots bigger (radius ∝ depth scale²), drawn back-to-front.
  - Status text ("Reading the page…", "Catching the light…", "Cutting facets…", "Turning the stone…",
    "Sifting tabs…") with a light shimmer sweeping left to right every 2.2s.
  - When done: dots shrink away over 0.35s; text becomes e.g. "Polished for 10s", no shimmer.
  - A setting for one-color dots. prefers-reduced-motion: three still dots, no shimmer.

## Chrome-equivalent features
The ⋮ menu: profile header with "Switch"; New tab (Ctrl+T); New window (Ctrl+N);
New incognito window (Ctrl+Shift+N); Passwords and autofill; History (Ctrl+H); Downloads (Ctrl+J);
Bookmarks and lists; Spaces and tab groups; Extensions; Delete browsing data (Ctrl+Shift+Del);
Zoom (− 100% + and full screen); Print (Ctrl+P); Translate this page; Find and edit (Ctrl+F);
Cast, save and share (save page as, save as PDF, copy link); More tools; Help; Settings; About Opal.

Implementation notes:
- Spaces: each space has its own tabs and bookmarks.
- Profiles: separate persistent session partitions.
- Incognito: an in-memory partition with nothing saved to disk.
- Split view: two WebContentsViews side by side shown as one tab in the list.
- Picture-in-picture for videos, with a floating mini player.
- Find in page via webContents.findInPage.
- Reader mode using Mozilla Readability.
- Translate via the AI backend.
- Downloads via session "will-download", with a downloads page and the toolbar progress ring.
- Extensions: use electron-chrome-extensions and electron-chrome-web-store so extensions can be installed
  from the Chrome Web Store (plus unpacked ones), with a toolbar extensions menu. Tell me clearly which APIs
  won't work, and keep a list in PROGRESS.md of which popular extensions work and which don't.
- Casting can be left out for now.
- Keyboard shortcuts: Ctrl+T/W/L/R/N/F/H/J/P, Ctrl+Shift+N, Ctrl+Tab, Alt+Left/Right, Ctrl+K command bar,
  and Ctrl+Shift+A to toggle the AI panel. Shortcuts must work while a web page has focus
  (use before-input-event).
- Restore open tabs and spaces after a crash or restart (session restore).

## Opal AI panel
Onyx is my own separate app (a Cursor-style editor) that already talks to Claude and OpenAI.
Opal never holds AI keys itself; all AI goes through Onyx.
- Panel header: sparkle icon, "Opal AI", an S / M / L size switch, a collapse button.
- Widths: S 320px, M 400px, L 520px. Dragging the handle resizes it (clamped to 320–520).
  Collapsing shrinks it to a 52px strip with one sparkle button that reopens it.
  The toolbar "AI" button and Ctrl+Shift+A toggle it.
- Provider switch: Claude / ChatGPT / Both (Both shows the two answers one after the other, labeled).
- A "Reading this page: <title>" strip. Only send page text when I actually ask something.
- Chat with streamed replies. Quick actions: Summarize page, Compare my tabs, Sort tabs into spaces.
- Input placeholder: "Ask, or type /hide, /small, /large". Slash commands: /hide, /collapse,
  /small, /narrow, /medium, /large, /wide.
- Remember the panel's open/closed state and size between launches.
- If Onyx isn't running, show a clear message in the panel instead of failing silently.
- Agent mode: Opal AI (through Onyx) can read the page, click, type, scroll, navigate and manage tabs
  using webContents APIs. Each action is shown in the panel as it happens, with a Stop button.
  It must ask for confirmation before submitting forms, purchases, or anything involving passwords or
  payments, and it never reads or types saved passwords.

## Onyx connection
- Onyx runs a local HTTP server on 127.0.0.1:7777 only.
- It generates a random token saved to a file readable only by my user (chmod 600). Every request
  needs `Authorization: Bearer <token>`. No CORS for web pages.
- Endpoints: POST /ai/chat (provider, messages, optional pageText; streams the reply);
  /storage endpoints for bookmarks, history, AI chats and settings, backed by SQLite inside Onyx.
- Opal reads the token in the main process only, and every Onyx call is made from
  the main process via IPC, never from the renderer or web pages.
- The Onyx server is a separate job in the Onyx project. Don't edit Onyx from here; until it exists,
  build Opal's side against a small local mock server and note that in PROGRESS.md.

## Platform
- Linux desktops (developed and first tested in ChromeOS's Linux container). The packaged app must show up in the
  desktop's app launcher with the Opal icon.

## Phases
1. Shell: Studio layout, spaces, vertical tabs, toolbar, address bar with web search, bookmarks bar,
   new tab page.
2. Chrome features: menu, history, downloads, bookmarks, find, zoom, print/PDF, incognito, profiles,
   split view, picture-in-picture, reader mode, shortcuts, permission prompts, session restore.
3. Opal AI panel and the Onyx connection.
4. Extensions support and settings page.
5. Packaging as an AppImage and .deb with electron-builder, with the Opal icon and a desktop entry
   named "Opal".

Before writing code, fill PROGRESS.md with the full step list for Phase 1 and make the first commit.
At the end of each phase, tell me what works, what doesn't yet, and how to test it.
