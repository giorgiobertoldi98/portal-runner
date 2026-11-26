// Settings screen (from the main menu): one tab for the general settings, then one per world, side by side in a
// column on the left; the chosen tab's settings fill the right.
import { WORLDS } from '../worlds/registry.js';
import { GENERAL, levelSettings, GENERAL_DEBUG, levelDebugSettings, setValue, resetDefaults } from '../settings.js';
import { tr, has, num, lang, LANGUAGES, setLanguage } from '../i18n/i18n.js';

const $ = (id) => document.getElementById(id);
const labelOf = (s) => tr(`${s.text}.label`);
const hintOf = (s) => tr(`${s.text}.hint`, s.vars ? s.vars() : {});
const hasHint = (s) => has(`${s.text}.hint`);
const fmt = (s, v) => { const n = num(v, s.step < 1 ? 1 : 0); return s.unit ? tr(`units.${s.unit}`, { n }) : n; };

export class SettingsScreen {
  constructor({ onBack, onSound }) {
    this.tab = 'general'; // 'general' or a world's index
    this.onSound = onSound || (() => {});
    this.rows = [];
    this.tabs = $('set-tabs');
    this.body = $('set-body');
    this.head = $('set-head');
    this.list = $('set-list');
    this.general = $('set-general');
    // each world's tab carries a dab of its colour
    this.tabs.innerHTML = `<button data-t="general">${tr('settings.general')}</button>`
      + WORLDS.map((d, i) => `<button data-t="${i}" style="--tab:${d.theme.css}"><i class="dab"></i>${tr(`${d.id}.tab`)}</button>`).join('');
    this.bindLanguage();
    this.tabs.addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      this.onSound(); this.tab = b.dataset.t; this.body.scrollTop = 0; this.render();
    });
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
    const general = this.tab === 'general';
    this.tabs.querySelectorAll('button').forEach((b) => { const on = b.dataset.t === this.tab; b.classList.toggle('sel', on); b.setAttribute('aria-current', on); });
    this.general.classList.toggle('hidden', !general);
    this.head.textContent = general ? tr('settings.general') : tr(`${WORLDS[+this.tab].id}.name`);
    this.head.style.setProperty('--tab', general ? '' : WORLDS[+this.tab].theme.css);
    const items = general ? GENERAL : levelSettings(+this.tab);
    const flags = general ? GENERAL_DEBUG : levelDebugSettings(+this.tab);
    // the tab's debug switches, in their own section at the end
    const debug = flags.length ? `<h4 class="set-sub">${tr('settings.debug')}</h4>` + flags.map((s, i) => `
      <div class="setting">
        <div class="txt"><span>${labelOf(s)}</span>${hasHint(s) ? `<small>${hintOf(s)}</small>` : ''}</div>
        <button class="switch" role="switch" data-f="${i}" aria-label="${labelOf(s)}"><i></i></button>
      </div>`).join('') : '';
    this.list.innerHTML = items.map((s, i) => `
      <div class="setting stepper">
        <div class="txt"><span>${labelOf(s)}</span>${hasHint(s) ? `<small data-h="${i}">${hintOf(s)}</small>` : ''}</div>
        <div class="ctl">
          <button class="step" data-i="${i}" data-d="-1" aria-label="${tr('settings.decrease', { name: labelOf(s) })}">−</button>
          <b data-v="${i}"></b>
          <button class="step" data-i="${i}" data-d="1" aria-label="${tr('settings.increase', { name: labelOf(s) })}">+</button>
        </div>
      </div>`).join('') + debug;
    this.rows = items;
    this.flags = flags;
    this.list.querySelectorAll('button.switch').forEach((btn) => btn.addEventListener('click', () => {
      const s = flags[+btn.dataset.f]; s.set(!s.get()); this.onSound(); this.refresh();
    }));
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
    this.list.querySelectorAll('button.switch').forEach((el) => el.setAttribute('aria-checked', String(this.flags[+el.dataset.f].get())));
  }
}
