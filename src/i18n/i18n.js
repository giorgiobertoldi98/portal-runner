// Every word the player reads goes through tr(): adding a language never touches game code (see ./CLAUDE.md).
//
// A catalogue is a nested object of strings. A string may hold {vars}; a value may also be a plural set
// ({ one, other, ... } per Intl.PluralRules), chosen by vars.count. Keys are dotted paths ('hud.inPortal').
// The game's own text lives in one file per language (en.js, ...); each world brings its own text in its module
// (`strings: { en: {...} }`), registered under the world's id, so worlds stay self-contained.
import en from './en.js';

// language code -> { name (in that language), strings }. Add a language here and it appears in Settings.
export const LANGUAGES = {
  en: { name: 'English', strings: en },
};
const FALLBACK = 'en';
const STORE_KEY = 'pr-lang';
// ?lang=pseudo: every string accented, bracketed and ~35% longer, to spot hard-coded text and test room for
// longer languages. A testing aid only: never offered in Settings.
const PSEUDO = 'pseudo';

const worldStrings = {};   // namespace -> { lang -> strings }

function pickLanguage() {
  const asked = new URLSearchParams(location.search).get('lang');
  if (asked === PSEUDO || LANGUAGES[asked]) return asked;
  try { const saved = localStorage.getItem(STORE_KEY); if (LANGUAGES[saved]) return saved; } catch (_) {}
  for (const l of navigator.languages || [navigator.language]) {
    const base = String(l || '').toLowerCase().split('-')[0];
    if (LANGUAGES[base]) return base;
  }
  return FALLBACK;
}

export const lang = pickLanguage();
const locale = lang === PSEUDO ? FALLBACK : lang;
const plurals = new Intl.PluralRules(locale);

// Switching language reloads the page: worlds bake text into textures when they're built, so a fresh start is
// the one way every string changes together. Settings are saved, so nothing is lost.
export function setLanguage(code) {
  if (!LANGUAGES[code] || code === lang) return;
  try { localStorage.setItem(STORE_KEY, code); } catch (_) {}
  const url = new URL(location.href);
  url.searchParams.delete('lang');
  location.replace(url);
}

// a world's (or any self-contained module's) own text: { en: {...}, it: {...} }
export function addStrings(ns, byLang) { worldStrings[ns] = byLang || {}; }

const dig = (obj, path) => path.reduce((o, k) => (o == null ? undefined : o[k]), obj);

function lookup(code, key) {
  const [ns, ...rest] = key.split('.');
  if (worldStrings[ns]) return dig(worldStrings[ns][code], rest);
  return dig(LANGUAGES[code]?.strings, key.split('.'));
}

// whether a key exists (in this language or the fallback), for optional text such as a setting's hint
export const has = (key) => lookup(lang === PSEUDO ? FALLBACK : lang, key) !== undefined || lookup(FALLBACK, key) !== undefined;

export function tr(key, vars = {}) {
  let v = lang === PSEUDO ? undefined : lookup(lang, key);
  if (v === undefined) v = lookup(FALLBACK, key);
  if (v === undefined) { console.warn(`[i18n] missing: ${key}`); return key; }
  if (typeof v === 'object') v = v[plurals.select(vars.count ?? 0)] ?? v.other;
  let s = String(v).replace(/\{(\w+)\}/g, (m, k) => (k in vars ? fmtValue(vars[k]) : m));
  if (lang === PSEUDO) s = pseudo(s);
  return s;
}

const numFmt = new Map();
// a number in the player's language (decimal separator and all); digits = fixed decimals
export function num(n, digits = 0) {
  if (!numFmt.has(digits)) numFmt.set(digits, new Intl.NumberFormat(locale, { minimumFractionDigits: digits, maximumFractionDigits: digits }));
  return numFmt.get(digits).format(n);
}
const fmtValue = (v) => (typeof v === 'number' ? num(v, Number.isInteger(v) ? 0 : 1) : String(v));

// Fill the static markup: data-i18n (text), data-i18n-html (trusted markup from our own catalogue) and
// data-i18n-aria / data-i18n-title (attributes).
export function applyDom(root = document) {
  document.documentElement.lang = locale;
  document.title = tr('title');
  for (const el of root.querySelectorAll('[data-i18n]')) el.textContent = tr(el.dataset.i18n);
  for (const el of root.querySelectorAll('[data-i18n-html]')) el.innerHTML = tr(el.dataset.i18nHtml);
  for (const el of root.querySelectorAll('[data-i18n-aria]')) el.setAttribute('aria-label', tr(el.dataset.i18nAria));
  for (const el of root.querySelectorAll('[data-i18n-title]')) el.setAttribute('title', tr(el.dataset.i18nTitle));
}

const ACCENT = { a: 'å', e: 'é', i: 'î', o: 'ö', u: 'ü', c: 'ç', n: 'ñ', s: 'š', y: 'ý', A: 'Å', E: 'É', I: 'Î', O: 'Ö', U: 'Ü', C: 'Ç', N: 'Ñ', S: 'Š' };
function pseudo(s) {
  // leave markup and unfilled {vars} intact
  const out = s.split(/(<[^>]*>|\{\w+\})/).map((part, i) => (i % 2 ? part : part.replace(/[a-zA-Z]/g, (c) => ACCENT[c] || c))).join('');
  const letters = s.replace(/<[^>]*>/g, '').length;
  return `⟦${out}${'·'.repeat(Math.ceil(letters * 0.35))}⟧`;
}
