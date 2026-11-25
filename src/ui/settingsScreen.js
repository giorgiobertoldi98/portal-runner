// Settings screen (from the main menu): General tab + Levels tab with one sub-tab per world.
import { WORLDS } from '../worlds/registry.js';
import { GENERAL, levelSettings, setValue, resetDefaults } from '../settings.js';
import { tr, has, num, lang, LANGUAGES, setLanguage } from '../i18n/i18n.js';

const $ = (id) => document.getElementById(id);
const labelOf = (s) => tr(`${s.text}.label`);
const hintOf = (s) => tr(`${s.text}.hint`, s.vars ? s.vars() : {});
const hasHint = (s) => has(`${s.text}.hint`);
const fmt = (s, v) => { const n = num(v, s.step < 1 ? 1 : 0); return s.unit ? tr(`units.${s.unit}`, { n }) : n; };

export class SettingsScreen {
  constructor({ onBack, onSound }) {
    this.tab = 'general';
    this.level = 0;
    this.onSound = onSound || (() => {});
    this.rows = [];
    this.tabs = $('set-tabs');
    this.levels = $('set-levels');
    this.list = $('set-list');
    this.general = $('set-general');
    this.levels.style.gridTemplateColumns = `repeat(${WORLDS.length}, 1fr)`;
    this.levels.innerHTML = WORLDS.map((d, i) => `<button data-l="${i}">${tr(`${d.id}.tab`)}</button>`).join('');
    this.bindLanguage();
    this.tabs.addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; this.onSound(); this.tab = b.dataset.t; this.render(); });
    this.levels.addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; this.onSound(); this.level = +b.dataset.l; this.render(); });
    $('set-reset').addEventListener('click', () => { this.onSound(); resetDefaults(); this.refresh(); });
    $('set-done').addEventListener('click', () => { this.onSound(); onBack(); });
  }

  open() { this.render(); }

  // the language row: only once there is more than one language to choose from
  bindLanguage() {
    const codes = Object.keys(LANGUAGES), row = $('set-lang');
    row.classList.toggle('hidden', codes.length < 2);
    if (codes.length < 2) return;
    const seg = row.querySelector('.seg');
    seg.style.gridTemplateColumns = `repeat(${codes.length}, auto)`;
    seg.innerHTML = codes.map((c) => `<button data-c="${c}" lang="${c}" class="${c === lang ? 'sel' : ''}">${LANGUAGES[c].name}</button>`).join('');
    seg.addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; this.onSound(); setLanguage(b.dataset.c); });
  }

  render() {
    this.tabs.querySelectorAll('button').forEach((b) => b.classList.toggle('sel', b.dataset.t === this.tab));
    this.levels.querySelectorAll('button').forEach((b) => b.classList.toggle('sel', +b.dataset.l === this.level));
    this.general.classList.toggle('hidden', this.tab !== 'general');
    this.levels.classList.toggle('hidden', this.tab !== 'levels');
    const items = this.tab === 'general' ? GENERAL : levelSettings(this.level);
    const head = this.tab === 'levels' ? `<div class="set-head">${tr(`${WORLDS[this.level].id}.name`)}</div>` : '';
    this.list.innerHTML = head + items.map((s, i) => `
      <div class="setting stepper">
        <div class="txt"><span>${labelOf(s)}</span>${hasHint(s) ? `<small data-h="${i}">${hintOf(s)}</small>` : ''}</div>
        <div class="ctl">
          <button class="step" data-i="${i}" data-d="-1" aria-label="${tr('settings.decrease', { name: labelOf(s) })}">−</button>
          <b data-v="${i}"></b>
          <button class="step" data-i="${i}" data-d="1" aria-label="${tr('settings.increase', { name: labelOf(s) })}">+</button>
        </div>
      </div>`).join('');
    this.rows = items;
    this.list.querySelectorAll('button.step').forEach((btn) => this.bindStep(btn));
    this.refresh();
  }

  // press = one step; hold = keep stepping, faster after a moment
  bindStep(btn) {
    const s = this.rows[+btn.dataset.i], dir = +btn.dataset.d;
    let timer = null, n = 0;
    const tick = () => { setValue(s, s.get() + dir * s.step); this.refresh(); };
    const stop = () => { clearTimeout(timer); timer = null; };
    btn.addEventListener('pointerdown', (e) => {
      e.preventDefault(); this.onSound(); tick(); n = 0;
      const loop = () => { tick(); n++; timer = setTimeout(loop, n > 8 ? 45 : 110); };
      timer = setTimeout(loop, 380);
    });
    ['pointerup', 'pointerleave', 'pointercancel'].forEach((ev) => btn.addEventListener(ev, stop));
  }

  // linked settings (e.g. storm min/max) can change each other, so redraw every value
  refresh() {
    this.list.querySelectorAll('b[data-v]').forEach((el) => { const s = this.rows[+el.dataset.v]; el.textContent = fmt(s, s.get()); });
    this.list.querySelectorAll('small[data-h]').forEach((el) => { el.textContent = hintOf(this.rows[+el.dataset.h]); });
  }
}
