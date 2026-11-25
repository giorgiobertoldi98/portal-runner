// The explorers' map: a hand-drawn chart of the current world, held up almost full screen over the game (which keeps
// running; see held.js for what all held items share). The chart is square, so it sits on an unrolled scroll that
// takes the screen's proportions: wooden rods at both ends, the world's name, the legend and a compass on the parchment
// beside the chart, the close button in the top-right corner.
// It shows you (an arrow pointing the way the explorer faces, with a faint view cone), the portal, the ice hole and every
// gem lying on the ground. Gems lying close together (e.g. the ones you lose when caught) share one diamond with a
// count, so a pile never reads as a single gem. It opens centred on you (stopping at the map's edge); anything out of
// view gets a small pointer at the chart's edge.
// Its gestures are its own and work only on the chart: pinch (touch) or the mouse wheel (PC) zoom around the fingers /
// the cursor, a drag moves the chart, a double tap / double-click goes back to the whole map. Turning is on the right
// page: a turn pad on touch (read by main.js with turnInput()), A / D on PC (read by main.js). The left page says how,
// in a few handwritten words, for the controls in use.
// The world supplies what's drawn through `world.mapInfo`:
//   { kind(x, z) -> 'lake' | 'rock' | 'ground', landmarks: [{ x, z, label }], trees: [{ x, z }], title }
// The world is sampled once into a grid; the chart (paper, lakes, cliffs, contour lines, trees, landmarks) is drawn
// from it for the current view and size, and redrawn only when the view changes (zooming, resizing); the marks are
// drawn on top every frame. Marks keep a fixed size on screen whatever the zoom.
import * as THREE from 'three';
import { gemMapColor } from '../entities/gem.js';
import { heldControls } from './held.js';

const MARK = 1.15;     // size of the marks, in CSS px per unit of their original drawing
const GRID = 256;      // world samples per side
const PAPER = '#e6eef4';
const TAP = { ms: 320, px: 30 };   // two taps this close in time and place reset the zoom

// A zoom level that eases toward its target (the wheel), or follows the fingers at once (a pinch: set()).
class Zoom {
  constructor(min = 1, max = 4) { this.min = min; this.max = max; this.v = 1; this.target = 1; }
  clamp(z) { return Math.min(this.max, Math.max(this.min, z)); }
  by(f) { if (f && f !== 1) this.target = this.clamp(this.target * f); }
  set(z) { this.v = this.target = this.clamp(z); }
  update(dt) {
    const k = 1 - Math.exp(-dt * 14);
    this.v += (this.target - this.v) * k;
    if (Math.abs(this.target - this.v) < 0.002) this.v = this.target;
  }
  get moving() { return this.v !== this.target; }
}

// how to use the chart, for the controls in use: [gesture, what it does]
const HOW = {
  touch: [['Pinch', 'zoom'], ['Drag', 'move'], ['Double tap', 'reset']],
  pc: [['Wheel', 'zoom'], ['Drag', 'move'], ['Double-click', 'reset']],
};
// turning, on the right page: a pad on touch, the A / D keys on PC
const TURN_ARROW = (d) => `<svg viewBox="-12 -12 24 24" aria-hidden="true"><path d="${d > 0 ? 'M6 -5A7.5 7.5 0 1 0 7 3' : 'M-6 -5A7.5 7.5 0 1 1 -7 3'}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>`
  + `<path d="${d > 0 ? 'M2.6 -7.6 6.4 -4.6 2.4 -2.2' : 'M-2.6 -7.6 -6.4 -4.6 -2.4 -2.2'}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const TURN = {
  touch: `<div class="map-pad" aria-label="Turn"><i class="pad-l">${TURN_ARROW(-1)}</i><i class="pad-r">${TURN_ARROW(1)}</i><b class="pad-knob"></b></div>`,
  pc: `<div class="map-keys"><span class="key">${TURN_ARROW(-1)}A</span><span class="key">D${TURN_ARROW(1)}</span></div>`,
};

const COMPASS = '<svg class="map-compass" viewBox="-30 -36 60 66" aria-hidden="true"><circle r="22" fill="none" stroke="currentColor" stroke-width="1.5" opacity=".75"/>'
  + '<circle r="17" fill="none" stroke="currentColor" stroke-width=".8" opacity=".45"/>'
  + '<path d="M0-20 6 0 0 20-6 0z" fill="currentColor" opacity=".25"/><path d="M0-20 6 0H-6z" fill="currentColor"/>'
  + '<path d="M-20 0h-5M20 0h5M0 20v5" stroke="currentColor" stroke-width="1.4"/>'
  + '<text y="-26" text-anchor="middle" font-family="Cinzel, Georgia, serif" font-weight="700" font-size="11" fill="currentColor">N</text></svg>';

export class MapView {
  constructor({ touch = false } = {}) {
    this.el = document.createElement('div');
    this.el.id = 'map-view';
    this.el.className = 'held-item';
    this.el.innerHTML = '<div class="scroll"><i class="rod"></i><div class="sheet">'
      + '<div class="map-side map-side-l"><div class="map-title"></div><i class="map-rule"></i>'
      + '<ul class="map-legend"><li class="lg-you">You</li><li class="lg-gem">Gems</li><li class="lg-portal">Portal</li><li class="lg-hole">Ice hole</li></ul>'
      + '<i class="map-rule"></i><dl class="map-how">'
      + HOW[touch ? 'touch' : 'pc'].map(([g, a]) => `<div><dt>${g}</dt><dd>${a}</dd></div>`).join('') + '</dl></div>'
      + '<div class="map-chart"><canvas></canvas></div>'
      + '<div class="map-side map-side-r">' + COMPASS + '<div class="map-turn">' + TURN[touch ? 'touch' : 'pc'] + '<span class="map-turn-label">Turn</span></div></div>'
      + '</div><i class="rod"></i></div>';
    document.getElementById('hud').appendChild(this.el);
    this.sheet = this.el.querySelector('.sheet');
    this.canvas = this.el.querySelector('canvas');
    this.ctx = this.canvas.getContext('2d');
    this.hold = { pauses: false };   // the game runs on
    this.zoom = new Zoom(1, 4);
    this.c = { x: 0, z: 0 };         // the chart's centre, in metres
    this.anchor = null;              // a point the wheel zooms around: { wx, wz (world), sx, sy (on the chart) }
    this.view = null;                // the view last drawn: { cx, cz, half }
    this.recentre = true;
    this.onClose = null;
    this.ctl = heldControls({ label: 'map', onClose: () => this.onClose && this.onClose() });
    this.sheet.appendChild(this.ctl.el);
    this.open = false;
    this.grids = new Map();
    this.rendered = null;
    this.cs = 0; this.dpr = 1;
    this.lastT = null;
    addEventListener('resize', () => { if (this.open) this.layout(); });
    this.bindChart(this.el.querySelector('.map-chart'));
    this.turn = 0;
    const pad = this.el.querySelector('.map-pad');
    if (pad) this.bindPad(pad);
  }

  // the chart's own gestures: a drag moves it, two fingers pinch, the wheel zooms, a double tap / click resets
  bindChart(el) {
    const ptrs = new Map();
    let pinch = null, lastTap = null;
    const at = (e) => { const r = el.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
    const k = () => this.cs / (2 * this.view.half);
    const toWorld = (p) => ({ x: this.view.cx + (p.x - this.cs / 2) / k(), z: this.view.cz + (p.y - this.cs / 2) / k() });
    const mid = () => { const [a, b] = [...ptrs.values()]; return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, d: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)) }; };
    const startPinch = () => { const m = mid(); pinch = { d: m.d, z: this.zoom.v, w: toWorld(m) }; };
    el.addEventListener('pointerdown', (e) => {
      if (!this.open || !this.view) return;
      e.preventDefault(); e.stopPropagation();
      try { el.setPointerCapture(e.pointerId); } catch (_) { /* not a live pointer */ }
      const p = at(e);
      ptrs.set(e.pointerId, { ...p, x0: p.x, y0: p.y, t0: performance.now() });
      this.anchor = null;
      if (ptrs.size === 2) startPinch();
      el.classList.add('dragging');
    });
    el.addEventListener('pointermove', (e) => {
      const q = ptrs.get(e.pointerId);
      if (!q || !this.view) return;
      const p = at(e), dx = p.x - q.x, dy = p.y - q.y;
      q.x = p.x; q.y = p.y;
      if (ptrs.size >= 2 && pinch) {
        // the point between the fingers stays under them while they spread or move
        const m = mid();
        this.zoom.set(pinch.z * m.d / pinch.d);
        const kk = this.cs * this.zoom.v / (2 * this.view.S);
        this.c = { x: pinch.w.x - (m.x - this.cs / 2) / kk, z: pinch.w.z - (m.y - this.cs / 2) / kk };
      } else if (ptrs.size === 1) {
        this.c = { x: this.c.x - dx / k(), z: this.c.z - dy / k() };
      }
    });
    const up = (e) => {
      const q = ptrs.get(e.pointerId);
      if (!q) return;
      ptrs.delete(e.pointerId);
      pinch = null;
      if (ptrs.size === 2) startPinch();
      if (!ptrs.size) el.classList.remove('dragging');
      // a quick touch that didn't move is a tap; two in a row reset the zoom (a mouse uses dblclick)
      if (e.type !== 'pointerup' || e.pointerType === 'mouse') return;
      const tap = performance.now() - q.t0 < 250 && Math.hypot(q.x - q.x0, q.y - q.y0) < 10;
      if (!tap) { lastTap = null; return; }
      const now = performance.now();
      if (lastTap && now - lastTap.t < TAP.ms && Math.hypot(q.x - lastTap.x, q.y - lastTap.y) < TAP.px) { this.resetZoom(); lastTap = null; }
      else lastTap = { t: now, x: q.x, y: q.y };
    };
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('dblclick', (e) => { e.preventDefault(); this.resetZoom(); });
    // the wheel zooms around the cursor, and only over the chart
    el.addEventListener('wheel', (e) => {
      if (!this.open || !this.view) return;
      e.preventDefault(); e.stopPropagation();
      const dy = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1);
      const p = at(e), w = toWorld(p);
      this.anchor = { wx: w.x, wz: w.z, sx: p.x, sy: p.y };
      this.zoom.by(Math.exp(-Math.max(-300, Math.min(300, dy)) * 0.0018));
    }, { passive: false });
    this.chartPtrs = ptrs;
  }
  resetZoom() { this.anchor = null; this.zoom.target = 1; }

  // the turn pad (touch): hold the knob to one side to keep turning, faster the further out; it springs back
  bindPad(pad) {
    const knob = pad.querySelector('.pad-knob');
    let id = null;
    const set = (e) => {
      const r = pad.getBoundingClientRect(), R = r.width * 0.32;
      const x = Math.max(-R, Math.min(R, e.clientX - (r.left + r.width / 2)));
      knob.style.transform = `translate(calc(-50% + ${x}px), -50%)`;
      const f = x / R;
      this.turn = Math.sign(f) * Math.pow(Math.abs(f), 1.5);   // fine aim near the middle
      pad.classList.toggle('turn-l', f < -0.15); pad.classList.toggle('turn-r', f > 0.15);
    };
    const end = (e) => { if (e.pointerId !== id) return; id = null; this.releasePad(); };
    pad.addEventListener('pointerdown', (e) => {
      e.preventDefault(); e.stopPropagation();
      if (id !== null) return;
      id = e.pointerId; try { pad.setPointerCapture(id); } catch (_) {} pad.classList.add('active'); set(e);
    });
    pad.addEventListener('pointermove', (e) => { if (e.pointerId === id) set(e); });
    pad.addEventListener('pointerup', end);
    pad.addEventListener('pointercancel', end);
    this.releasePad = () => {
      id = null; this.turn = 0; knob.style.transform = '';
      pad.classList.remove('active', 'turn-l', 'turn-r');
    };
  }
  // -1 (left) … 1 (right) from the turn pad, 0 when it's let go
  turnInput() { return this.open ? this.turn : 0; }

  show(on) {
    this.open = on;
    this.el.classList.toggle('show', on);
    if (on) { this.layout(); this.lastT = null; this.recentre = true; this.anchor = null; }
    else { this.releasePad?.(); this.chartPtrs?.clear(); this.el.querySelector('.map-chart').classList.remove('dragging'); }
  }

  // fit the square chart into the scroll: as tall as the sheet allows, keeping room beside it for the legend and compass
  layout() {
    const w = this.sheet.clientWidth, h = this.sheet.clientHeight;
    if (!w || !h) return;
    const pad = Math.round(Math.min(26, Math.max(10, h * 0.035)));
    const side = w < 900 ? 118 : 150;
    const cs = Math.max(120, Math.floor(Math.min(h - 2 * pad, w - 2 * side)));
    const dpr = Math.min(devicePixelRatio || 1, 2);
    this.sheet.style.setProperty('--chart', cs + 'px');
    if (cs !== this.cs || dpr !== this.dpr) {
      this.cs = cs; this.dpr = dpr;
      this.canvas.width = this.canvas.height = Math.round(cs * dpr);
      this.rendered = null;
    }
  }

  // the world sampled once: ground height, and lake / cliff weights (blended, so their edges stay smooth when zoomed)
  grid(world) {
    if (this.grids.has(world)) return this.grids.get(world);
    const S = world.radius + 8, N = GRID, info = world.mapInfo;
    const hs = new Float32Array(N * N), lake = new Float32Array(N * N), rock = new Float32Array(N * N);
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const x = -S + i * (2 * S / (N - 1)), z = -S + j * (2 * S / (N - 1));
      hs[j * N + i] = world.groundAt ? world.groundAt(x, z) : world.heightAt(x, z);
      const kd = info.kind(x, z);
      lake[j * N + i] = kd === 'lake' ? 1 : 0;
      rock[j * N + i] = kd === 'rock' ? 1 : 0;
    }
    const gr = { S, N, hs, lake, rock };
    this.grids.set(world, gr);
    return gr;
  }

  // draw the chart for a view (centre cx, cz and half-width, in metres) at the canvas's resolution
  render(world, view) {
    const { S, N, hs, lake, rock } = this.grid(world);
    const info = world.mapInfo;
    const P = this.canvas.width, dpr = this.dpr, cs = this.cs;
    const c = document.createElement('canvas'); c.width = c.height = P;
    const g = c.getContext('2d');
    const img = g.createImageData(P, P), d = img.data;
    const H = new Float32Array(P * P);
    const R = new Uint8Array(P * P);   // cliff pixels (contours drawn lighter over their hatching)
    const m = (2 * view.half) / P, x0 = view.cx - view.half, z0 = view.cz - view.half;
    const toG = (N - 1) / (2 * S);
    const paper = [232, 238, 242], lakeC = [158, 202, 230], rockC = [168, 178, 192];
    const hatch = Math.max(1, Math.round(dpr)), hatchEvery = 5 * hatch;
    for (let y = 0; y < P; y++) {
      let gz = ((z0 + (y + 0.5) * m) + S) * toG; gz = Math.min(N - 1.001, Math.max(0, gz));
      const j = Math.floor(gz), tz = gz - j;
      for (let x = 0; x < P; x++) {
        let gx = ((x0 + (x + 0.5) * m) + S) * toG; gx = Math.min(N - 1.001, Math.max(0, gx));
        const i = Math.floor(gx), tx = gx - i, a = j * N + i;
        const w00 = (1 - tx) * (1 - tz), w10 = tx * (1 - tz), w01 = (1 - tx) * tz, w11 = tx * tz;
        const p = y * P + x;
        H[p] = hs[a] * w00 + hs[a + 1] * w10 + hs[a + N] * w01 + hs[a + N + 1] * w11;
        const lk = lake[a] * w00 + lake[a + 1] * w10 + lake[a + N] * w01 + lake[a + N + 1] * w11;
        const rk = rock[a] * w00 + rock[a + 1] * w10 + rock[a + N] * w01 + rock[a + N + 1] * w11;
        const kd = lk > 0.5 ? 1 : rk > 0.5 ? 2 : 0;
        if (kd === 2) R[p] = 1;
        const col = kd === 1 ? lakeC : kd === 2 ? rockC : paper;
        const shade = kd === 2 && ((x + y) % hatchEvery < hatch) ? -34 : 0;   // hatching on cliffs
        const n = ((x * 73856093) ^ (y * 19349663)) & 15;                      // paper grain
        const o = p * 4;
        d[o] = col[0] + shade - n * 0.6; d[o + 1] = col[1] + shade - n * 0.6; d[o + 2] = col[2] + shade - n * 0.4; d[o + 3] = 255;
      }
    }
    // contour lines every 3 m (every 5th one heavier), drawn where the 3 m band changes between neighbouring pixels
    const thin = Math.max(1, Math.round(dpr * 0.75)), thick = thin * 2;
    for (let y = 0; y < P - thick; y++) for (let x = 0; x < P - thick; x++) {
      const p = y * P + x, a = Math.floor(H[p] / 3);
      const r1 = Math.floor(H[p + thin] / 3), d1 = Math.floor(H[p + thin * P] / 3);
      let line = 0;
      if (r1 !== a || d1 !== a) line = Math.max(a, r1, d1) % 5 === 0 ? 2 : 1;
      else {
        const r2 = Math.floor(H[p + thick] / 3), d2 = Math.floor(H[p + thick * P] / 3);
        if ((r2 !== a || d2 !== a) && Math.max(a, r2, d2) % 5 === 0) line = 2;
      }
      if (!line) continue;
      const k = (line === 2 ? 70 : 42) * (R[p] ? 0.4 : 1), o = p * 4;
      d[o] -= k * 0.9; d[o + 1] -= k * 0.7; d[o + 2] -= k * 0.45;
    }
    g.putImageData(img, 0, 0);
    g.scale(dpr, dpr);
    const sx = (x) => (x - view.cx) / view.half * cs / 2 + cs / 2;
    const sz = (z) => (z - view.cz) / view.half * cs / 2 + cs / 2;
    const zoom = S / view.half;
    // trees
    g.fillStyle = 'rgba(40, 86, 74, 0.55)';
    const tr = 1.2 * Math.min(2.2, Math.sqrt(zoom));
    for (const t of info.trees || []) {
      const x = sx(t.x), y = sz(t.z);
      if (x < -4 || y < -4 || x > cs + 4 || y > cs + 4) continue;
      g.beginPath(); g.arc(x, y, tr, 0, 7); g.fill();
    }
    // the playable edge
    g.strokeStyle = 'rgba(52, 38, 28, 0.55)'; g.lineWidth = 1.6; g.setLineDash([6, 5]);
    g.beginPath(); g.arc(sx(0), sz(0), (world.radius - 10) * cs / (2 * view.half), 0, 7); g.stroke(); g.setLineDash([]);
    // landmarks
    const fs = Math.round(Math.min(16, Math.max(12, cs * 0.024)));
    g.textAlign = 'center'; g.textBaseline = 'top';
    for (const l of info.landmarks || []) {
      const x = sx(l.x), y = sz(l.z);
      if (x < -60 || y < -20 || x > cs + 60 || y > cs + 20) continue;
      g.fillStyle = 'rgba(52, 38, 28, 0.9)';
      g.beginPath(); g.moveTo(x, y - 5); g.lineTo(x + 4.5, y + 3); g.lineTo(x - 4.5, y + 3); g.closePath(); g.fill();
      g.font = `700 ${fs}px Cinzel, Georgia, serif`;
      g.lineWidth = 4; g.strokeStyle = 'rgba(230, 238, 244, 0.9)'; g.strokeText(l.label, x, y + 6);
      g.fillStyle = 'rgba(52, 38, 28, 0.9)'; g.fillText(l.label, x, y + 6);
    }
    // a soft edge, as on old paper
    const vg = g.createRadialGradient(cs / 2, cs / 2, cs * 0.3, cs / 2, cs / 2, cs * 0.72);
    vg.addColorStop(0, 'rgba(90, 70, 40, 0)'); vg.addColorStop(1, 'rgba(90, 70, 40, 0.24)');
    g.fillStyle = vg; g.fillRect(0, 0, cs, cs);
    this.rendered = { img: c, world, cx: view.cx, cz: view.cz, half: view.half, size: P };
  }

  // state = { player: {x, z}, heading (the explorer's facing, radians), gems: [{x, z}], portal: {x, z}, hole: {x, z} | null, t }
  draw(world, state) {
    if (!this.open || !world.mapInfo) return;
    if (!this.cs) this.layout();
    if (!this.cs) return;
    const t = state.t;
    const dt = this.lastT === null ? 0 : Math.min(0.1, Math.max(0, t - this.lastT));
    this.lastT = t;
    this.zoom.update(dt);
    const title = world.mapInfo.title || world.def?.name || '';
    if (this.title !== title) {
      this.title = title;
      this.el.querySelector('.map-title').textContent = title;
    }
    this.el.querySelector('.lg-hole').style.display = state.hole ? '' : 'none';
    // the view: the whole map at 1×; zoomed in, wherever you moved it (it opens centred on you), never past the map's edge
    const S = this.grid(world).S, half = S / this.zoom.v, lim = S - half, cs = this.cs;
    if (this.recentre) { this.c = { x: state.player.x, z: state.player.z }; this.recentre = false; }
    if (this.anchor) {
      // zooming with the wheel: the point under the cursor stays under it
      const a = this.anchor, kk = cs / (2 * half);
      this.c = { x: a.wx - (a.sx - cs / 2) / kk, z: a.wz - (a.sy - cs / 2) / kk };
      if (!this.zoom.moving) this.anchor = null;
    }
    this.c = { x: Math.max(-lim, Math.min(lim, this.c.x)), z: Math.max(-lim, Math.min(lim, this.c.z)) };
    const view = { half, cx: this.c.x, cz: this.c.z, S };
    this.view = view;
    const r = this.rendered;
    const fresh = r && r.world === world && r.size === this.canvas.width;
    const same = fresh && Math.abs(r.half - view.half) < 1e-3 * S && Math.hypot(r.cx - view.cx, r.cz - view.cz) * cs / (2 * half) < 0.5;
    // while the chart is zoomed or dragged it's drawn afresh at most every 60 ms (the last drawing is stretched and
    // moved along in between), so a large, sharp chart never holds up the frame
    const busy = this.zoom.moving || this.chartPtrs.size > 0, now = performance.now();
    if (!same && (!fresh || !busy || now - (this.renderedAt || 0) > 60)) { this.render(world, view); this.renderedAt = now; }
    const g = this.ctx;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.fillStyle = PAPER; g.fillRect(0, 0, cs, cs);
    const k = cs / (2 * view.half);
    {
      const R = this.rendered;
      g.drawImage(R.img, (R.cx - R.half - view.cx) * k + cs / 2, (R.cz - R.half - view.cz) * k + cs / 2, 2 * R.half * k, 2 * R.half * k);
    }
    const px = (x) => (x - view.cx) * k + cs / 2, pz = (z) => (z - view.cz) * k + cs / 2;
    const M = MARK;
    g.save();
    g.beginPath(); g.rect(0, 0, cs, cs); g.clip();
    const off = [];   // marks out of view, pointed at from the chart's edge
    const inView = (x, y) => x > 0 && y > 0 && x < cs && y < cs;
    // the ice hole
    if (state.hole) {
      const x = px(state.hole.x), y = pz(state.hole.z);
      if (!inView(x, y)) off.push({ x, y, color: 'rgba(30, 90, 140, 0.95)' });
      g.strokeStyle = 'rgba(30, 90, 140, 0.95)'; g.lineWidth = 2.2;
      g.beginPath();
      for (let a = 0; a < 12.6; a += 0.2) { const rr = (1 + a * 0.7) * M; g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
      g.stroke();
      g.font = `700 ${Math.round(14 * M)}px Cinzel, Georgia, serif`; g.textAlign = 'center'; g.textBaseline = 'top';
      g.lineWidth = 4; g.strokeStyle = 'rgba(230, 238, 244, 0.9)'; g.strokeText('Ice hole', x, y + 12 * M);
      g.fillStyle = 'rgba(30, 90, 140, 0.95)'; g.fillText('Ice hole', x, y + 12 * M);
    }
    // the portal
    {
      const x = px(state.portal.x), y = pz(state.portal.z);
      if (!inView(x, y)) off.push({ x, y, color: '#1890c8' });
      const pulse = 1 + 0.12 * Math.sin(t * 3);
      g.fillStyle = 'rgba(40, 170, 230, 0.25)';
      g.beginPath(); g.arc(x, y, 13 * M * pulse, 0, 7); g.fill();
      g.strokeStyle = '#1890c8'; g.lineWidth = 3;
      g.beginPath(); g.ellipse(x, y, 6 * M, 8.5 * M, 0, 0, 7); g.stroke();
    }
    // gems: bright, pulsing diamonds. Gems closer than a diamond's width on the chart are drawn as one, with a count.
    const piles = [];
    for (const gm of state.gems) {
      const x = px(gm.x), y = pz(gm.z);
      const pile = piles.find((p) => Math.hypot(p.x - x, p.y - y) < 12 * M);
      if (pile) { pile.n++; pile.x += (x - pile.x) / pile.n; pile.y += (y - pile.y) / pile.n; }
      else piles.push({ x, y, n: 1, seed: gm.x });
    }
    // gems in this world's own colour (its gem's revealed colour, see worlds/*.js `gem`)
    const gc = new THREE.Color(gemMapColor(world.def?.gem)), gHex = '#' + gc.getHexString();
    const gRgb = `${Math.round(gc.r * 255)}, ${Math.round(gc.g * 255)}, ${Math.round(gc.b * 255)}`;
    for (const { x, y, n, seed } of piles) {
      if (!inView(x, y)) off.push({ x, y, color: gHex });
      const p = 0.5 + 0.5 * Math.sin(t * 4 + seed * 0.1);
      const glow = g.createRadialGradient(x, y, 0, x, y, 16 * M);
      glow.addColorStop(0, `rgba(${gRgb}, ${0.55 + 0.3 * p})`); glow.addColorStop(1, `rgba(${gRgb}, 0)`);
      g.fillStyle = glow; g.beginPath(); g.arc(x, y, 16 * M, 0, 7); g.fill();
      g.fillStyle = gHex; g.strokeStyle = '#fff'; g.lineWidth = 1.5;
      g.beginPath(); g.moveTo(x, y - 7 * M); g.lineTo(x + 5 * M, y); g.lineTo(x, y + 7 * M); g.lineTo(x - 5 * M, y); g.closePath(); g.fill(); g.stroke();
      if (n > 1) {
        const bx = x + 12 * M, by = y - 10 * M;
        g.fillStyle = gHex; g.strokeStyle = '#fff'; g.lineWidth = 2;
        g.beginPath(); g.arc(bx, by, 8.5 * M, 0, 7); g.fill(); g.stroke();
        g.fillStyle = '#fff'; g.font = `800 ${Math.round(12 * M)}px Inter, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText(String(n), bx, by + 0.5);
      }
    }
    // you: an arrow pointing the way the explorer faces, with a faint view cone
    {
      const x = px(state.player.x), y = pz(state.player.z);
      const a = Math.atan2(Math.cos(state.heading), Math.sin(state.heading));
      const cr = 70 * M;
      const cone = g.createRadialGradient(x, y, 0, x, y, cr);
      cone.addColorStop(0, 'rgba(255, 140, 40, 0.38)'); cone.addColorStop(1, 'rgba(255, 140, 40, 0)');
      g.fillStyle = cone;
      g.beginPath(); g.moveTo(x, y); g.arc(x, y, cr, a - 0.5, a + 0.5); g.closePath(); g.fill();
      g.save(); g.translate(x, y); g.rotate(a); g.scale(M, M);
      g.fillStyle = '#ff7a1a'; g.strokeStyle = '#fff'; g.lineWidth = 2 / M;
      g.beginPath(); g.moveTo(13, 0); g.lineTo(-8, 8); g.lineTo(-3.5, 0); g.lineTo(-8, -8); g.closePath(); g.fill(); g.stroke();
      g.restore();
    }
    // pointers at the chart's edge toward what's out of view
    const e = 13;
    for (const o of off) {
      const dx = o.x - cs / 2, dy = o.y - cs / 2;
      const s = Math.min((cs / 2 - e) / Math.max(1e-6, Math.abs(dx)), (cs / 2 - e) / Math.max(1e-6, Math.abs(dy)));
      const x = cs / 2 + dx * s, y = cs / 2 + dy * s;
      g.save(); g.translate(x, y); g.rotate(Math.atan2(dy, dx));
      g.fillStyle = o.color; g.strokeStyle = '#fff'; g.lineWidth = 1.6;
      g.beginPath(); g.moveTo(8, 0); g.lineTo(-5, 6.5); g.lineTo(-2, 0); g.lineTo(-5, -6.5); g.closePath(); g.fill(); g.stroke();
      g.restore();
    }
    g.restore();
  }
}
