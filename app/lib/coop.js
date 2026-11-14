// Play with a friend: the host's game is streamed to friends, and each friend's controller
// becomes Player 2, 3 or 4 (through lib/dsu.js). Friends don't need the game, only Dustoff.
//
// Host:  coop.host(gameId) -> code. A hidden window (coop/host.html) does the streaming.
// Guest: coop.join(code). A full-screen window (coop/guest.html) shows the game and sends the controller.
const path = require('path');
const { BrowserWindow, session, desktopCapturer } = require('electron');
const store = require('./store');
const runner = require('./runner');
const native = require('./native');
const dsu = require('./dsu');
const controls = require('./controls');
const { SYS } = store;

const PROTO = 1; // bump when host and guest can no longer talk to each other
// Easy to read out loud and type with a controller: no 0/O, 1/I/L.
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const newCode = () => Array.from({ length: 6 }, () => ALPHABET[(Math.random() * ALPHABET.length) | 0]).join('');
const showCode = c => (c ? `${c.slice(0, 3)}-${c.slice(3)}` : '');
const DIR = path.join(__dirname, '..', 'coop');

let hooks = { send() {}, notice() {} };
let host = null; // { code, gid, win, friends: Map(slot -> name), hwnd, watch }
let guest = null; // { code, win, poll }
let hostSession = null;

function init(h) {
  hooks = Object.assign(hooks, h);
  // Anything left over from a crash while hosting goes back to normal.
  try {
    controls.restoreGuests();
  } catch {}
  hostSession = session.fromPartition('dustoff-coop-host');
  // The host page asks to capture "the screen"; Dustoff answers with the game window and PC sound.
  hostSession.setDisplayMediaRequestHandler(async (_req, cb) => {
    try {
      const hwnd = host && host.hwnd;
      if (!hwnd) return cb({});
      const sources = await desktopCapturer.getSources({ types: ['window'], thumbnailSize: { width: 0, height: 0 } });
      const src = sources.find(s => s.id.split(':')[1] === String(hwnd));
      if (!src) return cb({});
      cb({ video: src, audio: 'loopback' });
    } catch {
      cb({});
    }
  });
  hostSession.setPermissionRequestHandler((_wc, perm, cb) => cb(perm === 'media' || perm === 'display-capture'));
}

const status = () => ({
  role: host ? 'host' : guest ? 'guest' : null,
  code: showCode((host || guest || {}).code),
  friends: host ? [...host.friends.entries()].map(([slot, name]) => ({ player: slot + 2, name })) : [],
});
const changed = () => hooks.send('coop:state', status());

/* ---------- hosting ---------- */
function coopWindow(file, opts = {}) {
  return new BrowserWindow(
    Object.assign(
      {
        show: false,
        backgroundColor: '#000000',
        autoHideMenuBar: true,
        icon: path.join(__dirname, '..', 'icon', 'dustoff.ico'),
        webPreferences: Object.assign(
          {
            preload: path.join(DIR, 'preload.js'),
            contextIsolation: true,
            sandbox: false,
            backgroundThrottling: false,
            autoplayPolicy: 'no-user-gesture-required',
          },
          opts.web || {},
        ),
      },
      opts.win || {},
    ),
  );
}

// Starts the invite (gets a code), then starts the game with Players 2-4 set up for friends.
async function startHost(gid, resume) {
  if (host || guest) return { error: 'Already playing with a friend.' };
  if (runner.isRunning()) return { error: 'A game is already running.' };
  const g = store.game(gid);
  if (!g) return { error: 'Game not found.' };
  if (g.players === 1) return { error: `${g.title} is a one-player game, so there's no spot for a friend.` };
  if (!controls.SUPPORTS_GUESTS.has(g.sys))
    return {
      error: `Playing with a friend works with GameCube, Wii and Wii U games for now. ${SYS[g.sys].name} is coming later.`,
    };
  try {
    await dsu.start();
  } catch (e) {
    return { error: "Couldn't get friend controllers ready. Restart Dustoff and try again." };
  }
  // As many friends as the game has spots for (up to 3), when the game database knows.
  const max = g.players ? Math.max(1, Math.min(3, g.players - 1)) : 3;
  host = { code: null, gid, win: null, friends: new Map(), hwnd: 0, watch: null, title: g.title, max };
  let ready = null;
  for (let attempt = 0; attempt < 4 && host; attempt++) {
    host.code = newCode();
    ready = await openHostWindow(host.code, g.title);
    if (ready.ok || ready.error !== 'taken') break;
  }
  if (!host) return { error: 'Stopped.' };
  if (!ready || !ready.ok) {
    stopHost();
    return {
      error:
        ready && ready.error === 'net'
          ? "Couldn't reach the internet to make a friend code. Check your connection and try again."
          : "Couldn't make a friend code. Try again in a moment.",
    };
  }
  const r = runner.launch(gid, resume, { guests: true });
  if (!r || r.error) {
    stopHost();
    return r || { error: 'Something went wrong starting the game.' };
  }
  watchGameWindow();
  hooks.notice({ code: showCode(host.code), text: 'Waiting for a friend to join', sticky: true });
  changed();
  return { ok: true, code: showCode(host.code) };
}

function openHostWindow(code, title) {
  return new Promise(resolve => {
    if (host.win && !host.win.isDestroyed()) host.win.destroy();
    const win = coopWindow('host', { web: { partition: 'dustoff-coop-host' } });
    host.win = win;
    let done = false;
    const finish = v => {
      if (done) return;
      done = true;
      clearTimeout(t);
      resolve(v);
    };
    const t = setTimeout(() => finish({ error: 'net' }), 15000);
    win.webContents.once('did-finish-load', () =>
      win.webContents.send('coop:init', { code, title, proto: PROTO, max: host ? host.max : 3 }),
    );
    win.webContents.ipc.on('coop:ready', () => finish({ ok: true }));
    win.webContents.ipc.on('coop:error', (_e, kind) => finish({ error: kind }));
    win.webContents.ipc.on('coop:pad', (_e, slot, st) => {
      if (host && host.friends.has(slot) && st && typeof st === 'object') dsu.setPad(slot, st);
    });
    win.webContents.ipc.on('coop:joined', (_e, slot, name) => {
      if (!host || typeof slot !== 'number') return;
      host.friends.set(slot, String(name || 'Friend').slice(0, 20));
      hooks.notice({ text: `${host.friends.get(slot)} joined as Player ${slot + 2}`, mood: 'happy' });
      require('./discord').friends(host.friends.size);
      changed();
    });
    win.webContents.ipc.on('coop:left', (_e, slot) => {
      if (!host || !host.friends.has(slot)) return;
      const name = host.friends.get(slot);
      host.friends.delete(slot);
      dsu.clearPad(slot);
      hooks.notice({ text: `${name} left (Player ${slot + 2})`, mood: 'surprised' });
      require('./discord').friends(host.friends.size);
      changed();
    });
    win.on('closed', () => {
      if (host && host.win === win) host.win = null;
    });
    win.loadFile(path.join(DIR, 'host.html'));
  });
}

// Finds the game's window and keeps the stream pointed at it (Dolphin and Cemu can recreate it).
function watchGameWindow() {
  clearInterval(host.watch);
  host.watch = setInterval(() => {
    const c = runner.current();
    if (!host || !c || !c.proc) return;
    const hwnd = native.mainWindowOf(c.proc.pid);
    if (hwnd && hwnd !== host.hwnd) {
      host.hwnd = hwnd;
      if (host.win && !host.win.isDestroyed()) host.win.webContents.send('coop:capture');
    }
  }, 1000);
}

function stopHost() {
  if (!host) return;
  const h = host;
  host = null;
  clearInterval(h.watch);
  if (h.win && !h.win.isDestroyed()) {
    h.win.webContents.send('coop:end');
    setTimeout(() => !h.win.isDestroyed() && h.win.destroy(), 600);
  }
  dsu.stop();
  hooks.notice(null);
  changed();
}

/* ---------- joining ---------- */
function join(rawCode, name) {
  if (host || guest) return { error: 'Already playing with a friend.' };
  if (runner.isRunning()) return { error: 'Quit your game first, then join your friend.' };
  const clean = String(rawCode || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
  if (clean.length !== 6 || [...clean].some(c => !ALPHABET.includes(c)))
    return {
      error: /[01OIL]/.test(clean)
        ? "That code doesn't look right. Friend codes never use 0, O, 1, I or L. Check it with your friend."
        : 'Friend codes have 6 letters and numbers, like K7P-2QX.',
    };
  const win = coopWindow('guest', { win: { fullscreen: true, title: 'Dustoff · Playing with a friend' } });
  guest = { code: clean, win, poll: null, last: '' };
  win.webContents.once('did-finish-load', () =>
    win.webContents.send('coop:init', { code: clean, show: showCode(clean), name: name || 'Friend', proto: PROTO }),
  );
  win.once('ready-to-show', () => {
    win.show();
    win.focus();
  });
  win.on('closed', () => leave());
  win.webContents.ipc.on('coop:leave', () => leave());
  win.loadFile(path.join(DIR, 'guest.html'));
  // Read this PC's controller often and pass changes to the page, which sends them to the host.
  let lastSent = 0;
  guest.poll = setInterval(() => {
    if (!guest || win.isDestroyed()) return;
    const p = native.readPadFull() || { b: 0, lt: 0, rt: 0, lx: 0, ly: 0, rx: 0, ry: 0, none: true };
    const key = `${p.b},${p.lt},${p.rt},${p.lx >> 8},${p.ly >> 8},${p.rx >> 8},${p.ry >> 8}`;
    const now = Date.now();
    if (key !== guest.last || now - lastSent > 100) {
      guest.last = key;
      lastSent = now;
      win.webContents.send('coop:pad', p);
    }
  }, 4);
  changed();
  return { ok: true };
}

function leave() {
  if (!guest) return;
  const g = guest;
  guest = null;
  clearInterval(g.poll);
  if (!g.win.isDestroyed()) g.win.destroy();
  hooks.send('coop:left-game');
  changed();
}

module.exports = {
  init,
  host: startHost,
  join,
  leave,
  status,
  // Called by main.js when the hosted game closes.
  gameEnded() {
    stopHost();
  },
  isHosting: () => !!host,
  showCode,
  PROTO,
};
