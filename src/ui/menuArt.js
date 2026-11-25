// The landing view's illustration: the void between worlds, drawn like the sketches in the explorers' notes
// (ink outlines over watercolour washes on paper). A winding chain of floating portals climbs into the distance,
// one per world in the registry, each washed in the colours of the world it opens onto and fading the farther it is.
// A dotted route links them like a path on a map; dark gems drift past and glint now and then.
// Everything is driven by WORLDS, so a new world appears here automatically. Motion is CSS (style.css, .menu-art),
// so reduced motion stills it.
import { mulberry32 } from '../engine/noise.js';

const INK = '#3a2c20', PAPER = '#f4ead4';
const hex = (n) => (typeof n === 'string' ? n : `#${n.toString(16).padStart(6, '0')}`);
// a colour thinned towards the paper, as a watercolour wash would be
const wash = (c, k) => {
  const a = parseInt(hex(c).slice(1), 16), b = parseInt(PAPER.slice(1), 16);
  const ch = (s) => Math.round(((a >> s) & 255) * (1 - k) + ((b >> s) & 255) * k);
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
};
const f = (n) => Math.round(n * 10) / 10;
const line = (w = 1.3, o = 1) => `stroke="${INK}" stroke-width="${w}" stroke-opacity="${o}" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"`;

// where the i-th portal floats (its feet), and how big: zig-zagging, climbing and shrinking into the distance
function spot(i) {
  const s = 0.6 ** i;
  const y = 470 - 245 * (1 - 0.55 ** i) / 0.45;
  const x = i === 0 ? 300 : 300 + (i % 2 ? 1 : -1) * (130 - 18 * i);
  return { x, y, s, fade: Math.max(0.4, 1 - 0.22 * i) };
}

// ── one portal on its floating island, in local units (feet at 0,0; the arch is 108 wide, 170 tall) ──
const OUTER = 'M-68 0V-116A68 68 0 0 1 68-116V0Z', INNER = 'M-54 0V-116A54 54 0 0 1 54-116V0Z';
function spiral(turns, r0, r1) {
  let d = '';
  for (let k = 0; k <= 60; k++) {
    const u = k / 60, a = u * turns * Math.PI * 2, r = r0 + (r1 - r0) * u;
    d += `${k ? 'L' : 'M'}${f(Math.cos(a) * r)} ${f(Math.sin(a) * r)}`;
  }
  return d;
}
function portal(def, i, rng) {
  const th = def.theme, { x, y, s, fade } = spot(i), id = `p${i}`;
  const stone = wash(th.stone, 0.45), glow = hex(th.glow);
  const crystals = [[-96, 2, 0.8], [-82, 6, 1.1], [88, 4, 1], [100, 0, 0.7]].map(([cx, cy, k]) =>
    `<path d="M${cx - 6 * k} ${cy} L${cx - 1 * k} ${cy - 22 * k} L${cx + 6 * k} ${cy} Z" fill="${wash(th.glow, 0.35)}" ${line(1.1)}/>`).join('');
  const hatch = [[-70, 30, -52, 70], [-30, 40, -14, 92], [30, 36, 18, 84], [66, 30, 52, 60]]
    .map(([a, b, c, d]) => `<path d="M${a} ${b}L${c} ${d}" fill="none" ${line(0.9, 0.45)}/>`).join('');
  const bob = 5 + rng() * 3;
  return `<g transform="translate(${f(x)} ${f(y)}) scale(${f(s * 100) / 100})" opacity="${f(fade * 100) / 100}">
  <g class="bob" style="animation-duration:${f(bob)}s;animation-delay:-${f(rng() * bob)}s">
    <defs>
      <radialGradient id="${id}g" cx=".5" cy=".55" r=".7"><stop offset="0" stop-color="${wash(th.colC, 0.05)}"/><stop offset=".45" stop-color="${wash(th.colB, 0.18)}"/><stop offset="1" stop-color="${wash(th.colA, 0.35)}"/></radialGradient>
      <radialGradient id="${id}h"><stop offset="0" stop-color="${glow}" stop-opacity=".55"/><stop offset="1" stop-color="${glow}" stop-opacity="0"/></radialGradient>
      <clipPath id="${id}c"><path d="${INNER}"/></clipPath>
    </defs>
    <ellipse cx="0" cy="-86" rx="132" ry="150" fill="url(#${id}h)" filter="url(#wash)"/>
    <path d="M-124 6 L-104 42 L-72 54 L-54 94 L-22 106 L0 152 L18 108 L50 88 L74 58 L106 38 L124 6 Z" fill="${stone}" fill-opacity=".8" filter="url(#wash)"/>
    <path d="M-124 6 L-104 42 L-72 54 L-54 94 L-22 106 L0 152 L18 108 L50 88 L74 58 L106 38 L124 6" fill="none" ${line()}/>
    ${hatch}
    <path d="M-40 168 l12 -6 l8 10 l-10 8 z M44 150 l10 -4 l5 8 l-9 5 z" fill="${stone}" ${line(1)}/>
    <ellipse cx="0" cy="6" rx="124" ry="22" fill="${wash(th.stone, 0.75)}" ${line()}/>
    <ellipse cx="0" cy="2" rx="80" ry="11" fill="${wash(th.stone, 0.55)}" ${line(1, 0.7)}/>
    <g clip-path="url(#${id}c)">
      <rect x="-60" y="-176" width="120" height="180" fill="url(#${id}g)"/>
      <g transform="translate(0 -84)"><g class="swirl" style="animation-duration:${f(16 + i * 5)}s">
        <path d="${spiral(2.2, 4, 96)}" fill="none" stroke="${wash(th.colC, 0)}" stroke-width="3" stroke-opacity=".75" stroke-linecap="round"/>
        <path d="${spiral(2.2, 4, 96)}" transform="rotate(180)" fill="none" stroke="#fffaf0" stroke-width="2" stroke-opacity=".55" stroke-linecap="round"/>
      </g></g>
    </g>
    <path d="${OUTER}${INNER}" fill-rule="evenodd" fill="${stone}" ${line(1.4)}/>
    <path d="M-61 -6V-112M61 -6V-112" fill="none" ${line(0.8, 0.4)}/>
    ${crystals}
  </g>
</g>`;
}

// ── a dark gem, sketched in its world's design (hidden: dark, with a hint of its colour) ──
function gem(look, rng) {
  const dark = wash(look.innerDark ?? look.dark, 0.1), col = wash(look.inner ?? look.col, 0.2);
  if (look.style === 'geode') {
    const holes = [[-4, -4, 2.6], [5, -1, 2], [-1, 5, 2.2], [6, 6, 1.4], [-7, 3, 1.5]]
      .map(([x, y, r]) => `<ellipse cx="${x}" cy="${y}" rx="${r}" ry="${f(r * 0.8)}" fill="${col}" fill-opacity=".7"/>`).join('');
    return `<path d="M-11 -3 Q-10 -12 -1 -12 Q10 -12 12 -2 Q13 9 2 12 Q-10 12 -11 -3Z" fill="${dark}" ${line(1.1)}/>${holes}`;
  }
  if (look.style === 'rose') {
    let d = '';
    for (let k = 0; k < 6; k++) d += `<ellipse cx="0" cy="-6" rx="5" ry="9" transform="rotate(${k * 60 + rng() * 10})" fill="${k % 2 ? dark : col}" fill-opacity="${k % 2 ? 1 : 0.75}" ${line(1)}/>`;
    return `${d}<circle r="3.5" fill="${col}" ${line(1)}/>`;
  }
  // cluster: hexagonal prisms growing from a frozen lump
  const prism = (a, h, w) => `<path d="M${-w} 4 L${-w} ${-h + 5} L0 ${-h} L${w} ${-h + 5} L${w} 4 Z" transform="rotate(${a})" fill="${dark}" ${line(1)}/><path d="M0 ${-h} L0 2" transform="rotate(${a})" stroke="${col}" stroke-width="1.6" stroke-opacity=".7"/>`;
  return `${prism(-28, 13, 3.5)}${prism(26, 11, 3)}${prism(0, 18, 4.2)}<ellipse cx="0" cy="5" rx="10" ry="4.5" fill="${dark}" ${line(1)}/>`;
}
const glint = (c) => `<path class="glint-star" d="M0 -9 L1.6 -1.6 L9 0 L1.6 1.6 L0 9 L-1.6 1.6 L-9 0 L-1.6 -1.6Z" fill="${c}" stroke="${INK}" stroke-width=".6" vector-effect="non-scaling-stroke"/>`;

export function menuIllustration(worlds) {
  const rng = mulberry32(23);
  const spots = worlds.map((_, i) => spot(i));
  const tints = worlds.map((w) => hex(w.theme.glow));

  // soft washes of every world's colour drifting through the void
  const blobs = [[120, 180, 170, 120], [480, 330, 190, 150], [260, 560, 230, 90], [520, 90, 150, 100], [90, 450, 120, 110]]
    .map(([cx, cy, rx, ry], k) => `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${tints[k % tints.length]}" fill-opacity=".09"/>`).join('');
  // ink wisps and a scatter of little stars
  const wisps = [[40, 250, 90], [410, 470, 120], [330, 150, 80], [70, 590, 110], [480, 600, 70]]
    .map(([x, y, w]) => `<path d="M${x} ${y} q${w * 0.25} -10 ${w * 0.5} 0 t${w * 0.5} 0" fill="none" ${line(0.9, 0.3)}/>`).join('');
  let stars = '';
  for (let k = 0; k < 26; k++) {
    const sx = 20 + rng() * 560, sy = 15 + rng() * 600, r = 1.5 + rng() * 2.5;
    if (spots.some((p) => Math.hypot(sx - p.x, sy - (p.y - 60 * p.s)) < 130 * p.s)) continue;
    stars += `<path class="twinkle" style="animation-delay:-${f(rng() * 5)}s" d="M${f(sx)} ${f(sy - r)}V${f(sy + r)}M${f(sx - r)} ${f(sy)}H${f(sx + r)}" ${line(0.8, 0.5)}/>`;
  }
  // the dotted route from the bottom of the page through every island, like a path on a map
  let route = `M250 660`;
  let prev = { x: 250, y: 660 };
  for (const p of spots) {
    const to = { x: p.x, y: p.y + 6 * p.s };
    route += ` C${f(prev.x - 40)} ${f((prev.y + to.y) / 2 + 20)} ${f(to.x + (to.x > 300 ? 90 : -90) * p.s)} ${f(to.y + 60 * p.s)} ${f(to.x)} ${f(to.y)}`;
    prev = to;
  }
  // drifting gems, one design per world in turn, away from the portals
  const gemSpots = [[80, 330, 1.25], [535, 440, 1.1], [150, 560, 1.35], [560, 170, 0.9], [395, 40, 0.75], [60, 120, 0.95], [470, 590, 1]];
  const gems = gemSpots.map(([gx, gy, k], n) => {
    const w = worlds[n % worlds.length], d = 6 + rng() * 4;
    return `<g transform="translate(${gx} ${gy}) scale(${k})"><g class="drift" style="animation-duration:${f(d)}s;animation-delay:-${f(rng() * d)}s">
      ${gem(w.gem || {}, rng)}<g transform="translate(8 -12)"><g class="glint" style="animation-delay:-${f(rng() * 9)}s">${glint(wash(w.gem?.glow ?? w.theme.glow, 0.1))}</g></g></g></g>`;
  }).join('');

  // the farthest portal is drawn first, so nearer ones overlap it
  const portals = worlds.map((w, i) => portal(w, i, rng)).reverse().join('');
  return `<svg class="menu-art" viewBox="0 0 600 640" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
<defs>
  <filter id="wash" x="-20%" y="-20%" width="140%" height="140%"><feTurbulence type="fractalNoise" baseFrequency=".035" numOctaves="3" seed="4"/><feDisplacementMap in="SourceGraphic" scale="14"/><feGaussianBlur stdDeviation="1.2"/></filter>
  <filter id="soft" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="26"/></filter>
</defs>
<g filter="url(#soft)">${blobs}</g>
${wisps}
${stars}
<path d="${route}" fill="none" stroke="${INK}" stroke-width="1.6" stroke-opacity=".45" stroke-dasharray="1 7" stroke-linecap="round" vector-effect="non-scaling-stroke"/>
${portals}
${gems}
</svg>`;
}
