const { app, BrowserWindow, ipcMain, shell, screen, dialog } = require('electron');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const store = require('./lib/store');
const id = require('./lib/identify');
const runner = require('./lib/runner');
const controls = require('./lib/controls');
const setup = require('./lib/setup');
const coop = require('./lib/coop');
const gameinfo = require('./lib/gameinfo');
const updater = require('./lib/update');
const discord = require('./lib/discord');
const { P, SYS } = store;

const UA = 'GameLauncherHub/0.1.0 (Windows)';
let hub, overlay;

// Self-test mode (DUSTOFF_SELFTEST=1): opens hidden, renders every screen in every theme,
// writes data/cache/selftest.json and exits. Used by tools/check.js before a release.
const SELFTEST = process.env.DUSTOFF_SELFTEST === '1';
if (SELFTEST) app.setPath('userData', path.join(require('os').tmpdir(), 'dustoff-selftest'));
if (!SELFTEST && !app.requestSingleInstanceLock()) app.quit();
app.on('second-instance', () => {
  if (hub) {
    if (hub.isMinimized()) hub.restore();
    hub.focus();
  }
});

function send(ch, data) {
  if (hub && !hub.isDestroyed()) hub.webContents.send(ch, data);
}
const CONTROL_DEFS = controls.forRenderer();
// Plain-language list of what changed in each version (Settings > What's new).
let CHANGELOG = [];
try {
  CHANGELOG = JSON.parse(fs.readFileSync(path.join(__dirname, 'changelog.json'), 'utf8'));
} catch {}
function snapshot() {
  const db = store.get();
  return {
    games: db.games,
    settings: db.settings,
    systems: SYS,
    controls: CONTROL_DEFS,
    version: app.getVersion(),
    update: updState,
    changelog: CHANGELOG,
  };
}
const changed = () => send('lib:changed', snapshot());

function createWindows() {
  store.load();
  setup.ensureAll();
  // Pick up Continue states that may have changed outside the app.
  for (const g of store.get().games) runner.refreshResume(g);
  // Mario Kart Wii used a Dolphin per-game file for Classic Controller; the hub handles that now.
  for (const g of store.get().games) {
    if (g.sys === 'wii' && /^RMC/.test(g.discId || '') && !g.controlsMigrated) {
      g.controls = g.controls || { mode: 'cls', map: {} };
      g.controlsMigrated = true;
      store.save();
    }
  }
  for (const f of [
    path.join(P.dolphin, 'User', 'GameSettings', 'RMC.ini'),
    path.join(P.dolphin, 'User', 'Config', 'Profiles', 'Wiimote', 'Hub Classic Controller.ini'),
  ])
    fs.rmSync(f, { force: true });
  const full = store.get().settings.startFullscreen || process.argv.includes('--fullscreen');
  hub = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#0c0a12',
    autoHideMenuBar: true,
    fullscreen: full,
    show: false,
    title: 'Dustoff',
    icon: path.join(__dirname, 'icon', 'dustoff.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      sandbox: false,
      autoplayPolicy: 'no-user-gesture-required',
    },
  });
  hub.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  hub.once('ready-to-show', () => {
    if (!SELFTEST) hub.show();
  });
  // Never navigate away from the app's own page (e.g. a file dropped in the wrong spot).
  hub.webContents.on('will-navigate', e => e.preventDefault());
  hub.on('closed', () => {
    hub = null;
    app.quit();
  });
  hub.webContents.on('before-input-event', (e, input) => {
    if (input.type === 'keyDown' && input.key === 'F11') {
      hub.setFullScreen(!hub.isFullScreen());
      e.preventDefault();
    }
  });
  hub.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  const b = screen.getPrimaryDisplay().bounds;
  overlay = new BrowserWindow({
    x: b.x,
    y: b.y,
    width: b.width,
    height: b.height,
    transparent: true,
    frame: false,
    show: false,
    skipTaskbar: true,
    focusable: false,
    resizable: false,
    hasShadow: false,
    alwaysOnTop: true,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: false },
  });
  overlay.setAlwaysOnTop(true, 'screen-saver');
  overlay.setIgnoreMouseEvents(false);
  overlay.loadFile(path.join(__dirname, 'overlay', 'overlay.html'));

  coop.init({
    send(ch, data) {
      send(ch, data);
      if (ch === 'coop:left-game') focusHub();
    },
    notice: showNotice,
  });
}
function focusHub() {
  if (!hub || hub.isDestroyed()) return;
  hub.show();
  if (hub.isMinimized()) hub.restore();
  hub.setAlwaysOnTop(true);
  hub.focus();
  hub.setAlwaysOnTop(false);
}

/* ---------- overlay: in-game menu + small notices (friend code, friend joined) ---------- */
let menuOpen = false,
  noticeShown = false;
function showNotice(n) {
  if (!overlay || overlay.isDestroyed()) return;
  overlay.webContents.send('overlay:notice', n);
  if (!n) return;
  noticeShown = true;
  if (!menuOpen) {
    // Clicks go through to the game while only a notice is showing.
    overlay.setIgnoreMouseEvents(true);
    overlay.showInactive();
    overlay.setAlwaysOnTop(true, 'screen-saver');
  }
}
ipcMain.on('overlay:notice-gone', () => {
  noticeShown = false;
  if (!menuOpen && overlay && !overlay.isDestroyed()) overlay.hide();
});

runner.setHooks({
  started(g) {
    send('game:state', { running: true, id: g.id });
    discord.playing(g);
  },
  ended(g, secs) {
    discord.stopped();
    coop.gameEnded();
    send('game:state', { running: false, id: g.id, secs });
    changed();
    if (hub && !hub.isDestroyed()) {
      hub.show();
      if (hub.isMinimized()) hub.restore();
      hub.setAlwaysOnTop(true);
      hub.focus();
      hub.setAlwaysOnTop(false);
    }
  },
  error(msg) {
    send('toast', msg);
    send('game:state', { running: false });
  },
  overlay(open, g, kind) {
    if (!overlay || overlay.isDestroyed()) return;
    menuOpen = !!open;
    if (open) {
      overlay.setIgnoreMouseEvents(false);
      overlay.webContents.send('overlay:open', {
        coop: coop.status(),
        title: g.title,
        sys: SYS[g.sys].name,
        canState: kind === 'ra' || kind === 'dolphin',
        playSeconds: g.playSeconds || 0,
      });
      overlay.showInactive();
      overlay.setAlwaysOnTop(true, 'screen-saver');
    } else {
      overlay.webContents.send('overlay:close');
      if (noticeShown) overlay.setIgnoreMouseEvents(true);
      else overlay.hide();
    }
  },
  overlayNav(key) {
    if (overlay && !overlay.isDestroyed()) overlay.webContents.send('overlay:nav', key);
  },
});

/* ---------- adding games ---------- */
async function uniqueDest(dir, name, size) {
  let dest = path.join(dir, name);
  for (let i = 2; ; i++) {
    try {
      const st = await fsp.stat(dest);
      if (st.size === size) return { dest, exists: true };
      dest = path.join(dir, name.replace(/(\.[^.]+)$/, ` (${i})$1`));
    } catch {
      return { dest, exists: false };
    }
  }
}
/* "Downloading" tiles: each file being added shows up right away with its progress. */
let pendN = 0;
const pend = (key, d) => send('lib:pending', Object.assign({ key }, d));
const pendDone = key => send('lib:pending', { key, done: true });
const ownWrites = new Set(); // files the hub itself is writing, so the folder watcher ignores them
function copyWithProgress(src, dest, onPct) {
  return new Promise((resolve, reject) => {
    const total = fs.statSync(src).size;
    let done = 0,
      last = 0;
    const rs = fs.createReadStream(src, { highWaterMark: 4 << 20 }),
      ws = fs.createWriteStream(dest);
    rs.on('data', c => {
      done += c.length;
      const now = Date.now();
      if (now - last > 200) {
        last = now;
        onPct(total ? Math.round((done / total) * 100) : 100);
      }
    });
    rs.on('error', reject);
    ws.on('error', reject);
    ws.on('finish', resolve);
    rs.pipe(ws);
  });
}
async function addOne(file, results) {
  const key = 'p' + ++pendN;
  pend(key, { name: id.cleanFileName(file), stage: 'checking' });
  try {
    const info = await id.inspect(file).catch(e => {
      results.failed.push(`${path.basename(file)}: ${e.message}`);
      return null;
    });
    if (!info) {
      if (!results.failed.some(f => f.startsWith(path.basename(file)))) results.unknown.push(path.basename(file));
      return;
    }
    const db = store.get();
    const dupe = db.games.find(
      g =>
        g.sys === info.sys &&
        ((info.crc && g.crc === info.crc) ||
          (info.discId && g.discId === info.discId) ||
          (info.titleId && g.titleId === info.titleId) ||
          path.basename(g.file) === path.basename(file)),
    );
    if (dupe) {
      results.dupes.push(dupe.title);
      return;
    }
    pend(key, { name: info.title, sys: info.sys, stage: 'copying', pct: 0 });
    const dir = path.join(P.games, SYS[info.sys].dir);
    const st = await fsp.stat(file);
    let dest = file;
    if (!path.resolve(file).toLowerCase().startsWith(path.resolve(dir).toLowerCase())) {
      const u = await uniqueDest(dir, path.basename(file), st.size);
      dest = u.dest;
      if (!u.exists) {
        ownWrites.add(dest.toLowerCase());
        try {
          // A file already inside the games folder (put there by hand) is moved, not copied.
          const inGames = path
            .resolve(file)
            .toLowerCase()
            .startsWith(path.resolve(P.games).toLowerCase() + path.sep);
          let moved = false;
          if (inGames) {
            try {
              await fsp.rename(file, dest);
              moved = true;
            } catch {}
          }
          if (!moved) await copyWithProgress(file, dest, pct => pend(key, { pct }));
        } finally {
          setTimeout(() => ownWrites.delete(dest.toLowerCase()), 5000);
        }
      }
    }
    addGame(info, dest, results);
  } finally {
    pendDone(key);
  }
}
function addGame(info, dest, results) {
  const db = store.get();
  const g = {
    id: store.newId(),
    title: info.title,
    sys: info.sys,
    file: dest,
    region: info.region || '',
    verified: info.verified,
    crc: info.crc || null,
    raHash: info.raHash || null,
    datName: info.datName || null,
    discId: info.discId || null,
    titleId: info.titleId || null,
    wiiuId: info.wiiuId || null,
    added: Date.now(),
    playSeconds: 0,
    sessions: [],
    lastPlayed: null,
    art: null,
    raGameId: null,
  };
  db.ignored = db.ignored.filter(x => x !== dest.toLowerCase()); // adding it on purpose un-hides it
  db.games.unshift(g);
  results.added.push(g);
  store.save();
  changed();
  // Slower lookups run after the game shows up.
  (async () => {
    await fillInfo(g);
    const art = await id.fetchArt(g);
    if (art) {
      g.art = art;
      store.save();
      changed();
    }
    if (g.raHash) {
      g.raGameId = await id.raGameId(g.raHash);
      store.save();
      changed();
    }
  })();
}
ipcMain.handle('lib:add', (_e, paths) => addPaths(paths));
async function addPaths(paths) {
  const results = { added: [], dupes: [], unknown: [], failed: [], installed: [] };
  const temps = [];
  try {
    // Gather every file first (unpacking zips) so a firmware zip's .nca files stay together.
    const groups = [];
    for (const p of paths) {
      const plain = [];
      for (const f of await id.walk(p).catch(() => [])) {
        if (id.ARCHIVES.has(id.extOf(f))) {
          send('toast', `Unpacking ${path.basename(f)}…`);
          try {
            const dir = await id.extract(f);
            temps.push(dir);
            groups.push(await id.walk(dir));
          } catch (e) {
            results.failed.push(`${path.basename(f)}: couldn't unpack`);
          }
        } else plain.push(f);
      }
      if (plain.length) groups.push(plain);
    }
    for (const files of groups) {
      const { rest, done } = await setup
        .takeSystemFiles(files)
        .catch(e => ({ rest: files, done: [`Couldn't install console files: ${e.message}`] }));
      results.installed.push(...done);
      for (const f of rest) await addOne(f, results);
    }
  } finally {
    for (const t of temps) fsp.rm(t, { recursive: true, force: true }).catch(() => {});
  }
  if (results.installed.length) changed();
  return {
    added: results.added.map(g => ({ id: g.id, title: g.title, sys: g.sys, verified: g.verified })),
    dupes: results.dupes,
    unknown: results.unknown,
    failed: results.failed,
    installed: results.installed,
  };
}

/* ---------- games folder watcher ---------- */
// Game files copied straight into the games folder (any subfolder) are added on their own once
// the copy finishes. While Windows is still copying, the game shows as a "downloading" tile.
const watching = new Map();
function queueWatch(f) {
  const lf = f.toLowerCase();
  if (watching.has(lf) || ownWrites.has(lf) || !id.EXT[id.extOf(f)] || store.get().ignored.includes(lf)) return;
  if (store.get().games.some(g => (g.file || '').toLowerCase() === lf)) return;
  const key = 'w' + ++pendN;
  let last = -1,
    same = 0,
    shown = false;
  const t = setInterval(async () => {
    let st;
    try {
      st = await fsp.stat(f);
    } catch {
      clearInterval(t);
      watching.delete(lf);
      if (shown) pendDone(key);
      return;
    }
    if (!st.isFile()) {
      clearInterval(t);
      watching.delete(lf);
      return;
    }
    if (st.size !== last) {
      last = st.size;
      same = 0;
      if (!shown) {
        shown = true;
        pend(key, { name: id.cleanFileName(f), stage: 'copying', pct: null });
      }
      return;
    }
    if (++same < 3) return;
    try {
      const fh = await fsp.open(f, 'r+');
      await fh.close();
    } catch {
      return;
    } // still locked by the copy
    clearInterval(t);
    watching.delete(lf);
    if (shown) pendDone(key);
    if (store.get().games.some(g => (g.file || '').toLowerCase() === lf)) return;
    const r = await addPaths([f]);
    // Duplicates and files that aren't games stay where they are but aren't checked again every start.
    if (!r.added.length && !store.get().ignored.includes(lf)) {
      store.get().ignored.push(lf);
      store.save();
    }
    if (r.added.length) send('toast', `Added ${r.added.map(g => g.title).join(', ')}.`);
  }, 1000);
  watching.set(lf, t);
}
function watchGames() {
  try {
    fs.watch(P.games, { recursive: true }, (_ev, name) => {
      if (name) queueWatch(path.join(P.games, name));
    });
  } catch (e) {
    console.error('watch failed', e);
  }
  // Pick up anything that was put in the folder while the hub was closed.
  id.walk(P.games)
    .then(files => files.forEach(queueWatch))
    .catch(() => {});
}

/* ---------- custom pictures ---------- */
async function setCustomArt(g, src) {
  const ext = (path.extname(src) || '.png').toLowerCase();
  if (!/^\.(png|jpe?g|webp|gif|bmp)$/.test(ext)) return { error: 'Pick a PNG, JPG, WEBP, GIF or BMP picture.' };
  const dest = path.join(P.art, `${g.id}-custom-${Date.now()}${ext}`);
  await fsp.copyFile(src, dest);
  if (g.customArt && g.art && g.art !== dest) fsp.rm(g.art, { force: true }).catch(() => {});
  g.art = dest;
  g.customArt = true;
  store.save();
  changed();
  return { ok: true };
}
ipcMain.handle('art:pick', async (_e, gid) => {
  const g = store.game(gid);
  if (!g) return;
  const r = await dialog.showOpenDialog(hub, {
    title: `Picture for ${g.title}`,
    properties: ['openFile'],
    filters: [{ name: 'Pictures', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'] }],
  });
  if (r.canceled || !r.filePaths[0]) return { canceled: true };
  return setCustomArt(g, r.filePaths[0]);
});
// Profile picture for the Home Row badge.
ipcMain.handle('profile:pick', async () => {
  const r = await dialog.showOpenDialog(hub, {
    title: 'Choose your profile picture',
    properties: ['openFile'],
    filters: [{ name: 'Pictures', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'] }],
  });
  if (r.canceled || !r.filePaths[0]) return { canceled: true };
  const s = store.get().settings;
  s.profile = s.profile || {};
  const dest = path.join(P.art, `profile-${Date.now()}${path.extname(r.filePaths[0]).toLowerCase() || '.png'}`);
  await fsp.copyFile(r.filePaths[0], dest);
  if (s.profile.icon) fsp.rm(s.profile.icon, { force: true }).catch(() => {});
  s.profile.icon = dest;
  store.save();
  changed();
  return { ok: true };
});
ipcMain.handle('profile:clear', () => {
  const s = store.get().settings;
  if (!s.profile || !s.profile.icon) return;
  fsp.rm(s.profile.icon, { force: true }).catch(() => {});
  delete s.profile.icon;
  store.save();
  changed();
});
ipcMain.handle('art:file', (_e, gid, file) => {
  const g = store.game(gid);
  return g ? setCustomArt(g, file) : null;
});
ipcMain.handle('art:reset', async (_e, gid) => {
  const g = store.game(gid);
  if (!g) return;
  if (g.customArt && g.art) await fsp.rm(g.art, { force: true }).catch(() => {});
  g.customArt = false;
  g.art = null;
  store.save();
  changed();
  const art = await id.fetchArt(g);
  if (art) {
    g.art = art;
    store.save();
    changed();
  }
  return { ok: !!art };
});

/* ---------- library edits ---------- */
ipcMain.handle('lib:get', () => snapshot());
ipcMain.handle('lib:update', (_e, gid, patch) => {
  const g = store.game(gid);
  if (!g) return;
  if (typeof patch.title === 'string' && patch.title.trim()) {
    g.title = patch.title.trim().slice(0, 120);
    g.renamed = true;
  }
  if (typeof patch.fav === 'boolean') g.fav = patch.fav;
  store.save();
  changed();
});
ipcMain.handle('lib:remove', (_e, gid) => {
  const db = store.get();
  const i = db.games.findIndex(g => g.id === gid);
  if (i < 0) return;
  const [g] = db.games.splice(i, 1);
  if (g.art) fsp.rm(g.art, { force: true }).catch(() => {});
  if (g.file && !db.ignored.includes(g.file.toLowerCase())) db.ignored.push(g.file.toLowerCase());
  store.save();
  changed();
  return { title: g.title, file: g.file };
});

/* ---------- playing ---------- */
ipcMain.handle('game:launch', (_e, gid, resume) =>
  coop.status().role === 'guest' ? { error: "You're in a friend's game right now." } : runner.launch(gid, resume),
);
ipcMain.on('overlay:action', async (_e, name) => {
  if (name === 'resume') return runner.toggleOverlay(false);
  const msg = await runner.action(name);
  if (msg && overlay) overlay.webContents.send('overlay:done', msg);
});

/* ---------- updates ---------- */
// updState: { installed, available: {version} | null, busy, pct, error }
let updInfo = null;
const updState = { installed: false, available: null, busy: false, pct: 0, error: '' };
function updSend() {
  send('update:state', updState);
}
async function updCheck(manual) {
  updState.installed = updater.isInstalled();
  updState.error = '';
  try {
    const info = await updater.check();
    const isNew = info && (!updInfo || updInfo.version !== info.version);
    updInfo = info;
    updState.available = info ? { version: info.version } : null;
    if (isNew && !manual) send('toast', `Dustoff ${info.version} is out. Update from Settings when you're ready.`);
  } catch {
    if (manual) updState.error = "Couldn't check for updates. Check your internet connection.";
  }
  updSend();
  return updState;
}
ipcMain.handle('update:check', () => updCheck(true));
ipcMain.handle('update:install', async () => {
  if (!updInfo || updState.busy) return updState;
  if (runner.isRunning() || coop.status().role)
    return Object.assign({}, updState, { error: 'Finish your game first, then update.' });
  updState.busy = true;
  updState.pct = 0;
  updSend();
  try {
    await updater.install(updInfo, pct => {
      updState.pct = pct;
      updSend();
    });
  } catch (e) {
    updState.busy = false;
    updState.error = "The update didn't download completely. Try again.";
    updSend();
  }
  return updState;
});

/* ---------- playing with a friend ---------- */
ipcMain.handle('coop:host', (_e, gid, resume) => coop.host(gid, !!resume));
ipcMain.handle('coop:join', (_e, code) => {
  const p = store.get().settings.profile || {};
  return coop.join(code, p.name || '');
});
ipcMain.handle('coop:leave', () => coop.leave());
ipcMain.handle('coop:status', () => coop.status());

/* ---------- controls ---------- */
// data: { mode, map } or null to go back to defaults (system) / system controls (game).
ipcMain.handle('controls:set', (_e, sys, gid, data) => {
  if (!SYS[sys]) return;
  const clean = data && {
    mode: String(data.mode || ''),
    map: data.map && typeof data.map === 'object' ? data.map : {},
  };
  if (gid) {
    const g = store.game(gid);
    if (!g) return;
    if (clean) g.controls = clean;
    else delete g.controls;
  } else {
    const c = store.get().settings.controls;
    if (clean) c[sys] = clean;
    else delete c[sys];
  }
  store.save();
  changed();
});

/* ---------- settings ---------- */
ipcMain.handle('settings:set', (_e, patch) => {
  const s = store.get().settings;
  if (typeof patch.startFullscreen === 'boolean') s.startFullscreen = patch.startFullscreen;
  if (typeof patch.theme === 'string' && /^[a-z0-9-]{1,30}$/.test(patch.theme)) s.theme = patch.theme;
  if (typeof patch.themeSounds === 'boolean') s.themeSounds = patch.themeSounds;
  if (typeof patch.discord === 'boolean') s.discord = patch.discord;
  if (patch.profile && typeof patch.profile === 'object') {
    s.profile = s.profile || {};
    if (typeof patch.profile.name === 'string') s.profile.name = patch.profile.name.trim().slice(0, 20);
    if (typeof patch.profile.color === 'string' && /^[a-z]{1,12}$/.test(patch.profile.color))
      s.profile.color = patch.profile.color;
  }
  if (patch.ra) Object.assign(s.ra, patch.ra);
  store.save();
  changed();
});
ipcMain.handle('app:fullscreen', () => {
  hub.setFullScreen(!hub.isFullScreen());
  return hub.isFullScreen();
});
ipcMain.handle('app:open', (_e, which) => {
  const map = { games: P.games, switch: store.ryuData(), wiiu: path.join(P.cemu, 'portable'), root: P.root };
  if (map[which]) shell.openPath(map[which]);
});
ipcMain.handle('switch:status', () => setup.switchStatus());
ipcMain.handle('switch:openEmu', () => {
  const exe = store.ryuExe();
  if (!exe) return;
  const { spawn } = require('child_process');
  spawn(exe, [], { cwd: P.ryubing, detached: true, stdio: 'ignore' }).unref();
});
ipcMain.handle('switch:pick', async () => {
  const r = await dialog.showOpenDialog(hub, { title: 'Choose your Ryubing folder', properties: ['openDirectory'] });
  if (r.canceled || !r.filePaths[0]) return { canceled: true };
  const dir = r.filePaths[0];
  if (!store.ryuExe(dir))
    return { error: "That folder doesn't have Ryujinx.exe in it. Pick the folder you unzipped Ryubing into." };
  store.get().settings.ryubingDir = dir;
  store.useRyubing(dir);
  setup.ensureAll();
  store.save();
  changed();
  return { ok: true };
});

ipcMain.handle('wiiu:status', () => {
  const base = path.join(P.cemu, 'portable');
  const keys = [path.join(base, 'keys.txt'), path.join(P.cemu, 'keys.txt')].some(f => {
    try {
      return fs.statSync(f).size > 40;
    } catch {
      return false;
    }
  });
  return {
    keys,
    controller: fs.existsSync(path.join(base, 'controllerProfiles', 'controller0.xml')),
    configured: fs.existsSync(path.join(base, 'settings.xml')),
  };
});
ipcMain.handle('wiiu:openEmu', () => {
  const { spawn } = require('child_process');
  spawn(path.join(P.cemu, 'Cemu.exe'), [], { cwd: P.cemu, detached: true, stdio: 'ignore' }).unref();
});

/* ---------- RetroAchievements ---------- */
ipcMain.handle('ra:login', async (_e, user, pass) => {
  try {
    const body = new URLSearchParams({ r: 'login2', u: user, p: pass });
    const r = await fetch('https://retroachievements.org/dorequest.php', {
      method: 'POST',
      body,
      headers: { 'User-Agent': UA },
    });
    const j = await r.json();
    if (!j.Success) return { error: j.Error || 'Login failed. Check your username and password.' };
    const s = store.get().settings;
    s.ra.user = j.User || user;
    s.ra.token = j.Token;
    store.save();
    changed();
    return { ok: true, user: s.ra.user };
  } catch (e) {
    return { error: "Couldn't reach RetroAchievements. Check your internet connection." };
  }
});
ipcMain.handle('ra:logout', () => {
  const s = store.get().settings;
  s.ra = { user: '', token: '', apiKey: '' };
  store.save();
  changed();
});
ipcMain.handle('ra:progress', async (_e, gid) => {
  const g = store.game(gid);
  const s = store.get().settings.ra;
  if (!g || !g.raGameId || !s.user || !s.apiKey) return null;
  try {
    const u = `https://retroachievements.org/API/API_GetGameInfoAndUserProgress.php?y=${encodeURIComponent(s.apiKey)}&u=${encodeURIComponent(s.user)}&g=${g.raGameId}`;
    const j = await (await fetch(u, { headers: { 'User-Agent': UA } })).json();
    g.ra = { earned: j.NumAwardedToUser || 0, total: j.NumAchievements || 0, at: Date.now() };
    store.save();
    return g.ra;
  } catch {
    return null;
  }
});

// Player count and supported controllers (Wii / Wii U), from GameTDB. Refreshed monthly.
async function fillInfo(g) {
  if (!['wii', 'wiiu'].includes(g.sys)) return;
  try {
    const i = await gameinfo.lookup(g);
    if (i === undefined) return; // offline: try again next start
    g.players = i ? i.players : null;
    g.ctrls = i ? i.ctrls : null;
    g.infoAt = Date.now();
    store.save();
    changed();
  } catch {}
}

// Re-check games that were added before a recognition fix, or whose art failed to download.
async function recheck() {
  for (const g of store.get().games)
    if (['wii', 'wiiu'].includes(g.sys) && (!g.infoAt || Date.now() - g.infoAt > 30 * 864e5)) await fillInfo(g);
  for (const g of store.get().games) {
    if (g.customArt || (g.art && g.verified !== false)) continue;
    if (!id.ROM_SYS.includes(g.sys) && g.art) continue;
    try {
      if (g.verified !== true && id.ROM_SYS.includes(g.sys)) {
        const info = await id.inspect(g.file);
        if (info && info.verified) {
          Object.assign(g, {
            verified: true,
            datName: info.datName,
            region: info.region,
            crc: info.crc,
            raHash: info.raHash,
          });
          if (!g.renamed) g.title = info.title;
        }
      }
      if (g.sys === 'wiiu' && !g.wiiuId) {
        const info = await id.inspect(g.file);
        if (info && info.wiiuId) {
          g.wiiuId = info.wiiuId;
          g.region = info.region;
          g.titleId = info.titleId || null;
          if (!g.renamed) g.title = info.title;
        }
      }
      if (!g.art) {
        const art = await id.fetchArt(g);
        if (art) g.art = art;
      }
      if (g.raHash && !g.raGameId) g.raGameId = await id.raGameId(g.raHash);
      store.save();
      changed();
    } catch {}
  }
}
ipcMain.handle('selftest:info', () => SELFTEST);
ipcMain.handle('selftest:shot', async (_e, name) => {
  if (!SELFTEST || !/^[a-z0-9-]{1,30}$/.test(name)) return;
  const img = await hub.webContents.capturePage();
  fs.writeFileSync(path.join(P.cache, `selftest-${name}.png`), img.toPNG());
});
ipcMain.on('selftest:done', (_e, r) => {
  try {
    fs.writeFileSync(
      path.join(P.cache, 'selftest.json'),
      JSON.stringify(Object.assign({ electron: process.versions.electron, at: new Date().toISOString() }, r), null, 2),
    );
  } catch {}
  app.exit(r && r.ok ? 0 : 1);
});
app.whenReady().then(() => {
  createWindows();
  if (SELFTEST) {
    setTimeout(() => {
      try {
        fs.writeFileSync(
          path.join(P.cache, 'selftest.json'),
          JSON.stringify({ ok: false, errors: ['timed out: the window never reported back'] }),
        );
      } catch {}
      app.exit(2);
    }, 60000);
    return;
  }
  setTimeout(recheck, 1500);
  setTimeout(updCheck, 10000);
  setInterval(updCheck, 6 * 3600e3);
  setTimeout(watchGames, 2500);
});
app.on('window-all-closed', () => app.quit());
