// A world's note: a handwritten page with a picture and one line, held up almost full screen from the note item
// (its button, or Space while it's selected). It behaves like every held item (see held.js): while it's open you can
// neither walk nor turn, and the game keeps running. It has no gestures of its own.
// The world supplies it through the optional `mechanics.briefing()` hook: { image (SVG markup), text } or null.
// It closes with its close button or Esc / Enter / Space.
import { heldControls } from './held.js';

export class Briefing {
  constructor() {
    this.el = document.createElement('div');
    this.el.id = 'briefing';
    this.el.className = 'held-item hidden';
    this.el.innerHTML = '<div class="brief-page" role="dialog" aria-modal="true" aria-label="Note">'
      + '<div class="brief-image"></div><p class="brief-text"></p></div>';
    document.getElementById('hud').appendChild(this.el);
    this.q = (s) => this.el.querySelector(s);
    this.hold = { pauses: false };
    this.ctl = heldControls({ label: 'note', onClose: () => this.close() });
    this.q('.brief-page').appendChild(this.ctl.el);
    this.open = false;
    this.onClose = null;
  }

  show(data, { onClose } = {}) {
    this.q('.brief-image').innerHTML = data.image || '';
    this.q('.brief-text').textContent = data.text || '';
    this.onClose = onClose;
    this.open = true;
    this.el.classList.remove('hidden');
    requestAnimationFrame(() => this.el.classList.add('show'));
  }

  close() {
    if (!this.open) return;
    this.open = false;
    this.el.classList.remove('show');
    setTimeout(() => { if (!this.open) this.el.classList.add('hidden'); }, 250);
    const cb = this.onClose; this.onClose = null;
    if (cb) cb();
  }

  // close without running the callback (leaving the run)
  dismiss() { this.onClose = null; this.close(); }
}
