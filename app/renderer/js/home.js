/* Dustoff renderer: Home (Spotlight) and Library screens. */
/* ---------- Spotlight ---------- */
function homeRender() {
  if (!LIB.games.length && !PENDING.size) {
    return /* HTML */ `<div class="d empty">
      <div class="empty-card">
        ${mascotImg('normal', 'mascot-empty')}
        <h1>Drag your games here</h1>
        <p>
          Drop game files, zip files or a whole folder anywhere on this window. Each game is recognized, copied into
          your games folder and sorted by system. Everything else is already set up.
        </p>
        <p class="empty-sub">Wii U .wux/.wud discs need the keys.txt from your own Wii U. Drop it here too.</p>
        <button class="sp-play" data-f data-act="add"><span class="g a">A</span> Add games</button>
        <div class="sys-row">
          <span>NES .nes</span><span>SNES .sfc .smc</span><span>N64 .z64 .n64 .v64</span><span>Game Boy .gb</span
          ><span>GBC .gbc</span><span>GBA .gba</span><span>GameCube .iso .rvz .gcm</span><span>Wii .wbfs .rvz .iso</span
          ><span>Wii U .wua .wux .wud</span><span>Switch .nsp .xci</span>
        </div>
      </div>
    </div>`;
  }
  const L = [...pendingGames(), ...sorted(list())];
  const th = curTheme();
  if (th.id !== 'hub') return th.home(L, thCtx(false));
  const anyPlayed = LIB.games.some(g => g.lastPlayed);
  return /* HTML */ `<div class="d d-sp">
    <div class="sp-bg"></div>
    <section class="sp-hero">
      <div id="sptext"></div>
      <div class="sp-art" id="spart"></div>
    </section>
    <p class="sp-label">
      ${anyPlayed ? 'Recently played' : 'Your games'}${state.sys !== 'all' ? ' · ' + esc(SYS(state.sys).name) : ''}
    </p>
    <div class="sp-strip">
      ${L.map(g => (g.pending ? /* HTML */ `<button class="sp-tile" data-f data-pending="${g.pending.key}" aria-label="${esc(g.title)}, being added">${art(g)}</button>` : /* HTML */ `<button class="sp-tile" data-f data-game="${g.id}" aria-label="${esc(g.title)}">${art(g)}${tags(g)}</button>`)).join('')}
    </div>
  </div>`;
}
function homeSelect(g) {
  const th = curTheme();
  if (th.id !== 'hub') {
    const el = $('#thdetail');
    if (el && g) el.innerHTML = th.detail(g, thCtx(false));
    return;
  }
  const d = $('.d-sp');
  if (!d || !g) return;
  d.style.setProperty('--h', hue(g));
  const meta = [
    g.playSeconds ? `${fmtDur(g.playSeconds)} played` : 'Not played yet',
    g.lastPlayed ? `Last played ${ago(g.lastPlayed).toLowerCase()}` : '',
    raLine(g),
  ].filter(Boolean);
  const primary = g.resume
    ? /* HTML */ `<button class="sp-play" data-f data-act="continue"><span class="g a">A</span> Continue</button
        ><button class="sp-sec" data-f data-act="play">Start fresh</button>`
    : /* HTML */ `<button class="sp-play" data-f data-act="play"><span class="g a">A</span> Play</button>`;
  const resume = g.resume
    ? /* HTML */ `<div class="sp-resume">
        ${g.resume.thumb ? /* HTML */ `<img src="${fileUrl(g.resume.thumb)}?t=${Math.round(g.resume.at)}" alt="" />` : ''}<span
          >Continue picks up exactly where you quit, ${ago(g.resume.at).toLowerCase()}.</span
        >
      </div>`
    : '';
  $('#sptext').innerHTML = /* HTML */ `<p class="sp-eyebrow">
      ${esc(SYS(g.sys).full)}${g.region ? /* HTML */ ` <span class="badge">${esc(g.region)}</span>` : ''}${verifiedBadge(g)}
    </p>
    <h1>${esc(g.title)}</h1>
    <p class="sp-meta">${meta.map(m => /* HTML */ `<span>${esc(m)}</span>`).join('')}</p>
    <div class="sp-btns">
      ${primary}<button class="sp-sec" data-f data-act="sys">
        ${state.sys === 'all' ? 'All systems' : esc(SYS(state.sys).name)} <span class="g bump">LB</span
        ><span class="g bump">RB</span></button
      ><button class="sp-sec" data-f data-act="library"><span class="g y">Y</span> Library</button>
    </div>
    ${resume}`;
  $('#spart').innerHTML = art(g);
  for (const el of [$('#sptext'), $('#spart')]) {
    el.classList.remove('swap');
    void el.offsetWidth;
    el.classList.add('swap');
  }
}

/* ---------- Library ---------- */
const SORTS = { recent: 'Recently played', az: 'A to Z', played: 'Most played' };
const libList = () => {
  const q = state.q.trim().toLowerCase();
  const L = q ? list().filter(g => g.title.toLowerCase().includes(q)) : list();
  return sorted(L, state.sort);
};
function libGrid() {
  const L = libList();
  const P = state.q ? [] : pendingGames().filter(g => state.sys === 'all' || g.sys === state.sys);
  const pend = P.map(
    g =>
      /* HTML */ `<button class="lb-tile" data-f data-pending="${g.pending.key}">
        <span class="artwrap">${art(g)}</span><span class="lb-t">${esc(g.title)}</span
        ><span class="lb-s">Being added</span>
      </button>`,
  ).join('');
  if (pend)
    return (
      pend +
      L.map(
        g =>
          /* HTML */ `<button class="lb-tile" data-f data-game="${g.id}">
            <span class="artwrap">${art(g)}${tags(g)}</span><span class="lb-t">${esc(g.title)}</span
            ><span class="lb-s">${esc(SYS(g.sys).name)}${g.playSeconds ? ' · ' + fmtDur(g.playSeconds) : ''}</span>
          </button>`,
      ).join('')
    );
  if (!L.length)
    return /* HTML */ `<p class="lb-empty">
      ${mascotImg(state.q ? 'surprised' : 'normal')}
      ${state.q ? `No games match "${esc(state.q)}".` : 'No games here yet. Drag some onto this window.'}
    </p>`;
  return L.map(
    g =>
      /* HTML */ `<button class="lb-tile" data-f data-game="${g.id}">
        <span class="artwrap">${art(g)}${tags(g)}</span><span class="lb-t">${esc(g.title)}</span
        ><span class="lb-s">${esc(SYS(g.sys).name)}${g.playSeconds ? ' · ' + fmtDur(g.playSeconds) : ''}</span>
      </button>`,
  ).join('');
}
function libRender() {
  const side = ['all', ...present()]
    .map(
      s =>
        /* HTML */ `<button class="lb-sys${state.sys === s ? ' on' : ''}" data-f data-sys="${s}">
          <span class="dot" style="--h:${s === 'all' ? 220 : HUE[s]}"></span
          >${s === 'all' ? 'All games' : esc(SYS(s).name)}<em>${count(s)}</em>
        </button>`,
    )
    .join('');
  return /* HTML */ `<div class="d d-lb">
    <aside class="lb-side">
      <button class="lb-home" data-f data-act="home"><span class="g b">B</span> Home</button>
      <p class="lb-brand">Systems</p>
      ${side}
    </aside>
    <section class="lb-main">
      <div class="lb-bar">
        <input
          id="lbsearch"
          data-f
          type="search"
          placeholder="Search your games"
          value="${esc(state.q)}"
          autocomplete="off"
          aria-label="Search"
        /><button class="lb-sort" data-f data-act="sort">${SORTS[state.sort]}</button
        ><span id="lbcount">${gameCount(libList().length)}</span>
      </div>
      <div class="lb-grid" id="lbgrid">${libGrid()}</div>
    </section>
    <section class="lb-detail" id="lbdetail"></section>
  </div>`;
}
let removeArmed = false;
function libSelect(g) {
  const d = $('#lbdetail');
  if (!d || !g) return;
  removeArmed = false;
  const rows = [
    ['Emulator', SYS(g.sys).emu],
    ['Region', g.region || 'Unknown'],
    ['Play time', fmtDur(g.playSeconds) || 'None yet'],
    ['Last played', ago(g.lastPlayed)],
    ['Achievements', raLine(g) || 'None for this game'],
    ['File', (g.file || '').split(/[\\/]/).pop()],
  ];
  d.innerHTML = /* HTML */ `<div id="lbart">${art(g)}</div>
    <p class="lb-eyebrow">${esc(SYS(g.sys).full)}</p>
    <div id="lbtitlewrap"><h2>${esc(g.title)}</h2></div>
    <div class="lb-badges">${verifiedBadge(g)}${g.resume ? '<span class="badge ok">Continue ready</span>' : ''}</div>
    <dl class="lb-dl">
      ${rows
        .map(
          ([k, v]) =>
            /* HTML */ `<dt>${k}</dt>
              <dd>${esc(v)}</dd>`,
        )
        .join('')}
    </dl>
    <div class="lb-actions">
      ${g.resume ? '<button class="lb-play" data-f data-act="continue">Continue</button><button class="lb-small" data-f data-act="play">Start fresh</button>' : '<button class="lb-play" data-f data-act="play">Play</button>'}
      <div class="lb-row">
        <button class="lb-small" data-f data-act="ctl-game">Controls${g.controls ? ' (custom)' : ''}</button
        ><button class="lb-small" data-f data-act="rename">Rename</button
        ><button class="lb-small" data-f data-act="remove" id="lbremove">Remove</button>
      </div>
      <div class="lb-row">
        <button class="lb-small" data-f data-act="art-set">Change picture</button
        >${g.customArt ? '<button class="lb-small" data-f data-act="art-reset">Use original picture</button>' : ''}
      </div>
      <p class="lb-tip">Tip: drag a picture onto this window to use it for ${esc(g.title)}.</p>
    </div>`;
}
function applySearch(v) {
  state.q = v;
  const s = $('#lbsearch');
  if (s && s.value !== v) s.value = v;
  if (!$('#lbgrid')) return;
  $('#lbgrid').innerHTML = libGrid();
  $('#lbcount').textContent = gameCount(libList().length);
  const first = stage.querySelector('#lbgrid [data-game]');
  if (first) {
    state.sel = first.dataset.game;
    libSelect(byId(state.sel));
  }
}
