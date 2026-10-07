#!/bin/sh
# Opal post-install (.deb and .rpm).

# Chromium's setuid sandbox helper must be owned by root with the setuid bit.
if [ -f /opt/Opal/chrome-sandbox ]; then
  chown root:root /opt/Opal/chrome-sandbox || true
  chmod 4755 /opt/Opal/chrome-sandbox || true
fi

# Ubuntu 23.10+ restricts unprivileged user namespaces with AppArmor; this profile gives
# Opal the same permission browsers like Chrome get. Only where AppArmor 4 is present.
if [ -d /etc/apparmor.d ] && [ -f /etc/apparmor.d/abi/4.0 ] && command -v apparmor_parser >/dev/null 2>&1; then
  cat > /etc/apparmor.d/opal-browser <<'PROFILE'
# Opal browser: allows user namespaces for Chromium's sandbox (Ubuntu 23.10+).
abi <abi/4.0>,
include <tunables/global>

profile opal-browser /opt/Opal/opal-bin flags=(unconfined) {
  userns,

  include if exists <local/opal-browser>
}
PROFILE
  apparmor_parser --replace --write-cache --skip-read-cache /etc/apparmor.d/opal-browser 2>/dev/null || true
fi

ln -sf /opt/Opal/opal /usr/bin/opal || true

# Refresh icon and desktop caches so app launchers show Opal with its icon.
if command -v update-desktop-database >/dev/null 2>&1; then update-desktop-database -q /usr/share/applications || true; fi
if command -v gtk-update-icon-cache >/dev/null 2>&1; then gtk-update-icon-cache -q -t -f /usr/share/icons/hicolor || true; fi
exit 0
