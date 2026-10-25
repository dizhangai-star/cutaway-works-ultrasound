// Paper background picker (generic): cycles the css/bg.css variants on html[data-bg], kept in the URL as ?bg=.
// Preview only: in the film (html.rec) the button is hidden and the key ignored; the recording takes ?bg=.
// Markup: <button class="head-bg mono" data-act="bg" title="background (B)"><svg …/><span></span></button>
export const BGS = ['grid', 'dots', 'iso', 'polar', 'hatch', 'film', 'scan'];

export function initBg(btn = document.querySelector('[data-act="bg"]')) {
  const root = document.documentElement, rec = () => root.classList.contains('rec');
  const set = (name) => {
    if (!BGS.includes(name)) name = 'grid';
    if (name === 'grid') delete root.dataset.bg; else root.dataset.bg = name;
    if (btn) btn.querySelector('span').textContent = name.toUpperCase();
    if (rec()) return;
    const u = new URL(location.href); name === 'grid' ? u.searchParams.delete('bg') : u.searchParams.set('bg', name); history.replaceState(null, '', u);
  };
  const cycle = () => { if (!rec()) set(BGS[(BGS.indexOf(root.dataset.bg || 'grid') + 1) % BGS.length]); };
  set(new URLSearchParams(location.search).get('bg') || 'grid');
  if (btn) btn.onclick = cycle;
  return { set, cycle };
}
