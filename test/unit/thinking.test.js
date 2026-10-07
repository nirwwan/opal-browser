'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const T = require('../../src/renderer/thinking');

const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;

test('cycle: square 4.4s, collapse, orbit 4.4s, collapse', () => {
  assert.equal(T.stateAt(1).phase, 'square');
  assert.equal(T.stateAt(1).spread, 1);
  assert.equal(T.stateAt(4.4 + 0.1).spread, 0);
  assert.equal(T.stateAt(4.4 + 0.35 + 1).phase, 'orbit');
  assert.ok(near(T.CYCLE, 2 * 4.4 + 2 * 0.35));
  assert.equal(T.stateAt(T.CYCLE + 1).phase, 'square');
  // Shrinks into the point near the end of a phase.
  assert.ok(T.stateAt(4.4 - 0.02).spread < 0.3);
});

test('square: four dots, still for 0.5s, flips 180 degrees by the end of each 1.1s', () => {
  const a = T.squarePoints(0.2);
  assert.equal(a.length, 4);
  for (const d of a) assert.ok(near(d.p[2], 0)); // flat while resting
  const mid = T.squarePoints(0.5 + 0.3); // mid-flip: some depth
  assert.ok(mid.some((d) => Math.abs(d.p[2]) > 0.2));
  const end = T.squarePoints(1.0999);
  for (const d of end) assert.ok(Math.abs(d.p[2]) < 0.02);
  assert.deepEqual(new Set(a.map((d) => d.color)), new Set(T.COLORS));
});

test('orbit: three dots 120 degrees apart at the same radius', () => {
  const pts = T.orbitPoints(2);
  assert.equal(pts.length, 3);
  const r = pts.map(({ p }) => Math.hypot(...p));
  assert.ok(near(r[0], r[1], 1e-9) && near(r[1], r[2], 1e-9));
  const dots = [[0, 1], [1, 2], [0, 2]].map(([i, j]) => pts[i].p.reduce((s, v, k) => s + v * pts[j].p[k], 0) / (r[0] * r[0]));
  for (const d of dots) assert.ok(near(d, -0.5, 1e-9)); // cos 120°
});
