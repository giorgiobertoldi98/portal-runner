// Sound of the main menu and settings: the void between worlds. One calm, sparse track that belongs to no
// single world. It sits well below the in-game music: a slow pad, a low drone, a rare glass note,
// and a faint airy hush. No intensity layers (nothing hunts you here).

const MUSIC = {
  bpm: 52,
  root: 48, // C3
  scale: [0, 2, 4, 5, 7, 9, 11],
  // Cmaj9 · Am · F(add9) · G6/9, four bars each: one chord change every ~18 s
  chords: [[0, 7, 11, 14], [-3, 4, 7, 12], [-7, 0, 4, 9], [-5, 2, 7, 11]],
  barsPerChord: 4,
  pad: { wave: 'triangle', gain: 0.03, filter: 780, attack: 4 },
  drone: { notes: [0, 7], wave: 'sine', gain: 0.016, octave: -1 },
  melody: { inst: 'glass', gain: 0.024, octave: 2, density: [0.05, 0.05], range: 7 },
};

const AMBIENT = {
  layers: [
    { type: 'noise', filter: 'bandpass', freq: 900, q: 0.6, gain: 0.035, lfoRate: 0.05, lfoDepth: 300 },
    { type: 'noise', filter: 'highpass', freq: 5200, q: 0.5, gain: 0.006, lfoRate: 0.09, lfoDepth: 1200 },
  ],
};

export const MENU_AUDIO = { ambient: AMBIENT, music: MUSIC };
