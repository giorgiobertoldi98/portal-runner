// Things you hold up to read (the explorers' map, a note) share one behaviour:
// - they open almost full screen, inset by a thin border (--held-m in style.css) where the world stays visible, so
//   their proportions follow the screen's; each one fills its own shape with its own background (the map sits on
//   a scroll, the sketch on a note);
// - while one is open the game's own controls are off: no pads, no walking, no camera (main.js → input.setHold);
//   an item that needs gestures of its own (the map: zoom, pan, its turn slider) handles them on its own element;
// - each says, in its `hold` settings, whether the game stops while it's open: { pauses };
// - each has a close button in its top-right corner (heldControls).

const X_ICON = '<svg viewBox="0 0 24 24" width="18" height="18"><path d="M6 6l12 12M18 6 6 18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>';

// The corner controls: the close button.
export function heldControls({ label, onClose }) {
  const el = document.createElement('div');
  el.className = 'held-ctl';
  el.innerHTML = `<button class="held-btn held-x" aria-label="Close ${label}" title="Close">${X_ICON}</button>`;
  el.querySelector('.held-x').addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); onClose(); });
  el.addEventListener('pointerdown', (e) => e.stopPropagation());   // never starts a gesture on the item behind it
  return { el };
}
