// Renders the hub off-screen with the real library in a chosen theme and size, presses down a few
// times, and saves screenshots + scroll measurements. Usage: electron tools/ui-shot <theme> <w> <h> <outdir>
const path = require('path');
const fs = require('fs');
const { app, BrowserWindow, ipcMain } = require('electron');
const APP = path.join(__dirname, '..', '..', 'app');
const [theme = 'channels', W = '1440', H = '900', OUT = __dirname] = process.argv.slice(2).filter(a => !a.startsWith('--') && a !== '.' && !a.endsWith('ui-shot'));
app.setPath('userData', path.join(require('os').tmpdir(), 'dustoff-ui-shot'));
app.whenReady().then(async () => {
  const store = require(path.join(APP, 'lib', 'store'));
  const controls = require(path.join(APP, 'lib', 'controls'));
  store.load();
  const db = store.get();
  const snap = { games: db.games, settings: Object.assign({}, db.settings, { theme, themeSounds: false }), systems: store.SYS, controls: controls.forRenderer(), version: 'test' };
  ipcMain.handle('lib:get', () => snap);
  ipcMain.handle('selftest:info', () => false);
  for (const ch of ['coop:status', 'switch:status', 'wiiu:status', 'ra:progress']) ipcMain.handle(ch, () => null);
  const win = new BrowserWindow({ width: +W, height: +H, x: 20, y: 20, show: process.env.SHOW === '1', webPreferences: { preload: path.join(APP, 'preload.js'), contextIsolation: true, sandbox: false } });
  await win.loadFile(path.join(APP, 'renderer', 'index.html'));
  await new Promise(r => setTimeout(r, 1200));
  const measure = () => win.webContents.executeJavaScript(`(() => {
    const g = document.querySelector('.th-scroll') || document.querySelector('.ch-grid');
    const a = document.activeElement; const r = a && a.getBoundingClientRect();
    return { focused: a && (a.getAttribute('aria-label') || a.textContent.trim().slice(0,30)), x: r && Math.round(r.left), y: r && Math.round(r.top),
      gridScrollTop: g && g.scrollTop, pagesLeft: document.querySelector('.ch-pages') && document.querySelector('.ch-pages').scrollLeft, arrows: [...document.querySelectorAll('.ch-arrow')].filter(e => getComputedStyle(e).display !== 'none').map(e => e.className.slice(-1)).join(''), gridClient: g && g.clientHeight, gridScroll: g && g.scrollHeight, tiles: document.querySelectorAll('[data-game]').length };
  })()`);
  const out = [];
  out.push(['start', await measure()]);
  fs.writeFileSync(path.join(OUT, `${theme}-0.png`), (await win.webContents.capturePage()).toPNG());
  const moves = (process.env.MOVES || '0,1;0,1;0,1').split(';');
  for (let i = 1; i <= moves.length; i++) {
    await win.webContents.executeJavaScript(`move(${moves[i - 1]})`);
    await new Promise(r => setTimeout(r, 700));
    out.push(['down ' + i, await measure()]);
    fs.writeFileSync(path.join(OUT, `${theme}-${i}.png`), (await win.webContents.capturePage()).toPNG());
  }
  for (const [k, v] of out) console.log(k, JSON.stringify(v));
  app.exit(0);
});
