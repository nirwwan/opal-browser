#!/bin/sh
# Opal post-remove (.deb and .rpm). Only clean up on a real removal, not an upgrade.
case "$1" in
  upgrade|1) exit 0 ;;   # deb upgrade / rpm upgrade (1 package left)
esac
rm -f /usr/bin/opal
if [ -f /etc/apparmor.d/opal-browser ]; then
  apparmor_parser --remove /etc/apparmor.d/opal-browser 2>/dev/null || true
  rm -f /etc/apparmor.d/opal-browser
fi
if command -v update-desktop-database >/dev/null 2>&1; then update-desktop-database -q /usr/share/applications || true; fi
exit 0
