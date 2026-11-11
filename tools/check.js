// Dustoff test suite. Run: node tools\check.js          (quick: code + logic + app self-test)
//                          node tools\check.js --full   (also builds the public installer, installs it to a
//                                                         temp folder and self-tests the installed copy)
// Exits with code 1 if anything fails. Never touches your library, games or saves.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const APP = path.join(ROOT, 'app');
const FULL = process.argv.includes('--full');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'dustoff-check-'));
let pass = 0,
  fail = 0;
const results = [];
function ok(name) {
  pass++;
  results.push(['PASS', name]);
  console.log('  PASS  ' + name);
}
function bad(name, why) {
  fail++;
  results.push(['FAIL', name, why]);
  console.log('  FAIL  ' + name + '  ->  ' + why);
}
async function test(name, fn) {
  try {
    const r = await fn();
    if (r === false) bad(name, 'returned false');
    else ok(name);
  } catch (e) {
    bad(name, e.message);
  }
}
const eq = (a, b, what) => {
  if (a !== b) throw new Error(`${what}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
};
const section = t => console.log('\n' + t);

(async () => {
  console.log('Dustoff checks' + (FULL ? ' (full)' : ''));

  section('1. Code');
  const jsFiles = [];
  (function walk(d) {
    for (const n of fs.readdirSync(d)) {
      const p = path.join(d, n);
      if (n === 'node_modules' || n.startsWith('.')) continue;
      const st = fs.statSync(p);
      if (st.isDirectory()) walk(p);
      else if (n.endsWith('.js')) jsFiles.push(p);
    }
  })(APP);
  jsFiles.push(
    ...fs
      .readdirSync(__dirname)
      .filter(n => n.endsWith('.js'))
      .map(n => path.join(__dirname, n)),
  );
  await test(`all ${jsFiles.length} JavaScript files parse`, () => {
    for (const f of jsFiles) {
      const r = spawnSync(process.execPath, ['--check', f], {
        encoding: 'utf8',
      });
      if (r.status) throw new Error(path.relative(ROOT, f) + ': ' + r.stderr.split('\n')[0]);
    }
  });
  await test('Electron is a supported version (43 or newer)', () => {
    const v = require(path.join(APP, 'node_modules', 'electron', 'package.json')).version;
    if (parseInt(v) < 43) throw new Error('Electron ' + v + ' no longer gets security fixes');
  });
  await test('security settings: context isolation on, node integration off, https-only external links', () => {
    const m = fs.readFileSync(path.join(APP, 'main.js'), 'utf8');
    if (/nodeIntegration:\s*true/.test(m)) throw new Error('nodeIntegration is on');
    if ((m.match(/contextIsolation: true/g) || []).length < 2) throw new Error('contextIsolation missing on a window');
    if (!/will-navigate/.test(m)) throw new Error('navigation guard missing');
    if (!/\^https:/.test(m)) throw new Error('external links not limited to https');
  });

  // Point the app's folders at a throwaway copy so nothing real is touched.
  const store = require(path.join(APP, 'lib', 'store'));
  const P = store.P;
  P.cache = path.join(TMP, 'cache');
  fs.mkdirSync(P.cache, { recursive: true });
  P.art = path.join(TMP, 'art');
  fs.mkdirSync(P.art, { recursive: true });
  P.dolphin = path.join(TMP, 'dolphin');
  P.cemu = path.join(TMP, 'cemu');
  P.ryubing = path.join(TMP, 'ryubing');
  fs.mkdirSync(path.join(P.dolphin, 'User', 'Config'), { recursive: true });
  fs.mkdirSync(path.join(P.ryubing, 'portable'), { recursive: true });
  fs.writeFileSync(path.join(P.ryubing, 'Ryujinx.exe'), '');
  fs.writeFileSync(
    path.join(P.ryubing, 'portable', 'Config.json'),
    JSON.stringify({ game_dirs: [], input_config: [] }),
  );
  fs.mkdirSync(path.join(P.cemu, 'portable', 'graphicPacks', 'downloadedGraphicPacks'), { recursive: true });
  fs.writeFileSync(path.join(P.cemu, 'portable', 'graphicPacks', 'downloadedGraphicPacks', 'version.txt'), 'test'); // skip the real download
  const id = require(path.join(APP, 'lib', 'identify'));
  const controls = require(path.join(APP, 'lib', 'controls'));
  const setup = require(path.join(APP, 'lib', 'setup'));

  section('2. Recognizing games');
  const G = path.join(TMP, 'games');
  fs.mkdirSync(G);
  const w = (n, b) => {
    const f = path.join(G, n);
    fs.writeFileSync(f, b);
    return f;
  };
  await test('Game Boy file goes to Game Boy', async () =>
    eq((await id.inspect(w('a.gb', Buffer.alloc(0x8000)))).sys, 'gb', 'system'));
  await test('Color-only .gb file goes to Game Boy Color', async () => {
    const b = Buffer.alloc(0x8000);
    b[0x143] = 0xc0;
    eq((await id.inspect(w('b.gb', b))).sys, 'gbc', 'system');
  });
  await test('GBA file goes to GBA', async () =>
    eq((await id.inspect(w('c.gba', Buffer.alloc(0x8000)))).sys, 'gba', 'system'));
  await test('NES header is skipped when hashing', async () => {
    const b = Buffer.alloc(16 + 0x8000);
    b.write('NES\x1a', 0, 'latin1');
    const a = await id.inspect(w('d.nes', b));
    const c = await id.inspect(w('e.nes', Buffer.alloc(0x8000)));
    eq(a.crc, c.crc, 'crc');
  });
  await test('Wii U .wud disc is read', async () => {
    const b = Buffer.alloc(0x1000);
    b.write('WUP-P-AMKE-0', 0, 'latin1');
    const i = await id.inspect(w('f.wud', b));
    eq(i.sys, 'wiiu', 'system');
  });
  await test('Wii U .wux disc is read', async () => {
    const ss = 0x8000,
      b = Buffer.alloc(ss * 2);
    b.write('WUX0', 0, 'latin1');
    b.writeUInt32LE(0x1099d02e, 4);
    b.writeUInt32LE(ss, 8);
    b.writeBigUInt64LE(BigInt(ss), 16);
    b.write('WUP-P-AMKE-0', ss, 'latin1');
    eq((await id.inspect(w('g.wux', b))).sys, 'wiiu', 'system');
  });
  await test('unknown file type is skipped', async () =>
    eq(await id.inspect(w('h.txt', Buffer.from('hi'))), null, 'result'));
  await test('GameCube/Wii disc header is read', async () => {
    const b = Buffer.alloc(0x8100);
    b.write('GALE01', 0, 'latin1');
    b.writeUInt32BE(0xc2339f3d, 0x1c);
    b.write('Test Game', 0x20, 'latin1');
    const i = await id.inspect(w('i.iso', b));
    eq(i.sys, 'gc', 'system');
    eq(i.discId, 'GALE01', 'disc ID');
  });

  section('3. Controls');
  const settings = { controls: {} };
  await test('NES/SNES/N64/GB/GBC/GBA write RetroArch binds (autodetect off)', () => {
    for (const sys of ['nes', 'snes', 'n64', 'gb', 'gbc', 'gba']) {
      const l = controls.apply({ sys }, settings);
      if (!l.includes('input_autodetect_enable = "false"') || l.length < 40)
        throw new Error(sys + ' wrote ' + l.length + ' lines');
    }
  });
  await test('a remapped N64 button lands on the right RetroArch bind', () => {
    const l = controls.apply({ sys: 'n64' }, { controls: { n64: { mode: 'std', map: { std: { a: 'rt' } } } } });
    if (!l.includes('input_player1_b_axis = "+5"')) throw new Error('N64 A -> RT missing');
  });
  await test('GameCube writes Dolphin pad config', () => {
    controls.apply({ sys: 'gc' }, settings);
    const t = fs.readFileSync(path.join(P.dolphin, 'User', 'Config', 'GCPadNew.ini'), 'utf8');
    if (!/Buttons\/A = `Button A`/.test(t)) throw new Error('A not mapped');
  });
  await test('every Wii controller type writes a Wii Remote config', () => {
    for (const mode of ['side', 'nun', 'cls', 'gc']) {
      controls.apply({ sys: 'wii', controls: { mode, map: {} } }, settings);
      const t = fs.readFileSync(path.join(P.dolphin, 'User', 'Config', 'WiimoteNew.ini'), 'utf8');
      if (!/\[Wiimote1\]/.test(t)) throw new Error(mode);
    }
  });
  await test('Wii U writes a valid Cemu controller file', () => {
    controls.apply({ sys: 'wiiu' }, settings);
    const x = fs.readFileSync(path.join(P.cemu, 'portable', 'controllerProfiles', 'controller0.xml'), 'utf8');
    if ((x.match(/<entry>/g) || []).length < 15 || !/<\/emulated_controller>/.test(x))
      throw new Error('incomplete XML');
  });
  await test('Switch controls fail clearly when no controller is set up', () => {
    try {
      controls.apply({ sys: 'switch' }, settings);
      throw new Error('no error');
    } catch (e) {
      if (!/no-controller/.test(e.message)) throw e;
    }
  });

  section('4. Setup and console files');
  await test('first start writes Cemu settings (no setup wizard)', () => {
    setup.ensureAll();
    if (!fs.existsSync(path.join(P.cemu, 'portable', 'settings.xml'))) throw new Error('missing');
  });
  await test('first start adds the Xbox controller for Switch', () => {
    const c = JSON.parse(fs.readFileSync(path.join(P.ryubing, 'portable', 'Config.json'), 'utf8'));
    eq(c.input_config.length, 1, 'controllers');
  });
  await test('Switch controls apply once a controller exists', () => controls.apply({ sys: 'switch' }, settings));
  await test('dropped prod.keys, keys.txt and firmware are installed; other files are left alone', async () => {
    const d = path.join(TMP, 'drop');
    fs.mkdirSync(path.join(d, 'fw'), { recursive: true });
    fs.writeFileSync(path.join(d, 'prod.keys'), 'header_key = ' + '0'.repeat(64) + '\n');
    fs.writeFileSync(path.join(d, 'keys.txt'), 'D7B00402659BA2ABD2CB0DB27FA2B656 # key\n');
    fs.writeFileSync(path.join(d, 'notes.txt'), 'hello');
    for (let i = 0; i < 25; i++) fs.writeFileSync(path.join(d, 'fw', i.toString(16).padStart(32, '0') + '.nca'), 'x');
    const r = await setup.takeSystemFiles(await id.walk(d));
    eq(r.rest.length, 1, 'files left for games');
    eq(r.done.length, 3, 'things installed');
    const st = setup.switchStatus();
    if (!st.keys || !st.firmware) throw new Error('status not updated');
  });
  await test('a fake keys file is NOT treated as Switch keys', async () => {
    const f = path.join(TMP, 'x.keys');
    fs.writeFileSync(f, 'not keys');
    eq((await setup.takeSystemFiles([f])).rest.length, 1, 'left alone');
  });

  section('5. The app itself (hidden self-test of every screen and theme)');
  const runSelftest = (exe, args, cache) => {
    const out = path.join(cache, 'selftest.json');
    try {
      fs.rmSync(out);
    } catch {}
    spawnSync(exe, args, {
      env: Object.assign({}, process.env, { DUSTOFF_SELFTEST: '1' }),
      timeout: 90000,
      stdio: 'ignore',
    });
    if (!fs.existsSync(out)) throw new Error('no result file (app crashed or never started)');
    const r = JSON.parse(fs.readFileSync(out, 'utf8'));
    if (!r.ok) throw new Error(r.errors.slice(0, 3).join(' | '));
    return r;
  };
  await test('every screen in every theme renders without errors (your copy)', () => {
    const r = runSelftest(
      path.join(APP, 'node_modules', 'electron', 'dist', 'electron.exe'),
      [APP],
      path.join(ROOT, 'data', 'cache'),
    );
    console.log(`        ${r.steps} screens checked, ${r.games} games, Electron ${r.electron}`);
  });

  if (FULL) {
    section('6. Public installer');
    await test('public installer builds (includes the personal-file scan)', () => {
      execFileSync(process.execPath, [path.join(__dirname, 'build-installer.js'), '--public'], { stdio: 'inherit' });
    });
    const parent = path.join(TMP, 'install');
    await test('installer unpacks cleanly', () => {
      const work = path.join(ROOT, 'dist', 'build-public');
      execFileSync(
        'powershell.exe',
        [
          '-NoProfile',
          '-ExecutionPolicy',
          'Bypass',
          '-File',
          path.join(work, 'install.ps1'),
          '-Parent',
          parent,
          '-NoShortcuts',
          '-NoLaunch',
        ],
        { cwd: work, stdio: 'ignore', env: Object.assign({}, process.env) },
      );
      if (!fs.existsSync(path.join(parent, 'Dustoff', 'Dustoff.exe')))
        throw new Error('Dustoff.exe missing after install');
    });
    await test('public build has no Switch emulator', () => {
      if (fs.existsSync(path.join(parent, 'Dustoff', 'emulators', 'ryubing')))
        throw new Error('ryubing folder is in the public build');
    });
    await test('installed copy starts and passes its self-test (fresh, empty library)', () => {
      const r = runSelftest(
        path.join(parent, 'Dustoff', 'Dustoff.exe'),
        [],
        path.join(parent, 'Dustoff', 'data', 'cache'),
      );
      console.log(`        ${r.steps} screens checked on a fresh install`);
    });
  }

  try {
    fs.rmSync(TMP, { recursive: true, force: true });
  } catch {}
  console.log(`\n${pass} passed, ${fail} failed`);
  fs.writeFileSync(
    path.join(ROOT, 'dist', 'last-check.json'),
    JSON.stringify({ at: new Date().toISOString(), full: FULL, pass, fail, results }, null, 2),
  );
  process.exit(fail ? 1 : 0);
})();
