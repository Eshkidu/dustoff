// Paths, system definitions, and the saved library (data/library.json).
const fs = require('fs');
const path = require('path');

// Dev: <root>/app/lib. Installed: <root>/resources/app/lib (next to "Dustoff.exe").
const APP_DIR = path.resolve(__dirname, '..');
const ROOT =
  path.basename(path.dirname(APP_DIR)).toLowerCase() === 'resources'
    ? path.resolve(APP_DIR, '..', '..')
    : path.resolve(APP_DIR, '..');
const P = {
  root: ROOT,
  data: path.join(ROOT, 'data'),
  art: path.join(ROOT, 'data', 'art'),
  cache: path.join(ROOT, 'data', 'cache'),
  games: path.join(ROOT, 'games'),
  emu: path.join(ROOT, 'emulators'),
  libraryFile: path.join(ROOT, 'data', 'library.json'),
};
P.retroarch = path.join(P.emu, 'retroarch');
P.dolphin = path.join(P.emu, 'dolphin');
P.ryubing = path.join(P.emu, 'ryubing');
// Ryubing (Switch) may be bundled, or installed by the user somewhere else (public build ships without it).
const RYU_EXES = ['Ryujinx.exe', 'Ryubing.exe'];
function ryuExe(dir = P.ryubing) {
  for (const n of RYU_EXES) {
    const f = path.join(dir, n);
    if (fs.existsSync(f)) return f;
  }
  return null;
}
function useRyubing(customDir) {
  const bundled = path.join(P.emu, 'ryubing');
  P.ryubing = ryuExe(bundled) ? bundled : customDir && ryuExe(customDir) ? customDir : bundled;
}
// Ryubing keeps its data in a "portable" folder next to the exe if there is one, otherwise in AppData.
function ryuData() {
  const portable = path.join(P.ryubing, 'portable');
  return fs.existsSync(portable) ? portable : path.join(process.env.APPDATA || '', 'Ryujinx');
}
P.cemu = path.join(P.emu, 'cemu');

const SYS = {
  nes: {
    name: 'NES',
    full: 'Nintendo Entertainment System',
    dir: 'NES',
    emu: 'RetroArch (Mesen)',
    core: 'mesen_libretro.dll',
  },
  snes: { name: 'SNES', full: 'Super Nintendo', dir: 'SNES', emu: 'RetroArch (Snes9x)', core: 'snes9x_libretro.dll' },
  gb: {
    name: 'Game Boy',
    full: 'Game Boy',
    dir: 'Game Boy',
    emu: 'RetroArch (Gambatte)',
    core: 'gambatte_libretro.dll',
  },
  gbc: {
    name: 'GBC',
    full: 'Game Boy Color',
    dir: 'Game Boy Color',
    emu: 'RetroArch (Gambatte)',
    core: 'gambatte_libretro.dll',
  },
  gba: {
    name: 'GBA',
    full: 'Game Boy Advance',
    dir: 'Game Boy Advance',
    emu: 'RetroArch (mGBA)',
    core: 'mgba_libretro.dll',
  },
  n64: {
    name: 'N64',
    full: 'Nintendo 64',
    dir: 'N64',
    emu: 'RetroArch (Mupen64Plus)',
    core: 'mupen64plus_next_libretro.dll',
  },
  gc: { name: 'GameCube', full: 'Nintendo GameCube', dir: 'GameCube', emu: 'Dolphin' },
  wii: { name: 'Wii', full: 'Nintendo Wii', dir: 'Wii', emu: 'Dolphin' },
  wiiu: { name: 'Wii U', full: 'Nintendo Wii U', dir: 'Wii U', emu: 'Cemu' },
  switch: { name: 'Switch', full: 'Nintendo Switch', dir: 'Switch', emu: 'Ryubing' },
};

for (const d of [P.data, P.art, P.cache, P.games, ...Object.values(SYS).map(s => path.join(P.games, s.dir))]) {
  fs.mkdirSync(d, { recursive: true });
}

const DEFAULT = {
  version: 1,
  games: [],
  settings: { startFullscreen: false, ra: { user: '', token: '', apiKey: '' }, controls: {} },
};
let db;
function load() {
  try {
    db = JSON.parse(fs.readFileSync(P.libraryFile, 'utf8'));
  } catch {
    db = structuredClone(DEFAULT);
  }
  db.settings = Object.assign(structuredClone(DEFAULT.settings), db.settings || {});
  db.settings.ra = Object.assign({ user: '', token: '', apiKey: '' }, db.settings.ra || {});
  db.settings.controls = db.settings.controls || {};
  useRyubing(db.settings.ryubingDir);
  db.games = db.games || [];
  db.ignored = db.ignored || []; // removed games' files, so the folder watcher doesn't add them back
  return db;
}
let saveTimer;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const tmp = P.libraryFile + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
    fs.renameSync(tmp, P.libraryFile);
  }, 150);
}
function get() {
  return db || load();
}
function game(id) {
  return get().games.find(g => g.id === id);
}
function newId() {
  return 'g' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

module.exports = { P, SYS, load, save, get, game, newId, ryuExe, useRyubing, ryuData };
