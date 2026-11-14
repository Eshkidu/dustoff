// Starts games in the right emulator, tracks play time, handles Continue
// (resume states), and drives the in-game menu actions for each emulator.
const fs = require('fs');
const path = require('path');
const dgram = require('dgram');
const { spawn, execFile } = require('child_process');
const store = require('./store');
const native = require('./native');
const controls = require('./controls');
const { P, SYS } = store;

const LOG = path.join(P.cache, 'hub.log');
const log = (...a) => {
  try {
    fs.appendFileSync(LOG, `[${new Date().toISOString()}] ${a.join(' ')}\n`);
  } catch {}
};
const kindOf = sys =>
  sys === 'gc' || sys === 'wii' ? 'dolphin' : sys === 'switch' ? 'switch' : sys === 'wiiu' ? 'cemu' : 'ra';
const dolphinState = (g, slot = 1) => path.join(P.dolphin, 'User', 'StateSaves', `${g.discId}.s0${slot}`);

let current = null; // { game, proc, kind, start, paused }
let hooks = { started() {}, ended() {}, overlay() {} };
function setHooks(h) {
  hooks = Object.assign(hooks, h);
}

/* ---------- RetroArch network commands ---------- */
const udp = dgram.createSocket('udp4');
udp.on('error', () => {});
const ra = cmd => udp.send(Buffer.from(cmd), 55355, '127.0.0.1');

/* ---------- resume (Continue) ---------- */
function findRaState(g) {
  const base = path.basename(g.file).replace(/\.[^.]+$/, '') + '.state.auto';
  const root = path.join(P.retroarch, 'states');
  const look = dir => {
    let entries = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return null;
    }
    for (const e of entries) if (e.isFile() && e.name === base) return path.join(dir, e.name);
    for (const e of entries)
      if (e.isDirectory()) {
        const f = look(path.join(dir, e.name));
        if (f) return f;
      }
    return null;
  };
  return look(root);
}
function refreshResume(g) {
  const k = kindOf(g.sys);
  let file = null;
  if (k === 'ra') file = findRaState(g);
  else if (k === 'dolphin' && g.discId && fs.existsSync(dolphinState(g))) file = dolphinState(g);
  if (!file) {
    delete g.resume;
    return;
  }
  const thumb = fs.existsSync(file + '.png') ? file + '.png' : null;
  g.resume = { at: fs.statSync(file).mtimeMs, thumb };
}

/* ---------- emulator settings that depend on the user ---------- */
// RetroAchievements names and tokens go into config files, so keep only safe characters.
const raSafe = v => String(v || '').replace(/[^A-Za-z0-9_.-]/g, '');
function writeRaAppend(resume, extra = []) {
  const s = store.get().settings;
  const lines = ['savestate_auto_save = "true"', `savestate_auto_load = "${resume ? 'true' : 'false'}"`];
  if (s.ra.user && s.ra.token) {
    lines.push(
      'cheevos_enable = "true"',
      `cheevos_username = "${raSafe(s.ra.user)}"`,
      `cheevos_token = "${raSafe(s.ra.token)}"`,
      'cheevos_hardcore_mode_enable = "false"',
    );
  }
  lines.push(...extra);
  const f = path.join(P.cache, 'retroarch-launch.cfg');
  fs.writeFileSync(f, lines.join('\n') + '\n');
  return f;
}
function writeDolphinAchievements() {
  const s = store.get().settings;
  const f = path.join(P.dolphin, 'User', 'Config', 'RetroAchievements.ini');
  const on = !!(s.ra.user && s.ra.token);
  fs.writeFileSync(
    f,
    `[Achievements]\nEnabled = ${on ? 'True' : 'False'}\nUsername = ${raSafe(s.ra.user)}\nApiToken = ${raSafe(s.ra.token)}\nHardcoreEnabled = False\n`,
  );
}

/* ---------- launch ---------- */
// opts.guests: also set up Players 2-4 for friends (see lib/coop.js).
function launch(id, resume, opts = {}) {
  if (current) return { error: 'A game is already running.' };
  const g = store.game(id);
  if (!g) return { error: 'Game not found.' };
  if (!fs.existsSync(g.file)) return { error: `The game file is missing: ${g.file}` };
  if (g.sys === 'switch') {
    const st = require('./setup').switchStatus();
    if (!st.installed)
      return {
        error:
          "Switch games need Ryubing, which isn't included with Dustoff. If you have it, choose its folder in Settings > Switch.",
      };
    if (!st.keys || !st.firmware)
      return {
        error: `Switch games need the ${!st.keys && !st.firmware ? 'keys and firmware' : !st.keys ? 'keys' : 'firmware'} from your own Switch. Drag your prod.keys file and firmware zip onto Dustoff, the same way you add games.`,
      };
  }
  if (g.sys === 'wiiu' && /\.(wux|wud)$/i.test(g.file) && !require('./setup').wiiuKeysPresent()) {
    return {
      error:
        'Wii U disc images (.wux, .wud) need the keys.txt from your own Wii U. Drag it onto Dustoff, or use a .wua copy of the game, which needs no keys.',
    };
  }
  const kind = kindOf(g.sys);
  let exe,
    args,
    cwd,
    raBinds = [];
  try {
    raBinds = controls.apply(g, store.get().settings);
  } catch (e) {
    log('controls not applied:', e.message);
  }
  let guests = false;
  if (opts.guests) {
    try {
      guests = controls.applyGuests(g, store.get().settings);
    } catch (e) {
      log('friend controls not applied:', e.message);
    }
  }
  if (kind === 'ra') {
    cwd = P.retroarch;
    exe = path.join(cwd, 'retroarch.exe');
    args = [
      '-L',
      path.join(cwd, 'cores', SYS[g.sys].core),
      g.file,
      '--appendconfig',
      writeRaAppend(resume && !!g.resume, raBinds),
    ];
  } else if (kind === 'dolphin') {
    cwd = P.dolphin;
    exe = path.join(cwd, 'Dolphin.exe');
    writeDolphinAchievements();
    args = ['-b', '-e', g.file];
    if (resume && g.discId && fs.existsSync(dolphinState(g))) args.push('--save_state=' + dolphinState(g));
  } else if (kind === 'cemu') {
    cwd = P.cemu;
    exe = path.join(cwd, 'Cemu.exe');
    args = ['-g', g.file, '-f'];
  } else {
    cwd = P.ryubing;
    exe = store.ryuExe() || path.join(cwd, 'Ryujinx.exe');
    args = [g.file, '--fullscreen'];
  }
  if (!fs.existsSync(exe)) return { error: `Emulator not found: ${exe}` };
  log('launch', g.sys, JSON.stringify(g.title), 'resume=' + !!resume, args.join(' '));
  const proc = spawn(exe, args, { cwd, windowsHide: false });
  current = { game: g, proc, kind, start: Date.now(), paused: false, overlayOpen: false, guests };
  proc.on('error', err => {
    finish();
    hooks.error && hooks.error(`Couldn't start ${SYS[g.sys].emu}: ${err.message}`);
  });
  proc.on('exit', finish);
  watchPad();
  hooks.started(g);
  return { ok: true };
}

function finish() {
  if (!current) return;
  const { game: g, start, guests } = current;
  const secs = Math.round((Date.now() - start) / 1000);
  log('exit', JSON.stringify(g.title), secs + 's');
  current = null;
  stopPad();
  if (guests) controls.restoreGuests();
  hooks.overlay(false);
  if (secs > 5) {
    g.playSeconds = (g.playSeconds || 0) + secs;
    g.sessions = [...(g.sessions || []), { at: start, secs }].slice(-300);
    g.lastPlayed = start;
  }
  refreshResume(g);
  log('continue available:', !!g.resume);
  store.save();
  hooks.ended(g, secs);
}

/* ---------- in-game menu actions ---------- */
const taskkill = (pid, force) =>
  new Promise(r => execFile('taskkill', ['/PID', String(pid), ...(force ? ['/F', '/T'] : [])], () => r()));

async function setPaused(on) {
  if (!current || current.paused === on) return;
  current.paused = on;
  if (current.kind === 'ra') ra('PAUSE_TOGGLE');
  else if (current.kind === 'dolphin') await native.tapKey(native.VK.F10);
}
async function action(name) {
  if (!current) return;
  log('menu action', name);
  const k = current.kind;
  if (name === 'save') {
    if (k === 'ra') ra('SAVE_STATE');
    else if (k === 'dolphin') await native.tapKey(native.VK.F6);
    return 'Saved';
  }
  if (name === 'load') {
    if (k === 'ra') ra('LOAD_STATE');
    else if (k === 'dolphin') await native.tapKey(native.VK.F8);
    return 'Loaded';
  }
  if (name === 'screenshot') {
    if (k === 'ra') ra('SCREENSHOT');
    else if (k === 'dolphin') await native.tapKey(native.VK.F9);
    return 'Screenshot saved';
  }
  if (name === 'quit') return quit();
}
async function quit() {
  if (!current) return;
  const c = current;
  await setPaused(false);
  if (c.kind === 'ra') {
    ra('QUIT'); // RetroArch writes the Continue state on a clean exit
  } else if (c.kind === 'dolphin') {
    if (c.game.discId) {
      await native.tapKey(native.VK.F5);
      await native.wait(1800);
    }
    await taskkill(c.proc.pid, false);
  } else {
    await taskkill(c.proc.pid, false);
  }
  setTimeout(() => {
    if (current === c) taskkill(c.proc.pid, true);
  }, 8000);
}

/* ---------- controller watch while a game has focus ---------- */
let padTimer = null,
  comboSince = 0,
  prev = 0,
  repeatAt = 0;
function watchPad() {
  stopPad();
  padTimer = setInterval(() => {
    if (!current) return;
    const p = native.readPad();
    const b = p ? p.buttons : 0;
    const B = native.BTN;
    const combo = b & B.BACK && b & B.START;
    if (combo) {
      if (!comboSince) comboSince = Date.now();
      else if (comboSince > 0 && Date.now() - comboSince > 700) {
        comboSince = -1;
        toggleOverlay();
      }
    } else comboSince = 0;
    if (current && current.overlayOpen && !combo) {
      const pressed = b & ~prev;
      const now = Date.now();
      const dir = b & (B.UP | B.DOWN);
      if (pressed & B.UP || (dir & B.UP && now > repeatAt)) {
        hooks.overlayNav('up');
        repeatAt = now + (pressed & B.UP ? 380 : 120);
      }
      if (pressed & B.DOWN || (dir & B.DOWN && now > repeatAt)) {
        hooks.overlayNav('down');
        repeatAt = now + (pressed & B.DOWN ? 380 : 120);
      }
      if (pressed & B.A) hooks.overlayNav('a');
      if (pressed & B.B) hooks.overlayNav('b');
    }
    prev = b;
  }, 16);
}
function stopPad() {
  clearInterval(padTimer);
  padTimer = null;
  comboSince = 0;
}
async function toggleOverlay(force) {
  if (!current) return;
  const open = typeof force === 'boolean' ? force : !current.overlayOpen;
  current.overlayOpen = open;
  log('menu', open ? 'open' : 'close');
  if (open) {
    await setPaused(true);
    hooks.overlay(true, current.game, current.kind);
  } else {
    hooks.overlay(false);
    await setPaused(false);
  }
}

module.exports = {
  launch,
  action,
  toggleOverlay,
  setHooks,
  refreshResume,
  kindOf,
  isRunning: () => !!current,
  current: () => current,
};
