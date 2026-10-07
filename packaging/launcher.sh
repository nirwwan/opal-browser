#!/bin/sh
# Opal launcher. Checks that Chromium's sandbox can start on this system, then runs
# the real binary (opal-bin). If the sandbox can't work, it explains how to fix that
# instead of crashing. It never turns the sandbox off by itself.

HERE=$(dirname "$(readlink -f "$0")")
BIN="$HERE/opal-bin"

# Wayland when available, X11 otherwise (unless the user chose a platform).
OZONE="--ozone-platform-hint=auto"
for a in "$@"; do
  case "$a" in
    --ozone-platform=*|--ozone-platform-hint=*) OZONE="" ;;
    --no-sandbox) exec "$BIN" "$@" ;;   # the user's explicit choice
  esac
done

sandbox_ok() {
  [ -n "$FLATPAK_ID" ] && return 0                       # Flatpak brings its own sandbox (zypak)
  S="$HERE/chrome-sandbox"
  if [ -u "$S" ] && [ "$(stat -c %u "$S" 2>/dev/null)" = "0" ]; then return 0; fi   # setuid helper (.deb/.rpm)
  if [ "$(cat /proc/sys/kernel/unprivileged_userns_clone 2>/dev/null)" = "0" ]; then return 1; fi
  if [ "$(cat /proc/sys/user/max_user_namespaces 2>/dev/null)" = "0" ]; then return 1; fi
  if [ "$(cat /proc/sys/kernel/apparmor_restrict_unprivileged_userns 2>/dev/null)" = "1" ]; then
    # Ubuntu 23.10+: user namespaces only for programs with an AppArmor profile that allows them.
    [ "$BIN" = "/opt/Opal/opal-bin" ] && [ -f /etc/apparmor.d/opal-browser ] && return 0
    [ -n "$APPIMAGE" ] && [ -f /etc/apparmor.d/opal-appimage ] && return 0
    return 1
  fi
  if command -v unshare >/dev/null 2>&1; then
    unshare --user --map-root-user true >/dev/null 2>&1 && return 0
    return 1
  fi
  return 0
}

if ! sandbox_ok; then
  MSG="Opal can't start its security sandbox on this system.

Fix it in one of these ways:
 - Install Opal from the .deb or .rpm package: it sets up the sandbox for you.
 - AppImage on Ubuntu 23.10 or newer: add the AppArmor profile from
   https://github.com/nirwwan/opal-browser#sandbox (one command).
 - .tar.gz: run once in the Opal folder:
     sudo chown root:root chrome-sandbox && sudo chmod 4755 chrome-sandbox
 - Or allow user namespaces system-wide (less secure):
     sudo sysctl -w kernel.apparmor_restrict_unprivileged_userns=0

Starting Opal with --no-sandbox works but removes an important protection."
  echo "$MSG" >&2
  if [ -z "$OPAL_LAUNCHER_NO_DIALOG" ] && [ ! -t 2 ]; then
    if command -v zenity >/dev/null 2>&1; then zenity --error --title="Opal" --width=520 --text="$MSG" 2>/dev/null
    elif command -v kdialog >/dev/null 2>&1; then kdialog --title "Opal" --error "$MSG" 2>/dev/null
    elif command -v notify-send >/dev/null 2>&1; then notify-send -a Opal "Opal can't start its sandbox" "Run opal from a terminal to see how to fix it."
    elif command -v xmessage >/dev/null 2>&1; then xmessage -center "$MSG" 2>/dev/null
    fi
  fi
  exit 1
fi

exec "$BIN" $OZONE "$@"
