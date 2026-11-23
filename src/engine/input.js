// Keyboard + mouse + touch. On touch screens a joystick sits bottom-left (it jumps to where your thumb
// lands anywhere on the left side) and the right side of the screen drags the camera.
// While an item is held up (the map, a note: `holding`), `hold` says what still works: `move` (the joystick and
// movement keys), `look` (the camera: right side / turn pad / mouse) and `zoom` (pinching with two fingers anywhere, or
// the mouse wheel, read with consumeZoom()). Set it with setHold().
// With nothing held up, the mouse wheel steps through your items instead (consumeWheel(): +1 / -1 per notch).

export class Input {
  constructor(canvas, joystickEl, knobEl) {
    this.keys = new Set();
    this.look = { dx: 0, dy: 0 };
    this.lastLookTime = -10;
    this.joy = { id: null, ox: 0, oy: 0, x: 0, y: 0, active: false };
    this.lookPointer = null;
    this.mouseDrag = null;
    this.joystickEl = joystickEl;
    this.knobEl = knobEl;
    this.joyRadius = 55;
    this.lookpadEl = document.getElementById('lookpad');
    this.enabled = false;
    this.locked = false;
    this.holding = false;
    this.hold = { move: true, look: true, zoom: false };
    this.touches = new Map();   // touch pointers down, for pinching
    this.pinchD = 0;
    this.zoomF = 1;
    this.wheelAcc = 0;          // wheel travel not yet turned into an item step
    this.wheelSteps = 0;

    addEventListener('keydown', (e) => {
      this.keys.add(e.code);
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
    addEventListener('wheel', (e) => {
      const dy = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1);
      if (!this.holding) {
        // one step per mouse notch; a trackpad's small deltas add up to one (main.js reads them only during a run)
        this.wheelAcc += dy;
        if (Math.abs(this.wheelAcc) >= 60) { this.wheelSteps += Math.sign(this.wheelAcc); this.wheelAcc = 0; }
        return;
      }
      if (!this.hold.zoom) return;
      e.preventDefault();
      this.zoomF *= Math.exp(-Math.max(-300, Math.min(300, dy)) * 0.0018);
    }, { passive: false });

    canvas.addEventListener('pointerdown', (e) => this.onDown(e));
    addEventListener('pointermove', (e) => this.onMove(e));
    addEventListener('pointerup', (e) => this.onUp(e));
    addEventListener('pointercancel', (e) => this.onUp(e));
    document.addEventListener('pointerlockchange', () => { this.locked = document.pointerLockElement === canvas; });
    addEventListener('mousemove', (e) => {
      if (this.locked && this.enabled) this.addLook(e.movementX, e.movementY);
    });
    this.canvas = canvas;
  }

  addLook(dx, dy) {
    this.look.dx += dx; this.look.dy += dy;
    this.lastLookTime = performance.now() / 1000;
  }

  onDown(e) {
    if (!this.enabled) return;
    if (e.pointerType === 'mouse') {
      if (this.holding && !this.hold.look) return;
      this.mouseDrag = { x: e.clientX, y: e.clientY };
      return;
    }
    // touch / pen
    this.touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.holding) {
      // two fingers pinch an item that zooms; otherwise each side works only if the item lets its pad work
      if (this.hold.zoom && this.touches.size >= 2) { this.pinchD = this.pinchDist(); this.stopLook(); return; }
      if (e.clientX < innerWidth * 0.45 ? !this.hold.move : !this.hold.look) return;
    }
    if (e.clientX < innerWidth * 0.45 && this.joy.id === null) {
      this.joy = { id: e.pointerId, ox: e.clientX, oy: e.clientY, x: 0, y: 0, active: true };
      this.joyRadius = Math.max(36, (this.joystickEl.offsetWidth || 150) * 0.37);   // follows the pad's size (smaller on short screens)
      this.joystickEl.style.left = e.clientX + 'px';
      this.joystickEl.style.top = e.clientY + 'px';
      this.joystickEl.classList.add('active');
      this.knobEl.style.transform = 'translate(-50%, -50%)';
    } else if (this.lookPointer === null) {
      this.lookPointer = { id: e.pointerId, x: e.clientX, y: e.clientY };
      if (this.lookpadEl) this.lookpadEl.classList.add('active');
    }
  }

  pinchDist() {
    const [a, b] = [...this.touches.values()];
    return Math.max(1, Math.hypot(a.x - b.x, a.y - b.y));
  }

  stopLook() {
    this.lookPointer = null;
    if (this.lookpadEl) this.lookpadEl.classList.remove('active');
  }

  setHold(hold) {
    this.holding = !!hold;
    this.hold = hold || { move: true, look: true, zoom: false };
  }

  consumeZoom() { const f = this.zoomF; this.zoomF = 1; return f; }
  consumeWheel() { const s = this.wheelSteps; this.wheelSteps = 0; return s; }

  onMove(e) {
    const tp = this.touches.get(e.pointerId);
    if (tp) {
      tp.x = e.clientX; tp.y = e.clientY;
      if (this.holding && this.hold.zoom && this.touches.size >= 2) {
        const d = this.pinchDist();
        if (this.pinchD) this.zoomF *= d / this.pinchD;
        this.pinchD = d;
        return;
      }
    }
    if (this.mouseDrag && e.pointerType === 'mouse' && !this.locked) {
      this.addLook(e.clientX - this.mouseDrag.x, e.clientY - this.mouseDrag.y);
      this.mouseDrag.x = e.clientX; this.mouseDrag.y = e.clientY;
    }
    if (this.joy.id === e.pointerId) {
      let dx = e.clientX - this.joy.ox, dy = e.clientY - this.joy.oy;
      const d = Math.hypot(dx, dy), R = this.joyRadius;
      if (d > R) { dx *= R / d; dy *= R / d; }
      this.joy.x = dx / R; this.joy.y = dy / R;
      this.knobEl.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    } else if (this.lookPointer && this.lookPointer.id === e.pointerId) {
      this.addLook((e.clientX - this.lookPointer.x) * 1.4, (e.clientY - this.lookPointer.y) * 1.4);
      this.lookPointer.x = e.clientX; this.lookPointer.y = e.clientY;
    }
  }

  onUp(e) {
    if (e.pointerType === 'mouse') this.mouseDrag = null;
    this.touches.delete(e.pointerId);
    if (this.touches.size < 2) this.pinchD = 0;
    if (this.joy.id === e.pointerId) {
      this.joy = { id: null, ox: 0, oy: 0, x: 0, y: 0, active: false };
      this.joystickEl.classList.remove('active', 'run');
      this.joystickEl.style.left = ''; this.joystickEl.style.top = '';   // back to its resting spot
      this.knobEl.style.transform = 'translate(-50%, -50%)';
    }
    if (this.lookPointer && this.lookPointer.id === e.pointerId) { this.lookPointer = null; if (this.lookpadEl) this.lookpadEl.classList.remove('active'); }
  }

  requestLock() {
    try {
      const p = this.canvas.requestPointerLock && this.canvas.requestPointerLock();
      if (p && p.catch) p.catch(() => {});
    } catch (_) { /* sandbox may refuse: drag-to-look still works */ }
  }

  releaseLock() {
    try { if (document.pointerLockElement) document.exitPointerLock(); } catch (_) {}
  }

  reset() {
    this.keys.clear();
    this.look.dx = this.look.dy = 0;
    this.onUp({ pointerId: this.joy.id, pointerType: 'touch' });
    this.lookPointer = null;
    if (this.lookpadEl) this.lookpadEl.classList.remove('active');
    this.mouseDrag = null;
    this.touches.clear();
    this.pinchD = 0;
    this.zoomF = 1;
    this.wheelAcc = 0;
    this.wheelSteps = 0;
  }

  consumeLook() {
    const l = { dx: this.look.dx, dy: this.look.dy };
    this.look.dx = this.look.dy = 0;
    return l;
  }

  // x: right, y: forward, run: boolean
  getMove() {
    if (this.holding && !this.hold.move) { this.joystickEl.classList.remove('run'); return { x: 0, y: 0, run: false }; }
    const k = this.keys;
    let x = 0, y = 0;
    if (k.has('KeyW') || k.has('ArrowUp')) y += 1;
    if (k.has('KeyS') || k.has('ArrowDown')) y -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) x += 1;
    if (k.has('KeyA') || k.has('ArrowLeft')) x -= 1;
    let run = k.has('ShiftLeft') || k.has('ShiftRight');
    if (this.joy.active) {
      x += this.joy.x; y -= this.joy.y;
      const edge = Math.hypot(this.joy.x, this.joy.y) > 0.8;
      if (edge) run = true;
      this.joystickEl.classList.toggle('run', edge);
    }
    const m = Math.hypot(x, y);
    if (m > 1) { x /= m; y /= m; }
    return { x, y, run };
  }
}
