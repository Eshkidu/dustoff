// Shelf theme check: renders Home off-screen with the real library, opens a disc game and a cartridge
// game, plays one of each up to the launch call, and saves screenshots plus any page errors.
// Usage: electron tools/ui-shot/shelf-test.js <outdir>
const path = require('path');
const fs = require('fs');
const { app, BrowserWindow, ipcMain } = require('electron');
const APP = path.join(__dirname, '..', '..', 'app');
const OUT = process.argv.slice(2).find(a => !a.startsWith('--') && !a.endsWith('.js')) || __dirname;
app.setPath('userData', path.join(require('os').tmpdir(), 'dustoff-ui-shot'));
app.whenReady().then(async () => {
  const store = require(path.join(APP, 'lib', 'store'));
  const controls = require(path.join(APP, 'lib', 'controls'));
  store.load();
  const db = store.get();
  const snap = {
    games: db.games,
    settings: Object.assign({}, db.settings, { theme: 'shelf', themeSounds: false }),
    systems: store.SYS,
    controls: controls.forRenderer(),
    version: 'test',
  };
  const launched = [];
  ipcMain.handle('lib:get', () => snap);
  ipcMain.handle('selftest:info', () => false);
  ipcMain.handle('art:disc', (_e, gid) => {
    const g = db.games.find(x => x.id === gid);
    return g && g.discArt && fs.existsSync(g.discArt) ? g.discArt : null;
  });
  ipcMain.handle('game:launch', (_e, gid, resume) => {
    launched.push([gid, resume]);
    return { error: 'test run: not starting games' };
  });
  for (const ch of ['coop:status', 'switch:status', 'wiiu:status', 'ra:progress']) ipcMain.handle(ch, () => null);
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    show: process.env.SHOW === '1',
    webPreferences: { preload: path.join(APP, 'preload.js'), contextIsolation: true, sandbox: false },
  });
  const errors = [];
  win.webContents.on('console-message', (_e, level, msg) => {
    if (level >= 2) errors.push(msg);
  });
  await win.loadFile(path.join(APP, 'renderer', 'index.html'));
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const run = js => win.webContents.executeJavaScript(`(() => { try { ${js}; return 'ok' } catch (e) { return 'ERR ' + e.message } })()`);
  const shot = async name => fs.writeFileSync(path.join(OUT, `shelf-${name}.png`), (await win.webContents.capturePage()).toPNG());
  await wait(1200);
  await shot('home');
  const pick = sys => `const g = LIB.games.find(x => x.sys === '${sys}'); shelfOpen(stage.querySelector('.sh-box[data-game="' + g.id + '"]'))`;
  for (const [sys, name] of [
    ['wii', 'disc'],
    ['n64', 'cart'],
  ]) {
    console.log(name, 'open', await run(pick(sys)));
    await wait(350);
    await shot(`${name}-a-lifting`);
    await wait(1900);
    await shot(`${name}-b-open`);
    console.log(name, 'play', await run(`shelfPlay('play')`));
    await wait(name === 'disc' ? 1500 : 1300);
    await shot(`${name}-c-playing`);
    await wait(2200);
    await shot(`${name}-d-after`);
    await run(`launchingId = null; $('#launch').hidden = true`);
    await wait(400);
  }
  console.log('launched', JSON.stringify(launched));
  console.log('errors', JSON.stringify(errors));
  app.exit(0);
});
