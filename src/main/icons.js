'use strict';
// Finds the final Opal logo PNGs in build/icons (16-1024px). Files can be named
// like "256x256.png", "icon-256.png" or "opal-256.png"; whatever is there is used.
const fs = require('fs');
const path = require('path');

const ICON_DIR = path.join(__dirname, '../../build/icons');
const BUILD_DIR = path.join(__dirname, '../../build');

function listIcons() {
  let files = [];
  try { files = fs.readdirSync(ICON_DIR).filter((f) => f.toLowerCase().endsWith('.png')); } catch { return []; }
  return files.map((f) => {
    const m = /(\d+)(?:x(\d+))?\.png$/i.exec(f);
    return m ? { file: path.join(ICON_DIR, f), size: Number(m[1]) } : null;
  }).filter(Boolean).sort((a, b) => a.size - b.size);
}

// The icon closest to (and not smaller than) the wanted size, or null.
function iconPath(size = 256) {
  const icons = listIcons();
  if (!icons.length) return null;
  return (icons.find((i) => i.size >= size) || icons[icons.length - 1]).file;
}

// The About screen logo: the wordmark logos once they exist, else the 1024px icon.
function aboutLogo(theme = 'light') {
  const word = path.join(BUILD_DIR, `opal-logo-${theme}.png`);
  if (fs.existsSync(word)) return { file: word, wordmark: true };
  const big = path.join(ICON_DIR, '1024x1024.png');
  if (fs.existsSync(big)) return { file: big, wordmark: false };
  const any = iconPath(1024);
  return any ? { file: any, wordmark: false } : null;
}

module.exports = { listIcons, iconPath, aboutLogo, ICON_DIR };
