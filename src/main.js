import * as THREE from 'three';
import { GAME, PORTAL, GEMS, PLAYER, CALL, AUDIO, carryFactor } from './config.js';
import { WORLDS } from './worlds/registry.js';
import { Input } from './engine/input.js';
import { AudioEngine } from './engine/audio.js';
import { CameraRig } from './engine/cameraRig.js';
import { FixedShot } from './engine/fixedShot.js';
import { mulberry32 } from './engine/noise.js';
import { findSpot, dist2D, clamp, insideColliders } from './engine/utils.js';
import { Player } from './entities/player.js';
import { createPortal } from './entities/portal.js';
import { createGem, gemMapColor } from './entities/gem.js';
import { Monster } from './entities/monster.js';
import { Resonance } from './entities/resonance.js';
import { HUD } from './ui/hud.js';
import { gemIconURL } from './ui/gemIcon.js';
import { MapView } from './ui/mapView.js';
import { Briefing } from './ui/briefing.js';
import { SettingsScreen } from './ui/settingsScreen.js';
import { createMenuScene } from './ui/menuScene.js';
import { MENU_AUDIO } from './ui/menuAudio.js';
import { load as loadSettings } from './settings.js';

loadSettings(); // saved settings override the defaults in config.js

const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
const QUALITY = isTouch
  ? { pixelRatio: Math.min(devicePixelRatio, 1.5), shadowMap: 1024, density: 0.6, terrainSegments: 150 }
  : { pixelRatio: Math.min(devicePixelRatio, 2), shadowMap: 2048, density: 1, terrainSegments: 200 };

const CALL_HINT = () => (isTouch ? 'Let go of the stick to send a Resonance Call' : 'Stand still to send a Resonance Call');
const MAP_TURN = 2.2;   // rad/s: how fast the open map's turn slider (full tilt) or A / D turn the explorer and the camera
const MENU_ACCENT = '#e6defc'; // starlight: the landing view belongs to no single world
// The game is landscape only. Browsers don't let a page lock the orientation (outside fullscreen), so a screen taller
// than it is wide shows the #rotate notice (CSS), a run in progress pauses and nothing is rendered behind it.
const PORTRAIT = matchMedia('(orientation: portrait)');

class Game {
  constructor() {
    const canvas = document.getElementById('game');
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(QUALITY.pixelRatio);
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 3000);
    this.input = new Input(canvas, document.getElementById('joystick'), document.getElementById('joy-knob'));
    this.audio = new AudioEngine();
    this.hud = new HUD();
    this.hud.setTouch(isTouch);
    this.mapView = new MapView({ touch: isTouch });
    this.mapView.onClose = () => { if (this.mapView.open) this.toggleMap(); };
    this.holding = false;
    this.briefing = new Briefing();
    // Your items: things you hold up to read, gathered as you find them in a world (in that order) and kept until you
    // leave it, whatever happens meanwhile. Each world decides what exists through its hooks (briefing(), hasMap()).
    this.ITEMS = [
      { id: 'note', btn: this.hud.el.noteBtn, has: () => !!this.briefingData(), isOpen: () => this.briefing.open, open: () => this.openBriefing() },
      { id: 'map', btn: this.hud.el.mapBtn, has: () => this.hasMap(), isOpen: () => this.mapView.open, open: () => { if (!this.mapView.open) this.toggleMap(); } },
    ];
    this.items = [];     // ids, in the order found
    this.unseen = new Set();   // items opened by themselves when found, not yet introduced in the HUD
    this.itemSel = 0;    // the selected one (PC: the wheel or 1-9 picks it, Space opens it)
    this.rig = new CameraRig(this.camera);
    this.shot = new FixedShot();   // small rooms' fixed camera shots
    this.player = new Player();
    this.resonance = new Resonance();
    this.carried = [];
    this.worlds = new Map();
    this.state = 'loading';
    this.time = 0;
    this.gameId = 0;
    this.clock = new THREE.Clock();

    this.bindUI();
    this.onResize();
    addEventListener('resize', () => this.onResize());
    document.addEventListener('visibilitychange', () => { if (document.hidden && this.state === 'playing') this.pause(); });
    this.renderer.setAnimationLoop(() => this.frame());

    // every world lends its colour to the landing view (title, sky, portals)
    WORLDS.forEach((def, i) => document.documentElement.style.setProperty(`--w${i}`, def.theme.css));
    document.documentElement.style.setProperty('--worlds', WORLDS.map((d) => d.theme.css).concat(WORLDS[0].theme.css).join(', '));

    // build the landing view and the first world behind the loading screen, then show the menu
    setTimeout(() => {
      this.menu = createMenuScene({ worlds: WORLDS, quality: QUALITY });
      this.menu.update(0.016, 0, this.camera);
      this.renderer.compile(this.menu.scene, this.camera);
      this.getWorld(0);
      this.showMenu();
    }, 50);
  }

  // ---------- UI ----------

  bindUI() {
    this.settings = new SettingsScreen({ onSound: () => { this.audio.init(); this.audio.click(); }, onBack: () => this.hud.showScreen('menu') });
    document.getElementById('btn-settings').addEventListener('click', () => { this.audio.init(); this.audio.click(); this.settings.open(); this.hud.showScreen('settings'); });

    const start = () => { this.audio.init(); this.audio.click(); this.startGame(); };
    document.getElementById('btn-start').addEventListener('click', start);
    document.getElementById('btn-again').addEventListener('click', start);
    document.getElementById('btn-resume').addEventListener('click', () => this.resume());
    const toMenu = () => { this.briefing.dismiss(); this.putAway(); this.world?.mechanics?.reset(); this.resonance.reset(); this.hud.setDrop(false); this.hud.setAction(null); this.hud.setCall(false); this.audio.init(); this.audio.click(); this.showMenu(); this.input.releaseLock(); this.syncHolding(); };
    document.getElementById('btn-quit').addEventListener('click', toMenu);
    document.getElementById('btn-menu').addEventListener('click', toMenu);
    document.getElementById('btn-pause').addEventListener('click', (e) => { e.stopPropagation(); if (this.state === 'playing') this.pause(); else if (this.state === 'paused') this.resume(); });
    // settings switches, remembered in this browser when storage is available: footstep sounds (on by default) and
    // debug mode (off by default; read at each level start)
    const bindSwitch = (cls, key, on, apply) => {
      try { const v = localStorage.getItem(key); if (v) on = v === 'on'; } catch (_) {}
      const btns = document.querySelectorAll(cls);
      const show = () => { apply(on); btns.forEach((b) => b.setAttribute('aria-checked', String(on))); };
      btns.forEach((b) => b.addEventListener('click', () => {
        on = !on; show(); this.audio.init(); this.audio.click();
        try { localStorage.setItem(key, on ? 'on' : 'off'); } catch (_) {}
      }));
      show();
    };
    bindSwitch('.opt-steps', 'pr-footsteps', true, (on) => { this.audio.footstepsOn = on; });
    bindSwitch('.opt-debug', 'pr-debug', false, (on) => { this.debug = on; });

    // menu track: browsers only allow sound after a gesture, so it starts on the first touch, click or key at the menu
    const wake = () => { if (this.state === 'menu') { this.audio.init(); this.menuAudio(); } };
    ['pointerdown', 'touchend', 'keydown'].forEach((ev) => addEventListener(ev, wake, { capture: true, passive: true }));

    const muteBtn = document.getElementById('btn-mute');
    const toggleMute = () => { this.audio.init(); this.audio.setMuted(!this.audio.muted); muteBtn.classList.toggle('muted', this.audio.muted); };
    muteBtn.addEventListener('click', (e) => { e.stopPropagation(); toggleMute(); });
    addEventListener('keydown', (e) => {
      const live = this.state === 'playing' || this.state === 'frozen';
      // Space: put away what you hold up; else use the action within reach (take the note / map); else hold up the selected item
      if (e.code === 'Space' && live) {
        e.preventDefault();
        if (e.repeat) return;
        if (this.heldItem()) this.closeHeld();
        else if (this.state === 'playing') { if (this.hud.actId) this.actionQueued = true; else this.useItem(this.items[this.itemSel]); }
        return;
      }
      // 1-9 pick an item (while nothing is held up)
      const digit = /^(Digit|Numpad)([1-9])$/.exec(e.code);
      if (digit && this.state === 'playing' && !this.heldItem() && +digit[2] <= this.items.length) { this.selectItem(+digit[2] - 1); return; }
      // the note: Esc or Enter also put it away (Space does too, above)
      if (this.briefing.open && live) {
        if (['Escape', 'Enter', 'NumpadEnter'].includes(e.code)) { e.preventDefault(); this.closeBriefing(); return; }
      }
      // the open map: Esc puts it away (instead of pausing)
      if (this.mapView.open && live && e.code === 'Escape') { e.preventDefault(); this.toggleMap(); return; }
      if (e.code === 'Escape' || e.code === 'KeyP') { if (this.state === 'playing') this.pause(); else if (this.state === 'paused') this.resume(); }
      if (e.code === 'Escape' && this.state === 'menu' && !document.getElementById('screen-settings').classList.contains('hidden')) this.hud.showScreen('menu');
      if (e.code === 'KeyM') toggleMute();
      if ((e.code === 'KeyQ' || e.code === 'KeyG') && this.state === 'playing' && !this.heldItem()) this.dropQueued = true;   // not while an item is held up: the game's controls are off
    });
    // tapping or clicking an item holds it up straight away (and selects it)
    for (const d of this.ITEMS) d.btn.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); if (this.state === 'playing') this.useItem(d.id); });
    const dropBtn = document.getElementById('btn-drop');
    dropBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); if (this.state === 'playing') this.dropQueued = true; });
    document.getElementById('btn-act').addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); if (this.state === 'playing') this.actionQueued = true; });
    document.getElementById('game').addEventListener('click', () => {
      if (this.state === 'playing' && !isTouch && !this.holding) this.input.requestLock();
    });
  }

  // the world's map, once you hold it (e.g. the glacier's explorers' map)
  hasMap() { return !!(this.world?.mechanics?.hasMap && this.world.mechanics.hasMap()); }
  toggleMap() {
    if (!this.hasMap()) return;
    if (!this.mapView.open && this.briefing.open) this.briefing.dismiss();
    this.mapView.show(!this.mapView.open);
    this.syncHolding();
    this.audio.noiseBurst({ type: 'bandpass', freq: 2200, q: 1, dur: 0.22, gain: 0.07, attack: 0.01, sweepTo: this.mapView.open ? 3200 : 1200 });
  }
  // put away whatever is held up (the map, the note) without a sound: when caught, between levels, leaving the run
  putAway() { this.relock = false; this.mapView.show(false); this.briefing.dismiss(); this.syncHolding(); }
  // put away the item you hold up, by hand (Space)
  closeHeld() { if (this.mapView.open) this.toggleMap(); else if (this.briefing.open) this.closeBriefing(); }

  // keep the items in step with what the world says you have: a new one joins the end, gets selected and is held up
  // straight away, as if tapped (it glows until then, in case it can't open yet). Debug mode hands everything over at
  // the start, quietly: no glow, nothing opens, and the first item stays selected.
  syncItems() {
    const found = [];
    for (const d of this.ITEMS) {
      const i = this.items.indexOf(d.id), has = this.world ? d.has() : false;
      if (has && i < 0) {
        this.items.push(d.id);
        if (!this.debug) { this.itemSel = this.items.length - 1; this.hud.attention(d.btn, true); found.push(d.id); }
      } else if (!has && i >= 0) { this.items.splice(i, 1); this.hud.attention(d.btn, false); }
    }
    this.itemSel = clamp(this.itemSel, 0, Math.max(0, this.items.length - 1));
    this.hud.setItems(this.items, this.items[this.itemSel] ?? null);
    // held up at once, so its name and glow are kept for the moment it's first put away (syncHolding)
    for (const id of found) this.unseen.add(id);
    if (found.length && this.state === 'playing') this.useItem(found[found.length - 1]);
  }
  selectItem(i) {
    const n = this.items.length;
    if (!n) return;
    this.itemSel = ((i % n) + n) % n;
    this.syncItems();
    this.hud.flashItemLabel();
  }
  // hold up an item (Space on the selected one, or a tap / click on its button); a held-up item is put away instead
  useItem(id) {
    const d = this.ITEMS.find((x) => x.id === id);
    if (!d || !this.items.includes(id)) return;
    this.itemSel = this.items.indexOf(id);
    if (d.isOpen()) this.closeHeld();
    else { d.open(); if (d.isOpen()) this.hud.attention(d.btn, false); }
    this.syncItems();
  }

  // Holding an item up (the map, the note): it covers almost the whole screen, the HUD and both pads step aside
  // (style.css, body.holding) and the game's own controls are off; the item handles its own gestures. Its `hold`
  // says whether the game pauses while it's open (see held.js).
  heldItem() { return this.mapView.open ? this.mapView : this.briefing.open ? this.briefing : null; }
  syncHolding() {
    const item = this.heldItem();
    if (item === this.heldNow) return;
    this.heldNow = item;
    this.holding = !!item;
    document.body.classList.toggle('holding', !!item);
    this.input.reset();
    this.input.setHold(!!item);
    if (item) { this.relock = this.input.locked || this.relock; this.input.releaseLock(); }
    else if (this.relock) { this.relock = false; if (!isTouch && (this.state === 'playing' || this.state === 'frozen')) this.input.requestLock(); }   // put it away and the mouse looks again, no extra click
    // a new item opened by itself the moment you found it, so the HUD was away: it introduces itself (its name and a
    // glow on its button) the first time it's put away
    if (!item && this.unseen.size) {
      for (const d of this.ITEMS) if (this.unseen.has(d.id) && this.items.includes(d.id)) this.hud.introduce(d.btn);
      this.unseen.clear();
    }
  }

  // the world's briefing card (the glacier: a note with a sketch), one of your items (see ITEMS)
  briefingData() { return this.world?.mechanics?.briefing?.(isTouch) || null; }
  openBriefing() {
    const data = this.briefingData();
    if (!data || this.state !== 'playing' || this.briefing.open) return false;
    this.putAway();
    this.audio.noiseBurst({ type: 'bandpass', freq: 2400, q: 1, dur: 0.25, gain: 0.07, attack: 0.01, sweepTo: 3400 });
    this.briefing.show(data, { touch: isTouch, onClose: () => {
      this.audio.noiseBurst({ type: 'bandpass', freq: 2400, q: 1, dur: 0.2, gain: 0.06, attack: 0.01, sweepTo: 1300 });
      this.syncHolding();
    } });
    this.syncHolding();
    return true;
  }
  closeBriefing() { this.briefing.close(); }

  showMenu() {
    this.state = 'menu';
    this.hud.setAccent(MENU_ACCENT);
    this.hud.showScreen('menu');
    document.body.classList.add('at-menu');
    if (this.audio.ready) this.menuAudio();
  }

  // the one background track for the main menu and settings (crossfades from whatever was playing)
  menuAudio() {
    this.audio.quiet();
    this.audio.setLevel(AUDIO.menuLevel);
    this.audio.setAmbient(MENU_AUDIO.ambient, MENU_AUDIO.music);
  }

  onResize() {
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.fov = 62;
    this.rig.distance = 7.5;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(innerWidth, innerHeight);
  }

  pause() {
    this.state = 'paused';
    this.input.releaseLock();
    this.input.reset();
    this.hud.showScreen('pause');
    if (this.audio.ctx) this.audio.ctx.suspend();
  }

  resume() {
    this.audio.init();
    this.state = 'playing';
    this.hud.showScreen(null);
    this.clock.getDelta();
  }

  // ---------- Worlds ----------

  getWorld(idx) {
    if (this.worlds.has(idx)) return this.worlds.get(idx);
    const def = WORLDS[idx];
    const w = def.build({ quality: QUALITY });
    w.def = def;
    w.index = idx;
    // one portal per level: it leads to the next level, or home from the last one
    const last = idx === WORLDS.length - 1;
    const dest = last ? def : WORLDS[idx + 1];
    const spot = w.portalSpots[0];
    w.portal = createPortal({ dest, gem: def.gem, destIndex: last ? -1 : idx + 1, x: spot.x, y: w.heightAt(spot.x, spot.z), z: spot.z, label: last ? 'The Way Home' : null, heightAt: w.heightAt });
    w.scene.add(w.portal.group);
    w.colliders.push(...w.portal.colliders);
    w.gems = [];
    w.monster = new Monster(w.createMonsterBody(), w.createMonsterBrain ? w.createMonsterBrain() : undefined);
    w.monster.object.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    w.monster.object.visible = false;
    w.scene.add(w.monster.object);
    this.renderer.compile(w.scene, this.camera);
    this.worlds.set(idx, w);
    return w;
  }

  // fresh gems + empty portal for this level
  setupLevel(w) {
    for (const g of w.gems) w.scene.remove(g.group);
    w.gems = [];
    this.carried = [];
    this.player.setCarried(0);
    this.quota = GAME.quotas[Math.min(w.index, GAME.quotas.length - 1)];
    w.portal.setQuota(this.quota);
    const count = this.quota + GEMS.extraPerLevel;
    const pp = w.portal.position;
    for (let i = 0; i < count; i++) {
      const avoid = [{ x: pp.x, z: pp.z, d: 30 }, ...w.gems.map((g) => ({ x: g.group.position.x, z: g.group.position.z, d: 40 }))];
      const s = findSpot(this.rng, w, { avoid });
      const gem = createGem(w.def.gem);
      gem.group.position.set(s.x, w.heightAt(s.x, s.z) + 1.3, s.z);
      w.scene.add(gem.group);
      w.gems.push(gem);
    }
    this.base = this.baseSpot();
    if (w.mechanics) w.mechanics.setup({ world: w, rng: this.rng, portal: { x: pp.x, z: pp.z }, base: this.base, gems: this.groundGemSpots() });
    if (this.debug) w.mechanics?.grantAll?.();   // debug mode: start out holding everything this world lets you find
  }

  groundGemSpots() {
    return this.world.gems.filter((g) => g.state === 'ground').map((g) => ({ x: g.group.position.x, z: g.group.position.z }));
  }

  // ---------- Game flow ----------

  startGame() {
    document.body.classList.remove('at-menu');
    this.gameId++;
    this.rng = mulberry32((Date.now() ^ (Math.random() * 1e9)) >>> 0);
    this.lives = GAME.lives;
    this.time = 0;
    this.delivered = 0;
    this.catches = 0;
    this.level = 0;
    this.callTaught = false;
    this.hud.setLives(this.lives, GAME.lives);
    this.hud.showScreen(null);
    this.input.enabled = true;
    this.enterLevel(0, true);
  }

  enterLevel(idx, fromMenu = false) {
    this.state = 'transition';
    const def = WORLDS[idx];
    this.hud.fade(true, fromMenu ? '#05060c' : def.theme.css);
    if (!fromMenu) this.audio.whoosh();
    setTimeout(() => {
      const w = this.getWorld(idx);
      if (this.world && this.world !== w) { this.world.monster.active = false; this.world.mechanics?.reset(); }
      this.world = w;
      this.level = idx;
      this.setupLevel(w);
      w.scene.add(this.player.object);
      w.scene.add(this.resonance.group);
      this.resonance.reset();
      this.resonance.setColor(def.theme.colB);
      this.player.setGemLook(def.gem);
      document.documentElement.style.setProperty('--gem', '#' + new THREE.Color(gemMapColor(def.gem)).getHexString()); // the map legend's gem colour
      this.hud.setGemIcon(gemIconURL(this.renderer, def.gem));
      this.spawnPlayerAndMonster();
      this.insertTimer = 0;
      this.dropQueued = false; this.actionQueued = false; this.hud.setAction(null);
      this.putAway();
      this.stillTime = 0;
      this.audio.setLevel(AUDIO.runLevel);
      this.audio.setAmbient(w.audio.ambient, w.audio.music);
      this.hud.setAccent(def.theme.css);
      for (const d of this.ITEMS) this.hud.attention(d.btn, false);
      this.items = []; this.itemSel = 0; this.unseen.clear();   // each world's items stay behind when you leave it
      this.input.consumeWheel();
      this.syncItems();
      this.updateGemHud();
      w.update(0.016, this.time, this.camera, this.player.position);
      this.renderer.compile(w.scene, this.camera);
      setTimeout(() => {
        this.hud.fade(false);
        this.state = 'playing';
        this.clock.getDelta();
        this.hud.showBanner(def.name, def.tagline);
        this.syncItems();
        // the first hint of a run: the world's own (introHint), otherwise how to send a Resonance Call
        // (never in a world where the call is silent)
        const intro = w.mechanics?.introHint?.(isTouch);
        const callSilent = w.mechanics?.canCall && !w.mechanics.canCall();
        if (intro) setTimeout(() => this.state === 'playing' && this.hud.toast(intro, 5200), 3800);
        else if (!this.callTaught && !callSilent) { this.callTaught = true; setTimeout(() => this.state === 'playing' && this.hud.toast(CALL_HINT(), 4200), 3800); }
      }, 120);
    }, fromMenu ? 250 : 600);
  }

  // in front of the portal, facing the middle of the world, just inside the edge of the safe zone (its ring)
  // so the first step out is the first step into danger. If the straight-ahead spot isn't walkable, swing around
  // the portal at the same distance; then try a little closer.
  baseSpot() {
    const w = this.world, pp = w.portal.position;
    const R = PORTAL.safeRadius;
    const edge = R > 0 ? Math.max(6, R - 1.5) : 9;   // never on the portal platform (~5.5 m)
    const ahead = Math.atan2(-pp.z, -pp.x);             // direction from the portal to the world centre
    for (const d of [edge, Math.max(6, edge - 1.5)]) {
      for (const da of [0, 0.35, -0.35, 0.7, -0.7, 1.05, -1.05, 1.4, -1.4]) {
        const x = pp.x + Math.cos(ahead + da) * d, z = pp.z + Math.sin(ahead + da) * d;
        if (w.isValidSpot(x, z)) return { x, z };
      }
    }
    return findSpot(this.rng, w, { avoid: [] });
  }

  spawnPlayerAndMonster() {
    const w = this.world;
    const s = this.baseSpot();
    this.player.place(s.x, s.z, w.heightAt(s.x, s.z), Math.atan2(-s.x, -s.z));
    this.respawnNote = w.mechanics?.onRespawn ? w.mechanics.onRespawn({ base: s, heading: Math.atan2(-s.x, -s.z), player: this.player.position }) : null;
    this.rig.snap(this.player);
    // the monster appears at random, but never closer than the minimum distance
    const m = findSpot(this.rng, w, { avoid: [{ x: s.x, z: s.z, d: GAME.monsterSpawnMinDist }] });
    w.monster.reset(m.x, m.z, w, Math.atan2(s.x - m.x, s.z - m.z), this.rng);
    this.growlTimer = 2;
    this.resonance.reset();
  }

  updateGemHud() {
    const p = this.world.portal;
    this.hud.setWorld(this.world.def.name);
    this.hud.setGems(p.filled, p.quota, this.carried.length, p.active);
    this.hud.setDrop(this.carried.length > 0);
    this.player.speedMul = carryFactor(this.carried.length);
  }

  // place a carried gem back on the ground
  putDown(gem, x, z) {
    const w = this.world;
    gem.state = 'ground';
    gem.marked = true;
    gem.blockPickup = true;
    gem.lit = 0; gem.litTarget = 0;
    gem.group.position.set(x, w.heightAt(x, z) + 1.3, z);
    w.scene.add(gem.group);
  }

  // somewhere near you to set a gem down that you can walk back to: about `dist` metres away in direction `angle`
  // (swinging around, then closer), never inside a prop, off the map, or down/up a wall (the ice hole, cliffs).
  // Falls back to the spot you stand on, which is always reachable.
  dropSpot(angle, dist) {
    const w = this.world, p = this.player.position;
    for (const d of [dist, dist * 0.6]) {
      for (const da of [0, 0.5, -0.5, 1, -1, 1.6, -1.6, Math.PI]) {
        const x = p.x + Math.sin(angle + da) * d, z = p.z + Math.cos(angle + da) * d;
        if (Math.hypot(x, z) > w.radius - 4) continue;
        if (insideColliders(x, z, 0.6, w.colliders)) continue;
        if (Math.abs(w.heightAt(x, z) - p.y) > 1) continue;
        return { x, z };
      }
    }
    return { x: p.x, z: p.z };
  }

  dropGem() {
    if (!this.carried.length || this.state !== 'playing') return;
    const gem = this.carried.pop();
    const s = this.dropSpot(this.player.heading + Math.PI, 1.0);
    this.putDown(gem, s.x, s.z);
    this.player.setCarried(this.carried.length);
    this.audio.drop();
    this.updateGemHud();
  }

  caught() {
    this.hud.setCall(false);
    this.putAway();
    this.lives--;
    this.catches++;
    this.hud.setLives(this.lives, GAME.lives);
    this.audio.hurt();
    // carried gems fall around where you were caught, each on ground you can walk back to (they stay faintly lit;
    // on the map a pile shows its count)
    this.carried.forEach((g, i, arr) => {
      const s = this.dropSpot((i / arr.length) * Math.PI * 2, 2.5);
      this.putDown(g, s.x, s.z);
      g.blockPickup = false;
    });
    const lost = this.carried.length;
    this.carried = [];
    this.player.setCarried(0);
    this.updateGemHud();
    if (this.lives <= 0) {
      this.world.mechanics?.reset();
      this.syncItems();
      this.state = 'over';
      this.input.releaseLock();
      this.audio.lose();
      this.audio.stopMusic(1.5);
      this.hud.setDanger(0);
      this.hud.setDrop(false); this.hud.setAction(null);
      setTimeout(() => this.hud.showEnd(false, `${this.world.def.monsterName[0].toUpperCase() + this.world.def.monsterName.slice(1)} got you in ${this.world.def.name}.`, this.stats()), 700);
      return;
    }
    this.state = 'transition';
    this.hud.fade(true, '#7a0010');
    setTimeout(() => {
      this.spawnPlayerAndMonster();
      this.hud.toast(`${this.world.def.monsterName} caught you — ${this.lives} ${this.lives === 1 ? 'life' : 'lives'} left${lost ? ` · ${lost} gem${lost === 1 ? '' : 's'} dropped` : ''}${this.respawnNote ? ` · ${this.respawnNote}` : ''}`, 3600);
      this.hud.fade(false);
      this.state = 'playing';
      this.clock.getDelta();
    }, 650);
  }

  win() {
    this.hud.setCall(false);
    this.putAway();
    this.state = 'over';
    this.input.releaseLock();
    this.audio.win();
    this.audio.stopMusic(2.5);
    this.hud.setDanger(0);
    this.hud.setDrop(false); this.hud.setAction(null);
    setTimeout(() => this.hud.showEnd(true, 'Three worlds crossed. The way home closes behind you.', this.stats(true)), 900);
  }

  stats(win = false) {
    const m = Math.floor(this.time / 60), s = Math.floor(this.time % 60);
    return [
      ['Time', `${m}:${String(s).padStart(2, '0')}`],
      win ? ['Lives left', this.lives ?? '—'] : ['World', this.world ? this.world.def.name : '—'],
      ['Gems delivered', this.delivered],
      ['Caught', this.catches],
    ];
  }

  // ---------- Loop ----------

  // the landing copy's right edge, as a fraction of the screen width, so the menu scene can frame the portals beside it.
  // Re-measured a few times a second: fonts loading or the device's text size can change it after startup.
  trackMenuCopy(t) {
    if (t - (this._copyT || 0) < 0.25) return;
    this._copyT = t;
    const el = document.querySelector('#screen-menu .landing-copy');
    if (!el || !el.offsetParent) return; // hidden (e.g. Settings is open): keep the last framing
    this.menu.setCopyRect(el.getBoundingClientRect().right / innerWidth);
  }

  frame() {
    const dt = Math.min(this.clock.getDelta(), 0.05);
    const t = performance.now() / 1000;
    // held upright (or a window taller than wide): the rotate notice covers the screen, so pause and draw nothing
    if (PORTRAIT.matches) { if (this.state === 'playing') this.pause(); return; }
    if (this.state === 'menu' && this.menu) {
      this.trackMenuCopy(t);
      this.menu.update(dt, t, this.camera);
      this.renderer.render(this.menu.scene, this.camera);
      return;
    }
    if (this.menu && (this.camera.zoom !== 1 || (this.camera.view && this.camera.view.enabled))) this.menu.release(this.camera);
    if (!this.world) return;
    if (this.state === 'playing' && this.heldItem()?.hold.pauses) { this.state = 'frozen'; this.clock.getDelta(); }
    if (this.state === 'playing') this.update(dt, t);
    else if (this.state === 'transition' || this.state === 'over' || this.state === 'frozen') {
      if (this.state === 'frozen') {
        // a held item that pauses the game: the world is frozen and the music plays on
        this.audio.update(dt, {});
        if (!this.heldItem()?.hold.pauses) this.state = 'playing';
      }
      this.world.update(dt, t, this.camera, this.player.position);
      this.world.portal.update(dt, t);
      for (const g of this.world.gems) if (g.state === 'ground') g.update(dt, t);
    }
    this.renderer.render(this.world.scene, this.camera);
  }

  update(dt, t) {
    const w = this.world;
    const P = this.player.position;
    this.time += dt;
    const look = this.input.consumeLook();
    this.input.walkOnly = this.shot.active;   // a room with a fixed shot is too small to run in
    const move = this.input.getMove();
    const moving = Math.hypot(move.x, move.y) > 0.1;
    this.player.update(dt, move, this.rig.moveYaw(move), w, null, (k) => this.audio.footstep(w.audio.footstep, k));
    // the camera swings behind the explorer while walking, but not when walking backward (S): the explorer turns to face
    // the camera and walks straight towards it, instead of the camera chasing round in a circle. It also waits until the
    // explorer has finished turning to its walking direction (e.g. S then W), so it doesn't wobble while the heading sweeps round.
    const turnLeft = Math.atan2(this.player.moveDir.x, this.player.moveDir.z) - this.player.heading;
    const turned = Math.abs(Math.atan2(Math.sin(turnLeft), Math.cos(turnLeft))) < 0.35;
    const follow = moving && move.y > -0.1 && turned;
    this.rig.update(dt, this.player, look, w.heightAt, follow, t - this.input.lastLookTime, w.colliders);
    // With the map open (you can't walk then), its turn slider or A / D turn the explorer and the camera together, so
    // the map's arrow (the explorer's heading) turns and the view behind the map keeps its angle to you.
    if (this.mapView.open) {
      const k = this.input.keys, turn = this.mapView.turnInput() + (k.has('KeyD') ? 1 : 0) - (k.has('KeyA') ? 1 : 0);
      if (turn) {
        const d = -clamp(turn, -1, 1) * MAP_TURN * dt;   // right turns clockwise, as the mouse does
        this.rig.yaw += d;
        this.player.heading += d;
        this.player.object.rotation.y = this.player.heading;
      }
    }
    if (w.constrainCamera) w.constrainCamera(this.camera, this.rig, P, dt); // e.g. keep it inside the ice hole's cave
    this.shot.update(this.camera, this.rig, P, dt, w.fixedShot);

    // world mechanics (e.g. snow storms), then the hunter, whose brain reads the mechanics' signals
    if (w.mechanics) {
      const mctx = {
        player: P, camera: this.camera, audio: this.audio, hud: this.hud, growl: w.audio.growl, touch: isTouch,
        enabled: !w.portal.active, gems: this.groundGemSpots(), portal: { x: w.portal.position.x, z: w.portal.position.z }, base: this.base,
      };
      w.mechanics.update(dt, t, mctx);
      // a contextual action within reach (the glacier: take the map from its crate), used with Space, a click or the action button
      const act = w.mechanics.action ? w.mechanics.action() : null;
      if (this.actionQueued) { this.actionQueued = false; if (act && w.mechanics.doAction) w.mechanics.doAction(mctx); }
      this.hud.setAction(w.mechanics.action ? w.mechanics.action() : null);
    } else this.hud.setAction(null);
    const d = w.monster.update(dt, { player: this.player, world: w, rng: this.rng, signals: w.mechanics ? w.mechanics.signals : null, portal: { x: w.portal.position.x, z: w.portal.position.z } });
    const danger = w.monster.danger(d);
    this.hud.setDanger(danger);
    this.growlTimer -= dt;
    if (this.growlTimer <= 0) {
      this.audio.growl(w.audio.growl, Math.pow(clamp(1 - d / 140, 0, 1), 1.4));
      this.growlTimer = 2.5 + Math.random() * 3 + (d / 40);
    }
    if (d < w.monster.body.radius + PLAYER.radius + 0.35) { this.caught(); return; }

    // drop (Q key or the touch button)
    if (this.dropQueued) { this.dropQueued = false; this.dropGem(); }

    // Resonance Call
    const ground = w.gems.filter((g) => g.state === 'ground');
    // portal open: no call at all (no ring, no trail) until the next world.
    // holding the last needed gem: the ring still appears, but it lights no gems and shows no direction.
    let inRing = 0;
    // some worlds silence the call until you've found something (the glacier: the explorers' map)
    const callOk = !w.mechanics?.canCall || w.mechanics.canCall();
    const stillNow = !moving && this.player.speed < 0.4;
    this.stillTime = stillNow ? (this.stillTime || 0) + dt : 0;
    if (callOk && !this.callTaught && !w.portal.active) { this.callTaught = true; setTimeout(() => this.state === 'playing' && this.hud.toast(CALL_HINT(), 4200), 4600); }
    if (w.portal.active || !callOk) {
      if (this.resonance.radius > 0 || this.resonance.trailTarget) this.resonance.reset();
      for (const g of ground) g.litTarget = 0;
      this.hud.setCall(false);
    } else {
      const noneNeeded = w.portal.filled + this.carried.length >= w.portal.quota;
      const still = !moving && this.player.speed < 0.4;
      if (noneNeeded) {
        this.resonance.trailTarget = null;
        for (const g of ground) g.litTarget = 0;
      }
      inRing = this.resonance.update(dt, t, still, this.player, w, noneNeeded ? [] : ground);
      this.hud.setCall(this.resonance.charging, this.resonance.radius, this.resonance.radius / CALL.maxRadius, inRing, !!this.resonance.trailTarget);
    }

    // gems on the ground: proximity hum, pickup. Until you have a way to find gems (the call, or the world's map)
    // they only hum from right next to them
    const humR = callOk || this.hasMap() ? GEMS.humRadius : GEMS.humRadiusBlind;
    let near = 0;
    for (const g of ground) {
      const gp = g.group.position;
      const gd = Math.hypot(gp.x - P.x, gp.z - P.z);
      g.near = clamp(1 - gd / humR, 0, 1);
      near = Math.max(near, g.near);
      if (g.blockPickup && gd > GEMS.pickupRadius + 1.5) g.blockPickup = false;
      if (!g.blockPickup && gd < GEMS.pickupRadius && Math.abs(gp.y - P.y - 1) < 2.5) {
        g.state = 'carried';
        g.marked = false;
        w.scene.remove(g.group);
        this.carried.push(g);
        this.player.setCarried(this.carried.length);
        this.audio.pickup();
        this.updateGemHud();
        if (this.delivered === 0 && this.carried.length === 1 && this.level === 0) this.hud.toast('This gem is slowing me down...', 3600);
      }
      g.update(dt, t);
    }

    // portal: feed carried gems, then step through
    const portal = w.portal;
    portal.update(dt, t);
    const pd = dist2D(portal.position, P);
    if (pd < PORTAL.insertRadius && this.carried.length && portal.filled < portal.quota) {
      this.insertTimer -= dt;
      if (this.insertTimer <= 0) {
        this.insertTimer = PORTAL.insertInterval;
        const g = this.carried.pop();
        g.state = 'socketed';
        this.delivered++;
        this.player.setCarried(this.carried.length);
        this.audio.insert(portal.filled);
        const done = portal.insert();
        if (!done && w.mechanics?.onGemInserted) w.mechanics.onGemInserted({ player: P, audio: this.audio, hud: this.hud, gems: this.groundGemSpots(), portal: { x: portal.position.x, z: portal.position.z }, base: this.base });
        if (done) {
          portal.activate();
          // the hunter vanishes: you are free to roam until you choose to step through
          w.monster.active = false;
          w.monster.object.visible = false;
          this.hud.setDanger(0);
          this.audio.activate();
        }
        this.updateGemHud();
      }
    } else this.insertTimer = 0.15;
    if (portal.active && portal.contains(P)) {
      this.hud.setCall(false);
      if (this.level === WORLDS.length - 1) { this.win(); return; }
      this.enterLevel(this.level + 1);
      return;
    }

    w.update(dt, t, this.camera, P);
    this.syncItems();
    const steps = this.input.consumeWheel();
    if (steps && !this.heldItem()) this.selectItem(this.itemSel + steps);
    if (!this.hasMap() && this.mapView.open) this.putAway();
    if (this.mapView.open) {
      this.mapView.draw(w, {
        player: P, heading: this.player.heading, gems: this.groundGemSpots(), t,
        portal: { x: portal.position.x, z: portal.position.z }, ...(w.mechanics?.mapMarks ? w.mechanics.mapMarks() : {}),
      });
    }
    this.audio.update(dt, {
      danger, intensity: Math.pow(clamp(1 - d / 130, 0, 1), 1.15),
      portalProximity: clamp(1 - pd / 35, 0, 1), portalFreq: portal.dest.theme.hum,
      gemNear: near, call: this.resonance.radius / CALL.maxRadius, charging: this.resonance.charging,
    });
  }
}

window.__game = new Game();
