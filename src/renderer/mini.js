'use strict';
/* global icon */
const api = window.opal;
document.getElementById('back').innerHTML = icon('external-link', 14);
document.getElementById('close').innerHTML = icon('x', 14);
document.getElementById('back').addEventListener('click', () => api.cmd('pip-return'));
document.getElementById('close').addEventListener('click', () => api.cmd('pip'));
api.on('state', (s) => { if (s.title) document.getElementById('t').textContent = s.title; });
