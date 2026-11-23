// The note's sketch at the start of the Frozen Peaks (the note item): a quick drawing, in ink and
// blue wash, of a ring of ice spikes seen somewhere in the snow. It is drawn from almost ground level,
// so the ring reads as a cluster of spikes standing on a snowy rise: no opening, no way in, no hint of what lies
// inside. It matches the look of the hole's crown in iceCave.js (outward-leaning blue-ice shards, four spires a little
// above the rest) so the player can recognise it, but it never shows where it is or what it is.
import { mulberry32 } from '../engine/noise.js';

const INK = '#3a2c20';
const f = (n) => Math.round(n * 10) / 10;

export function holeSketch() {
  const rng = mulberry32(11);
  const cx = 236, cy = 210, rx = 96, ry = 9;   // seen from low down: a very flat ring
  const spireA = [0.4, 1.9, 3.3, 4.6];

  // ── shards: [angle, height, width, isSpire] ── (an unbroken ring: the sketch shows no gap)
  const shards = [];
  for (let i = 0; i < 52; i++) shards.push([(i / 52) * 6.283 + (rng() - 0.5) * 0.08, 16 + rng() * 20, 7 + rng() * 6, false]);
  for (const a of spireA) shards.push([a, 42 + rng() * 8, 13, true]);
  const shard = ([a, h, w, spire]) => {
    const bx = cx + Math.cos(a) * rx, by = cy + Math.sin(a) * ry;
    const tx = bx + Math.cos(a) * h * (spire ? 0.16 : 0.3), ty = by - h;
    return `<path d="M${f(bx - w / 2)} ${f(by + 1)} L${f(tx)} ${f(ty)} L${f(bx + w / 2)} ${f(by + 1)} Z" fill="url(#ice)" stroke="${INK}" stroke-width="${spire ? 1.3 : 1}" stroke-linejoin="round"/>`
      + `<path d="M${f(bx + w * 0.12)} ${f(by - 1)} L${f(tx)} ${f(ty)}" stroke="#ffffff" stroke-width="1" opacity=".7"/>`;
  };
  const back = shards.filter((s) => Math.sin(s[0]) < 0).sort((p, q) => Math.sin(p[0]) - Math.sin(q[0]));
  const front = shards.filter((s) => Math.sin(s[0]) >= 0).sort((p, q) => Math.sin(p[0]) - Math.sin(q[0]));

  // ── snow drifted against the foot of the front spikes, so they stand in the snow ──
  let drifts = '';
  for (let a = 0.15; a < 3.0; a += 0.32) {
    const x = cx + Math.cos(a) * rx, y = cy + Math.sin(a) * ry + 2;
    drifts += `<ellipse cx="${f(x)}" cy="${f(y)}" rx="${f(14 + rng() * 8)}" ry="3.2" fill="#f7f6f1"/>`;
  }

  // ── far hills, pines, a few hand-drawn snow strokes ──
  const pine = (x, y, s) => `<path d="M${x} ${y - 14 * s} l${-5 * s} ${8 * s} h${3 * s} l${-4 * s} ${6 * s} h${12 * s} l${-4 * s} ${-6 * s} h${3 * s} z" fill="#4d6b5c" stroke="${INK}" stroke-width=".6" opacity=".75"/>`;
  const pines = [[30, 152, 1], [48, 149, 0.8], [62, 154, 1.1], [426, 148, 0.9], [442, 152, 1.1], [458, 149, 0.75]].map((p) => pine(...p)).join('');
  const strokes = [[40, 248, 60], [120, 270, 44], [300, 262, 70], [380, 276, 50], [70, 226, 36]]
    .map(([x, y, w]) => `<path d="M${x} ${y} q${w / 2} -4 ${w} 0" fill="none" stroke="${INK}" stroke-width=".8" opacity=".35"/>`).join('');

  return `<svg class="sketch" viewBox="0 64 480 236" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Sketch of a ring of tall blue ice spikes standing on a snowy rise, with mountains behind">
<defs>
  <linearGradient id="ice" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e3f7ff"/><stop offset="1" stop-color="#78c3ea"/></linearGradient>
</defs>
<path d="M0 138 L36 104 L58 122 L96 84 L132 120 L170 98 L204 126 L250 92 L292 124 L330 100 L366 122 L404 88 L444 118 L480 102 L480 160 L0 160 Z" fill="#d5dfe8" stroke="${INK}" stroke-width=".8" stroke-linejoin="round" opacity=".55"/>
<path d="M0 156 Q70 140 150 150 T300 146 T480 150 L480 300 L0 300 Z" fill="#f7f4ec" opacity=".85"/>
<path d="M0 156 Q70 140 150 150 T300 146 T480 150" fill="none" stroke="${INK}" stroke-width="1" opacity=".6"/>
${pines}
${strokes}
<ellipse cx="${cx}" cy="${cy + 12}" rx="150" ry="22" fill="#a9c3d8" opacity=".3"/>
${back.map(shard).join('')}
<ellipse cx="${cx}" cy="${cy}" rx="${rx - 4}" ry="${ry - 1}" fill="#f4f6f5" stroke="none"/>
${front.map(shard).join('')}
${drifts}
</svg>`;
}
