/* Dustoff renderer: Shelf theme. Picking a game pulls its case off the shelf and opens it; playing
   spins the disc up (or pushes the cartridge / card into a slot) and then starts the game. */
/* ---------- case overlay ---------- */
const SHV = { open: false, busy: false, g: null };
const shvEl = $('#shv'),
  shvFly = $('#shv-fly'),
  shvCap = $('#shv-cap'),
  shvBtns = $('#shv-btns'),
  shvLayer = $('#shv-layer'),
  shvSlot = $('#shv-slot');
// What sits inside each system's case: [kind, css class, width (share of the case), aspect, plastic color]
const SHV_MEDIA = {
  nes: ['cart', 'cart-nes', 0.72, '1 / 1.1', '#8f8c87'],
  gb: ['cart', 'cart-gb', 0.56, '1 / 1.12', '#aaa7a1'],
  gbc: ['cart', 'cart-gb', 0.56, '1 / 1.12', '#7d6fae'],
  snes: ['cart', 'cart-snes', 0.52, '1.25 / 1', '#a19e98'],
  n64: ['cart', 'cart-n64', 0.44, '1 / .92', '#3c3c42'],
  gba: ['cart', 'cart-gba', 0.68, '1.6 / 1', '#56565e'],
  switch: ['cart', 'card', 0.42, '1 / 1.42', '#e6e3dd'],
  gc: ['disc', 'disc-mini', 0.68],
  wii: ['disc', 'disc', 0.86],
  wiiu: ['disc', 'disc', 0.86],
};
const shelfIsOpen = () => SHV.open || SHV.busy;
// The picked case stays turned out even while the window itself isn't focused.
stage.addEventListener('focusin', e => {
  if (!e.target.classList || !e.target.classList.contains('sh-box')) return;
  stage.querySelectorAll('.sh-on').forEach(b => b !== e.target && b.classList.remove('sh-on'));
  e.target.classList.add('sh-on');
});
const shWait = ms => new Promise(r => setTimeout(r, reduce ? Math.min(ms, 40) : ms));
const shBox = g => stage.querySelector(`.sh-box[data-game="${g.id}"]`);
function shFlip(el) {
  const r = el.getBoundingClientRect(),
    f = shvFly.getBoundingClientRect();
  return {
    dx: r.left + r.width / 2 - (f.left + f.width / 2),
    dy: r.top + r.height / 2 - (f.top + f.height / 2),
    sc: r.width / f.width || 0.3,
  };
}
function shMediaHtml(g) {
  const [kind, cls, w, aspect, color] = SHV_MEDIA[g.sys] || SHV_MEDIA.wii;
  if (kind === 'disc')
    return /* HTML */ `<button
      class="shv-media shv-disc ${cls}"
      style="--mw:${w * 100}%"
      aria-label="Play ${esc(g.title)}"
    >
      <span class="shv-spin">${shDiscFace(g)}</span><span class="shv-sheen"></span>
    </button>`;
  return /* HTML */ `<button
    class="shv-media shv-cart ${cls}"
    style="--mw:${w * 100}%;aspect-ratio:${aspect};--cc:${color}"
    aria-label="Play ${esc(g.title)}"
  >
    <span class="lbl">${art(g)}</span><span class="grip"></span>
  </button>`;
}
// Real disc scan when we have one, otherwise the box art printed on a plain disc.
const shDiscFace = g =>
  g.discArt
    ? /* HTML */ `<img class="shv-discimg" src="${fileUrl(g.discArt)}" alt="" draggable="false" />`
    : /* HTML */ `<span class="shv-label">${art(g)}</span><span class="shv-ring"></span>`;

async function shelfOpen(btn) {
  if (shelfIsOpen() || state.running || launchingId) return;
  const g = byId(btn.dataset.game);
  if (!g) return;
  SHV.busy = true;
  SHV.g = g;
  drawHints();
  if (document.activeElement !== btn) {
    focusEl(btn);
    await shWait(460);
  }
  const B = HubThemes.shelfBox(g.sys),
    media = SHV_MEDIA[g.sys] || SHV_MEDIA.wii;
  const k = Math.min((innerHeight * 0.52) / B.h, (innerWidth * 0.38) / B.w, 3.4),
    W = B.w * k,
    H = B.h * k;
  Object.assign(shvFly.style, {
    width: W + 'px',
    height: H + 'px',
    marginLeft: -W / 2 + 'px',
    marginTop: -H / 2 + 'px',
  });
  shvFly.className = `shv-fly k-${B.k} sb-${g.sys}`;
  shvFly.innerHTML = /* HTML */ `<div class="shv-shift">
    <div class="shv-oc">
      <div class="shv-base">
        ${B.k === 'cb' ? '<div class="shv-tray"></div>' : ''}${media[0] === 'disc' ? '<div class="shv-hub"></div>' : ''}${g.sys === 'switch' ? '<div class="shv-holder"></div>' : ''}${shMediaHtml(g)}
      </div>
      <div class="shv-lid">
        <div class="shv-lid-out">${art(g)}</div>
        <div class="shv-lid-in">${art(g)}</div>
      </div>
    </div>
  </div>`;
  shvFly.querySelector('.shv-media').addEventListener('click', () => shelfPlay(g.resume ? 'continue' : 'play'));
  shDrawCaption(g);
  shvEl.hidden = false;
  shvEl.classList.remove('playing');
  document.body.classList.add('shv-on');
  const f = shFlip(btn);
  btn.classList.add('shv-out');
  requestAnimationFrame(() => shvEl.classList.add('on'));
  sfx('open');
  await shvFly.animate(
    [
      { transform: `translate(${f.dx}px,${f.dy}px) scale(${f.sc})` },
      {
        transform: `translate(${f.dx * 0.4}px,${f.dy * 0.4 - 30}px) scale(${(f.sc + 1) / 2}) rotate(-3deg)`,
        offset: 0.45,
      },
      { transform: 'none' },
    ],
    { duration: reduce ? 1 : 620, easing: 'cubic-bezier(.25,.7,.2,1)', fill: 'both' },
  ).finished;
  shvFly.querySelector('.shv-shift').classList.add('open');
  await shWait(600);
  shvCap.classList.add('on');
  SHV.busy = false;
  SHV.open = true;
  drawHints();
  focusEl(shvBtns.querySelector('[data-f]'), true);
  if (media[0] === 'disc' && !g.discArt && api.discArt)
    api.discArt(g.id).then(file => {
      if (!file) return;
      g.discArt = file;
      const spin = SHV.g === g && shvFly.querySelector('.shv-spin');
      if (spin) spin.innerHTML = shDiscFace(g);
    });
}
function shDrawCaption(g) {
  const meta = [
    g.playSeconds ? `${fmtDur(g.playSeconds)} played` : 'Not played yet',
    g.lastPlayed ? `last played ${ago(g.lastPlayed).toLowerCase()}` : '',
    raLine(g),
  ].filter(Boolean);
  const btns = [
    g.resume ? ['continue', 'Continue', 'a'] : ['play', 'Play', 'a'],
    g.resume ? ['play', 'Start fresh'] : null,
    canInvite(g) ? ['friend', 'Play with a friend'] : null,
    ['back', 'Back to shelf', 'b'],
  ].filter(Boolean);
  $('#shv-sys').textContent = SYS(g.sys).full;
  $('#shv-title').textContent = g.title;
  $('#shv-meta').textContent = meta.join(' · ');
  $('#shv-resume').textContent = g.resume
    ? `Continue picks up exactly where you quit, ${ago(g.resume.at).toLowerCase()}.`
    : '';
  shvBtns.innerHTML = btns
    .map(
      ([act, label, key], i) =>
        /* HTML */ `<button class="shv-btn${i === 0 ? ' pri' : ''}" data-f data-sa="${act}">
          ${key ? `<span class="g ${key}">${key.toUpperCase()}</span>` : ''}${label}
        </button>`,
    )
    .join('');
}
shvBtns.addEventListener('click', e => {
  const b = e.target.closest('[data-sa]');
  if (!b || !SHV.open) return;
  const a = b.dataset.sa;
  if (a === 'back') shelfClose();
  else shelfPlay(a);
});
async function shelfClose() {
  if (!SHV.open) return;
  SHV.open = false;
  SHV.busy = true;
  drawHints();
  sfx('close');
  shvCap.classList.remove('on');
  shvFly.querySelector('.shv-shift').classList.remove('open');
  await shWait(760);
  shvEl.classList.remove('on');
  const btn = shBox(SHV.g);
  if (btn) {
    shvFly.getAnimations().forEach(a => a.cancel());
    const f = shFlip(btn);
    await shvFly.animate([{ transform: 'none' }, { transform: `translate(${f.dx}px,${f.dy}px) scale(${f.sc})` }], {
      duration: reduce ? 1 : 460,
      easing: 'cubic-bezier(.5,0,.3,1)',
      fill: 'both',
    }).finished;
  }
  shReset();
}
function shReset() {
  shvEl.hidden = true;
  shvEl.classList.remove('on', 'playing');
  document.body.classList.remove('shv-on');
  shvFly.getAnimations().forEach(a => a.cancel());
  shvFly.innerHTML = '';
  shvLayer.innerHTML = '';
  shvSlot.className = '';
  shvCap.classList.remove('on');
  const g = SHV.g;
  SHV.open = SHV.busy = false;
  SHV.g = null;
  stage.querySelectorAll('.shv-out').forEach(b => b.classList.remove('shv-out'));
  if (state.pendingRender) render();
  else {
    const b = g && shBox(g);
    if (b) focusEl(b, true);
    drawHints();
  }
}
async function shelfPlay(how) {
  if (!SHV.open) return;
  const g = SHV.g;
  SHV.open = false;
  SHV.busy = true;
  drawHints();
  shvCap.classList.remove('on');
  const media = shvFly.querySelector('.shv-media'),
    r = media.getBoundingClientRect();
  media.style.cssText += `;left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px;transform:none;animation:none`;
  shvLayer.appendChild(media);
  shvEl.classList.add('playing');
  if (media.classList.contains('shv-disc')) await shSpin(media, r);
  else await shInsert(media, r);
  if (how === 'friend') hostGame(g.id, !!g.resume);
  else launchGame(g.id, how === 'continue');
  await shWait(250);
  shReset();
}
async function shSpin(el, r) {
  const tx = innerWidth / 2 - (r.left + r.width / 2),
    ty = innerHeight * 0.45 - (r.top + r.height / 2),
    sc = Math.min(1.4, (innerHeight * 0.5) / r.height);
  await el.animate([{ transform: 'none' }, { transform: `translate(${tx}px,${ty}px) scale(${sc})` }], {
    duration: reduce ? 1 : 520,
    easing: 'cubic-bezier(.2,.8,.2,1)',
    fill: 'forwards',
  }).finished;
  const spin = el.querySelector('.shv-spin'),
    dur = reduce ? 0.2 : 2;
  sfx('spin', null, { dur });
  await new Promise(done => {
    const t0 = performance.now();
    let ang = 0,
      last = t0;
    (function frame(now) {
      const t = (now - t0) / 1000,
        v = Math.min(1, t / dur) ** 2 * 2600;
      ang += (v * (now - last)) / 1000;
      last = now;
      spin.style.transform = `rotate(${ang}deg)`;
      spin.style.filter = v > 900 ? `blur(${Math.min(2.5, (v - 900) / 700)}px)` : '';
      if (t < dur) requestAnimationFrame(frame);
      else done();
    })(t0);
  });
  $('#shv-flash').animate([{ opacity: 0 }, { opacity: 1 }, { opacity: 0 }], { duration: reduce ? 1 : 700 });
  await el.animate(
    [
      { transform: `translate(${tx}px,${ty}px) scale(${sc})`, opacity: 1 },
      { transform: `translate(${tx}px,${ty}px) scale(${sc * 3})`, opacity: 0 },
    ],
    { duration: reduce ? 1 : 420, easing: 'cubic-bezier(.6,0,.9,.4)', fill: 'forwards' },
  ).finished;
}
async function shInsert(el, r) {
  const sw = Math.max(r.width * 1.45, 140),
    cut = Math.min(innerHeight * 0.8, Math.max(innerHeight * 0.62, r.height + 150));
  Object.assign(shvSlot.style, { width: sw + 'px', top: cut - 10 + 'px' });
  shvSlot.classList.add('show');
  const tx = innerWidth / 2 - (r.left + r.width / 2),
    ty = cut - r.bottom,
    D = r.height * 0.72,
    clip0 = 'inset(0px 0px 0px 0px)';
  await el.animate(
    [
      { transform: 'translate(0px,0px) scale(1)', clipPath: clip0 },
      { transform: 'translate(0px,-26px) scale(1.06)', clipPath: clip0, offset: 0.18 },
      { transform: `translate(${tx}px,${ty - 40}px) scale(1)`, clipPath: clip0, offset: 0.55 },
      { transform: `translate(${tx}px,${ty}px) scale(1)`, clipPath: clip0, offset: 0.68 },
      { transform: `translate(${tx}px,${ty + D}px) scale(1)`, clipPath: `inset(0px 0px ${D}px 0px)` },
    ],
    { duration: reduce ? 1 : 1400, easing: 'cubic-bezier(.4,0,.2,1)', fill: 'forwards' },
  ).finished;
  sfx('insert');
  await shWait(320);
  shvSlot.classList.add('power');
  await shWait(500);
  $('#shv-flash').animate([{ opacity: 0 }, { opacity: 0.8 }, { opacity: 0 }], { duration: reduce ? 1 : 600 });
  await shWait(200);
}
