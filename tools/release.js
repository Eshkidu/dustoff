// One-button release: tests everything, builds the public installer, publishes the source code
// and the installer to GitHub, then bumps the version for next time.
// Run with tools\release.cmd (or the "Release Dustoff" desktop shortcut). Asks before publishing.
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { execFileSync, spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const APP = path.join(ROOT, 'app');
const DIST = path.join(ROOT, 'dist');
const REPO = path.join(DIST, 'repo'); // clean copy of the source that gets published
const REPO_NAME = 'dustoff';
const INSTALLER = path.join(DIST, 'DustoffSetup-Public.exe');

const say = m => console.log(m);
const die = m => {
  console.log('\n' + m + '\n');
  process.exit(1);
};
// Output shown live in the window (stdio: 'inherit') comes back as null, so default to ''.
const run = (cmd, args, opts = {}) =>
  String(execFileSync(cmd, args, Object.assign({ encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }, opts)) ?? '').trim();
const tryRun = (cmd, args, opts) => {
  try {
    return run(cmd, args, opts);
  } catch {
    return null;
  }
};
const ask = q =>
  new Promise(r => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    rl.question(q, a => {
      rl.close();
      r(a.trim());
    });
  });

(async () => {
  say('Dustoff release\n');

  // 1. Tools
  if (!tryRun('git', ['--version'])) die('Git is not installed. Install it from https://git-scm.com and try again.');
  if (!tryRun('gh', ['--version']))
    die(
      'The GitHub tool (gh) is not installed. In a terminal run:\n  winget install GitHub.cli\nthen close and reopen this window.',
    );
  if (spawnSync('gh', ['auth', 'status'], { stdio: 'ignore' }).status !== 0)
    die(
      'You are not signed in to GitHub yet. In a terminal run:\n  gh auth login\nand pick GitHub.com, HTTPS, and "Login with a web browser".',
    );
  const me = JSON.parse(run('gh', ['api', 'user']));
  const pkg = JSON.parse(fs.readFileSync(path.join(APP, 'package.json'), 'utf8'));
  let ver = pkg.version;
  const repoUrl = `https://github.com/${me.login}/${REPO_NAME}`;
  const repoExists =
    spawnSync('gh', ['repo', 'view', `${me.login}/${REPO_NAME}`], {
      stdio: 'ignore',
    }).status === 0;
  if (
    repoExists &&
    spawnSync('gh', ['release', 'view', 'v' + ver, '--repo', `${me.login}/${REPO_NAME}`], { stdio: 'ignore' })
      .status === 0
  ) {
    const [a, b, c] = ver.split('.').map(Number);
    ver = `${a}.${b}.${c + 1}`;
  }
  say(`GitHub account: ${me.login}`);
  say(`Version:        ${ver}`);
  say(`Where:          ${repoUrl}${repoExists ? '' : '  (new, public)'}\n`);

  // 2. Tests + public installer (aborts on any failure)
  pkg.version = ver;
  fs.writeFileSync(path.join(APP, 'package.json'), JSON.stringify(pkg, null, 2) + '\n');
  say('Running every check and building the public installer. This takes about 8 minutes...\n');
  const chk = spawnSync(process.execPath, [path.join(__dirname, 'check.js'), '--full'], { stdio: 'inherit' });
  if (chk.status !== 0) die('Checks failed, so nothing was published. Details are in dist\\last-check.json.');
  if (!fs.existsSync(INSTALLER)) die('The public installer is missing, so nothing was published.');

  // 3. Clean source copy: app code + build tools only. No emulators, games, saves, keys or library.
  fs.rmSync(path.join(REPO, 'app'), { recursive: true, force: true });
  fs.rmSync(path.join(REPO, 'tools'), { recursive: true, force: true });
  fs.mkdirSync(REPO, { recursive: true });
  const skip = r => /(^|\/)node_modules(\/|$)|\.bak|backup|(^|\/)\.git(\/|$)|^repo(\/|$)/i.test(r);
  const copy = (src, dest, rel = '') => {
    if (fs.statSync(src).isDirectory()) {
      fs.mkdirSync(dest, { recursive: true });
      for (const n of fs.readdirSync(src)) {
        const r = rel ? rel + '/' + n : n;
        if (!skip(r)) copy(path.join(src, n), path.join(dest, n), r);
      }
    } else fs.copyFileSync(src, dest);
  };
  copy(APP, path.join(REPO, 'app'));
  copy(__dirname, path.join(REPO, 'tools'));
  // README, LICENSE and screenshots live in tools/repo and go to the top of the published repo.
  copy(path.join(__dirname, 'repo'), REPO);
  // Fill the version and installer size shown under the download button.
  const readme = path.join(REPO, 'README.md');
  const mb = Math.round(fs.statSync(INSTALLER).size / 1048576) + ' MB';
  fs.writeFileSync(readme, fs.readFileSync(readme, 'utf8').replace(/\{\{VERSION\}\}/g, ver).replace(/\{\{SIZE\}\}/g, mb));
  for (const f of ['.prettierrc.json', '.prettierignore']) fs.copyFileSync(path.join(ROOT, f), path.join(REPO, f));
  fs.writeFileSync(path.join(REPO, '.gitignore'), 'node_modules/\ndist/\ndata/\ngames/\nemulators/\n*.bak*\n');
  // Same personal-info guard as the installer build.
  const who = require('os').userInfo().username.toLowerCase();
  (function scan(d) {
    for (const n of fs.readdirSync(d)) {
      if (n === '.git') continue;
      const p = path.join(d, n);
      if (fs.statSync(p).isDirectory()) scan(p);
      else {
        const t = fs.readFileSync(p, 'latin1').toLowerCase();
        if (t.includes('\\users\\' + who) || t.includes('/users/' + who))
          die('Stopped: ' + path.relative(REPO, p) + ' mentions your user folder. Nothing was published.');
      }
    }
  })(REPO);

  // 4. Notes
  const notes = path.join(DIST, 'release-notes.md');
  fs.writeFileSync(
    notes,
    `## Dustoff ${ver}

**Download:** DustoffSetup-Public.exe below. Double-click, wait about a minute, and Dustoff opens.

- Windows 10/11, 64-bit. An Xbox controller is recommended for now. Support for more controllers is coming.
- Windows may show "Windows protected your PC". Click **More info**, then **Run anyway**.
- Dustoff does not include any games, BIOS files, keys or firmware. Use your own copies of games you own.
- Built in: RetroArch (NES, SNES, N64, Game Boy, GBC, GBA), Dolphin (GameCube, Wii), Cemu (Wii U).
`,
  );

  // 5. Last chance
  say(`\nReady to publish Dustoff ${ver} to ${repoUrl}`);
  say('  - the source code (app + build tools)');
  say(`  - ${path.basename(INSTALLER)} (${(fs.statSync(INSTALLER).size / 1048576).toFixed(0)} MB)`);
  say('Anyone on the internet will be able to see and download these.\n');
  if ((await ask('Type RELEASE to publish, or anything else to stop: ')).toUpperCase() !== 'RELEASE')
    die('Stopped. Nothing was published.');

  // 6. Publish. Commits use GitHub's private no-reply email so your real email stays hidden.
  const g = (...a) => run('git', a, { cwd: REPO });
  if (!fs.existsSync(path.join(REPO, '.git'))) {
    g('init', '-b', 'main');
  }
  g('config', 'user.name', me.login);
  g('config', 'user.email', `${me.id}+${me.login}@users.noreply.github.com`);
  g('add', '-A');
  if (tryRun('git', ['diff', '--cached', '--quiet'], { cwd: REPO }) === null) g('commit', '-m', `Dustoff ${ver}`);
  if (!repoExists) {
    run('gh', [
      'repo',
      'create',
      REPO_NAME,
      '--public',
      '--description',
      'Drop in your games and play. A controller-first launcher for classic consoles.',
      '--source',
      REPO,
      '--remote',
      'origin',
      '--push',
    ]);
  } else {
    if (!tryRun('git', ['remote', 'get-url', 'origin'], { cwd: REPO })) g('remote', 'add', 'origin', repoUrl + '.git');
    run('git', ['push', '-u', 'origin', 'main'], {
      cwd: REPO,
      stdio: 'inherit',
    });
  }
  run(
    'gh',
    [
      'release',
      'create',
      'v' + ver,
      INSTALLER,
      '--repo',
      `${me.login}/${REPO_NAME}`,
      '--title',
      `Dustoff ${ver}`,
      '--notes-file',
      notes,
    ],
    { stdio: 'inherit' },
  );

  say(`\nPublished! ${repoUrl}/releases/tag/v${ver}`);
  say('Share that link. To take it down later, delete the release on that page.');
})().catch(e =>
  die(
    'Something went wrong: ' +
      e.message +
      '\nIf it stopped before "Published!", the release may be incomplete. Check the release page on GitHub.',
  ),
);
