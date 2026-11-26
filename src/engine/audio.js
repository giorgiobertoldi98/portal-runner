// Procedural audio (Web Audio). No audio files: every sound is synthesised.
// Worlds describe their sound as data (ambient layers, music, footstep, growl).
import { Music } from './music.js';

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.footstepVolume = 0.35; // relative to each world's footstep gain
    this.ambient = null;
    this.sparkleTimer = 2;
    this.hbTimer = 0;
    this.level = 1;     // overall level of everything but the master mute: 1 at the menu, AUDIO.runLevel in a run
  }

  get ready() { return !!this.ctx; }

  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.9;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 4;
    this.master.connect(comp); comp.connect(ctx.destination);
    this.mix = this.gain(this.level, this.master); // every bus goes through here (see setLevel)

    this.sfx = this.gain(1.0, this.mix);
    this.amb = this.gain(0.8, this.mix);
    this.music = this.gain(0.55, this.mix);
    // echo on the music bus
    const delay = ctx.createDelay(2);
    delay.delayTime.value = 0.42;
    const fb = this.gain(0.4);
    const wet = this.gain(0.45, this.mix);
    this.music.connect(delay); delay.connect(fb); fb.connect(delay); delay.connect(wet);
    this.musicDry = this.gain(0.6, this.mix);

    const len = ctx.sampleRate * 2;
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

    // portal hum
    this.humGain = this.gain(0, this.amb);
    const humFilter = ctx.createBiquadFilter();
    humFilter.type = 'lowpass'; humFilter.frequency.value = 900;
    humFilter.connect(this.humGain);
    this.humA = ctx.createOscillator(); this.humA.type = 'sine';
    this.humB = ctx.createOscillator(); this.humB.type = 'triangle';
    this.humA.frequency.value = 110; this.humB.frequency.value = 165;
    this.humA.connect(humFilter); this.humB.connect(humFilter);
    this.humA.start(); this.humB.start();

    // gem hum (nearest dark gem) and Resonance Call tone
    const mkHum = (types, freqs, cutoff) => {
      const g = this.gain(0, this.sfx);
      const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = cutoff; f.connect(g);
      const oscs = types.map((ty, i) => { const o = ctx.createOscillator(); o.type = ty; o.frequency.value = freqs[i]; o.connect(f); o.start(); return o; });
      return { g, oscs };
    };
    this.gemHum = mkHum(['sine', 'sine'], [660, 990], 2400);
    const trem = ctx.createOscillator(); trem.frequency.value = 6;
    const tremG = this.gain(0); trem.connect(tremG); tremG.connect(this.gemHum.g.gain); trem.start(); // depth follows the hum's level (update)
    this.gemHumTrem = tremG;
    this.callHum = mkHum(['triangle', 'sine', 'sine'], [220, 330, 440], 1600);

    this.soundtrack = new Music(this);
    if (this.pendingAmbient) { this.setAmbient(...this.pendingAmbient); this.pendingAmbient = null; }
  }

  setMuted(m) {
    this.muted = m;
    if (this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.9, this.ctx.currentTime, 0.05);
  }

  // Overall level of all sound (sfx, ambient, music), smoothed. The menu track is written quiet, so a run
  // plays at a lower level (AUDIO.runLevel) to sit close to it. Safe to call before init().
  setLevel(v, tc = 0.5) {
    this.level = v;
    if (this.ctx) this.mix.gain.setTargetAtTime(v, this.ctx.currentTime, tc);
  }

  gain(v, dest) {
    const g = this.ctx.createGain();
    g.gain.value = v;
    if (dest) g.connect(dest);
    return g;
  }

  noise(loop = true) {
    const s = this.ctx.createBufferSource();
    s.buffer = this.noiseBuf; s.loop = loop;
    return s;
  }

  filter(type, freq, q = 1) {
    const f = this.ctx.createBiquadFilter();
    f.type = type; f.frequency.value = freq; f.Q.value = q;
    return f;
  }

  tone({ freq = 440, type = 'sine', dur = 0.5, gain = 0.2, attack = 0.01, bus = null, glideTo = null, when = 0, filter = null }) {
    if (!this.ctx) return;
    const ctx = this.ctx, t0 = ctx.currentTime + when;
    const o = ctx.createOscillator();
    o.type = type; o.frequency.setValueAtTime(freq, t0);
    if (glideTo) o.frequency.exponentialRampToValueAtTime(glideTo, t0 + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    let node = o;
    if (filter) { const f = this.filter('lowpass', filter); o.connect(f); node = f; }
    node.connect(g); g.connect(bus || this.sfx);
    o.start(t0); o.stop(t0 + dur + 0.05);
  }

  noiseBurst({ type = 'bandpass', freq = 1000, q = 1, dur = 0.2, gain = 0.2, attack = 0.005, bus = null, sweepTo = null, when = 0 }) {
    if (!this.ctx) return;
    const ctx = this.ctx, t0 = ctx.currentTime + when;
    const s = this.noise(false);
    const f = this.filter(type, freq, q);
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t0 + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    s.connect(f); f.connect(g); g.connect(bus || this.sfx);
    s.start(t0, Math.random() * 1.5); s.stop(t0 + dur + 0.05);
  }

  // ---------- Ambient ----------

  setAmbient(def, music = null) {
    if (!this.ctx) { this.pendingAmbient = [def, music]; return; }
    const ctx = this.ctx, now = ctx.currentTime;
    if (this.ambient && this.ambient.def === def) { if (music) this.soundtrack.play(music); return; } // already playing
    if (this.ambient) {
      const old = this.ambient;
      old.out.gain.setTargetAtTime(0, now, 0.4);
      setTimeout(() => old.nodes.forEach((n) => { try { n.stop(); } catch (_) {} }), 2500);
    }
    const out = this.gain(0);
    out.connect(this.amb);
    const nodes = [];
    this.buildLayers(def.layers, out, nodes);
    out.gain.setTargetAtTime(1, now + 0.3, 0.8);
    this.ambient = { def, out, nodes };
    if (music) this.soundtrack.play(music);
  }

  // Sound layers described as data (same format as world ambients) -> nodes feeding `out`.
  buildLayers(layers, out, nodes) {
    const ctx = this.ctx;
    for (const L of layers || []) {
      const g = this.gain(L.gain, out);
      let src;
      if (L.type === 'noise') {
        src = this.noise();
        const f = this.filter(L.filter || 'bandpass', L.freq, L.q ?? 1);
        src.connect(f); f.connect(g);
        if (L.lfoRate) {
          const lfo = ctx.createOscillator(); lfo.frequency.value = L.lfoRate;
          const lg = this.gain(L.lfoDepth || 200); lfo.connect(lg); lg.connect(f.frequency);
          lfo.start(); nodes.push(lfo);
        }
      } else {
        src = ctx.createOscillator(); src.type = L.wave || 'sine'; src.frequency.value = L.freq;
        if (L.vibrato) {
          const lfo = ctx.createOscillator(); lfo.frequency.value = L.vibrato.rate;
          const lg = this.gain(L.vibrato.depth); lfo.connect(lg); lg.connect(src.frequency);
          lfo.start(); nodes.push(lfo);
        }
        const f = this.filter('lowpass', L.filterFreq || 2000);
        src.connect(f); f.connect(g);
      }
      if (L.swell) { // slow amplitude swell
        const lfo = ctx.createOscillator(); lfo.frequency.value = L.swell;
        const lg = this.gain(L.gain * 0.8); lfo.connect(lg); lg.connect(g.gain);
        lfo.start(); nodes.push(lfo);
      }
      src.start(); nodes.push(src);
    }
  }

  // A persistent sound (e.g. a storm, a device hum) whose level you set every frame.
  loop(def) {
    if (!this.ctx) return null;
    const out = this.gain(0, this.sfx);
    const nodes = [];
    this.buildLayers(def.layers, out, nodes);
    return {
      set: (v, tc = 0.2) => out.gain.setTargetAtTime(v, this.ctx.currentTime, tc),
      stop: () => { out.gain.setTargetAtTime(0, this.ctx.currentTime, 0.2); setTimeout(() => nodes.forEach((n) => { try { n.stop(); } catch (_) {} }), 1500); },
    };
  }

  stopMusic(fade = 1.5) { if (this.soundtrack) this.soundtrack.stop(fade); }

  // Silence every in-game voice that the per-frame update drives (portal hum, gem hum, call chord, heartbeat)
  // and calm the music. Used when leaving a run for the menu, where update() doesn't run.
  quiet() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    for (const p of [this.humGain.gain, this.gemHum.g.gain, this.gemHumTrem.gain, this.callHum.g.gain]) p.setTargetAtTime(0, now, 0.15);
    this.hbTimer = 0;
    this.soundtrack.intensity = this.soundtrack.target = 0;
  }

  // ---------- Per-frame ----------

  update(dt, { danger = 0, intensity = 0, portalProximity = 0, portalFreq = 110, gemNear = 0, call = 0, charging = false } = {}) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    this.soundtrack.setIntensity(intensity);
    this.soundtrack.tick();
    // heartbeat when the monster is close
    if (danger > 0.02) {
      this.hbTimer -= dt;
      if (this.hbTimer <= 0) {
        const v = 0.15 + danger * 0.5;
        this.tone({ freq: 62, type: 'sine', dur: 0.22, gain: v, glideTo: 40 });
        this.tone({ freq: 58, type: 'sine', dur: 0.2, gain: v * 0.7, glideTo: 38, when: 0.2 });
        this.hbTimer = 1.1 - danger * 0.7;
      }
    } else this.hbTimer = 0;
    // portal hum (kept low: you hear it at every start, respawn and delivery)
    this.humGain.gain.setTargetAtTime(portalProximity * 0.115, ctx.currentTime, 0.2);
    this.humA.frequency.setTargetAtTime(portalFreq, ctx.currentTime, 0.3);
    this.humB.frequency.setTargetAtTime(portalFreq * 1.5, ctx.currentTime, 0.3);
    // gem hum: louder and higher as you get closer
    const now = ctx.currentTime;
    const gv = gemNear * gemNear * 0.088;
    this.gemHum.g.gain.setTargetAtTime(gv, now, 0.15);
    this.gemHumTrem.gain.setTargetAtTime(gv * 0.8, now, 0.15);
    this.gemHum.oscs[0].frequency.setTargetAtTime(520 + gemNear * 320, now, 0.2);
    this.gemHum.oscs[1].frequency.setTargetAtTime((520 + gemNear * 320) * 1.5, now, 0.2);
    // call: a chord that rises with the ring
    const cv = charging ? 0.04 + call * 0.04 : 0;
    this.callHum.g.gain.setTargetAtTime(cv, now, charging ? 0.25 : 0.12);
    [1, 1.5, 2].forEach((m, i) => this.callHum.oscs[i].frequency.setTargetAtTime((180 + call * 160) * m, now, 0.2));
  }

  // ---------- Sound effects ----------

  footstep(p, intensity = 1) {
    if (!this.ctx || !p) return;
    const v = this.footstepVolume * intensity;
    this.noiseBurst({ type: p.filter || 'bandpass', freq: p.freq * (0.85 + Math.random() * 0.3), q: p.q ?? 1, dur: p.decay, gain: p.gain * v });
    if (p.blip) this.tone({ freq: p.blip * (0.9 + Math.random() * 0.2), type: 'sine', dur: p.decay * 1.2, gain: p.gain * 0.5 * v, glideTo: p.blip * 0.5 });
  }

  growl(p, vol = 1) {
    if (!this.ctx || !p || vol < 0.02) return;
    const ctx = this.ctx, t0 = ctx.currentTime, dur = p.decay || 1.2;
    const f0 = p.baseFreq * (0.9 + Math.random() * 0.2);
    const out = ctx.createGain();
    out.gain.setValueAtTime(0.0001, t0);
    out.gain.exponentialRampToValueAtTime(p.gain * vol, t0 + 0.12);
    out.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    const filt = this.filter('lowpass', p.filterFreq || 800, 2);
    filt.connect(out); out.connect(this.sfx);
    for (const det of [0, 7]) {
      const o = ctx.createOscillator();
      o.type = p.type || 'sawtooth';
      o.frequency.setValueAtTime(f0, t0);
      o.detune.value = det * 10;
      if (p.glide) o.frequency.exponentialRampToValueAtTime(f0 * p.glide, t0 + dur);
      if (p.vibrato) {
        const l = ctx.createOscillator(); l.frequency.value = p.vibrato;
        const lg = this.gain(f0 * 0.08); l.connect(lg); lg.connect(o.frequency);
        l.start(t0); l.stop(t0 + dur);
      }
      o.connect(filt); o.start(t0); o.stop(t0 + dur + 0.05);
    }
    if (p.trem) { // clicky tremolo (insect chitter)
      const l = ctx.createOscillator(); l.type = 'square'; l.frequency.value = p.trem;
      const lg = this.gain(p.gain * vol * 0.9); l.connect(lg); lg.connect(out.gain);
      l.start(t0); l.stop(t0 + dur);
    }
    this.noiseBurst({ type: 'bandpass', freq: f0 * 4, q: 0.8, dur: dur * 0.8, gain: p.gain * vol * (p.noise ?? 0.4), attack: 0.1 });
  }

  chime() {
    [1046.5, 1318.5, 1568, 2093].forEach((f, i) => this.tone({ freq: f, type: 'triangle', dur: 0.9, gain: 0.16, when: i * 0.07 }));
    this.tone({ freq: 523.25, type: 'sine', dur: 1.2, gain: 0.12 });
  }

  pickup() {
    [784, 1046.5].forEach((f, i) => this.tone({ freq: f, type: 'triangle', dur: 0.4, gain: 0.13, when: i * 0.06 }));
  }

  drop() {
    this.tone({ freq: 520, type: 'triangle', dur: 0.25, gain: 0.12, glideTo: 260 });
    this.noiseBurst({ type: 'lowpass', freq: 500, dur: 0.18, gain: 0.15 });
  }

  insert(i = 0) {
    const base = [523.25, 587.3, 659.25, 783.99, 880, 1046.5, 1174.7, 1318.5][i % 8];
    this.tone({ freq: base, type: 'triangle', dur: 0.8, gain: 0.16 });
    this.tone({ freq: base * 2, type: 'sine', dur: 0.6, gain: 0.07, when: 0.04 });
  }

  activate() {
    this.noiseBurst({ type: 'bandpass', freq: 300, q: 1.2, dur: 1.6, gain: 0.4, attack: 0.4, sweepTo: 4000 });
    [261.6, 392, 523.25, 783.99].forEach((f, i) => this.tone({ freq: f, type: 'triangle', dur: 2.2, gain: 0.13, when: 0.2 + i * 0.12, attack: 0.2 }));
  }

  whoosh() {
    this.noiseBurst({ type: 'bandpass', freq: 200, q: 1.2, dur: 1.1, gain: 0.5, attack: 0.3, sweepTo: 5000 });
    this.tone({ freq: 120, type: 'sine', dur: 1.2, gain: 0.3, attack: 0.2, glideTo: 900 });
  }

  hurt() {
    this.tone({ freq: 320, type: 'sawtooth', dur: 0.7, gain: 0.3, glideTo: 60, filter: 1400 });
    this.noiseBurst({ type: 'lowpass', freq: 800, dur: 0.5, gain: 0.4 });
  }

  win() {
    const seq = [523.25, 659.25, 783.99, 1046.5, 1318.5];
    seq.forEach((f, i) => this.tone({ freq: f, type: 'triangle', dur: 1.4, gain: 0.18, when: i * 0.14, bus: this.music }));
    [261.6, 329.6, 392].forEach((f) => this.tone({ freq: f, type: 'sine', dur: 2.6, gain: 0.1, when: 0.7, attack: 0.3 }));
  }

  // onto the path not yet drawn: a rising glass arpeggio, ringing on while the menu's calm track fades in
  crossed() {
    [523.25, 659.25, 783.99, 1046.5, 1174.66].forEach((f, i) => {
      this.tone({ freq: f, dur: 3.2, gain: 0.12, when: 0.6 + i * 0.22, bus: this.music });
      this.tone({ freq: f * 2.01, dur: 1.6, gain: 0.04, when: 0.6 + i * 0.22, bus: this.music });
    });
  }

  lose() {
    [392, 349.2, 311.1, 233.1].forEach((f, i) => this.tone({ freq: f, type: 'sawtooth', dur: 0.9, gain: 0.12, when: i * 0.25, filter: 900 }));
  }

  click() { this.tone({ freq: 880, type: 'sine', dur: 0.08, gain: 0.08 }); }
}
