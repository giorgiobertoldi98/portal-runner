// The HUD counter's gem icon: a snapshot of the world's own 3D gem (same shape and colours as in the world,
// revealed and softly glowing), rendered once per gem style with the game's renderer and cached as an image URL.
import * as THREE from 'three';
import { gemDesign } from '../entities/gemDesigns.js';
import { DEFAULT_GEM } from '../entities/gem.js';

const SIZE = 192;    // render size; drawn down to OUT for smooth edges
const OUT = 64;
const cache = new Map();

export function gemIconURL(renderer, look = DEFAULT_GEM) {
  const L = { ...DEFAULT_GEM, ...look };
  const key = JSON.stringify(L);
  if (cache.has(key)) return cache.get(key);

  const scene = new THREE.Scene();
  const body = new THREE.Group();
  const mats = [];
  for (const part of gemDesign(L.style).parts) {
    const inner = part.role === 'inner', rock = part.role === 'rock';
    const mat = new THREE.MeshStandardMaterial({
      color: inner ? (L.inner ?? L.col) : L.col, emissive: L.glow, emissiveIntensity: (rock ? 0 : inner ? 0.8 : 0.35) * (L.glowK ?? 1),   // the geode's lining a touch brighter, so it reads at icon size
      roughness: 0.5, metalness: 0.15, flatShading: true, side: THREE.DoubleSide,
    });
    mats.push(mat);
    body.add(new THREE.Mesh(part.geo, mat));
  }
  // a three-quarter view from a little above, like seeing it on the ground
  body.rotation.set(0.35, 0.6, 0);
  scene.add(body);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x404050, 1.6));
  const key1 = new THREE.DirectionalLight(0xffffff, 2.4);
  key1.position.set(2, 3, 4);
  scene.add(key1);

  const sphere = new THREE.Box3().setFromObject(body).getBoundingSphere(new THREE.Sphere());
  const cam = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
  cam.position.set(sphere.center.x, sphere.center.y, sphere.center.z + sphere.radius / Math.sin(THREE.MathUtils.degToRad(15)) * 1.02);
  cam.lookAt(sphere.center);

  const rt = new THREE.WebGLRenderTarget(SIZE, SIZE);
  rt.texture.colorSpace = THREE.SRGBColorSpace;
  const prevTarget = renderer.getRenderTarget(), prevClear = renderer.getClearColor(new THREE.Color()), prevAlpha = renderer.getClearAlpha();
  renderer.setRenderTarget(rt);
  renderer.setClearColor(0x000000, 0);
  renderer.clear();
  renderer.render(scene, cam);
  const px = new Uint8Array(SIZE * SIZE * 4);
  renderer.readRenderTargetPixels(rt, 0, 0, SIZE, SIZE, px);
  renderer.setRenderTarget(prevTarget);
  renderer.setClearColor(prevClear, prevAlpha);
  rt.dispose();
  mats.forEach((m) => m.dispose());

  // the GPU's rows run bottom-up: flip them into a canvas, then draw it down to the icon size
  const big = document.createElement('canvas');
  big.width = big.height = SIZE;
  const img = new ImageData(SIZE, SIZE);
  for (let y = 0; y < SIZE; y++) img.data.set(px.subarray((SIZE - 1 - y) * SIZE * 4, (SIZE - y) * SIZE * 4), y * SIZE * 4);
  big.getContext('2d').putImageData(img, 0, 0);
  // crop to the gem itself (a square around its visible pixels, with a little room for the edges) so it fills the icon
  let x0 = SIZE, y0 = SIZE, x1 = 0, y1 = 0;
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
    if (img.data[(y * SIZE + x) * 4 + 3] > 8) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  }
  const side = Math.max(x1 - x0, y1 - y0) * 1.08 + 2, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  const out = document.createElement('canvas');
  out.width = out.height = OUT;
  const g = out.getContext('2d');
  g.imageSmoothingQuality = 'high';
  if (x1 > x0) g.drawImage(big, cx - side / 2, cy - side / 2, side, side, 0, 0, OUT, OUT);
  const url = out.toDataURL('image/png');
  cache.set(key, url);
  return url;
}
