# Flatpak

`io.github.nirwwan.Opal.yml` builds Opal from the release `.tar.gz` on top of the Electron base app,
with Chromium's sandbox provided by zypak. It has not been submitted to Flathub.

Build and run locally:

```sh
flatpak install flathub org.freedesktop.Platform//24.08 org.freedesktop.Sdk//24.08 org.electronjs.Electron2.BaseApp//24.08
flatpak-builder --user --install --force-clean build-dir packaging/flatpak/io.github.nirwwan.Opal.yml
flatpak run io.github.nirwwan.Opal
```

Before submitting to Flathub:

- Fill in the two `sha256:` values from the release's `SHA256SUMS` (and update the URLs for each new version).
- Open a pull request against `flathub/flathub` with the manifest, following https://docs.flathub.org/docs/for-app-authors/submission
- The app ID `io.github.nirwwan.Opal` matches the GitHub account, which Flathub accepts for verification.
- Flathub reviewers ask for: a stable release with screenshots (the metainfo points at `docs/screenshots/opal.png`),
  a metainfo file that passes `flatpak run --command=flatpak-builder-lint org.flatpak.Builder appstream ...`,
  the narrowest `finish-args` that work, and a note on why `--talk-name=org.freedesktop.secrets` is needed
  (encrypting saved AI API keys with the keyring).
- Browsers on Flathub also need to explain why they bundle a Chromium (Electron) rather than using a system one.
