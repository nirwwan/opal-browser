# Contributing to Opal

Thanks for helping! Bug reports, ideas and pull requests are all welcome.

## Reporting bugs and asking for features

Use the issue templates. For bugs, please include your distribution, desktop environment, Wayland or X11,
which package you installed (AppImage, .deb, .rpm, .tar.gz or from source) and how to reproduce the problem.
Security problems go through [SECURITY.md](SECURITY.md), not public issues.

## Development setup

```sh
npm ci
npm start
```

Opal is plain JavaScript (no build step): the main process is in `src/main`, the browser UI in `src/renderer`,
Opal's own pages (`opal://settings` and so on) in `src/pages`, and code shared by both in `src/shared`.
`docs/dev/CLAUDE.md` is the original design brief, `docs/dev/PROGRESS.md` explains decisions and known issues.

## Before you open a pull request

```sh
npm run lint
npm run test:unit
npm run test:e2e        # needs Xvfb (xvfb-run); runs the real app
```

- Keep the security model: `contextIsolation` and `sandbox` on, no `nodeIntegration`, every IPC message
  listed and checked in `src/main/schema.js`, and anything that holds secrets (API keys, the Onyx token) in the
  main process only.
- Add or update tests for what you change. End-to-end tests use local servers and fake AI backends
  (`scripts/mock-onyx.js`, `scripts/mock-llm.js`) and must not need the internet.
- Never put real personal data (profiles, history, keys, screenshots of your own browser) in tests, fixtures or docs.
- Match the surrounding style; user-facing text is short, plain and friendly.
- One topic per pull request, with a clear description of what and why.

By contributing you agree that your contributions are licensed under the MIT License.
