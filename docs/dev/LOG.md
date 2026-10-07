<!-- Development log, kept as written (append-only), with personal details removed. -->

# Opal: log (append-only)

## 2026-10-06 12:28: Step 0 started: project setup
- Created the project folder as a separate project folder (separate from the Onyx project).
- Saved the project brief as CLAUDE.md.
- Wrote PROGRESS.md with the full Phase 1 step list.
- Ran: `git init`, added .gitignore.

## 2026-10-06 12:28: Step 0 finished: first commit

## 2026-10-06 12:31: Naming change: "Onyx AI" -> "Opal AI"
- User request: the assistant is "Opal AI" everywhere users see it; Onyx stays the backend name only.
- Ran: `sed -i 's/Onyx AI/Opal AI/g' CLAUDE.md` (4 occurrences), added a naming rule to CLAUDE.md, logged under Decisions in PROGRESS.md.

## 2026-10-06 12:31: Session start: master build
- Read CLAUDE.md, PROGRESS.md, LOG.md. git status clean; HEAD bb30534.
- Master build plan received: Phase 1 -> 2 -> 3 (mock) -> Onyx server (branch opal-server in the Onyx project) -> 4 -> 5 -> final pass.
- Note: Phase 1 code was never written (only Step 0), so "verify Phase 1" means build it first.
- Note: the master plan says "Onyx AI panel"; kept the "Opal AI" naming decision.
- the Onyx project git status: clean, on main.

## 2026-10-06 12:31: Step 1 started: Electron scaffold
- npm install --save-dev electron@44 @playwright/test@1; npm install @mozilla/readability. Electron binary needed a manual `node node_modules/electron/install.js` (postinstall did not fetch it).
- Smoke test: Electron 44.5.1 / Chrome 152 starts with sandbox on (xvfb-run, --ozone-platform=x11 needed because WAYLAND_DISPLAY is set).
- Added lucide-static (icons, generated into src/renderer/icons.js by scripts/gen-icons.js) and Bricolage Grotesque variable woff2 (assets/fonts, OFL).
- Error: `node --test test/unit/` fails on Node 22 (directory not accepted) -> script uses test/unit/*.test.js.
- Error: UI script crashed with "Identifier 'opal' has already been declared" (contextBridge global) -> renamed local to `api`.
- First screenshot via scripts/screenshot.js (composites UI + views, no system screenshot tool installed): Studio layout renders.

## 2026-10-06 12:50: Steps 1-5 finished: scaffold, security baseline, font/tokens, layout, window controls

## 2026-10-06 12:54: Steps 6-15 verified with e2e tests
- Added Playwright Electron tests (test/e2e/phase1.spec.js, helpers with a local test server).
- Ran: npm run test:e2e -> 6 passed, 2 failed:
  - Ctrl+T via Playwright keyboard doesn't reach before-input-event (CDP input). Test now sends a native key with webContents.sendInputEvent.
  - UA test looked for opal://newtab after navigating the only tab away; test fixed.
- Re-ran both: passed. Note: run e2e only through `npm run test:e2e` (xvfb), otherwise windows open on the real display.

## 2026-10-06 12:55: Phase 1 finished (Step 16 review)
- Screenshot with Wikipedia/DuckDuckGo/GitHub tabs matches the Studio spec. Wrote Phase 1 summary in PROGRESS.md.

## 2026-10-06 12:55: Phase 2 planned (18 steps in PROGRESS.md); Step 2.1 started: overlay + ⋮ menu

## 2026-10-06 13:00: 2.1 finished
- Overlay view with the ⋮ menu (all CLAUDE.md items, submenus, zoom row, profile Switch), Ctrl+K command bar, address-bar suggestion dropdown.
- Error: popovers.js redeclared overlay.js globals ('esc') -> wrapped in an IIFE.
- npm run test:e2e -- test/e2e/phase2.spec.js: 2 passed.

## 2026-10-06 13:02: 2.2 finished
- History page with day groups, search, per-row and multi delete; suggestions from bookmarks + history with arrow-key fill. e2e passed.

## 2026-10-06 13:03: 2.3 finished
- Downloads saved to settings.downloadDir or ~/Downloads with unique names, progress ring state, popover, opal://downloads with open/show/pause/resume/cancel/retry/remove. e2e passed.

## 2026-10-06 13:04: 2.4 finished
- Bookmark manager: spaces + folder tree, search, add bookmark/folder, edit, move across spaces/folders, delete; bar updates live. e2e passed.

## 2026-10-06 13:05: 2.5 finished
- Find bar: findInPage with live count, Enter/Shift+Enter, Esc; closes on tab switch.

## 2026-10-06 13:05: 2.6 finished
- Zoom in/out/reset with Chrome's steps, chip in the address bar, menu row; full screen.

## 2026-10-06 13:06: 2.7 finished
- Print uses the system dialog; Save as PDF and Save page as use save dialogs. e2e checks PDF output and clipboard.

## 2026-10-06 13:07: 2.8 finished
- Incognito windows share one in-memory partition, dark rail, no history/session/downloads on disk; data cleared when the last one closes. e2e passed.

## 2026-10-06 13:07: 2.9 finished
- Profiles: create from profile card or menu, each opens in its own window with persist:profile-<id>; switching focuses an open window or restores its saved session. e2e passed.

## 2026-10-06 13:09: 2.10 finished
- Split view: second pane in the same tab (new tab page or a link via context menu), focus marker, Ctrl+W closes the focused pane, separate back into two tabs. e2e passed.

## 2026-10-06 13:10: 2.11 finished
- PiP: the tab's view moves into an always-on-top mini window (video styled to fill it, native controls on), placeholder in the tab, Back to tab / close restores. e2e passed.

## 2026-10-06 13:11: 2.12 finished
- Reader mode: Readability in an isolated world, article shown on opal://reader with sanitised HTML and text size buttons; Back/Exit returns. Also exposes pageText() for the AI panel. e2e passed.

## 2026-10-06 13:12: 2.14 finished
- Permission requests (camera, mic, location, notifications, MIDI, clipboard read...) show an infobar with Block/Allow; remembered per origin; hardware device APIs denied. e2e passed.

## 2026-10-06 13:13: 2.16 finished
- Delete browsing data dialog: range, history, cookies/site data, cache, download history. Note shown that site data can only be cleared for all time. e2e passed.

## 2026-10-06 13:42: 2.13 finished
- Every shortcut in src/shared/shortcuts.js maps to an implemented command (test). Added AI panel state (toggle/size) so Ctrl+Shift+A works.
- Error: find test flaky ('No results'). Traced: page views had 0x0 bounds because the UI sent layout from requestAnimationFrame, which is throttled for background windows. Fixed with a timer; also xvfb screen 1600x1000 for e2e and the AI panel collapses on windows under 1100px.
- Full e2e: 24 passed.

## 2026-10-06 13:42: 2.15 finished
- Session restore survives SIGKILL (test kills the app and relaunches). Ctrl+Shift+T reopens closed tabs.

## 2026-10-06 13:42: User design/feature updates recorded
- Updated CLAUDE.md: Google default search with engine setting, final logo in build/icons, Chrome Web Store extensions,
  agent mode, thinking animation, ChromeOS platform notes. Logged under Decisions; user tasks added to PROGRESS.md.
- Found build/icons empty in the container; asked the user to copy the PNGs into Linux files.
- Removed build/ from .gitignore (it holds icons now).

## 2026-10-06 18:13: 2.19 finished
- Search engine: Google default; DuckDuckGo/Bing/Brave; bangs only with DuckDuckGo; address bar, new tab page, suggestions and context-menu search use it. Unit + e2e updated.
- Error: launches suddenly took ~7s and tests timed out. Cause: 2.7 GB RAM, no swap, and ~140 leftover test profiles in RAM-backed /tmp. Deleted them; e2e profiles now live in .test-tmp and are removed after each run; launch timeout 40s; Playwright retries: 1.
- Untracked test-results/ (was accidentally committed) and ignored it.

## 2026-10-06 18:13: 2.17 finished
- About (versions, logo from build/icons when present), Help (shortcut list), Passwords page explaining there is no password manager; site-info popover with permission reset; translate popover (runs through Opal AI in Phase 3).

## 2026-10-06 18:15: 2.18 Phase 2 review finished; Phase 2 done
- Screenshot review (split view + find bar): fixed missing letters on favicon fallbacks, right-aligned the find bar.
- Wrote Phase 2 summary and the Phase 3 step list.

## 2026-10-06 18:21: 3.1 finished
- Mock Onyx server: discovery file $XDG_RUNTIME_DIR/onyx-opal.json (0600, like Onyx's Terminal Bridge), Bearer token, Origin refused, /health, NDJSON-streamed /ai/chat, /storage/<kind>. Scripted replies for tests, including agent-mode JSON actions.
- Read the Onyx project (read-only): Onyx reaches Claude through `claude -p --output-format stream-json` (no API keys in Onyx), so agent mode will use a text JSON action protocol, not provider tool APIs.
- Error: unit test hung: req 'close' fires once the request body is read in Node 22, so the stream loop stopped early; only res 'close' is watched now.

## 2026-10-06 18:22: 3.2 finished
- Onyx client in main: discovery file must be 0600 and point at 127.0.0.1; NDJSON streaming with abort; health polling every 15s feeding the profile-card dot and menu header.

## 2026-10-06 18:27: 3.3 finished
- Opal AI panel view: header with S/M/L and collapse, 52px strip, provider switch (Both answers labelled), Reading-this-page strip with an off switch, streamed Markdown answers, offline card with retry, state remembered across launches. e2e 3 passed.

## 2026-10-06 18:27: 3.4 finished
- Slash commands /hide /collapse /small /narrow /medium /large /wide with a hint list; unknown commands explained.

## 2026-10-07 07:49: Session start; 3.5 started
- User asked to finish the whole app today (Phase 3 rest, Phase 4, Phase 5). Read CLAUDE.md, PROGRESS.md, LOG.md; git clean at 83623b6.
- build/icons now has the PNGs (16-1024), so that user task is done.
- 3.5: src/main/ai-actions.js (summarize, compare-tabs, sort-tabs with plan + ai-apply-sort).

## 2026-10-07 07:50: 3.5 finished
- Quick actions done; sort plan hides the raw JSON and moves tabs only on "Move tabs". `npm run test:e2e -- test/e2e/phase3.spec.js -g "quick actions"`: 1 passed. Unit parsePlan: 2 passed.
- Note: `npx xvfb-run` fails (npm 404); always use `npm run test:e2e -- <args>`.

## 2026-10-07 07:51: 3.6 finished; 3.7 started
- Tabs: spinner replaced by 16px thinking canvas + 2px accent progress bar. Electron has no load-progress event; estimated from did-start-loading/did-start-navigation/did-navigate/dom-ready/did-finish-load.
- Test server gained /slow. e2e "loading tab": 1 passed.

## 2026-10-07 07:53: 3.7 finished; 3.8 started
- Translate: isolated world 1003 keeps nodes + originals; chunks "N<TAB>text"; menu, popover and context menu use the remembered target. Unit 2 passed, e2e 1 passed.

## 2026-10-07 07:56: 3.8 finished; 3.9 started
- Agent mode in src/main/agent.js. Clicks/keys via sendInputEvent, typing via insertText, isolated world 1004.
- Error: e2e asserted 'hunter2' absent from the whole transcript, but the mock model's own reply contains it. Changed to check only Opal-sent (user) messages. 2 agent e2e passed, 3 unit passed.

## 2026-10-07 07:58: 3.9 finished; 3.10 started
- src/main/sync.js: local chats + Onyx storage sync. Unit 4 passed; e2e "chats are saved" passed (push of all four kinds, pull of a newer remote chat after restart).

## 2026-10-07 08:03: 3.10 finished; Phase 3 done; 4.1 started
- Full phase3 e2e: 8 passed, 1 flaky (progress bar colour read from a node replaced by a re-render) -> toHaveCSS; 3/3 on repeat.
- Review screenshot: agent log showed text meant for a password field; now "Typing into a password field".
- Phase 4 step list written. Next: npm install electron-chrome-extensions@4.9.0 electron-chrome-web-store@0.13.0.

## 2026-10-07 08:14: 4.1 and 4.3 finished; 4.2 started
- npm install electron-chrome-extensions@4.9.0 electron-chrome-web-store@0.13.0.
- Toolbar menu drives the library's browserAction.activateClick directly (no <browser-action-list>, which needs a bundled preload).
- Error: badge set by the MV3 service worker never arrived. Probe extension (fetch to a local server) showed the worker only has Electron's native chrome.* (no 'electron' global); a trivial service-worker preload of our own didn't run either -> Electron 44 doesn't run SW preloads here. Logged as known issue; test sets the badge from the popup.
- e2e phase4: 2 passed.

## 2026-10-07 08:19: 4.2 and 4.5 finished; 4.4 started
- Compat run (`OPAL_EXT_COMPAT=1 npm run test:e2e -- test/e2e/compat.spec.js`, 3.3 min): 12/12 install, workers run, 7 popups work, 5 blank (uBO Lite, Dark Reader, Bitwarden, 1Password, Privacy Badger). Ad request not blocked (no declarativeNetRequest).
- Error first run: `require` not available in electronApplication.evaluate -> added opal.extensions.installFromStore.
- Web Store page shows "Add to Opal" with chrome.webstorePrivate present.

## 2026-10-07 08:53: 4.4 finished; 4.6 started
- Settings page + validated settings.set. Screenshot review: cramped beside the AI panel -> single-column layout under 900px.
- Running the full suite: npm run test:unit && npm run test:e2e.

## 2026-10-07 08:57: 4.6 finished; Phase 4 done; 5.1 started
- Full run: unit 46 passed; e2e 37 passed, 1 skipped (compat, opt-in), 3.3 min.
- Packaging config added to package.json (build: deb + AppImage, executableName opal, packaging/after-install.sh). setDesktopName now 'opal.desktop' to match the .deb desktop file.

## 2026-10-07 09:16: 5.1 and 5.2 finished; 5.3 started
- npm install --save-dev electron-builder (26.15.3). `npx electron-builder --linux deb AppImage`: deb 100 MB, AppImage 126 MB.
- Warning fixed: desktopName + linux.syncDesktopName. xprop showed the main window's WM_CLASS is "opal","opal", so StartupWMClass=opal (was Opal).
- Packaged smoke test (OPAL_PACKAGED, helpers.launch uses executablePath): 1 passed. AppImage launches (FUSE present).
- Disk: 1.6 GB free after builds.

## 2026-10-07 09:23: 5.3 and 5.4 finished; Phase 5 done; all phases done
- User approved the install. `sudo apt install -y ./dist/opal-browser_0.1.0_amd64.deb`: ok; desktop + icon triggers ran; /usr/bin/opal starts (xvfb check, WM_CLASS opal).
- README.md written.

## 2026-10-07 09:57: Google sign-in fix ("This browser or app may not be secure")
- User report: Google sign-in fails in Opal. Asked to present as stable Chrome consistently.
- Probe before (Playwright + httpbin.org/headers): UA "Chrome/152.0.7977.130" (Chrome sends 152.0.0.0); NO Sec-CH-UA headers at all; navigator.userAgentData brands ["Not?A_Brand" 24, "Chromium" 152] (no Google Chrome); Accept-Language "en-US"; navigator.languages ["en-US","c"] (C.UTF-8 locale); window.chrome = {} (no app/csi/loadTimes); agent mode uses no webContents.debugger; no automation switches in src.
- Added src/shared/chrome-identity.js (reduced UA; Chromium's brand-list algorithm with "Google Chrome", GREASE brand/order seeded by the major version: for 152 that is "Chromium";v="152", "Not?A_Brand";v="24", "Google Chrome";v="152"; unit test also reproduces real Chrome 120's known header) and src/main/identity.js (UA fallback + every session, Accept-Language en-US,en;q=0.9, Sec-CH-UA headers added in onBeforeSendHeaders with high-entropy hints per Accept-CH/Critical-CH, LANGUAGE=en_US under a C locale, automation switches stripped unless OPAL_ALLOW_AUTOMATION=1, accounts.google.com guard for non-tab views). Page preload patches NavigatorUAData (brands, getHighEntropyValues, toJSON, native-looking toString) in the main world, also in iframes (nodeIntegrationInSubFrames).
- Note: kept Chromium's real GREASE brand ("Not?A_Brand";v="24" for 152) instead of a literal "Not.A/Brand": a fixed value would not match real Chrome 152.
- scripts/check-identity.js (normal launch, no Playwright): PASS, navigator.webdriver false, no automation flags on any process. Passing --remote-debugging-port=9339 to Opal: port stays closed.
- Google sign-in test: scripts/google-signin-check.js via OPAL_SELFTEST (dev builds only; drives the page from main with executeJavaScript/insertText/sendInputEvent, no debugger), identifier step with a made-up address (no real account or password used):
  - with UA + client hints fixed but window.chrome empty: /v3/signin/rejected "Couldn't sign you in. This browser or app may not be secure."
  - after adding chrome.app / chrome.csi / chrome.loadTimes: "Couldn't find this account" (Google accepted the browser and checked the address) - 3 runs out of 3.
- Not tested: the password step with a real account (no credentials here); the user should sign in once by hand.
- e2e test/e2e/identity.spec.js: 2 passed. Error on first run: popup link outside the 200px viewport -> clicked from script; wait condition counted iframe requests -> waits for the reload carrying sec-ch-ua-full-version-list.
- Full suite after the fix: unit 48 passed; e2e 39 passed, 2 skipped (opt-in), 9.8 min.

## 2026-10-07 10:06: 0.1.1 built and installed
- Version bumped to 0.1.1 so apt upgrades in place. User approved: `sudo apt install -y ./dist/opal-browser_0.1.1_amd64.deb` (0.1.0 -> 0.1.1).
- `xvfb-run -a node scripts/check-identity.js /usr/bin/opal`: PASS (installed app presents as stable Chrome, webdriver false, no automation flags).

## 2026-10-07 10:09: Phase 6 (public release) started
- User asked for a fully automatic public release (no questions). gh logged in as nirwwan (scopes repo, workflow). Disk: 1.1 GB free -> packages built in CI only. gitleaks not installed (will download the release binary into the scratchpad).
- Phase 6 step list and decisions written to PROGRESS.md.

## 2026-10-07 10:17: 6.1 finished
- Loaded the claude-api skill: official SDK (@anthropic-ai/sdk 0.131), default claude-opus-5-5, streaming via client.beta.messages.stream with betas server-side-fallback-2026-07-01 + fallbacks "default"; stop_reason refusal -> clear error.
- Error: saving a key failed in xvfb: safeStorage backend basic_text and isEncryptionAvailable() false. Fixed with setUsePlainTextEncryption(true) only in that case + Settings warning.
- Unit 52 passed. e2e ai-backends 3 passed + phase3 9 passed (offline test now selects the Onyx backend explicitly).
- User note mid-step: screenshots/fixtures/docs must use a fresh temporary profile and demo content only. Recorded under Decisions.

## 2026-10-07 10:19: 6.2 finished
- grep for username/email/home paths/ChromeOS over tracked files (except the dev docs, handled in 6.8): fixed package.json author/maintainer, comments, Onyx discovery path (XDG_CONFIG_HOME), About/AI texts. Version 0.1.0.

## 2026-10-07 10:21: 6.3 finished
- Launcher tested with a stand-in binary: adds --ozone-platform-hint=auto unless the user chose a platform; passes --no-sandbox through only when the user gave it; forced sandbox failure prints the fix and exits 1.

## 2026-10-07 10:25: 6.4 and 6.5 finished
- npm install electron-updater (6.8.9). `npx electron-builder --linux AppImage --x64 --publish never`: dist/Opal-0.1.0-x86_64.AppImage + latest-linux.yml; resources/app-update.yml points at nirwwan/opal-browser. AppImage launched via scripts/check-identity.js: PASS. dist removed afterwards (disk).

## 2026-10-07 10:42: 6.7 part 1: logos, screenshots, a bug fix
- build/opal-logo-light.png / -dark.png rendered with Electron (scripts/make-logos.js): 1024px icon + 'opal' in bundled Bricolage Grotesque 500, on white / #141821. Error: offscreen capturePage -> UnknownVizError; fixed with a visible window under Xvfb, GPU off, full-page capture.
- README screenshots (scripts/readme-screenshots.js): fresh temporary profile deleted on exit, public pages, built-in demo spaces/bookmarks, AI answer from scripts/mock-llm.js demo mode. docs/screenshots/{opal,split-view,new-tab,settings-ai}.png.
- Bug found while doing this: asking Opal AI hung forever when the page was still loading (reading page text waited on the page). reader.pageText now gives up after 5s and sends the question without page text.
- User asked mid-step to open Opal: started the installed /usr/bin/opal on the display.

## 2026-10-07 10:44: 6.6 and 6.7 finished
- ESLint clean; CI + release workflows written. README with demo screenshots; community files, templates, .gitignore.
