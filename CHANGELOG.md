# Changelog

All notable changes to Opal are listed here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and Opal uses [semantic versioning](https://semver.org/).

## [0.1.0] - 2026-10-07

First public release.

### Added
- Spaces with their own tabs and bookmarks, vertical tabs, bookmarks bar, new tab page.
- Split view, reader mode, picture in picture, find in page, zoom, print and save as PDF, downloads, history.
- Profiles and incognito windows; session restore after a crash.
- Chrome Web Store and unpacked extensions with a toolbar menu (partial Chrome API support).
- Opal AI (optional): page questions, summaries, comparing tabs, sorting tabs into spaces, translation and
  agent mode, using Ollama, your own Claude or OpenAI API key (encrypted with the system keyring), or Onyx.
- Settings page, including the AI backend and "Make Opal the default browser".
- Packages for x64 and arm64: AppImage (auto-updates), .deb, .rpm and .tar.gz, with SHA256SUMS.
- Sandbox check at start-up with clear instructions, and an AppArmor profile in the .deb/.rpm for Ubuntu 23.10+.
- Wayland and X11 support.

[0.1.0]: https://github.com/nirwwan/opal-browser/releases/tag/v0.1.0
