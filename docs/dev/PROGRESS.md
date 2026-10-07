# Opal: progress

## Current phase and step
Phase 6 (public release). Step 6.8 (secret scan, clean public branch) in progress.

## Done
- [x] Step 0: Project setup: CLAUDE.md, PROGRESS.md, LOG.md, .gitignore, git init
      (files: CLAUDE.md, PROGRESS.md, LOG.md, .gitignore)
- [x] Step 1: Electron scaffold (package.json, src/main/main.js, src/renderer/*, `npm start`)
- [x] Step 2: Security baseline: sandbox/contextIsolation, allow-listed preloads (src/preload/ui.js, page.js),
      typed command schema (src/main/schema.js), clean user agent (src/shared/ua.js), opal:// protocol with CSP
      (src/main/protocol.js), window.open -> new tab (src/main/opal-window.js)
- [x] Step 3: Bricolage Grotesque woff2 in assets/fonts, design tokens in src/renderer/ui.css
- [x] Step 4: Studio layout skeleton (src/renderer/index.html, ui.css, ui.js; layout rects sent to main)
- [x] Step 5: Window controls in the rail, drag regions

- [x] Step 6: Tab model in main (src/main/opal-window.js): WebContentsView per pane, lazy creation, bounds from UI rects
- [x] Step 7: Vertical tab list (src/renderer/ui.js): favicon/letter tiles, spinner, close, drag to reorder or onto a space
- [x] Step 8: Toolbar back/forward/reload-stop/home synced with the active tab
- [x] Step 9: Address bar (src/shared/omnibox.js): URL vs search, DuckDuckGo, bangs, chrome:// -> opal://, lock state
- [x] Step 10: Toolbar buttons: extensions, downloads ring, AI toggle, menu (wired to commands filled in later phases)
- [x] Step 11: New tab page (src/pages/newtab.html/js): wordmark, "Search the web", pinned sites
- [x] Step 12: Spaces (src/main/profile.js, commands.js): own tabs, accent colour, ring, add/edit/delete with colour picker
- [x] Step 13: Bookmarks bar with folders and All bookmarks menu; star toggles; "Saved in this space"
- [x] Step 14: Profile card, incognito and settings buttons in the rail
- [x] Step 15: JSON persistence (src/main/store.js): profile.json, session.json, history.json in ~/.config/Opal/profiles/<id>/
- [x] Step 16: Phase 1 review against the Studio spec (screenshots with real sites), fixed star on new tab, letter tiles

### Phase 1 summary
- Works: Studio layout (rail 68px, tabs 236px, toolbar 46px, bookmarks bar 32px, 13px Bricolage Grotesque,
  bundled offline), three default spaces with their own tabs and bookmarks, accent colour per space, add/edit/delete
  spaces with a colour picker, vertical tabs (reorder by drag, drag onto a space to move, middle-click close,
  context menu), address bar (URL vs DuckDuckGo search, bangs, lock state), new tab page, bookmarks bar with folders
  and All bookmarks, star, "Saved in this space", profile card, window controls, tabs/spaces restored on restart,
  target=_blank/window.open as tabs, Chrome-like user agent.
- Not yet: ⋮ menu, downloads, find, AI panel etc. (later phases; their buttons log "not implemented yet").
- Test: `npm run test:unit` (21 tests) and `npm run test:e2e` (8 tests, tests/e2e/phase1.spec.js).

### Phase 2 progress
- [x] 2.1 Overlay view (transparent WebContentsView above pages) and the ⋮ menu with every item from CLAUDE.md
      (src/main/overlay.js, src/renderer/overlay.{html,css,js}, popovers.js, base.css; test/e2e/phase2.spec.js)
- [x] 2.2 History: opal://history (search, delete, clear) and address-bar suggestions in the overlay
      (src/main/page-calls.js, src/pages/history.{html,js}, address-bar suggestions in src/main/overlay.js)
- [x] 2.3 Downloads: will-download, toolbar progress ring, downloads popover, opal://downloads
      (src/main/downloads.js, src/renderer/popovers.js, src/pages/downloads.{html,js})
- [x] 2.4 Bookmarks manager opal://bookmarks (per space, folders, edit, move, delete)
      (src/pages/bookmarks.{html,js}, page-calls bookmarks.*)
- [x] 2.5 Find in page bar (findInPage, Enter/Shift+Enter, count, Esc)
      (src/main/tools.js, find bar in src/renderer/ui.js)
- [x] 2.6 Zoom row in the menu, per-tab zoom chip, full screen
      (zoom steps + chip in opal-window.js/ui.js, menu zoom row, F11 full screen)
- [x] 2.7 Print, save as PDF, save page as, copy link
      (src/main/tools.js: print dialog, printToPDF, savePage HTML/MHTML, copy link toast)
- [x] 2.8 Incognito window: in-memory partition, nothing on disk, distinct look
      (src/main/main.js openIncognito, profile.js memory stores, ui.css incognito look)
- [x] 2.9 Profiles: separate persistent partitions, switch / create from menu header and profile card
      (src/main/profiles.js, profile popover in ui.js, Switch submenu in overlay.js)
- [x] 2.10 Split view: two panes in one tab, focus follows click, separate
      (split/unsplit/focusPane/closePane in src/main/opal-window.js, split marker in ui.js)
- [x] 2.11 Picture-in-picture with floating mini player window
      (src/main/pip.js, src/renderer/mini.{html,js})
- [x] 2.12 Reader mode with Mozilla Readability (opal://reader)
      (src/main/reader.js, src/pages/reader.{html,js})
- [x] 2.14 Permission prompts (camera, mic, location, notifications) as an infobar, remembered per site
      (src/main/permissions.js, infobar in ui.js, test/unit/permissions.test.js)
- [x] 2.16 Delete browsing data dialog (Ctrl+Shift+Del)
      (src/main/clear-data.js, clear-data dialog in popovers.js)
- [x] 2.13 Ctrl+K command bar; all shortcuts from CLAUDE.md verified
      (Ctrl+K in overlay.js; shortcut coverage + focus tests in test/e2e/phase2.spec.js; AI panel state skeleton src/main/ai-panel.js for Ctrl+Shift+A)
- [x] 2.15 Session restore after a crash (kill -9 test), reopen closed tab
      (debounced atomic session.json; kill -9 test; reopen closed tab)
- [x] 2.19 Search engine setting: Google default, DuckDuckGo/Bing/Brave, bangs only with DuckDuckGo
      (src/shared/omnibox.js ENGINES, settings.searchEngine, search.info page call, placeholder from state)
- [x] 2.17 Passwords and autofill page, translate entry point, Help and About Opal pages
      (src/main/info-pages.js, src/main/icons.js, src/pages/{about,help,passwords}.*, site-info/passwords/translate/extensions popovers)

- [x] 2.18 Phase 2 review: screenshots (split view, find bar, menu); favicon fallback letters fixed; find bar right-aligned

### Phase 2 summary
- Works: ⋮ menu with every CLAUDE.md item (profile header + Switch, zoom row, submenus), Ctrl+K command bar,
  address-bar suggestions, history page, downloads (ring, popover, page), bookmark manager, find in page, zoom,
  print / save as PDF / save page / copy link, incognito windows (in-memory), profiles (separate partitions),
  split view, picture-in-picture mini player, reader mode, permission prompts remembered per site,
  crash-safe session restore and reopen closed tab, delete browsing data, About / Help / Passwords pages,
  site info popover, search engine choice (Google default; DuckDuckGo bangs only on DuckDuckGo).
- Not yet / limits: no password manager (Electron has none); translate waits for Opal AI (Phase 3);
  extensions and the settings page are Phase 4; casting is left out; screen sharing not supported.
- Test: `npm run test:unit` (23) and `npm run test:e2e` (26 tests in test/e2e/phase1.spec.js and phase2.spec.js).
- [x] 3.1 Mock Onyx server (scripts/mock-onyx.js): 127.0.0.1, token file chmod 600, Bearer auth, no CORS,
      /health, streaming POST /ai/chat, /storage/{bookmarks,history,chats,settings}
      (scripts/mock-onyx.js, test/unit/mock-onyx.test.js)
- [x] 3.2 Onyx client in the main process (src/main/onyx.js): token read in main only, health check, streaming chat,
      clear "Onyx isn't running" state
      (src/main/onyx.js, src/main/onyx-link.js, test/unit/onyx-client.test.js)
- [x] 3.3 Opal AI panel view (WebContentsView): header (sparkle, "Opal AI", S/M/L, collapse), 52px collapsed strip,
      drag handle 320-520, provider switch Claude / ChatGPT / Both, "Reading this page" strip, chat with streaming
      (src/main/ai-panel.js, src/renderer/ai.{html,css,js}, test/e2e/phase3.spec.js)
- [x] 3.4 Slash commands (/hide /collapse /small /narrow /medium /large /wide) with unit tests
      (src/shared/slash.js, test/unit/slash.test.js, hints in ai.js)

- [x] 3.5 Quick actions: Summarize page, Compare my tabs (text of each tab), Sort tabs into spaces (plan card, "Move tabs" applies)
      (src/main/ai-actions.js, test/unit/ai-actions.test.js, phase3.spec.js)
- [x] 3.6 Thinking animation: panel indicator, shimmer, "Polished for Ns", reduced motion, one-colour mode
      (ai-set oneColorDots; the switch itself lands on the Phase 4 settings page); loading tabs show the 16px
      indicator and a 2px progress bar in the space colour (progress estimated from load milestones)
      (src/renderer/thinking.js, ui.js, ui.css, index.html, opal-window.js, phase3.spec.js)
- [x] 3.7 Translate this page through Opal AI: text nodes numbered in an isolated world, sent in ~3.5k-char chunks,
      replaced in place; "Show original" restores; target language remembered
      (src/main/translate.js, popovers.js, test/unit/translate.test.js, phase3.spec.js)
- [x] 3.8 Agent mode: JSON action per turn (read_page, click, type, press, select, scroll, submit, navigate, back,
      new/switch/close tab, wait, done); page snapshot of numbered elements (password values never included);
      live action log with Stop; confirmation for submits, Enter in forms, buy/pay/sign-in buttons, payment fields;
      typing into password fields always blocked
      (src/main/agent.js, scripts/mock-onyx.js wait step, test/unit/agent.test.js, phase3.spec.js)
- [x] 3.9 Chats saved locally (profiles/<id>/chats.json, last 100; Recent chats list in the panel, reopen/delete);
      bookmarks / history / chats / settings synced to Onyx storage as {profiles:{<id>:{updatedAt,data}}, app}
      (push on change every 5s by hash, pull newer on start / reconnect, last push on quit; incognito never syncs)
      (src/main/sync.js, ai-panel.js, ai.{html,js,css}, schema.js, test/unit/sync.test.js, phase3.spec.js)

- [x] 3.10 Phase 3 review: screenshots of the panel with plan card, agent log and confirmation; masked the text
      the model tried to type into password/payment fields in the action log; stabilised the progress-bar test

### Phase 3 summary
- Works: Opal AI panel (header, S/M/L, drag 320-520, 52px strip, Claude/ChatGPT/Both labelled, Reading this page
  with an off switch, streamed Markdown), slash commands, quick actions (summarize, compare tabs, sort tabs with
  a "Move tabs" step), thinking indicator (panel and loading tabs with a 2px progress bar), translate this page,
  agent mode (action log, Stop, confirmations, passwords never typed or read), saved chats with a Recent chats
  list, sync of bookmarks/history/chats/settings to Onyx storage, clear "Onyx isn't running" state.
- Not yet / limits: runs against the mock Onyx (scripts/mock-onyx.js) until the real Onyx server exists; tab load
  progress is estimated (Electron has no progress event); agent mode works on the main frame only (not iframes).
- Test: `npm run test:unit` (45+) and `npm run test:e2e` (phase1-3 specs). Try it by hand:
  `node scripts/mock-onyx.js` in one terminal, `npm start` in another.

### Phase 4 progress
- [x] 4.1 Extensions engine: electron-chrome-extensions per profile session (license GPL-3.0), tabs registered as
      they are created/activated, chrome.tabs.create/update/remove and windows.create mapped to Opal tabs/windows,
      extension context-menu items in the page menu; toolbar extensions menu with icons, badges, popups
      (src/main/extensions.js, popovers.js, overlay.css, opal-window.js hooks, test/fixtures/hello-ext, phase4.spec.js)
- [x] 4.3 opal://extensions page: cards with icon, version, ID, on/off switch, Options, Reload (unpacked), Remove,
      Load unpacked, Update, Chrome Web Store (src/pages/extensions.{html,js})
- [x] 4.2 Chrome Web Store: electron-chrome-web-store per profile (Extensions/ in the profile folder, auto-update
      at start and every 5 h, "Add extension?" dialog listing permissions); the store page shows "Add to Opal"
      (src/main/extensions.js installFromStore, opal://extensions Update button)
- [x] 4.5 Extension compatibility check against the real Web Store (test/e2e/compat.spec.js, opt-in with
      OPAL_EXT_COMPAT=1) and the list below
- [x] 4.4 opal://settings: search engine, startup restore, home page, bookmarks bar, one-colour dots, downloads
      folder / ask, Opal AI provider and size, translate language, Onyx status / address (127.0.0.1 only) / token
      file / test / sync on-off / sync now, profiles (open, rename, add, remove), delete browsing data, site
      permissions, extensions, About; every key validated in main; narrow-window layout
      (src/main/settings-page.js, src/pages/settings.{html,js}, test/unit/settings.test.js, phase4.spec.js)

### Extensions: what works (checked 2026-10-07, Electron 44.5, all MV3)
| Extension | Installs | Background | Popup | Notes |
|---|---|---|---|---|
| React Developer Tools | yes | runs | works | DevTools panel needs Inspect (Electron DevTools) |
| Vimium | yes | runs | works | content script keys: not verified automatically |
| Grammarly | yes | runs | works | injects into pages (checked) |
| Google Translate | yes | runs | works | |
| SponsorBlock | yes | runs | works | |
| Return YouTube Dislike | yes | runs | works | |
| Wappalyzer | yes | runs | works | |
| uBlock Origin Lite | yes | runs | blank | doesn't block: Electron has no declarativeNetRequest; ad request loaded |
| Dark Reader | yes | runs | blank | doesn't darken pages (needs its worker's extra APIs) |
| Bitwarden | yes | runs | blank | doesn't work yet (popup depends on worker APIs) |
| 1Password | yes | runs | blank | doesn't work yet |
| Privacy Badger | yes | runs | blank | doesn't work yet (also relies on webRequest blocking) |

### Chrome APIs that don't work in Opal
- Anything the library adds, when called from an MV3 service worker (Electron 44 runs no preloads there):
  contextMenus, windows, notifications, webNavigation, cookies, commands, badge updates from the worker.
- declarativeNetRequest (so MV3 content blockers don't block), webRequest blocking from workers.
- chrome.tabs.move / duplicate / highlight / discard / captureVisibleTab, tabs.onMoved/onAttached/onDetached,
  action.enable/disable, commands (extension keyboard shortcuts), contextMenus.update,
  notifications.onButtonClicked, identity (Google sign-in), sidePanel, offscreen documents, tabGroups.
- No extensions in incognito windows.

- [x] 4.6 Phase 4 review: full run 46 unit + 37 e2e passed (compat check opt-in); settings layout fixed

### Phase 4 summary
- Works: Chrome extensions per profile (Web Store "Add to Opal" with a permissions dialog, auto-update, unpacked
  folders), toolbar extensions menu with icons/badges/popups, extension context-menu items, opal://extensions
  (on/off, options, reload, remove, update), opal://settings with every setting validated in main.
- Not yet / limits: see "Extensions: what works" and "Chrome APIs that don't work" below; no extensions in incognito.
- Test: `npm run test:unit`, `npm run test:e2e`; real-store check `OPAL_EXT_COMPAT=1 npm run test:e2e -- test/e2e/compat.spec.js`.

### Phase 5 progress
- [x] 5.1 electron-builder 26 config in package.json: dist/opal-browser_0.1.1_amd64.deb and
      dist/Opal-0.1.1-x86_64.AppImage, icons from build/icons (hicolor 16-1024), /usr/share/applications/opal.desktop
      (Name=Opal, Categories=Network;WebBrowser;, http/https handler, StartupWMClass=opal, checked with xprop),
      packaging/after-install.sh (desktop + icon caches, chrome-sandbox, /usr/bin/opal), desktopName opal.desktop
- [x] 5.2 Built both; packaged smoke test passes (fonts, icon, About logo, reader mode, extensions, settings
      from app.asar): `OPAL_PACKAGED=$PWD/dist/linux-unpacked/opal npm run test:e2e -- test/e2e/packaged.spec.js`;
      the AppImage starts here too (FUSE is available in this container)

- [x] 5.3 Installed with `sudo apt install ./dist/opal-browser_0.1.1_amd64.deb` (user approved, 2026-10-07):
      /opt/Opal, /usr/bin/opal, /usr/share/applications/opal.desktop, hicolor icons, chrome-sandbox 4755;
      the installed binary starts (WM_CLASS opal matches StartupWMClass)
- [x] 5.4 README.md (install, run, Opal AI, tests, licence note); final summary

### Phase 5 summary
- Works: `npm run dist` builds the .deb and the AppImage with the Opal icon and a desktop entry named "Opal";
  the .deb is installed, so Opal is in the ChromeOS launcher under Linux apps.
- Not yet / limits: Opal AI still uses the mock Onyx until the real Onyx server exists; no auto-update of Opal
  itself (rebuild and reinstall the .deb); extension limits listed above.

## Next
- Nothing left in the five phases. Possible follow-ups: point Opal at the real Onyx server once it exists;
  decide the licence (MIT vs GPL-3.0, see Decisions); add build/opal-logo-light.png / -dark.png for About.


## Decisions
- Phase 6 decisions (user asked for a fully automatic public release, 2026-10-07; made without asking):
  - Release version is 0.1.0 as the user asked: package.json goes back from 0.1.1 (a local-only build) to 0.1.0.
  - Licence MIT for Opal's code (user decision). Release binaries bundle electron-chrome-extensions, which is
    GPL-3.0; that's compatible (MIT code may be combined with GPL code) but the binaries as a whole are then
    distributed under GPL-3.0 terms. Source is public, so that's satisfied; README and LICENSE note say so.
  - All packages are built in GitHub Actions, not here: this machine has ~1 GB disk free. Caches outside the
    project are not deleted (CLAUDE.md says ask first; the user asked for no questions).
  - Opal AI backend setting "aiBackend": auto (default) | onyx | ollama | keys | off. Auto uses Onyx if it is
    running, else Ollama if it answers with at least one model, else stored API keys, else shows the setup screen.
  - API keys: encrypted with safeStorage in main only, never sent to renderers (the UI only learns "key saved").
    If safeStorage has no real keyring on Linux (backend basic_text), Opal still allows saving but warns clearly.
  - Default models: Claude claude-sonnet-5-5, OpenAI and Ollama chosen from the provider's own model list
    (Settings fetches /v1/models or /api/tags), so no model name goes stale.
  - Sandbox: a small launcher script (opal) checks the sandbox before starting the real binary (opal-bin) and,
    if neither the setuid helper nor user namespaces can work, shows the fix (dialog or terminal) instead of
    crashing. It never adds --no-sandbox by itself.
  - Packages for x64 and arm64 are cross-built on an x64 GitHub runner (no native modules in Opal).
  - Screenshots, fixtures and docs use a fresh temporary profile with demo content only (public sites,
    demo spaces/bookmarks, a demo chat from the mock backend); never the user's real profile (user, 2026-10-07).
  - safeStorage without a keyring (basic_text backend): Opal opts in with setUsePlainTextEncryption so keys can
    still be saved, and Settings shows "No keyring found" with what that means.
  - App ID stays dev.opal.browser for packages; the Flatpak manifest uses io.github.nirwwan.Opal because Flathub
    needs an ID tied to something the author controls (see Phase 6 notes).
- electron-chrome-extensions is dual-licensed GPL-3.0 / paid Patron licence. Opal uses it under GPL-3.0
  (license: 'GPL-3.0' in src/main/extensions.js). Fine for personal use; distributing Opal binaries means
  GPL-3.0 terms apply (or buy the Patron licence). package.json still says MIT: user to decide (2026-10-07).
- Project lives in the project folder, completely separate from the Onyx project (user request, 2026-10-06).
- Started fresh: no starter Electron files existed in the folder.
- The AI assistant is named "Opal AI" in all user-facing text (panel header, menus, settings, tooltips,
  Ctrl+Shift+A hint, About). Onyx remains the backend name only ("Synced through Onyx", Onyx connection
  settings). CLAUDE.md updated to match (user request, 2026-10-06).
- 2026-10-06 update from the user (CLAUDE.md updated to match):
  - AI assistant is "Opal AI" in all UI; Onyx is only the backend name (already in place).
  - Logo is final: build/icons PNGs (16-1024px) for window/AppImage/.deb/desktop entry; About uses
    build/icons/1024x1024.png until build/opal-logo-light.png / opal-logo-dark.png exist. No icon design.
    .gitignore no longer ignores build/ (it holds icons; electron-builder output goes to dist/).
  - Search engine: default Google; setting with Google, DuckDuckGo, Bing, Brave; bangs only with DuckDuckGo.
    Built as Phase 2 step 2.19 (engine logic) and in the Phase 4 settings page (UI).
  - Extensions via electron-chrome-extensions + electron-chrome-web-store with a toolbar menu: Phase 4.
    A works / doesn't work list of popular extensions will live in PROGRESS.md.
  - Agent mode (read page, click, type, scroll, navigate, manage tabs; live action log, Stop, confirmation
    for forms/purchases/passwords/payments, never touches saved passwords): Phase 3.
  - Thinking animation (24px AI status indicator; 16px + 2px progress bar on loading tabs): Phase 3.
  - Platform: ChromeOS Linux container; packaged app must appear in the ChromeOS launcher with the icon
    (Phase 5). Ask for files to be placed in Linux files.

- Onyx protocol (designed here, since the real server doesn't exist yet): discovery file
  $XDG_RUNTIME_DIR/onyx-opal.json (0600) with {url, token, pid, version}, mirroring Onyx's Terminal Bridge
  (onyx-bridge.json). /ai/chat streams NDJSON ({"type":"delta"|"done"|"error"}). Storage is GET/PUT
  /storage/<bookmarks|history|chats|settings> with {data}.
- Agent mode uses a JSON action protocol in the model's text reply (one action per turn), because Onyx talks to
  Claude through the `claude -p` CLI and OpenAI through a CLI, neither of which exposes custom tools.
- Opal AI currently runs against the mock server (scripts/mock-onyx.js) until the Onyx server exists.

### Phase 6 progress
- [x] 6.1 Opal AI backends (src/main/llm.js manager, src/main/llm-backends.js clients): Onyx, Ollama (/api/tags,
      /api/chat), own API key for Claude (official @anthropic-ai/sdk, default claude-opus-5-5, streaming,
      fallbacks "default", refusal handled) or OpenAI (Chat Completions SSE); keys encrypted with safeStorage,
      main process only; setup screen in the panel; Settings section with backend, models (fetched from each
      provider), keys; provider switch shows only what the backend offers; scripts/mock-llm.js fake APIs;
      test/unit/llm-backends.test.js, test/e2e/ai-backends.spec.js
      Also (for 6.2/6.4): "Synced through Onyx" only when Onyx is connected; "Make Opal the default" (src/main/desktop.js)
- [x] 6.2 Personal bits removed from code/packaging: author/maintainer -> GitHub noreply address, homepage and
      repository -> github.com/nirwwan/opal-browser, ChromeOS-only comments made generic, Onyx discovery under
      $XDG_CONFIG_HOME; About/help/AI prompt describe Onyx as optional; profile card says "Saved on this computer"
      unless Onyx syncs; version back to 0.1.0
- [x] 6.3 Linux compatibility: --ozone-platform-hint=auto (main.js + launcher); packaging/launcher.sh becomes
      "opal" (afterPack hook renames Electron to opal-bin): checks setuid helper / user namespaces / AppArmor and
      shows the fix (zenity, kdialog, notify-send, xmessage or terminal) instead of crashing, never adds
      --no-sandbox; .deb/.rpm postinst sets chrome-sandbox root 4755 and installs an AppArmor 4 profile
      (opal-browser, userns) where available; postrm removes it on real removal only
- [x] 6.4 Desktop integration: opal.desktop (Network;WebBrowser;, http/https/html MIME), icons 16-1024 from
      build/icons, "Make Opal the default" in Settings via xdg-settings/xdg-mime (src/main/desktop.js; writes a
      user-level opal.desktop for the AppImage/tar.gz first; Flatpak points to system settings)
- [x] 6.5 Packages for x64 and arm64: AppImage (electron-updater from GitHub Releases, AppImage only, setting
      "Update Opal automatically"), .deb, .rpm (same postinst/postrm), .tar.gz; publish config writes
      app-update.yml/latest-linux*.yml; packaging/flatpak/ manifest + metainfo + desktop file + notes (not
      submitted). Local x64 AppImage build checked: launcher + opal-bin, app-update.yml, latest-linux.yml, and the
      AppImage starts (check-identity PASS). SHA256SUMS are made in the release workflow (6.6).
- [x] 6.6 ESLint 10 flat config (`npm run lint`, clean); .github/workflows/ci.yml (lint, unit, Playwright under
      Xvfb on Ubuntu 24.04 with chrome-sandbox setuid); .github/workflows/release.yml (tag v* -> check version,
      build all packages x64+arm64, smoke-test the x64 AppImage, SHA256SUMS, notes from CHANGELOG.md, gh release)
- [x] 6.7 build/opal-logo-{light,dark}.png (scripts/make-logos.js), docs/screenshots from a demo profile
      (scripts/readme-screenshots.js), README.md, LICENSE (MIT + GPL note for binaries), CONTRIBUTING.md,
      CODE_OF_CONDUCT.md, SECURITY.md, CHANGELOG.md, issue templates (bug: distro, desktop, Wayland/X11, package),
      PR template, .gitignore

## Next (Phase 6: Public release)
- [ ] 6.8 Secret scan (gitleaks + own checks) of tree and history; clean orphan branch "public" with docs/dev/
- [ ] 6.9 Create the GitHub repo, push public as main, topics; tag v0.1.0; release workflow green; publish release
- [ ] 6.10 Install the released AppImage, launch it once; RELEASE REPORT

## Known issues
- REGRESSION NOTE (Google sign-in, fixed 2026-10-07): Google rejects Opal with "This browser or app may not be
  secure" unless Opal looks exactly like stable Chrome. Keep all of these when changing Electron, preloads or
  webRequest: (1) reduced Chrome UA from src/shared/chrome-identity.js, set as app.userAgentFallback and on every
  session, no "Electron"/"opal-browser"; (2) Sec-CH-UA / -Mobile / -Platform headers (plus Accept-CH'd ones) added in
  session.webRequest.onBeforeSendHeaders (src/main/identity.js; Electron allows ONE such listener per session, so
  don't add another); (3) navigator.userAgentData patched by src/preload/page.js; (4) window.chrome.app / csi /
  loadTimes in the page main world (without these Google rejected the browser even with correct headers);
  (5) navigator.webdriver false: no --enable-automation / remote debugging in normal use (identity.early() strips
  them; tests set OPAL_ALLOW_AUTOMATION=1); agent mode must keep using executeJavaScript/sendInputEvent, never
  webContents.debugger; (6) accounts.google.com only in normal tabs. Checks: `npm run test:e2e -- test/e2e/identity.spec.js`,
  `xvfb-run -a node scripts/check-identity.js [binary]`, and the live check
  `OPAL_SELFTEST=scripts/google-signin-check.js OPAL_SELFTEST_OUT=out.json OPAL_USER_DATA=$(mktemp -d) OPAL_MULTI_INSTANCE=1 xvfb-run -a npx electron .`
  (expects "account-not-found" for its made-up address, not "blocked-insecure-browser").
- Extensions: Electron 44 does not run preload scripts in extension service workers (checked with a probe
  extension and a trivial preload of our own), so MV3 background service workers only get Electron's built-in
  chrome.* subset (action, runtime, storage, tabs, i18n, management, dom). Calls the library would add there
  (contextMenus, windows, notifications, webNavigation, badge text set from the worker) don't reach Opal.
  Popups, options pages and content scripts get the full API. MV2 background pages work fully.
- Passwords and autofill: Electron has no password manager. opal://passwords explains this; use a password
  manager app (or its extension after Phase 4).
- Delete browsing data: cookies/site storage can only be cleared for all time (Electron has no date filter).
- Screen sharing (getDisplayMedia) and hardware device APIs (USB, serial, HID) are not supported yet.
- The dev machine is small (2 cores, 2.7 GB RAM, no swap): a full e2e run takes ~10 minutes and the slowest
  tests can time out under memory pressure, hence one Playwright retry.
- `npm install` did not run Electron's postinstall here; if `npm start` says Electron failed to install,
  run `node node_modules/electron/install.js`.

## How to run and test
- `npm start` runs Opal (user data in ~/.config/Opal).
- `npm run test:unit` runs unit tests (node:test).
- `npm run test:e2e` runs Playwright Electron tests under xvfb-run (1600x1000 virtual screen). Run it through npm,
  otherwise test windows open on the real display.
- `npm run dist` builds dist/*.deb and dist/*.AppImage (`npm run dist:deb`, `npm run dist:appimage` for one).
- Install the .deb: `sudo apt install ./dist/opal-browser_<version>_amd64.deb`, then Opal is in the app launcher.
- `xvfb-run -a node scripts/screenshot.js out.png [url]` saves a screenshot of the whole window.
