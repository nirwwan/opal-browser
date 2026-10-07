'use strict';
// electron-builder afterPack hook (Linux): the real Electron binary becomes "opal-bin" and
// "opal" becomes packaging/launcher.sh, which checks the sandbox and picks Wayland/X11.
const fs = require('fs');
const path = require('path');

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'linux') return;
  const name = context.packager.executableName;
  const exe = path.join(context.appOutDir, name);
  fs.renameSync(exe, `${exe}-bin`);
  fs.copyFileSync(path.join(__dirname, 'launcher.sh'), exe);
  fs.chmodSync(exe, 0o755);
};
