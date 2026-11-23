// Things you hold up to read (the explorers' map, a journal page) share one behaviour:
// - they open almost full screen, inset by a thin border (--held-m in style.css) where the world stays visible, so
//   their proportions follow the screen's; each one fills its own shape with its own background (the map sits on
//   a scroll, the sketch on a journal page);
// - each item says what still works while it's open (its `hold` settings, read by main.js):
//     pads: 'both' (walk and turn), 'right' (turn the camera only) or 'none' (neither);
//     zoom: whether it zooms (pinch, the mouse wheel, + / − and its zoom buttons);
//     pauses: whether the game stops while it's open;
// - each has the same controls in its top-right corner: a close button, then zoom in / out if it zooms.
//   main.js routes the input; this module builds the controls.

const X_ICON = '<svg viewBox="0 0 24 24" width="18" height="18"><path d="M6 6l12 12M18 6 6 18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>';
const PLUS = '<svg viewBox="0 0 24 24" width="18" height="18"><path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>';
const MINUS = '<svg viewBox="0 0 24 24" width="18" height="18"><path d="M5 12h14" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>';

// A zoom level that eases toward its target.
export class Zoom {
  constructor(min = 1, max = 4) { this.min = min; this.max = max; this.v = 1; this.target = 1; }
  by(f) { if (f && f !== 1) this.target = Math.min(this.max, Math.max(this.min, this.target * f)); }
  update(dt) {
    const k = 1 - Math.exp(-dt * 14);
    this.v += (this.target - this.v) * k;
    if (Math.abs(this.target - this.v) < 0.002) this.v = this.target;
  }
  get moving() { return this.v !== this.target; }
}

// The corner controls: close, zoom in, zoom out. `zoom` is a Zoom; the buttons disable at its limits.
export function heldControls({ label, onClose, zoom = null, step = 1.6 }) {
  const el = document.createElement('div');
  el.className = 'held-ctl';
  el.innerHTML = `<button class="held-btn held-x" aria-label="Close ${label}" title="Close">${X_ICON}</button>`
    + (zoom ? `<button class="held-btn held-in" aria-label="Zoom in" title="Zoom in (+)">${PLUS}</button>`
    + `<button class="held-btn held-out" aria-label="Zoom out" title="Zoom out (−)">${MINUS}</button>` : '');
  const stop = (e) => { e.preventDefault(); e.stopPropagation(); };
  el.querySelector('.held-x').addEventListener('click', (e) => { stop(e); onClose(); });
  if (zoom) {
    el.querySelector('.held-in').addEventListener('click', (e) => { stop(e); zoom.by(step); refresh(); });
    el.querySelector('.held-out').addEventListener('click', (e) => { stop(e); zoom.by(1 / step); refresh(); });
  }
  // buttons swallow their own touches so they never start a camera drag
  el.addEventListener('pointerdown', (e) => e.stopPropagation());
  const zin = el.querySelector('.held-in'), zout = el.querySelector('.held-out');
  const refresh = () => { if (!zoom) return; zin.disabled = zoom.target >= zoom.max - 1e-3; zout.disabled = zoom.target <= zoom.min + 1e-3; };
  refresh();
  return { el, refresh };
}
