// The "path not yet drawn" screen's drawings, in the menu's hand (menuArt.js): the island of the world you just
// crossed, fully inked with a flag planted, and the dotted route going on to the worlds after it, only pencilled in,
// with a quill resting where the ink stops. Plus the screen's backdrop: the inside of the portal you stepped into.
// Motion is CSS (the menu's .bob / .swirl classes, plus .pencil and .flag), so reduced motion stills it.
import { mulberry32 } from '../engine/noise.js';
import { readInk, islandPortal, wash, hex, f, line, OUTER, INNER } from './menuArt.js';

// the card's drawing (viewBox 470 × 412). crossed: the world just left behind; ahead: the worlds not drawn yet
export function beyondIllustration(crossed, ahead) {
  readInk();
  const rng = mulberry32(31);
  const g = crossed.gem || {}, col = wash(g.col ?? crossed.theme.glow, 0.1);
  // a little flag planted on the island's rim, three of its gems stitched on it
  const stitch = [9, 19, 29].map((x, k) => `<path d="M${x} ${10 + k}l3 -5 3 5 -3 4z" fill="${col}" ${line(0.6)}/>`).join('');
  const flag = `<path d="M96 4V-70" ${line(1.6)}/><g transform="translate(96 -70)"><path class="flag" d="M0 0L40 6L36 16L42 26L0 24Z" fill="#e8743a" ${line(1.1)}/>${stitch}</g>`;
  const island = islandPortal(crossed, { x: 140, y: 255, s: 0.85, fade: 1 }, 'bz', rng, 'bwash', flag);
  // the worlds ahead: pencil only, each fainter and smaller, along a route that stops being inked
  const spots = ahead.map((_, i) => ({ x: 330 + 80 * i, y: 200 - 140 * i, s: 0.55 * 0.58 ** i, o: 0.45 - 0.15 * i }));
  const sketches = spots.map(({ x, y, s, o }, i) => {
    const pen = `fill="none" ${line(1.2, o)} stroke-dasharray="5 4"`;
    const parts = i ? [OUTER] : [OUTER, INNER, 'M-124 6L-90 50L-40 90L0 140L40 92L90 50L124 6'];
    return `<g transform="translate(${x} ${y}) scale(${f(s)})"><g class="pencil">${parts.map((d) => `<path d="${d}" ${pen}/>`).join('')}<ellipse cx="0" cy="6" rx="124" ry="22" ${pen}/></g></g>`;
  }).join('');
  let pencil = 'M290 215';
  spots.forEach(({ x, y }, i) => { if (i) pencil += ` C${x - 60} ${y + 70} ${x - 30} ${y + 40} ${x} ${y + 6}`; else pencil += ` C320 200 ${x - 10} ${y + 30} ${x} ${y + 6}`; });
  return `<svg class="menu-art beyond-art" viewBox="0 0 470 412" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
<defs><filter id="bwash" x="-20%" y="-20%" width="140%" height="140%"><feTurbulence type="fractalNoise" baseFrequency=".035" numOctaves="3" seed="7"/><feDisplacementMap in="SourceGraphic" scale="12"/><feGaussianBlur stdDeviation="1.1"/></filter></defs>
<path d="M148 255C200 235 250 250 290 215" fill="none" ${line(1.8, 0.8)} stroke-dasharray="1 7"/>
<path class="pencil" d="${pencil}" fill="none" ${line(1, 0.5)} stroke-dasharray="5 4"/>
${sketches}
${island}
<g transform="translate(252 262) rotate(-20)"><path d="M0 0L6 -6L60 -40C70 -48 78 -46 74 -36L16 4Z" fill="${wash(0xd8cdb4, 0.15)}" ${line(1.1)}/><path d="M8 -4L66 -40" ${line(0.9, 0.5)}/></g>
</svg>`;
}

// the backdrop: inside the portal, washed in its colours, its arms turning slowly
export function portalBackdrop(theme) {
  const c = (n) => hex(n);
  const spiral = (turns) => {
    let d = '';
    for (let k = 0; k <= 120; k++) {
      const u = k / 120, a = u * turns * Math.PI * 2, r = 20 + 800 * u;
      d += `${k ? 'L' : 'M'}${f(Math.cos(a) * r)} ${f(Math.sin(a) * r)}`;
    }
    return d;
  };
  const arms = (n, col, w, o, turns) => Array.from({ length: n }, (_, i) =>
    `<path d="${spiral(turns)}" transform="rotate(${f(i * 360 / n)})" fill="none" stroke="${col}" stroke-width="${w}" stroke-opacity="${o}" stroke-linecap="round"/>`).join('');
  const rng = mulberry32(5);
  let motes = '';
  for (let i = 0; i < 40; i++) {
    const a = rng() * 6.28, r = 200 + rng() * 520;
    motes += `<circle class="mote" style="animation-delay:-${f(rng() * 9)}s" cx="${f(Math.cos(a) * r)}" cy="${f(Math.sin(a) * r)}" r="${f(1 + rng() * 2.5)}" fill="${c(theme.colC)}"/>`;
  }
  return `<svg class="beyond-swirl" viewBox="-850 -850 1700 1700" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
<defs>
  <radialGradient id="bgp"><stop offset="0" stop-color="${c(theme.colC)}"/><stop offset=".2" stop-color="${c(theme.colB)}"/><stop offset=".62" stop-color="${wash(theme.colA, 0.05)}"/><stop offset="1" stop-color="${wash(theme.colA, 0.35)}"/></radialGradient>
  <filter id="bswash" x="-20%" y="-20%" width="140%" height="140%"><feTurbulence type="fractalNoise" baseFrequency=".02" numOctaves="3" seed="4"/><feDisplacementMap in="SourceGraphic" scale="26"/><feGaussianBlur stdDeviation="1.5"/></filter>
</defs>
<rect x="-850" y="-850" width="1700" height="1700" fill="url(#bgp)"/>
<g class="spin" filter="url(#bswash)">${arms(3, c(theme.colC), 18, 0.22, 1.6)}</g>
<g class="spin back" filter="url(#bswash)">${arms(4, c(theme.colA), 30, 0.25, 1.3)}</g>
<g>${motes}</g>
</svg>`;
}
