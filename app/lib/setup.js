// Keeps every emulator ready to play with no setup screens of its own, and installs
// console files (Switch keys + firmware, Wii U keys) that the user drops onto the hub.
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const os = require('os');
const { execFile } = require('child_process');
const { P, ryuExe, ryuData } = require('./store');
const { setIniValue } = require('./controls');

const UA = 'GameLauncherHub/0.1.0 (Windows)';
const LOG = path.join(P.cache, 'hub.log');
const log = (...a) => {
  try {
    fs.appendFileSync(LOG, `[${new Date().toISOString()}] setup: ${a.join(' ')}\n`);
  } catch {}
};
const fwd = p => p.replace(/\\/g, '/');
const xmlEsc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/* ---------- Cemu (Wii U) ---------- */
const cemuPortable = () => path.join(P.cemu, 'portable');
function cemuSettings() {
  const dir = cemuPortable();
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'settings.xml');
  const games = xmlEsc(fwd(path.join(P.games, 'Wii U')));
  if (!fs.existsSync(file)) {
    // NVIDIA cards hit "device lost" freezes in Cemu's Vulkan mode (seen in Super Mario 3D World),
    // so they get OpenGL. Other cards (AMD, Intel) run better on Vulkan.
    let api = 1;
    try {
      const gpus = require('child_process').execFileSync(
        'powershell.exe',
        ['-NoProfile', '-Command', '(Get-CimInstance Win32_VideoController).Name'],
        { encoding: 'utf8', timeout: 8000 },
      );
      if (/nvidia/i.test(gpus)) api = 0;
    } catch {}
    // Cemu shows its first-time wizard only when settings.xml is missing.
    fs.writeFileSync(
      file,
      `<?xml version="1.0" encoding="UTF-8"?>
<content>
    <mlc_path></mlc_path>
    <permanent_storage>true</permanent_storage>
    <use_discord_presence>false</use_discord_presence>
    <check_update>false</check_update>
    <vk_warning>true</vk_warning>
    <gp_download>true</gp_download>
    <fullscreen>true</fullscreen>
    <disable_screensaver>true</disable_screensaver>
    <play_boot_sound>false</play_boot_sound>
    <console_language>1</console_language>
    <GamePaths>
        <Entry>${games}</Entry>
    </GamePaths>
    <Graphic>
        <api>${api}</api>
        <VSync>1</VSync>
        <AsyncCompile>true</AsyncCompile>
    </Graphic>
</content>
`,
    );
    log('wrote Cemu settings.xml');
    return;
  }
  let x = fs.readFileSync(file, 'utf8'),
    before = x;
  const setTag = (tag, val) => {
    const re = new RegExp(`<${tag}>[^<]*</${tag}>|<${tag}/>`);
    x = re.test(x)
      ? x.replace(re, `<${tag}>${val}</${tag}>`)
      : x.replace('<content>', `<content>\n    <${tag}>${val}</${tag}>`);
  };
  setTag('check_update', 'false');
  setTag('gp_download', 'true');
  setTag('vk_warning', 'true');
  if (!x.includes(`<Entry>${games}</Entry>`)) {
    const block = `<GamePaths>\n        <Entry>${games}</Entry>\n    </GamePaths>`;
    x = /<GamePaths\/>|<GamePaths>[\s\S]*?<\/GamePaths>/.test(x)
      ? x.replace(/<GamePaths\/>|<GamePaths>[\s\S]*?<\/GamePaths>/, block)
      : x.replace('<content>', `<content>\n    ${block}`);
  }
  if (x !== before) {
    fs.writeFileSync(file, x);
    log('updated Cemu settings.xml');
  }
}

// Community graphic packs (fixes and upgrades). Cemu reads them from graphicPacks/downloadedGraphicPacks.
let packsRunning = false;
async function cemuGraphicPacks() {
  const dest = path.join(cemuPortable(), 'graphicPacks', 'downloadedGraphicPacks');
  if (packsRunning || fs.existsSync(path.join(dest, 'version.txt'))) return;
  packsRunning = true;
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hub-gp-'));
  try {
    const rel = await (
      await fetch('https://api.github.com/repos/cemu-project/cemu_graphic_packs/releases/latest', {
        headers: { 'User-Agent': UA },
      })
    ).json();
    const asset = (rel.assets || []).find(a => /\.zip$/i.test(a.name));
    if (!asset) throw new Error('no zip in release');
    const r = await fetch(asset.browser_download_url, { headers: { 'User-Agent': UA } });
    if (!r.ok) throw new Error('download ' + r.status);
    const zip = path.join(tmp, 'packs.zip');
    await fsp.writeFile(zip, Buffer.from(await r.arrayBuffer()));
    fs.mkdirSync(dest, { recursive: true });
    await new Promise((res, rej) =>
      execFile('C:\\Windows\\System32\\tar.exe', ['-xf', zip, '-C', dest], e => (e ? rej(e) : res())),
    );
    fs.writeFileSync(path.join(dest, 'version.txt'), rel.tag_name || 'unknown');
    log('installed Cemu graphic packs', rel.tag_name);
  } catch (e) {
    log('graphic packs not installed:', e.message);
  } finally {
    packsRunning = false;
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

/* ---------- Dolphin (GameCube / Wii) ---------- */
function dolphinSettings() {
  const ini = path.join(P.dolphin, 'User', 'Config', 'Dolphin.ini');
  fs.mkdirSync(path.dirname(ini), { recursive: true });
  if (!fs.existsSync(path.join(P.dolphin, 'portable.txt'))) fs.writeFileSync(path.join(P.dolphin, 'portable.txt'), '');
  const want = [
    ['General', 'ISOPath0', path.join(P.games, 'GameCube')],
    ['General', 'ISOPath1', path.join(P.games, 'Wii')],
    ['General', 'ISOPaths', '2'],
    ['Analytics', 'PermissionAsked', 'True'],
    ['Analytics', 'Enabled', 'False'],
    ['Interface', 'ConfirmStop', 'False'],
    ['Interface', 'PauseOnFocusLost', 'False'],
    ['AutoUpdate', 'UpdateTrack', ''],
    ['Display', 'Fullscreen', 'True'],
  ];
  let text = '';
  try {
    text = fs.readFileSync(ini, 'utf8');
  } catch {}
  for (const [sec, key, val] of want) {
    const cur = sectionValue(text, sec, key);
    if (cur !== val) {
      setIniValue(ini, sec, key, val);
      text = fs.readFileSync(ini, 'utf8');
    }
  }
  const gfx = path.join(P.dolphin, 'User', 'Config', 'GFX.ini');
  let g = '';
  try {
    g = fs.readFileSync(gfx, 'utf8');
  } catch {}
  if (sectionValue(g, 'Settings', 'BorderlessFullscreen') !== 'True')
    setIniValue(gfx, 'Settings', 'BorderlessFullscreen', 'True');
}
function sectionValue(text, sec, key) {
  let cur = null;
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*\[(.+)\]\s*$/);
    if (m) {
      cur = m[1];
      continue;
    }
    if (cur === sec) {
      const i = line.indexOf('=');
      if (i > 0 && line.slice(0, i).trim() === key) return line.slice(i + 1).trim();
    }
  }
  return null;
}

/* ---------- Ryubing (Switch) ---------- */
const ryuPortable = () => ryuData();
// Player 1 on the first Xbox controller (SDL3 uses this ID for any XInput pad).
const RYU_PAD = {
  left_joycon_stick: {
    joystick: 'Left',
    invert_stick_x: false,
    invert_stick_y: false,
    rotate90_cw: false,
    stick_button: 'LeftStick',
  },
  right_joycon_stick: {
    joystick: 'Right',
    invert_stick_x: false,
    invert_stick_y: false,
    rotate90_cw: false,
    stick_button: 'RightStick',
  },
  deadzone_left: 0.1,
  deadzone_right: 0.1,
  range_left: 1,
  range_right: 1,
  trigger_threshold: 0.5,
  motion: { motion_backend: 'GamepadDriver', sensitivity: 100, gyro_deadzone: 1, enable_motion: true },
  rumble: { strong_rumble: 1, weak_rumble: 1, enable_rumble: true },
  led: { enable_led: false, turn_off_led: false, use_rainbow: false, led_color: 0 },
  left_joycon: {
    button_minus: 'Back',
    button_l: 'LeftShoulder',
    button_zl: 'LeftTrigger',
    button_sl: 'SingleLeftTrigger0',
    button_sr: 'SingleRightTrigger0',
    dpad_up: 'DpadUp',
    dpad_down: 'DpadDown',
    dpad_left: 'DpadLeft',
    dpad_right: 'DpadRight',
  },
  right_joycon: {
    button_plus: 'Start',
    button_r: 'RightShoulder',
    button_zr: 'RightTrigger',
    button_sl: 'SingleLeftTrigger1',
    button_sr: 'SingleRightTrigger1',
    button_x: 'X',
    button_b: 'B',
    button_y: 'Y',
    button_a: 'A',
  },
  version: 1,
  backend: 'GamepadSDL3',
  id: '0-00000003-045e-0000-ff02-000000007801',
  name: 'Xbox Controller (0)',
  controller_type: 'ProController',
  player_index: 'Player1',
};
function ryubingSettings() {
  const file = path.join(ryuPortable(), 'Config.json');
  let cfg;
  try {
    cfg = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
  } catch {
    return;
  } // Ryubing writes a full file on first start
  const before = JSON.stringify(cfg);
  const ours = path.join(P.games, 'Switch');
  cfg.game_dirs = Array.isArray(cfg.game_dirs) ? cfg.game_dirs : [];
  if (!cfg.game_dirs.some(d => path.resolve(d).toLowerCase() === ours.toLowerCase())) cfg.game_dirs.push(ours);
  cfg.check_updates_on_start = false;
  cfg.update_checker_type = 'Off';
  cfg.show_confirm_exit = false;
  cfg.start_fullscreen = true;
  cfg.input_config = cfg.input_config || [];
  if (!cfg.input_config.some(p => p.player_index === 'Player1'))
    cfg.input_config.push(JSON.parse(JSON.stringify(RYU_PAD)));
  if (JSON.stringify(cfg) !== before) {
    fs.writeFileSync(file, JSON.stringify(cfg, null, 2));
    log('updated Ryubing Config.json');
  }
}
function switchStatus() {
  const base = ryuPortable();
  const keys = fs.existsSync(path.join(base, 'system', 'prod.keys'));
  let fw = 0;
  try {
    fw = fs.readdirSync(path.join(base, 'bis', 'system', 'Contents', 'registered')).length;
  } catch {}
  return { installed: !!ryuExe(), keys, firmware: fw > 20 };
}
function wiiuKeysPresent() {
  return [path.join(cemuPortable(), 'keys.txt'), path.join(P.cemu, 'keys.txt')].some(f => {
    try {
      return fs.statSync(f).size > 30;
    } catch {
      return false;
    }
  });
}

/* ---------- console files dropped on the hub ---------- */
// Splits dropped files into console files (installed here) and everything else (treated as games).
async function takeSystemFiles(files) {
  const rest = [],
    done = [];
  const ncas = files.filter(f => /\.nca$/i.test(f));
  const lower = f => path.basename(f).toLowerCase();
  for (const f of files) {
    const n = lower(f);
    if (/\.nca$/i.test(f)) continue;
    if (n === 'title.keys') {
      await copyTo(f, path.join(ryuPortable(), 'system', 'title.keys'));
      done.push('Installed Switch title keys.');
      continue;
    }
    if (/\.keys$/.test(n) && (await looksLikeProdKeys(f))) {
      await copyTo(f, path.join(ryuPortable(), 'system', 'prod.keys'));
      done.push('Installed your Switch keys.');
      continue;
    }
    if (n.endsWith('.txt') && (await looksLikeWiiuKeys(f))) {
      await copyTo(f, path.join(cemuPortable(), 'keys.txt'));
      done.push('Installed your Wii U keys.');
      continue;
    }
    rest.push(f);
  }
  if (ncas.length >= 20) {
    const n = await installFirmware(ncas);
    done.push(`Installed Switch firmware (${n} files).`);
  } else if (ncas.length)
    done.push(
      `Skipped ${ncas.length} .nca file${ncas.length === 1 ? '' : 's'}. Drop the whole firmware zip or folder instead.`,
    );
  return { rest, done };
}
async function copyTo(src, dest) {
  await fsp.mkdir(path.dirname(dest), { recursive: true });
  await fsp.copyFile(src, dest);
  log('installed', path.basename(src), '->', dest);
}
async function head(f, n = 4096) {
  const fh = await fsp.open(f, 'r');
  try {
    const b = Buffer.alloc(n);
    const { bytesRead } = await fh.read(b, 0, n, 0);
    return b.subarray(0, bytesRead).toString('latin1');
  } finally {
    await fh.close();
  }
}
async function looksLikeProdKeys(f) {
  return /^\s*(header_key|master_key_[0-9a-f]{2}|key_area_key_)\w*\s*=\s*[0-9a-f]{32,}/im.test(await head(f, 65536));
}
async function looksLikeWiiuKeys(f) {
  const lines = (await head(f))
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(l => l && !l.startsWith('#'));
  return lines.length > 0 && lines.every(l => /^[0-9a-f]{32}\b/i.test(l));
}
// Same layout Ryubing uses: bis/system/Contents/registered/<id>.nca/00
async function installFirmware(ncas) {
  const reg = path.join(ryuPortable(), 'bis', 'system', 'Contents', 'registered');
  await fsp.rm(reg, { recursive: true, force: true });
  await fsp.mkdir(reg, { recursive: true });
  for (const f of ncas) {
    const id = path.basename(f).replace(/(\.cnmt)?\.nca$/i, '');
    const dir = path.join(reg, id + '.nca');
    await fsp.mkdir(dir, { recursive: true });
    await fsp.copyFile(f, path.join(dir, '00'));
  }
  log('installed Switch firmware,', ncas.length, 'files');
  return ncas.length;
}

/* ---------- entry ---------- */
function ensureAll() {
  const steps = [
    ['Cemu', cemuSettings],
    ['Dolphin', dolphinSettings],
  ];
  if (ryuExe()) steps.push(['Ryubing', ryubingSettings]);
  for (const [name, fn] of steps) {
    try {
      fn();
    } catch (e) {
      log(name, 'setup failed:', e.message);
    }
  }
  cemuGraphicPacks();
}

module.exports = { ensureAll, cemuGraphicPacks, takeSystemFiles, switchStatus, wiiuKeysPresent };
