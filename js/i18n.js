// All visible text from strings.{zh,en}.json. Generic: `?lang=zh|en`, switchable at runtime.
//   <el data-i18n="key">         → textContent
//   <el data-i18n-list="key">    → array value, one <i> per item
//   <el data-i18n-title="key">   → title + aria-label (icon buttons)
// Canvas code calls t(key) each draw, so a switch repaints everything.

const tables = {};
const listeners = new Set();
let lang = 'en';

export async function initI18n(def = 'en') {
  const q = new URLSearchParams(location.search).get('lang');
  await Promise.all(['zh', 'en'].map(async (l) => { tables[l] = await (await fetch(`strings.${l}.json`)).json(); }));
  setLang(q === 'zh' || q === 'en' ? q : def);
}

export function setLang(l) {
  lang = l;
  document.documentElement.lang = l;
  document.title = t('doc.title');
  for (const el of document.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n);
  for (const el of document.querySelectorAll('[data-i18n-title]')) { el.title = t(el.dataset.i18nTitle); el.setAttribute('aria-label', el.title); }
  for (const el of document.querySelectorAll('[data-i18n-list]')) el.innerHTML = t(el.dataset.i18nList).map((s) => `<i>${s}</i>`).join('');
  listeners.forEach((f) => f(l));
}

export function t(key) {
  const v = tables[lang]?.[key] ?? tables.en?.[key];
  if (v === undefined) { console.warn('i18n: missing', key); return key; }
  return v;
}

export const getLang = () => lang;
export const onLang = (f) => listeners.add(f);
export const toggleLang = () => setLang(lang === 'zh' ? 'en' : 'zh');
/** numbers: thousands with a thin space, fixed decimals */
export const num = (x, d = 0) => x.toFixed(d).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
