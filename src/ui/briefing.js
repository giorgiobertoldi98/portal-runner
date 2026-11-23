// A world's briefing card: a journal page with a picture and a few lines, held up almost full screen from the journal
// item (the journal button, or Tab while it's selected). It behaves like every held item (see held.js); its own
// settings: no pads work while it's open (you can neither walk nor turn), no zoom, and the game keeps running. The world supplies it through the optional
// `mechanics.briefing()` hook: { kicker, title, image (SVG markup), text } or null.
// It closes with its close button or Esc / Enter / Space / Tab.
import { heldControls } from './held.js';

export class Briefing {
  constructor() {
    this.el = document.createElement('div');
    this.el.id = 'briefing';
    this.el.className = 'held-item hidden';
    this.el.innerHTML = '<div class="brief-page" role="dialog" aria-modal="true" aria-labelledby="brief-title">'
      + '<div class="brief-head"><div class="brief-kicker"></div><h2 id="brief-title"></h2></div>'
      + '<div class="brief-image"></div>'
      + '<div class="brief-side"><p class="brief-text"></p><div class="brief-again"></div></div></div>';
    document.getElementById('hud').appendChild(this.el);
    this.q = (s) => this.el.querySelector(s);
    this.hold = { pads: 'none', zoom: false, pauses: false };
    this.ctl = heldControls({ label: 'journal page', onClose: () => this.close() });
    this.q('.brief-page').appendChild(this.ctl.el);
    this.open = false;
    this.onClose = null;
  }

  show(data, { touch = false, onClose } = {}) {
    this.q('.brief-kicker').textContent = data.kicker || '';
    this.q('#brief-title').textContent = data.title || '';
    this.q('.brief-image').innerHTML = data.image || '';
    this.q('.brief-text').textContent = data.text || '';
    this.q('.brief-again').textContent = touch ? 'Reopen it with the journal button' : 'Reopen it from your items (Tab)';
    this.onClose = onClose;
    this.open = true;
    this.el.classList.remove('hidden');
    requestAnimationFrame(() => this.el.classList.add('show'));
  }

  zoomBy() {}

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
