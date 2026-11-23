// DOM-based HUD and screens.
const $ = (id) => document.getElementById(id);

const HEART = '<svg viewBox="0 0 24 24" width="22" height="22"><path d="M12 21s-7.5-4.6-10-9.2C.4 8.6 2.3 4.5 6.2 4.5c2.2 0 3.6 1.2 4.4 2.4h2.8c.8-1.2 2.2-2.4 4.4-2.4 3.9 0 5.8 4.1 4.2 7.3C19.5 16.4 12 21 12 21z"/></svg>';

const ICONS = {
  map: '<svg viewBox="0 0 24 24" width="22" height="22"><path d="M6 6h12v12H6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><ellipse cx="6" cy="12" rx="2.2" ry="6" fill="none" stroke="currentColor" stroke-width="1.8"/><ellipse cx="18" cy="12" rx="2.2" ry="6" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M11 6v12" stroke="#ff6a4d" stroke-width="2.2"/></svg>',
  note: '<svg viewBox="0 0 24 24" width="21" height="21"><path d="M5 4.5A1.5 1.5 0 0 1 6.5 3H19v15H6.5A1.5 1.5 0 0 0 5 19.5z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M5 19.5A1.5 1.5 0 0 0 6.5 21H19v-3" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M9 7.5h6M9 10.5h4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" opacity=".7"/></svg>',
  hand: '<svg viewBox="0 0 24 24" width="21" height="21"><path d="M8 13V5.5a1.5 1.5 0 0 1 3 0V11m0-1V4.5a1.5 1.5 0 0 1 3 0V11m0-5.5a1.5 1.5 0 0 1 3 0V13m0-4.5a1.5 1.5 0 0 1 3 0V15a7 7 0 0 1-7 7h-1a7 7 0 0 1-5.6-2.8L3.6 15a1.6 1.6 0 0 1 2.4-2z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" stroke-linecap="round"/></svg>',
};

export class HUD {
  constructor() {
    this.el = {
      hud: $('hud'), gemCount: $('gem-count'), carry: $('gem-carry'), dropN: $('drop-n'), act: $('btn-act'), actLabel: $('act-label'), actIcon: $('btn-act').querySelector('.ico'), lives: $('lives'), level: $('level'), drop: $('btn-drop'), callChip: $('call-chip'), callText: $('call-text'), callBar: $('call-bar'),
      banner: $('banner'), bannerName: $('banner-name'),
      bannerTag: $('banner-tag'), toast: $('toast'), vignette: $('vignette'), fade: $('fade'),
      menu: $('screen-menu'), settings: $('screen-settings'), pause: $('screen-pause'), end: $('screen-end'), loading: $('screen-loading'),
      items: $('items'), itemLabel: $('item-label'), itemName: $('item-name'),
      mapBtn: $('btn-map'), noteBtn: $('btn-note'), endTitle: $('end-title'), endText: $('end-text'), endStats: $('end-stats'), joystick: $('joystick'),
    };
    this.itemBtns = { note: this.el.noteBtn, map: this.el.mapBtn };   // item id -> its button
    this.bannerTimer = null;
    this.toastTimer = null;
  }

  showScreen(name) {
    for (const k of ['menu', 'settings', 'pause', 'end', 'loading']) this.el[k].classList.toggle('hidden', k !== name);
    this.el.hud.classList.toggle('hidden', name !== null && name !== 'pause');
  }

  setAccent(css) { document.documentElement.style.setProperty('--accent', css); }

  setWorld(name) { this.el.level.textContent = name; }

  setGems(filled, quota, carrying, open) {
    this.el.gemCount.textContent = `${filled} / ${quota}`;
    // carried gems show as a small badge beside the count
    this.el.carry.textContent = carrying && !open ? `+${carrying} carried` : '';
    this.el.carry.classList.toggle('show', !!carrying && !open);
    this.el.carry.parentElement.classList.toggle('carrying', !!carrying && !open);
    this.el.dropN.textContent = carrying ? String(carrying) : '';
    this.el.hud.classList.toggle('portal-open', open);
  }

  // radius in metres, k = 0..1 of max; found = gems inside the ring
  setCall(on, radius = 0, k = 0, found = 0, trail = false) {
    this.el.callChip.classList.toggle('show', on);
    if (!on) return;
    this.el.callText.textContent = found ? `${found} gem${found === 1 ? '' : 's'} answered · ${Math.round(radius)} m` : trail ? 'Nothing in range — follow the trail' : `Calling… ${Math.round(radius)} m`;
    this.el.callBar.style.width = `${Math.round(k * 100)}%`;
  }

  // Your items (things you hold up to read: the note, the map), in the order you found them, and the selected
  // one. PC: a slot bar; the label above it names the selected item for a moment after the selection changes (and
  // while that item calls for attention). Touch: buttons that fill a column of up to --max-rows, then wrap leftwards.
  setItems(ids, sel) {
    const key = ids.join() + '|' + sel;
    if (this.itemsKey === key) return;
    const prevSel = this.itemsKey ? this.itemsKey.split('|')[1] : null;
    this.itemsKey = key;
    const box = this.el.items;
    box.classList.toggle('none', !ids.length);
    const rows = parseInt(getComputedStyle(box).getPropertyValue('--max-rows'), 10) || 4;
    box.style.setProperty('--rows', String(Math.max(1, Math.min(ids.length, rows))));
    for (const [id, btn] of Object.entries(this.itemBtns)) {
      const i = ids.indexOf(id);
      btn.classList.toggle('show', i >= 0);
      btn.classList.toggle('sel', id === sel);
      btn.style.order = String(i);
      btn.querySelector('.k').textContent = i >= 0 && i < 9 ? String(i + 1) : '';
    }
    box.classList.toggle('many', ids.length > 1);
    this.el.itemName.textContent = sel ? this.itemBtns[sel].getAttribute('aria-label') : '';
    if (sel && sel !== prevSel) this.flashItemLabel();
  }
  flashItemLabel() {
    this.el.itemLabel.classList.add('show');
    clearTimeout(this.labelTimer);
    this.labelTimer = setTimeout(() => this.el.itemLabel.classList.remove('show'), 2600);
  }
  // a tool calling for attention until it's used (a new item, e.g. the note at a world's start or the map once
  // taken): a slow glow, and its name stays shown (beside it on touch, above the slot bar on PC while it's selected)
  attention(btn, on) {
    btn.classList.toggle('attn', !!on);
    this.el.items.classList.toggle('attn', !!this.el.items.querySelector('.tool.sel.attn'));
  }
  // a tool that just appeared glows and shows its name for a moment, so it's noticed
  fresh(btn) { btn.classList.remove('fresh'); void btn.offsetWidth; btn.classList.add('fresh'); }

  // the contextual action (e.g. "Take the map" next to the crate): { id, label, icon } or null
  setAction(a) {
    const id = a ? a.id : null;
    if (this.actId === id) return;
    this.actId = id;
    this.el.act.classList.toggle('show', !!a);
    if (!a) return;
    this.el.actLabel.textContent = a.label;
    this.el.act.setAttribute('aria-label', a.label);
    this.el.actIcon.innerHTML = ICONS[a.icon] || ICONS.hand;
  }

  setDrop(on) {
    if (on && !this.dropTaught) { this.dropTaught = true; this.fresh(this.el.drop); }
    this.el.drop.classList.toggle('show', on);
  }

  setLives(n, max) {
    let html = '';
    for (let i = 0; i < max; i++) html += `<span class="heart ${i < n ? '' : 'lost'}">${HEART}</span>`;
    this.el.lives.innerHTML = html;
  }

  showBanner(name, tag) {
    this.el.bannerName.textContent = name;
    this.el.bannerTag.textContent = tag;
    this.el.banner.classList.add('show');
    clearTimeout(this.bannerTimer);
    this.bannerTimer = setTimeout(() => this.el.banner.classList.remove('show'), 3600);
  }

  toast(msg, ms = 2600) {
    this.el.toast.textContent = msg;
    this.el.toast.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.el.toast.classList.remove('show'), ms);
  }

  setDanger(k) { this.el.vignette.style.opacity = String(Math.min(1, k * 1.1)); }

  fade(on, color = '#000') {
    this.el.fade.style.background = color;
    this.el.fade.classList.toggle('on', on);
  }

  showEnd(win, text, stats) {
    this.el.endTitle.textContent = win ? 'You made it home' : 'Caught';
    this.el.end.classList.toggle('win', win);
    this.el.endText.textContent = text;
    this.el.endStats.innerHTML = stats.map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join('');
    this.showScreen('end');
  }

  setTouch(on) { document.body.classList.toggle('touch', on); }
}
