/* Dustoff renderer: Shared state and helpers: library data, cover art, themes context, profile, "being added" tiles. */
const api = window.hub;
const HUE = { nes: 18, gb: 85, snes: 282, n64: 150, gbc: 320, gba: 50, gc: 248, wii: 195, wiiu: 120, switch: 355 };
const ORDER = ['nes', 'gb', 'snes', 'n64', 'gbc', 'gba', 'gc', 'wii', 'wiiu', 'switch'];
let LIB = {
  games: [],
  settings: { ra: {}, controls: {} },
  systems: {},
  controls: { systems: {}, inputs: {}, groups: {} },
};
const PENDING = new Map(); // games still being added: key -> { key, name, sys, stage, pct }
const state = {
  screen: 'home',
  sys: 'all',
  sel: null,
  mode: 'kb',
  q: '',
  sort: 'recent',
  running: false,
  pendingRender: false,
  ctl: null,
};

const $ = s => document.querySelector(s);
const stage = $('#stage');
const esc = s =>
  String(s ?? '').replace(
    /[&<>"']/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
const hash = s => {
  let h = 7;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) | 0;
  return Math.abs(h);
};
const mono = t =>
  t
    .replace(/[^A-Za-z0-9' ]/g, ' ')
    .split(/\s+/)
    .filter(w => w && !/^(the|of|a|to|bros|and)$/i.test(w))
    .slice(0, 3)
    .map(w => w[0])
    .join('')
    .toUpperCase();
const byId = id => LIB.games.find(g => g.id === id);
const SYS = s => LIB.systems[s] || { name: s, full: s, emu: '' };
const curTheme = () => HubThemes.get(LIB.settings.theme || 'hub');
// Interface sounds (on unless turned off). Moves only sound when the user just pressed something,
// so focus changes from screen redraws stay quiet.
const soundsOn = () => LIB.settings.themeSounds !== false;
let lastInput = 0;
const userInput = () => {
  lastInput = performance.now();
};
function sfx(kind, theme) {
  if (soundsOn()) HubThemes.sfx(theme || curTheme(), kind);
}
const clockNow = () => {
  const d = new Date();
  return {
    time: d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }).replace(/\s?[AP]M/i, ''),
    date: d.toLocaleDateString([], { weekday: 'short', month: 'numeric', day: 'numeric' }),
  };
};
// Helpers handed to themes.js. In preview mode tiles are inert and the first one shows as selected.
function thCtx(preview) {
  return {
    preview,
    art,
    esc,
    hue,
    now: clockNow,
    profile,
    tags: g => (preview || g.pending ? '' : tags(g)),
    sysName: g => (g.pending ? (g.sys ? SYS(g.sys).name : 'New game') : SYS(g.sys).name),
    meta: g =>
      g.pending
        ? pendLabel(g.pending)
        : [
            SYS(g.sys).name,
            g.playSeconds ? `${fmtDur(g.playSeconds)} played` : 'Not played yet',
            g.resume ? 'Continue ready' : '',
          ]
            .filter(Boolean)
            .join(' · '),
    attr: g =>
      preview ? 'tabindex="-1"' : g.pending ? `data-f data-pending="${g.pending.key}"` : `data-f data-game="${g.id}"`,
    sel: i => (preview && i === 0 ? ' sel' : ''),
  };
}
/* Profile shown on the Home Row theme: a name plus a picture or a color. */
const PF_COLORS = {
  orange: 'radial-gradient(circle at 35% 30%, #ffd36b, #f08a3c)',
  blue: 'radial-gradient(circle at 35% 30%, #8fd3ff, #2f6fe0)',
  green: 'radial-gradient(circle at 35% 30%, #b6f27a, #2e9e52)',
  pink: 'radial-gradient(circle at 35% 30%, #ffc2e2, #e0479a)',
  purple: 'radial-gradient(circle at 35% 30%, #d6b8ff, #7a4fe0)',
  red: 'radial-gradient(circle at 35% 30%, #ffb3a1, #d93b2f)',
  gray: 'radial-gradient(circle at 35% 30%, #e6e8ec, #7b828b)',
};
function profile() {
  const p = LIB.settings.profile || {};
  const avatar = p.icon
    ? `background-image:url('${fileUrl(p.icon)}?v=${encodeURIComponent(p.icon.slice(-18))}')`
    : `background:${PF_COLORS[p.color] || PF_COLORS.orange}`;
  return { name: p.name || 'Player 1', color: p.color || 'orange', icon: p.icon || '', avatar };
}
const SAMPLE = [
  ['Mario Kart Wii', 'wii'],
  ['Super Mario 3D World', 'wiiu'],
  ['The Legend of Zelda: Ocarina of Time', 'n64'],
  ['GoldenEye 007', 'n64'],
  ['Super Metroid', 'snes'],
  ['Metroid Fusion', 'gba'],
  ['Pokémon Crystal', 'gbc'],
  ['Super Mario Bros. 3', 'nes'],
].map(([title, sys], i) => ({ id: 'sample' + i, title, sys }));
const present = () => ORDER.filter(s => LIB.games.some(g => g.sys === s));
const count = s => (s === 'all' ? LIB.games.length : LIB.games.filter(g => g.sys === s).length);
const list = () => (state.sys === 'all' ? LIB.games : LIB.games.filter(g => g.sys === state.sys));
const gameCount = n => `${n} game${n === 1 ? '' : 's'}`;
const hue = g => {
  const h = hash(g.title);
  return ((HUE[g.sys] ?? 220) + (h % 40) - 20 + 360) % 360;
};
const fileUrl = p =>
  'file:///' +
  encodeURI(p.replace(/\\/g, '/'))
    .replace(/#/g, '%23')
    .replace(/\?/g, '%3F')
    .replace(/'/g, '%27')
    .replace(/\(/g, '%28')
    .replace(/\)/g, '%29');
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

function sorted(arr, how = 'recent') {
  const a = [...arr];
  if (how === 'az') return a.sort((x, y) => x.title.localeCompare(y.title));
  if (how === 'played') return a.sort((x, y) => (y.playSeconds || 0) - (x.playSeconds || 0));
  return a.sort((x, y) => (y.lastPlayed || 0) - (x.lastPlayed || 0) || (y.added || 0) - (x.added || 0));
}
function fmtDur(s) {
  s = s || 0;
  const h = Math.floor(s / 3600),
    m = Math.floor((s % 3600) / 60);
  return h ? `${h}h ${m}m` : m ? `${m}m` : s ? 'Under a minute' : '';
}
function ago(ts) {
  if (!ts) return 'Never';
  const d = Date.now() - ts,
    min = Math.round(d / 60000);
  if (min < 2) return 'Just now';
  if (min < 60) return `${min} min ago`;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (ts >= today.getTime()) return 'Today';
  if (ts >= today.getTime() - 864e5) return 'Yesterday';
  const days = Math.floor((today.getTime() - ts) / 864e5) + 1;
  if (days < 7) return `${days} days ago`;
  return new Date(ts).toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
    year: days > 300 ? 'numeric' : undefined,
  });
}
function art(g, cls = '') {
  const h = hash(g.title),
    h1 = hue(g),
    h2 = (h1 + 30 + ((h >> 3) % 70)) % 360,
    a = 100 + ((h >> 5) % 160);
  if (g.pending) return pendArt(g);
  const src = g.art ? fileUrl(g.art) : '';
  const img = g.art
    ? /* HTML */ `<img class="art-bg" src="${src}" alt="" draggable="false" /><img
          class="art-fg"
          src="${src}"
          alt=""
          draggable="false"
        />`
    : '';
  return /* HTML */ `<div
    class="art ${g.art ? 'img' : ''} ${cls}"
    style="--h1:${h1};--h2:${h2};--a:${a}deg"
    aria-hidden="true"
  >
    <span class="mono">${esc(mono(g.title))}</span>${img}
  </div>`;
}
// If a cover image fails to load, fall back to the generated art.
document.addEventListener(
  'error',
  e => {
    const t = e.target;
    if (t.tagName === 'IMG' && t.parentElement && t.parentElement.classList.contains('art')) {
      const a = t.parentElement;
      a.classList.remove('img');
      a.querySelectorAll('img').forEach(i => i.remove());
    }
  },
  true,
);
// A greyed tile with a progress bar while a game is being copied in (like a console download).
function pendLabel(p) {
  return p.stage === 'checking' ? 'Checking…' : p.pct == null ? 'Copying…' : `Copying ${p.pct}%`;
}
function pendArt(g) {
  const p = g.pending;
  return /* HTML */ `<div
    class="art pend${p.pct == null ? ' ind' : ''}"
    data-pend="${p.key}"
    style="--p:${p.pct || 0}"
    aria-hidden="true"
  >
    <span class="mono">${esc(mono(g.title))}</span>
    <span class="pend-lab"
      ><b>${esc(pendLabel(p))}</b><span class="pend-bar"><i></i></span
    ></span>
  </div>`;
}
const pendingGames = () =>
  [...PENDING.values()].map(p => ({
    id: 'pending-' + p.key,
    title: p.name || 'New game',
    sys: p.sys || '',
    pending: p,
  }));
function updatePending(p) {
  document.querySelectorAll(`[data-pend="${p.key}"]`).forEach(el => {
    el.style.setProperty('--p', p.pct || 0);
    el.classList.toggle('ind', p.pct == null);
    const b = el.querySelector('.pend-lab b');
    if (b) b.textContent = pendLabel(p);
  });
}
const isNew = g => g.added && Date.now() - g.added < 864e5 && !g.lastPlayed;
const tags = g =>
  `${isNew(g) ? '<b class="new">New</b>' : ''}${g.resume ? '<i class="resumedot" title="Continue available"></i>' : ''}`;
function verifiedBadge(g) {
  if (g.verified === true) return '<span class="badge ok">Verified good copy</span>';
  if (g.verified === false) return '<span class="badge warn">Not in the game database</span>';
  return '';
}
function raLine(g) {
  if (g.ra && g.ra.total) return `${g.ra.earned} of ${g.ra.total} achievements`;
  if (g.raGameId) return LIB.settings.ra.user ? 'Achievements on' : 'Achievements available';
  return '';
}
