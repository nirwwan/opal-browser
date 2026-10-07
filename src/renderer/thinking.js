'use strict';
// Opal's thinking indicator, drawn on a canvas.
// Two phases of ~4.4s, with a 0.35s collapse into one centre point between them:
//  - Square: four dots on a square's corners; every 1.1s the square flips 180° in 3D
//    around a diagonal (0.6s, ease-in-out), alternating diagonals.
//  - Orbit: three dots 120° apart on a 3D circle spinning ~2.6 rad/s; the orbit plane
//    tilts 1.0 ± 0.55 rad over ~7s and turns 0.5 rad/s.
// Nearer dots are bigger (radius ∝ perspective scale²) and drawn back to front.
// Any canvas with data-thinking is animated by one shared loop; drawing depends only
// on the clock, so canvases re-created by a re-render keep their place in the cycle.
(function (root) {
  const COLORS = ['#5b7cf0', '#2fb59a', '#f08a3c', '#a77bf0'];
  const PHASE = 4.4;
  const GAP = 0.35;
  const CYCLE = 2 * PHASE + 2 * GAP;
  const FLIP_EVERY = 1.1;
  const FLIP = 0.6;
  const FOCAL = 3.2; // perspective distance in units of the shape radius
  const EPOCH = 0; // shared clock origin: performance.now() based

  const ease = (x) => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2);
  const clamp01 = (x) => Math.max(0, Math.min(1, x));

  // Rotate point p around unit axis k by angle a (Rodrigues).
  function rotate(p, k, a) {
    const c = Math.cos(a);
    const s = Math.sin(a);
    const dot = k[0] * p[0] + k[1] * p[1] + k[2] * p[2];
    const cross = [k[1] * p[2] - k[2] * p[1], k[2] * p[0] - k[0] * p[2], k[0] * p[1] - k[1] * p[0]];
    return [0, 1, 2].map((i) => p[i] * c + cross[i] * s + k[i] * dot * (1 - c));
  }

  function squarePoints(t) {
    const flips = Math.floor(t / FLIP_EVERY);
    const local = t - flips * FLIP_EVERY;
    const progress = local < FLIP_EVERY - FLIP ? 0 : ease((local - (FLIP_EVERY - FLIP)) / FLIP);
    const r = 1 / Math.SQRT2;
    const axis = flips % 2 === 0 ? [r, r, 0] : [r, -r, 0];
    const s = 0.72;
    const corners = [[-s, -s, 0], [s, -s, 0], [s, s, 0], [-s, s, 0]];
    // Every completed flip is 180°; which corners sit where after earlier flips:
    // a 180° turn about a diagonal swaps the two off-diagonal corners.
    const order = [0, 1, 2, 3];
    for (let i = 0; i < flips % 4; i++) {
      if (i % 2 === 0) { const tmp = order[1]; order[1] = order[3]; order[3] = tmp; } else { const tmp = order[0]; order[0] = order[2]; order[2] = tmp; }
    }
    return order.map((ci, idx) => ({ p: rotate(corners[idx], axis, progress * Math.PI), color: COLORS[ci] }));
  }

  function orbitPoints(t) {
    const spin = 2.6 * t;
    const tilt = 1.0 + 0.55 * Math.sin((2 * Math.PI * t) / 7);
    const yaw = 0.5 * t;
    const R = 0.85;
    const out = [];
    for (let i = 0; i < 3; i++) {
      const a = spin + (i * 2 * Math.PI) / 3;
      let p = [R * Math.cos(a), R * Math.sin(a), 0];
      p = rotate(p, [1, 0, 0], tilt);
      p = rotate(p, [0, 1, 0], yaw);
      out.push({ p, color: COLORS[i] });
    }
    return out;
  }

  // Where we are in the cycle: phase name, time in phase, and how far the dots
  // are from the centre (1 = full shape, 0 = collapsed to a point).
  function stateAt(t) {
    const c = ((t % CYCLE) + CYCLE) % CYCLE;
    const segs = [['square', PHASE], ['gap', GAP], ['orbit', PHASE], ['gap', GAP]];
    let acc = 0;
    for (let i = 0; i < segs.length; i++) {
      const [name, len] = segs[i];
      if (c < acc + len) {
        const local = c - acc;
        if (name !== 'gap') {
          // Grow out of the point at the start, shrink into it at the end.
          const k = Math.min(1, ease(clamp01(local / (GAP / 2))), ease(clamp01((len - local) / (GAP / 2))));
          return { phase: name, t: local, spread: k };
        }
        return { phase: i === 1 ? 'square' : 'orbit', t: i === 1 ? PHASE : PHASE, spread: 0 };
      }
      acc += len;
    }
    return { phase: 'square', t: 0, spread: 1 };
  }

  // Draws one frame. opts: { size (CSS px), oneColor, accent, fade (0..1 radius factor) }
  function draw(canvas, now, opts = {}) {
    const ctx = canvas.getContext('2d');
    const dpr = root.devicePixelRatio || 1;
    const size = opts.size || 24;
    if (canvas.width !== Math.round(size * dpr)) { canvas.width = Math.round(size * dpr); canvas.height = Math.round(size * dpr); }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size, size);
    const fade = opts.fade === undefined ? 1 : opts.fade;
    if (fade <= 0) return;
    const half = size / 2;
    const unit = size * 0.36;
    const baseR = size * (size <= 16 ? 0.105 : 0.085);

    if (opts.still) {
      for (let i = 0; i < 3; i++) {
        ctx.fillStyle = opts.oneColor ? opts.accent : COLORS[i];
        ctx.beginPath();
        ctx.arc(half + (i - 1) * size * 0.3, half, baseR * fade, 0, Math.PI * 2);
        ctx.fill();
      }
      return;
    }

    const st = stateAt(now / 1000);
    const pts = st.phase === 'square' ? squarePoints(st.t) : orbitPoints(st.t);
    const proj = pts.map(({ p, color }) => {
      const z = p[2] * st.spread;
      const scale = FOCAL / (FOCAL - z);
      return { x: half + p[0] * st.spread * unit * scale, y: half + p[1] * st.spread * unit * scale, z, r: baseR * scale * scale * fade, color };
    }).sort((a, b) => a.z - b.z);
    for (const d of proj) {
      ctx.fillStyle = opts.oneColor ? opts.accent : d.color;
      ctx.beginPath();
      ctx.arc(d.x, d.y, Math.max(0, d.r), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // ---- shared animation loop for canvas[data-thinking] ----
  const reduced = () => root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let running = false;
  const config = { oneColor: false, accent: '#2a4bc7' };

  function frame(now) {
    const nodes = root.document ? root.document.querySelectorAll('canvas[data-thinking]') : [];
    if (!nodes.length) { running = false; return; }
    const still = reduced();
    for (const c of nodes) {
      const size = Number(c.dataset.thinking) || 24;
      let fade = 1;
      if (c.dataset.doneAt) fade = 1 - clamp01((now - Number(c.dataset.doneAt)) / 350);
      draw(c, now - EPOCH, { size, oneColor: config.oneColor, accent: config.accent, fade, still });
      if (c.dataset.doneAt && fade <= 0) delete c.dataset.thinking;
    }
    root.requestAnimationFrame(frame);
  }

  function kick() {
    if (running || !root.requestAnimationFrame) return;
    running = true;
    root.requestAnimationFrame(frame);
  }

  // Marks a canvas as finished: the dots shrink away over 0.35s.
  function finish(canvas) {
    if (canvas && canvas.dataset.thinking) canvas.dataset.doneAt = String(root.performance.now());
    kick();
  }

  function configure(c) {
    Object.assign(config, c);
    kick();
  }

  const api = { draw, stateAt, squarePoints, orbitPoints, kick, finish, configure, COLORS, PHASE, GAP, CYCLE };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.OpalThinking = api;
})(typeof window !== 'undefined' ? window : globalThis);
