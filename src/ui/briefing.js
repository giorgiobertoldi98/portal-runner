// A world's note: a handwritten page with a picture and one line, held up almost full screen from the note item
// (its button, or Space while it's selected). It behaves like every held item (see held.js): no pad works while it's
// open (you can neither walk nor turn), no zoom, and the game keeps running.
// The world supplies it through the optional `mechanics.briefing()` hook: { image (SVG markup), text } or null.
// It closes with its close button or Esc / Enter / Space.
import { heldControls } from './held.js';

export class Briefing {
  constructor() {
    this.el = document.createElement('div');
    this.el.id = 'briefing';
    this.el.className = 'held-item';
    this.el.innerHTML = '<div class="brief-page" role="dialog" aria-modal="true" aria-label="Note">'
      + '<div class="brief-image"></div><p class="brief-text"></p></div>';
    document.getElementById('hud').appendChild(this.el);
    this.q = (s) => this.el.querySelector(s);
    this.hold = { pads: 'none', zoom: false, pauses: false };
    this.ctl = heldControls({ label: 'note', onClose: () => this.close() });
    this.q('.brief-page').appendChild(this.ctl.el);
    this.open = false;
    this.image = null;
    this.onClose = null;
  }

  show(data, { onClose } = {}) {
    // the sketch is built once: the world hands back the same markup every time
    if (data.image !== this.image) { this.image = data.image; this.q('.brief-image').innerHTML = data.image || ''; }
    this.q('.brief-text').textContent = data.text || '';
    this.onClose = onClose;
    this.open = true;
    this.el.classList.add('show');
  }

  zoomBy() {}

  close() {
    if (!this.open) return;
    this.open = false;
    this.el.classList.remove('show');
    const cb = this.onClose; this.onClose = null;
    if (cb) cb();
  }

  // close without running the callback (leaving the run)
  dismiss() { this.onClose = null; this.close(); }
}
