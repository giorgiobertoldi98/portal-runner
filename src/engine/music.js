// Adaptive generative soundtrack (Web Audio, no files).
// Each world describes its music as data (see the MUSIC constant at the bottom of each world module):
//   bpm, root (MIDI), scale, chords (semitone offsets per chord), barsPerChord,
//   pad, drone, melody  → always playing (the calm layer)
//   bass, arp, perc[]   → each fades in above its `from` intensity
// Intensity (0..1) comes from the game: how close the monster is. The engine smooths it, so layers
// swell in as the hunter approaches and drain away after you escape. Changing world crossfades.
import { mulberry32 } from './noise.js';

const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export class Music {
  constructor(audio) {
    this.a = audio;
    this.cur = null;
    this.intensity = 0.15;
    this.target = 0.15;
    this.ksCache = new Map();
    this.timer = setInterval(() => this.tick(), 25);
  }

  get ctx() { return this.a.ctx; }

  // ---------- transport ----------

  play(def) {
    const ctx = this.ctx;
    if (!ctx || !def) return;
    if (this.cur && this.cur.def === def) return;
    this.stop(1.6);
    const now = ctx.currentTime;
    const wet = this.a.gain(0, this.a.music);        // through the echo bus
    const dry = this.a.gain(0, this.a.musicDry);     // percussion stays dry
    wet.gain.setTargetAtTime(1, now + 0.6, 1.2);
    dry.gain.setTargetAtTime(1, now + 0.6, 1.2);
    const layer = (bus, spec) => ({ g: this.a.gain(0, bus), from: spec ? spec.from ?? 0 : 0, spec });
    const s = {
      def, wet, dry, persist: [],
      pad: layer(wet, def.pad), drone: layer(wet, def.drone), melody: layer(wet, def.melody),
      bass: layer(dry, def.bass), arp: layer(wet, def.arp),
      perc: (def.perc || []).map((p) => layer(dry, p)),
      step: 0, next: now + 0.7, spb: 60 / def.bpm / 4,
      rng: mulberry32((def.bpm * 977 + def.root * 31) >>> 0),
      phrase: null, arpIdx: 0,
    };
    this.cur = s;
    this.startDrone(s);
    this.applyLayerGains(s, true);
  }

  stop(fade = 1.2) {
    const s = this.cur;
    if (!s || !this.ctx) { this.cur = null; return; }
    const now = this.ctx.currentTime;
    for (const b of [s.wet, s.dry]) { b.gain.cancelScheduledValues(now); b.gain.setTargetAtTime(0, now, fade / 3); }
    setTimeout(() => {
      s.persist.forEach((n) => { try { n.stop(); } catch (_) {} });
      try { s.wet.disconnect(); s.dry.disconnect(); } catch (_) {}
    }, fade * 1000 + 800);
    this.cur = null;
  }

  setIntensity(x) { this.target = Math.min(1, Math.max(0, x)); }

  // ---------- scheduler ----------

  tick() {
    const s = this.cur, ctx = this.ctx;
    if (!s || !ctx || ctx.state !== 'running') return;
    // rise quickly, calm down slowly
    const k = this.target > this.intensity ? 0.06 : 0.008;
    this.intensity += (this.target - this.intensity) * k;
    this.applyLayerGains(s, false);
    // if the main thread stalled (slow frame, tab paused), skip the missed steps but stay on the grid
    if (s.next < ctx.currentTime) {
      const missed = Math.ceil((ctx.currentTime - s.next) / s.spb);
      s.step += missed; s.next += missed * s.spb;
    }
    while (s.next < ctx.currentTime + 0.3) {
      this.scheduleStep(s, s.step, s.next);
      s.step++;
      s.next += s.spb;
    }
  }

  applyLayerGains(s, instant) {
    const now = this.ctx.currentTime, I = this.intensity;
    const set = (L, v) => { if (instant) L.g.gain.value = v; else L.g.gain.setTargetAtTime(v, now, 0.25); L.on = v > 0.02; };
    set(s.pad, 1); set(s.drone, 1); set(s.melody, 1);
    for (const L of [s.bass, s.arp, ...s.perc]) set(L, L.spec ? sstep(L.from - 0.1, L.from + 0.1, I) : 0);
  }

  chordAt(s, bar) {
    const d = s.def;
    return d.chords[Math.floor(bar / (d.barsPerChord || 2)) % d.chords.length];
  }

  scheduleStep(s, step, t) {
    const d = s.def, inBar = step % 16, bar = Math.floor(step / 16);
    const chord = this.chordAt(s, bar);
    const bpc = d.barsPerChord || 2;
    if (inBar === 0 && bar % bpc === 0 && d.pad) this.padChord(s, chord, t, bpc * 16 * s.spb);
    if (inBar === 0 && bar % 4 === 0) s.phrase = this.makePhrase(s, bar);

    // melody (calm layer, gets busier with intensity)
    if (d.melody && s.phrase) {
      const note = s.phrase[(bar % 4) * 16 + inBar];
      if (note !== null && note !== undefined) {
        this.note(d.melody.inst, mtof(d.root + 12 * (d.melody.octave ?? 1) + note), t, d.melody.gain, s.melody.g, s.spb * 4);
      }
      // extra notes when tense
      else if (inBar % 2 === 0 && s.rng() < (d.melody.density?.[1] ?? 0.3) * this.intensity * 0.5) {
        const tone = chord[Math.floor(s.rng() * chord.length)];
        this.note(d.melody.inst, mtof(d.root + 12 * (d.melody.octave ?? 1) + tone), t, d.melody.gain * 0.6, s.melody.g, s.spb * 2);
      }
    }
    // bass
    if (d.bass && s.bass.on && d.bass.pattern[inBar] === 'x') {
      const second = inBar >= 8 && s.rng() < 0.4;
      const n = d.root + 12 * (d.bass.octave ?? -1) + chord[0] + (second ? 7 : 0);
      this.note(d.bass.inst, mtof(n), t, d.bass.gain, s.bass.g, s.spb * 3);
    }
    // arpeggio
    if (d.arp && s.arp.on && d.arp.pattern[inBar] === 'x') {
      const len = chord.length, i = s.arpIdx++ % (len * 2 - 2);
      const idx = i < len ? i : len * 2 - 2 - i;
      this.note(d.arp.inst, mtof(d.root + 12 * (d.arp.octave ?? 1) + chord[idx]), t, d.arp.gain, s.arp.g, s.spb * 2);
    }
    // percussion
    s.perc.forEach((L) => { if (L.on && L.spec.pattern[inBar] === 'x') this.drum(L.spec.inst, t, L.spec.gain * (0.85 + s.rng() * 0.3), L.g); });
  }

  // Four-bar phrase from a one-bar motif with variations, so the melody repeats like a real tune.
  makePhrase(s, bar) {
    const d = s.def, m = d.melody;
    if (!m) return null;
    const r = s.rng, scale = d.scale, range = m.range || 9;
    if (s.phrase && r() < 0.45) return s.phrase; // repeat the last phrase sometimes
    const dens = (m.density || [0.15, 0.3]);
    const density = dens[0] + (dens[1] - dens[0]) * this.intensity;
    const degToSemi = (deg) => { const o = Math.floor(deg / scale.length); return scale[((deg % scale.length) + scale.length) % scale.length] + 12 * o; };
    const motif = new Array(16).fill(null);
    let deg = Math.floor(r() * 4);
    for (let i = 0; i < 16; i++) {
      const strong = i % 4 === 0;
      const p = strong ? density * 2.2 : i % 2 === 0 ? density * 1.1 : density * 0.35;
      if (r() < p) {
        deg += Math.round((r() - 0.5) * 4);
        deg = Math.max(-2, Math.min(range, deg));
        motif[i] = deg;
      }
    }
    const out = [];
    for (let b = 0; b < 4; b++) {
      const chord = this.chordAt(s, bar + b);
      for (let i = 0; i < 16; i++) {
        let dg = motif[i];
        if (dg === null) { out.push(null); continue; }
        if (b === 1 && i >= 8) dg += 1;          // answer
        if (b === 3 && i >= 8) dg = r() < 0.5 ? 0 : dg - 2; // resolve toward home
        let semi = degToSemi(dg);
        if (i % 8 === 0) { // snap strong beats to the nearest chord tone
          let best = semi, bd = 99;
          for (const c of chord) for (const o of [-12, 0, 12]) { const v = c + o; const dd = Math.abs(v - semi); if (dd < bd) { bd = dd; best = v; } }
          semi = best;
        }
        out.push(semi);
      }
    }
    return out;
  }

  startDrone(s) {
    const d = s.def.drone; if (!d) return;
    const ctx = this.ctx;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = d.filter || 900; f.connect(s.drone.g);
    const g = this.a.gain(d.gain, f);
    for (const n of d.notes) for (const det of [-4, 4]) {
      const o = ctx.createOscillator(); o.type = d.wave || 'sine';
      o.frequency.value = mtof(s.def.root + 12 * (d.octave ?? -1) + n); o.detune.value = det;
      o.connect(g); o.start(); s.persist.push(o);
    }
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.07; const lg = this.a.gain(d.gain * 0.5, g.gain);
    lfo.connect(lg); lfo.start(); s.persist.push(lfo);
  }

  padChord(s, chord, t, dur) {
    const p = s.def.pad, ctx = this.ctx;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = p.filter || 1000; f.Q.value = 0.6;
    const env = ctx.createGain(); f.connect(env); env.connect(s.pad.g);
    const g = (p.gain || 0.04) / Math.sqrt(chord.length);
    const att = Math.min(p.attack || 1.5, dur * 0.5);
    env.gain.setValueAtTime(0.0001, t);
    env.gain.linearRampToValueAtTime(g, t + att);
    env.gain.setValueAtTime(g, t + dur - 0.2);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur + 2.2);
    const nodes = [];
    for (const n of chord) for (const det of [-7, 7]) {
      const o = ctx.createOscillator(); o.type = p.wave || 'triangle';
      o.frequency.value = mtof(s.def.root + n); o.detune.value = det;
      o.connect(f); o.start(t); o.stop(t + dur + 2.4); nodes.push(o);
    }
    if (p.wobble) {
      const l = ctx.createOscillator(); l.frequency.value = p.wobble;
      const lg = this.a.gain((p.filter || 1000) * 0.6, f.frequency); l.connect(lg); l.start(t); l.stop(t + dur + 2.4);
    }
  }

  // ---------- instruments ----------

  env(t, peak, attack, decay, dest) {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    g.connect(dest);
    return g;
  }

  osc(type, freq, t, dur, dest) {
    const o = this.ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t);
    o.connect(dest); o.start(t); o.stop(t + dur + 0.05); return o;
  }

  noise(t, dur, dest) {
    const n = this.a.noise(false); n.connect(dest); n.start(t, Math.random() * 1.5); n.stop(t + dur + 0.05); return n;
  }

  filt(type, freq, q, dest) { const f = this.ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q; f.connect(dest); return f; }

  note(inst, freq, t, gain, dest, len) {
    const ctx = this.ctx;
    switch (inst) {
      case 'bell': { // FM bell
        const e = this.env(t, gain, 0.004, 2.6, dest);
        const c = this.osc('sine', freq, t, 2.7, e);
        const mg = ctx.createGain(); mg.gain.setValueAtTime(freq * 2.2, t); mg.gain.exponentialRampToValueAtTime(freq * 0.05, t + 1.2); mg.connect(c.frequency);
        this.osc('sine', freq * 3.5, t, 2.7, mg);
        break;
      }
      case 'glass': {
        const e = this.env(t, gain, 0.003, 1.3, dest);
        this.osc('sine', freq, t, 1.4, e);
        const e2 = this.env(t, gain * 0.35, 0.003, 0.6, dest); this.osc('sine', freq * 2.01, t, 0.7, e2);
        break;
      }
      case 'pluck': { // Karplus-Strong string, cached per pitch
        const src = ctx.createBufferSource(); src.buffer = this.ks(freq);
        const e = this.env(t, gain, 0.002, 1.5, dest);
        const f = this.filt('lowpass', Math.min(freq * 8, 6000), 0.5, e);
        src.connect(f); src.start(t); src.stop(t + 1.6);
        break;
      }
      case 'soft': {
        const e = this.env(t, gain, 0.015, Math.min(len || 0.6, 1.2), dest);
        const f = this.filt('lowpass', 520, 0.8, e);
        this.osc('triangle', freq, t, 1.3, f);
        break;
      }
      case 'sub': {
        const e = this.env(t, gain, 0.01, 0.45, dest);
        this.osc('sine', freq, t, 0.5, e);
        const e2 = this.env(t, gain * 0.4, 0.01, 0.25, dest);
        const f = this.filt('lowpass', 1400, 4, e2);
        f.frequency.setValueAtTime(1600, t); f.frequency.exponentialRampToValueAtTime(180, t + 0.25);
        this.osc('sawtooth', freq, t, 0.3, f);
        break;
      }
      case 'bleep': {
        const e = this.env(t, gain, 0.005, 0.35, dest);
        const c = this.osc('sine', freq * 1.03, t, 0.4, e);
        c.frequency.exponentialRampToValueAtTime(freq, t + 0.06);
        const mg = ctx.createGain(); mg.gain.setValueAtTime(freq * 1.5, t); mg.gain.exponentialRampToValueAtTime(1, t + 0.3); mg.connect(c.frequency);
        this.osc('sine', freq * 2, t, 0.4, mg);
        break;
      }
      default: {
        const e = this.env(t, gain, 0.01, 0.6, dest);
        this.osc('sine', freq, t, 0.7, e);
      }
    }
  }

  drum(inst, t, gain, dest) {
    switch (inst) {
      case 'kick': {
        const e = this.env(t, gain, 0.003, 0.32, dest);
        const o = this.osc('sine', 140, t, 0.35, e); o.frequency.exponentialRampToValueAtTime(42, t + 0.22);
        break;
      }
      case 'tom': {
        const e = this.env(t, gain, 0.004, 0.45, dest);
        const o = this.osc('sine', 115, t, 0.5, e); o.frequency.exponentialRampToValueAtTime(68, t + 0.35);
        break;
      }
      case 'dum': { // frame drum low stroke
        const e = this.env(t, gain, 0.003, 0.42, dest);
        const o = this.osc('sine', 98, t, 0.45, e); o.frequency.exponentialRampToValueAtTime(62, t + 0.3);
        const e2 = this.env(t, gain * 0.5, 0.002, 0.08, dest); this.noise(t, 0.1, this.filt('bandpass', 260, 1.2, e2));
        break;
      }
      case 'tek': {
        const e = this.env(t, gain, 0.001, 0.06, dest); this.noise(t, 0.08, this.filt('bandpass', 3400, 1.6, e));
        const e2 = this.env(t, gain * 0.4, 0.001, 0.05, dest); this.osc('sine', 820, t, 0.06, e2);
        break;
      }
      case 'shaker': { const e = this.env(t, gain, 0.012, 0.05, dest); this.noise(t, 0.08, this.filt('highpass', 6500, 0.7, e)); break; }
      case 'hat': { const e = this.env(t, gain, 0.001, 0.035, dest); this.noise(t, 0.05, this.filt('highpass', 8500, 0.7, e)); break; }
      case 'click': {
        const e = this.env(t, gain, 0.001, 0.025, dest); this.osc('sine', 2600, t, 0.04, e);
        const e2 = this.env(t, gain * 0.5, 0.001, 0.02, dest); this.noise(t, 0.03, this.filt('highpass', 5000, 0.7, e2));
        break;
      }
      case 'snap': { const e = this.env(t, gain, 0.002, 0.13, dest); this.noise(t, 0.15, this.filt('bandpass', 1700, 0.9, e)); break; }
    }
  }

  ks(freq) {
    const key = Math.round(freq * 10);
    if (this.ksCache.has(key)) return this.ksCache.get(key);
    const sr = this.ctx.sampleRate, len = Math.floor(sr * 1.5), N = Math.max(2, Math.round(sr / freq));
    const buf = this.ctx.createBuffer(1, len, sr), y = buf.getChannelData(0);
    let prev = 0;
    for (let i = 0; i < N; i++) { const v = Math.random() * 2 - 1; prev = prev * 0.5 + v * 0.5; y[i] = prev; }
    for (let i = N; i < len; i++) y[i] = 0.4985 * (y[i - N] + y[i - N + 1]);
    this.ksCache.set(key, buf);
    return buf;
  }
}
