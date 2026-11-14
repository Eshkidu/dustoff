// Builds dist\DustoffSetup.exe: a clean copy of the hub + emulators (no personal data,
// no keys, no saves), zipped and wrapped in a Windows IExpress installer.
// Run: node tools\build-installer.js            (full, for friends: includes Ryubing for Switch)
//      node tools\build-installer.js --public   (public: no Switch emulator)
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const APP = path.join(ROOT, 'app');
const EMU = path.join(ROOT, 'emulators');
const DIST = path.join(ROOT, 'dist');
const PUBLIC = process.argv.includes('--public');
const STAGE = path.join(DIST, PUBLIC ? 'stage-public' : 'stage', 'Dustoff');
const VERSION = require(path.join(APP, 'package.json')).version;

const rm = p => fs.rmSync(p, { recursive: true, force: true });
const mk = p => fs.mkdirSync(p, { recursive: true });
// Copy a tree; skip(rel) returns true for paths to leave out (rel uses forward slashes).
function copy(src, dest, skip = () => false, rel = '') {
  const st = fs.statSync(src);
  if (st.isDirectory()) {
    mk(dest);
    for (const n of fs.readdirSync(src)) {
      const r = rel ? rel + '/' + n : n;
      if (skip(r)) continue;
      copy(path.join(src, n), path.join(dest, n), skip, r);
    }
  } else {
    mk(path.dirname(dest));
    fs.copyFileSync(src, dest);
  }
}
const step = m => console.log('> ' + m);

rm(path.dirname(STAGE));
mk(STAGE);

step('Electron runtime');
copy(path.join(APP, 'node_modules', 'electron', 'dist'), STAGE, r => r === 'resources/default_app.asar');
fs.renameSync(path.join(STAGE, 'electron.exe'), path.join(STAGE, 'Dustoff.exe'));

step('Hub app');
const appOut = path.join(STAGE, 'resources', 'app');
for (const f of ['main.js', 'preload.js', 'package.json']) copy(path.join(APP, f), path.join(appOut, f));
for (const d of ['lib', 'renderer', 'overlay', 'icon', 'coop'])
  copy(path.join(APP, d), path.join(appOut, d), r => /\.bak$|\.bak-/.test(r));
copy(
  path.join(APP, 'node_modules', 'koffi'),
  path.join(appOut, 'node_modules', 'koffi'),
  r => /^build\/koffi\/(?!win32_x64)/.test(r) || /^(src|doc|vendor)\b/.test(r),
);

step('RetroArch');
const KEEP_CORES = ['mesen', 'snes9x', 'mupen64plus_next', 'gambatte', 'mgba'];
copy(
  path.join(EMU, 'retroarch'),
  path.join(STAGE, 'emulators', 'retroarch'),
  r =>
    /^(database|shaders|overlays|saves|states|screenshots|system|logs|playlists|thumbnails|recordings|downloads|cheats)(\/|$)/.test(
      r,
    ) ||
    (/^cores\/.+\.dll$/.test(r) && !KEEP_CORES.some(c => r === `cores/${c}_libretro.dll`)) ||
    /^retroarch\.default\.cfg$/.test(r) ||
    /^content_.*\.lpl$/.test(r),
);
for (const d of ['saves', 'states', 'screenshots', 'system']) mk(path.join(STAGE, 'emulators', 'retroarch', d));

step('Dolphin');
copy(path.join(EMU, 'dolphin'), path.join(STAGE, 'emulators', 'dolphin'), r => /^User\/(?!Config(\/|$))/.test(r));
const dcfg = path.join(STAGE, 'emulators', 'dolphin', 'User', 'Config');
fs.writeFileSync(path.join(dcfg, 'RetroAchievements.ini'), '[Achievements]\nEnabled = False\n');
const dini = path.join(dcfg, 'Dolphin.ini');
fs.writeFileSync(
  dini,
  fs
    .readFileSync(dini, 'utf8')
    .replace(/^ID = .*$/m, 'ID = ')
    .replace(/^WirelessMac = .*$/m, 'WirelessMac = ')
    .replace(/^ISOPath\d+ = .*$/gm, l => l.replace(/= .*/, '= ')),
);
for (const f of ['TimePlayed.ini', 'btdinf.bak']) rm(path.join(dcfg, f));

step('Cemu');
copy(
  path.join(EMU, 'cemu'),
  path.join(STAGE, 'emulators', 'cemu'),
  r => /^portable\/(?!graphicPacks(\/|$))/.test(r) || r === 'keys.txt' || r === 'log.txt',
);
mk(path.join(STAGE, 'emulators', 'cemu', 'portable')); // settings.xml is written by the hub on first start

if (!PUBLIC) {
  step('Ryubing');
  copy(path.join(EMU, 'ryubing'), path.join(STAGE, 'emulators', 'ryubing'), r => /^portable\//.test(r));
  const rcfg = JSON.parse(
    fs.readFileSync(path.join(EMU, 'ryubing', 'portable', 'Config.json'), 'utf8').replace(/^\uFEFF/, ''),
  );
  rcfg.game_dirs = [];
  rcfg.autoload_dirs = [];
  rcfg.input_config = []; // the hub adds the Xbox controller on first start
  for (const k of Object.keys(rcfg)) if (/recent|last_|history/i.test(k)) delete rcfg[k];
  mk(path.join(STAGE, 'emulators', 'ryubing', 'portable'));
  fs.writeFileSync(path.join(STAGE, 'emulators', 'ryubing', 'portable', 'Config.json'), JSON.stringify(rcfg, null, 2));
} else step('Skipping Ryubing (public build)');

step('Folders + uninstaller');
for (const d of ['data', 'games']) mk(path.join(STAGE, d));
fs.copyFileSync(path.join(__dirname, 'installer', 'uninstall.ps1'), path.join(STAGE, 'uninstall.ps1'));
fs.writeFileSync(path.join(STAGE, 'version.txt'), VERSION);
fs.copyFileSync(
  path.join(__dirname, 'installer', 'THIRD-PARTY-NOTICES.txt'),
  path.join(STAGE, 'THIRD-PARTY-NOTICES.txt'),
);

// Never ship personal files, whatever happened above.
const BAD = /(^|\/)(prod\.keys|title\.keys|keys\.txt|library\.json|Profiles\.json)$/i;
// ...and no text file may mention this PC's user name or home folder (paths, logins, history).
const WHO = require('os').userInfo().username.toLowerCase();
const TEXT = /\.(cfg|ini|json|xml|txt|lpl|opt|rmp|log|html|css|js|md|ps1|cmd)$/i;
(function scan(d, rel = '') {
  for (const n of fs.readdirSync(d)) {
    const p = path.join(d, n),
      r = rel + '/' + n;
    if (fs.statSync(p).isDirectory()) {
      scan(p, r);
      continue;
    }
    if (BAD.test(r)) throw new Error('Personal file in build: ' + r);
    if (
      TEXT.test(n) &&
      fs.statSync(p).size < 8 << 20 &&
      !r.startsWith('/resources/app/node_modules') &&
      !r.startsWith('/LICENSES')
    ) {
      const t = fs.readFileSync(p, 'latin1').toLowerCase();
      if (
        WHO.length > 2 &&
        (t.includes('\\users\\' + WHO) ||
          t.includes('\\\\users\\\\' + WHO) ||
          t.includes('/users/' + WHO) ||
          t.includes(WHO + '@'))
      )
        throw new Error('Personal info (your user name or home folder) in build file: ' + r);
    }
  }
})(STAGE);
step('Personal-info scan passed');

step('Zip');
const work = path.join(DIST, PUBLIC ? 'build-public' : 'build');
rm(work);
mk(work);
const zip = path.join(work, 'payload.zip');
// .NET's zip writer (Windows tar crashes on archives this size).
execFileSync(
  'powershell.exe',
  [
    '-NoProfile',
    '-Command',
    `Add-Type -AssemblyName System.IO.Compression.FileSystem; [IO.Compression.ZipFile]::CreateFromDirectory('${STAGE.replace(/'/g, "''")}', '${zip.replace(/'/g, "''")}', [IO.Compression.CompressionLevel]::Optimal, $true)`,
  ],
  { stdio: 'inherit' },
);
fs.copyFileSync(path.join(__dirname, 'installer', 'install.ps1'), path.join(work, 'install.ps1'));
fs.copyFileSync(path.join(__dirname, 'installer', 'install.cmd'), path.join(work, 'install.cmd'));

step('Installer exe');
const out = path.join(DIST, PUBLIC ? 'DustoffSetup-Public.exe' : 'DustoffSetup.exe');
rm(out);
const sed = `[Version]
Class=IEXPRESS
SEDVersion=3
[Options]
PackagePurpose=InstallApp
ShowInstallProgramWindow=1
HideExtractAnimation=0
UseLongFileName=1
InsideCompressed=0
CAB_FixedSize=0
CAB_ResvCodeSigning=0
RebootMode=N
InstallPrompt=%InstallPrompt%
DisplayLicense=%DisplayLicense%
FinishMessage=%FinishMessage%
TargetName=%TargetName%
FriendlyName=%FriendlyName%
AppLaunched=%AppLaunched%
PostInstallCmd=%PostInstallCmd%
AdminQuietInstCmd=%AdminQuietInstCmd%
UserQuietInstCmd=%UserQuietInstCmd%
SourceFiles=SourceFiles
[Strings]
InstallPrompt=
DisplayLicense=
FinishMessage=
TargetName=${out}
FriendlyName=Dustoff Setup
AppLaunched=cmd /c install.cmd
PostInstallCmd=<None>
AdminQuietInstCmd=
UserQuietInstCmd=
FILE0="install.cmd"
FILE1="install.ps1"
FILE2="payload.zip"
[SourceFiles]
SourceFiles0=${work}\\
[SourceFiles0]
%FILE0%=
%FILE1%=
%FILE2%=
`;
const sedFile = path.join(work, 'setup.sed');
fs.writeFileSync(sedFile, sed);
execFileSync('C:\\Windows\\System32\\iexpress.exe', ['/N', '/Q', sedFile], {
  stdio: 'inherit',
});
if (!fs.existsSync(out)) throw new Error('IExpress did not produce the installer');
console.log(`Done: ${out} (${(fs.statSync(out).size / 1048576).toFixed(0)} MB)`);
