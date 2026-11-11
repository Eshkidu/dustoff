/* Dustoff renderer: Theme tab (pick a look, live preview). */
/* ---------- theme tab ---------- */
function themeRender() {
  const cur = curTheme().id;
  return /* HTML */ `<div class="d d-st">
    <div class="thp">
      <aside class="thp-side">
        <h1>Theme</h1>
        <p>Pick a look for the whole hub. Each one is an original design inspired by a console era.</p>
        <div class="thp-list">
          ${HubThemes.list.map(t => /* HTML */ `<button class="thp-item${t.id === cur ? ' on' : ''}" data-f data-act="theme-pick" data-theme="${t.id}"><span class="sw">${t.sw.map(c => /* HTML */ `<i style="background:${c}"></i>`).join('')}</span><b>${esc(t.name)}</b><small>${esc(t.era)}${t.id === cur ? '<span class="use">In use</span>' : ''}</small></button>`).join('')}
        </div>
      </aside>
      <section class="thp-main">
        <div class="thp-prev" id="thprev" aria-hidden="true"></div>
        <div class="thp-info" id="thinfo"></div>
      </section>
    </div>
  </div>`;
}
function drawThemePreview(id) {
  const t = HubThemes.get(id);
  state.thPrev = t.id;
  const L = LIB.games.length ? sorted(LIB.games).slice(0, 12) : SAMPLE;
  const pv = $('#thprev');
  if (pv) pv.innerHTML = t.home(L, thCtx(true));
  const info = $('#thinfo');
  if (!info) return;
  const inUse = t.id === curTheme().id;
  info.innerHTML = /* HTML */ `<h2>${esc(t.name)}</h2>
    <p class="era">${esc(t.era)}</p>
    <p>${esc(t.desc)}</p>
    <div class="thp-chips">${t.chips.map(([k, v]) => /* HTML */ `<span><em>${k}</em>${esc(v)}</span>`).join('')}</div>
    <div class="row">
      <button class="sbtn primary" data-f data-act="theme-pick" data-theme="${t.id}" ${inUse ? ' disabled' : ''}>
        ${inUse ? 'In use' : 'Use this theme'}</button
      ><button class="sbtn" data-f data-act="theme-sound">Menu sounds: ${soundsOn() ? 'On' : 'Off'}</button>
    </div>`;
}
setInterval(() => {
  const n = clockNow();
  document.querySelectorAll('[data-clock="t"]').forEach(e => {
    e.textContent = n.time;
  });
  document.querySelectorAll('[data-clock="d"]').forEach(e => {
    e.textContent = n.date;
  });
}, 20000);
