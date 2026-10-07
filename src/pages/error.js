'use strict';
const p = new URLSearchParams(location.search);
const url = p.get('url') || '';
const code = p.get('code') || '';
let host = url;
try { host = new URL(url).hostname; } catch { /* keep raw */ }
const messages = {
  '-105': `${host}'s server address could not be found.`,
  '-106': 'You are offline. Check your internet connection.',
  '-102': `${host} refused to connect.`,
  '-118': `${host} took too long to respond.`,
  '-200': `The connection to ${host} isn't private (certificate problem).`,
  '-201': `The certificate for ${host} has expired or isn't valid yet.`,
  '-202': `The certificate for ${host} isn't trusted.`,
};
document.getElementById('desc').textContent = messages[code] || `${host} could not be loaded.`;
document.getElementById('code').textContent = (p.get('desc') || '') + (code ? ` (${code})` : '');
document.title = host || 'Error';
document.getElementById('retry').addEventListener('click', () => { if (url) location.href = url; });
