// README picture: renders the real app with a made-up sample library (drawn covers, no real games)
// on the Shelf theme and saves tools/repo/screenshots/home.png.
// Usage: electron tools/ui-shot/readme-shot.js [outfile]
const path = require('path');
const fs = require('fs');
const os = require('os');
const { app, BrowserWindow, ipcMain } = require('electron');
const APP = path.join(__dirname, '..', '..', 'app');
const OUT =
  process.argv.slice(2).find(a => a.endsWith('.png')) ||
  path.join(__dirname, '..', 'repo', 'screenshots', 'home.png');
const ART = path.join(os.tmpdir(), 'dustoff-readme-art');
app.setPath('userData', path.join(os.tmpdir(), 'dustoff-ui-shot'));

// [system, title, motif, [sky top, sky bottom, accent], font, hours played]
const SAMPLE = [
  ['nes', 'Moonlit Harbor', 'sun', ['#1b2550', '#e0577a', '#ffc85a'], 'Press Start 2P', 5],
  ['nes', 'Pixel Pilots', 'grid', ['#120c2e', '#3a1f6b', '#3ff0d8'], 'Press Start 2P', 2],
  ['nes', 'Brickfall', 'city', ['#2a1640', '#e8734a', '#ffd36b'], 'Chakra Petch', 0],
  ['nes', 'Tiny Knight', 'forest', ['#2f5d4a', '#a8d18a', '#f7e08a'], 'Press Start 2P', 1],
  ['gb', 'Pocket Pond', 'waves', ['#25453c', '#9bbc6c', '#e2f0a8'], 'Fredoka', 3],
  ['gb', 'Signal Lost', 'grid', ['#16231c', '#36553a', '#b7d86d'], 'Press Start 2P', 0],
  ['gb', 'Night Train', 'city', ['#151c2c', '#38507a', '#ffd56b'], 'Chakra Petch', 1],
  ['snes', 'Sky Garden', 'peaks', ['#5aa0d8', '#f6c6a0', '#5c8f5a'], 'Fredoka', 8],
  ['snes', 'Velvet Circuit', 'grid', ['#1a0f2e', '#7a1f5e', '#ff6fb5'], 'Chakra Petch', 2],
  ['snes', 'Emberfall', 'sun', ['#2a0e14', '#b8442a', '#ffb347'], 'Bungee', 4],
  ['snes', 'Glass Kingdom', 'orbs', ['#1d2f5a', '#7f6ad8', '#9ff3ea'], 'Unbounded', 0],
  ['n64', 'Turbo Tundra', 'peaks', ['#a9d4f0', '#e8f4fb', '#3a6fa8'], 'Chakra Petch', 6],
  ['n64', 'Orbit Kart', 'grid', ['#0d1a33', '#1f4a8a', '#ffd23f'], 'Bungee', 3],
  ['n64', 'Lantern Woods', 'forest', ['#14222a', '#3a5f5a', '#ffb85c'], 'Unbounded', 0],
  ['gba', 'Fox & Fern', 'forest', ['#e88a4a', '#f7d3a0', '#2f6a4a'], 'Fredoka', 2],
  ['gba', 'Neon Alley', 'city', ['#140a26', '#46206e', '#ff4fd8'], 'Bungee', 1],
  ['gba', 'Coral Quest', 'waves', ['#1a5f8a', '#5ec8d8', '#ff8f7a'], 'Fredoka', 0],
  ['gc', 'Lighthouse Keeper', 'sun', ['#16243f', '#e07a5a', '#fff0b0'], 'Unbounded', 9],
  ['gc', 'Gravity Bloom', 'orbs', ['#2a1240', '#c04a9a', '#ffd0f0'], 'Fredoka', 1],
  ['gc', 'Frost Relay', 'peaks', ['#7fb4dc', '#dff0fb', '#2a5a8a'], 'Chakra Petch', 0],
  ['wii', 'Party Planet', 'orbs', ['#2a6ad8', '#7fd0ff', '#ffe36b'], 'Fredoka', 12],
  ['wii', 'Sky Kart Rally', 'sun', ['#3a8ad8', '#ffb0a0', '#fff3a0'], 'Bungee', 7],
  ['wii', 'Ocean Drift', 'waves', ['#0f4a7a', '#58b8d8', '#ffffff'], 'Unbounded', 2],
  ['wii', 'Kite Festival', 'stars', ['#1a2a6a', '#6a5ad8', '#ffd86b'], 'Fredoka', 0],
  ['wiiu', 'Pixel Parade', 'grid', ['#1a1040', '#5a2ad8', '#ffde4a'], 'Bungee', 4],
  ['wiiu', 'Bloom Brigade', 'forest', ['#2a6a3a', '#bfe08a', '#ff8ab0'], 'Fredoka', 1],
  ['wiiu', 'Rooftop Run', 'city', ['#3a1a4a', '#e86a5a', '#ffe08a'], 'Chakra Petch', 0],
  ['switch', 'Island Postcards', 'waves', ['#2fa8d8', '#fde0a8', '#ff7a5a'], 'Fredoka', 6],
  ['switch', 'Comet Crew', 'stars', ['#110d2a', '#3a2a7a', '#ff9a4a'], 'Bungee', 3],
  ['switch', 'Quiet Woods', 'forest', ['#1f3a33', '#8fb89a', '#f3e3b8'], 'Fredoka', 0],
];
const PICK = 'Moonlit Harbor'; // the game shown turned out

// Drawing code that runs inside the app window (fonts are the app's bundled ones).
const DRAW = String.raw`(async (list) => {
  const fams = [...new Set(list.map(g => g.f))];
  await Promise.all(fams.map(f => document.fonts.load('40px "' + f + '"')));
  const hash = s => { let h = 2166136261; for (const ch of s) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
  const rng = seed => () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const rgb = h => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  const mix = (a, b, t) => { const A = rgb(a), B = rgb(b); return 'rgb(' + A.map((v, i) => Math.round(v + (B[i] - v) * t)).join(',') + ')'; };
  const alpha = (h, a) => 'rgba(' + rgb(h).join(',') + ',' + a + ')';
  const M = {
    sun(c, w, h, [c0, c1, c2]) { const cy = h * .6, r = Math.min(w, h) * .3; const g = c.createLinearGradient(0, cy - r, 0, cy + r); g.addColorStop(0, c2); g.addColorStop(1, c1); c.fillStyle = g; c.beginPath(); c.arc(w / 2, cy, r, 0, 7); c.fill(); c.fillStyle = mix(c0, c1, .35); for (let i = 0; i < 5; i++) c.fillRect(w / 2 - r - 2, cy + r * (.08 + i * .17), 2 * r + 4, 1.5 + i * r * .04); const gy = cy + r * .72; c.fillStyle = mix(c0, '#000000', .45); c.fillRect(0, gy, w, h - gy); },
    grid(c, w, h, [c0, c1, c2]) { const hz = h * .52; c.fillStyle = c2; c.globalAlpha = .85; c.beginPath(); c.arc(w / 2, hz, w * .17, Math.PI, 0); c.fill(); c.globalAlpha = 1; c.fillStyle = mix(c0, '#000000', .4); c.fillRect(0, hz, w, h - hz); c.strokeStyle = alpha(c2, .8); c.lineWidth = Math.max(1, w * .007); for (let i = -9; i <= 9; i++) { c.beginPath(); c.moveTo(w / 2 + i * w * .02, hz); c.lineTo(w / 2 + i * w * .2, h); c.stroke(); } for (let j = 1; j < 9; j++) { const y = hz + (h - hz) * (j / 8) ** 2; c.beginPath(); c.moveTo(0, y); c.lineTo(w, y); c.stroke(); } },
    peaks(c, w, h, [c0, c1, c2], R) { for (let L = 0; L < 4; L++) { c.fillStyle = L === 0 ? mix(c2, c1, .45) : mix(c1, '#000000', .12 + L * .24); const base = h * (.42 + L * .14); c.beginPath(); c.moveTo(0, h); let x = 0; c.lineTo(0, base); while (x < w) { const nx = x + w * (.14 + R() * .14); c.lineTo((x + nx) / 2, base - h * (.06 + R() * .16)); c.lineTo(nx, base); x = nx; } c.lineTo(w, h); c.fill(); } },
    waves(c, w, h, [c0, c1, c2], R) { for (let i = 0; i < 6; i++) { const y0 = h * (.42 + i * .1), A = h * (.02 + R() * .025), f = (2 + R() * 3) * Math.PI / w, ph = R() * 6; c.fillStyle = i % 2 ? alpha(c2, .55 + i * .05) : mix(c1, '#000000', i * .12); c.beginPath(); c.moveTo(0, h); for (let x = 0; x <= w; x += w / 40) c.lineTo(x, y0 + Math.sin(x * f + ph) * A); c.lineTo(w, h); c.fill(); } },
    stars(c, w, h, [c0, c1, c2], R) { c.fillStyle = 'rgba(0,0,0,.35)'; c.fillRect(0, 0, w, h); for (let i = 0; i < 160; i++) { c.fillStyle = 'rgba(255,255,255,' + (.3 + R() * .7) + ')'; const s = R() * w * .008 + .6; c.fillRect(R() * w, R() * h, s, s); } const px = w * .66, py = h * .64, pr = Math.min(w, h) * .22; const g = c.createRadialGradient(px - pr * .4, py - pr * .4, pr * .1, px, py, pr); g.addColorStop(0, c2); g.addColorStop(1, mix(c1, '#000000', .2)); c.fillStyle = g; c.beginPath(); c.arc(px, py, pr, 0, 7); c.fill(); c.strokeStyle = alpha(c2, .7); c.lineWidth = Math.max(1.5, w * .012); c.beginPath(); c.ellipse(px, py, pr * 1.7, pr * .42, -.35, 0, 7); c.stroke(); },
    city(c, w, h, [c0, c1, c2], R) { c.fillStyle = alpha(c2, .9); c.beginPath(); c.arc(w * .75, h * .38, w * .09, 0, 7); c.fill(); let x = -w * .02; while (x < w) { const bw = w * (.08 + R() * .1), bh = h * (.22 + R() * .38); c.fillStyle = mix(c0, '#000000', .55 + R() * .2); c.fillRect(x, h - bh, bw, bh); c.fillStyle = c2; for (let wy = h - bh + bh * .08; wy < h - 4; wy += h * .045) for (let wx = x + bw * .15; wx < x + bw * .85; wx += bw * .24) if (R() < .38) c.fillRect(wx, wy, bw * .12, h * .02); x += bw + w * .01; } },
    forest(c, w, h, [c0, c1, c2], R) { c.fillStyle = alpha(c2, .85); c.beginPath(); c.arc(w * .3, h * .34, w * .11, 0, 7); c.fill(); for (let L = 0; L < 3; L++) { const base = h * (.66 + L * .13); c.fillStyle = mix(c1, '#0b1a12', .3 + L * .3); for (let x = -w * .05; x < w * 1.05; x += w * (.07 + R() * .05)) { const th = h * (.18 + R() * .16), tw = w * (.07 + R() * .05); c.beginPath(); c.moveTo(x, base - th); c.lineTo(x + tw, base + 2); c.lineTo(x - tw, base + 2); c.fill(); } c.fillRect(0, base, w, h - base); } },
    orbs(c, w, h, [c0, c1, c2], R) { c.globalCompositeOperation = 'screen'; for (let i = 0; i < 7; i++) { const r = w * (.12 + R() * .24), x = R() * w, y = h * (.3 + R() * .65); const g = c.createRadialGradient(x - r * .3, y - r * .3, r * .1, x, y, r); const col = [c1, c2, '#ffffff'][i % 3]; g.addColorStop(0, alpha(col, .8)); g.addColorStop(1, alpha(col, 0)); c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, 7); c.fill(); } c.globalCompositeOperation = 'source-over'; },
  };
  const out = {};
  for (const g of list) {
    const cv = document.createElement('canvas'); cv.width = g.W; cv.height = g.H; const c = cv.getContext('2d'); const R = rng(hash(g.t));
    const W = g.W, H = g.H, band = g.band ? Math.round(H * .085) : 0;
    const sky = c.createLinearGradient(0, band, 0, H); sky.addColorStop(0, g.c[0]); sky.addColorStop(1, g.c[1]); c.fillStyle = sky; c.fillRect(0, 0, W, H);
    c.save(); c.translate(0, band); M[g.m](c, W, H - band, g.c, R); c.restore();
    const vg = c.createRadialGradient(W / 2, H / 2, Math.min(W, H) * .3, W / 2, H / 2, Math.max(W, H) * .75); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.35)'); c.fillStyle = vg; c.fillRect(0, 0, W, H);
    const maxW = W * .86; let size = W * (g.f === 'Press Start 2P' ? .085 : .14), lines = [];
    for (let n = 0; n < 14; n++) { c.font = size + 'px "' + g.f + '"'; lines = []; let line = ''; for (const w of g.t.split(' ')) { const t = line ? line + ' ' + w : w; if (c.measureText(t).width > maxW && line) { lines.push(line); line = w; } else line = t; } lines.push(line); if (lines.length <= 2 && lines.every(l => c.measureText(l).width <= maxW)) break; size *= .9; }
    c.textAlign = 'center'; c.textBaseline = 'top'; const lh = size * (g.f === 'Press Start 2P' ? 1.45 : 1.12);
    lines.forEach((l, i) => { const y = band + H * .06 + i * lh; c.lineJoin = 'round'; c.lineWidth = size * .16; c.strokeStyle = 'rgba(0,0,0,.55)'; c.strokeText(l, W / 2, y); c.fillStyle = '#fff8ec'; c.fillText(l, W / 2, y); });
    if (band) { c.fillStyle = g.bandColor; c.fillRect(0, 0, W, band); c.fillStyle = '#f3ead6'; c.font = '700 ' + band * .6 + 'px "Chakra Petch"'; c.textBaseline = 'middle'; c.textAlign = 'left'; c.fillText(g.sysName.toUpperCase(), band * .35, band * .54); }
    out[g.id] = cv.toDataURL('image/png');
  }
  return out;
})`;

app.whenReady().then(async () => {
  const store = require(path.join(APP, 'lib', 'store'));
  const controls = require(path.join(APP, 'lib', 'controls'));
  fs.mkdirSync(ART, { recursive: true });
  const BOX = { nes: [120, 168], gb: [104, 108], snes: [172, 124], n64: [172, 124], gba: [104, 108], gc: [124, 166], wii: [118, 166], wiiu: [118, 148], switch: [100, 160] };
  const BAND = { nes: '#151515', gb: '#2d4a2b', snes: '#3b3a4a', n64: '#20262e', gba: '#352a5c' };
  const now = Date.now();
  const games = SAMPLE.map(([sys, title, m, c, f, hrs], i) => ({
    id: 'sample' + i,
    title,
    sys,
    file: `C:\\Games\\${title}`,
    added: now - 30 * 864e5,
    playSeconds: hrs * 3600 + (hrs ? 1260 : 0),
    lastPlayed: hrs ? now - i * 3 * 3600e3 : 0,
    verified: true,
    art: null,
    _draw: { id: 'sample' + i, t: title, m, c, f, W: BOX[sys][0] * 4, H: BOX[sys][1] * 4, band: !!BAND[sys], bandColor: BAND[sys], sysName: store.SYS[sys].name },
  }));
  const pick = games.find(g => g.title === PICK);
  pick.resume = { at: now - 2 * 3600e3 };
  const strip = gs => gs.map(({ _draw, ...g }) => g);
  const snap = {
    games: strip(games),
    settings: { theme: 'shelf', themeSounds: false, ra: {}, controls: {} },
    systems: store.SYS,
    controls: controls.forRenderer(),
    version: 'sample',
  };
  ipcMain.handle('lib:get', () => snap);
  ipcMain.handle('selftest:info', () => false);
  for (const ch of ['coop:status', 'switch:status', 'wiiu:status', 'ra:progress', 'art:disc']) ipcMain.handle(ch, () => null);
  const win = new BrowserWindow({
    width: 1600,
    height: 900,
    useContentSize: true,
    show: process.env.SHOW === '1',
    webPreferences: { preload: path.join(APP, 'preload.js'), contextIsolation: true, sandbox: false },
  });
  await win.loadFile(path.join(APP, 'renderer', 'index.html'));
  await new Promise(r => setTimeout(r, 800));
  const urls = await win.webContents.executeJavaScript(`${DRAW}(${JSON.stringify(games.map(g => g._draw))})`);
  for (const g of games) {
    const file = path.join(ART, g.id + '.png');
    fs.writeFileSync(file, Buffer.from(urls[g.id].split(',')[1], 'base64'));
    g.art = file;
  }
  snap.games = strip(games);
  win.webContents.send('lib:changed', snap);
  await new Promise(r => setTimeout(r, 900));
  // Pretend a controller is plugged in (the hint bar and badge then show controller buttons) and pick the game.
  await win.webContents.executeJavaScript(`(() => {
    setMode('pad');
    const p = document.getElementById('padtxt'); if (p) { p.textContent = 'Xbox controller connected'; p.parentElement.classList.add('on'); }
    const b = document.querySelector('.sh-box[data-game="${pick.id}"]'); state.sel = '${pick.id}'; focusEl(b, true); select(byId('${pick.id}'));
  })()`);
  await new Promise(r => setTimeout(r, 1500));
  fs.writeFileSync(OUT, (await win.webContents.capturePage()).toPNG());
  console.log('saved', OUT);
  app.exit(0);
});
