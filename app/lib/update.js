// Updates: checks GitHub for a newer Dustoff release and installs it when the user says so.
// Only for installed copies (the installer writes version.txt next to Dustoff.exe); a copy run
// from source never updates itself.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { app } = require('electron');

const REPO = 'Eshkidu/dustoff';
const ASSET = 'DustoffSetup-Public.exe';
const UA = 'Dustoff updater (Windows)';

const installDir = () => path.dirname(process.execPath);
const isInstalled = () => app.isPackaged && fs.existsSync(path.join(installDir(), 'version.txt'));

const parts = v =>
  String(v || '')
    .replace(/^v/i, '')
    .split('.')
    .map(n => parseInt(n, 10) || 0);
function newer(a, b) {
  const x = parts(a),
    y = parts(b);
  for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0);
  return false;
}

// -> { version, url, size, notes } when a newer version exists, otherwise null.
async function check() {
  if (!isInstalled()) return null;
  const r = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
    headers: { 'User-Agent': UA, Accept: 'application/vnd.github+json' },
  });
  if (!r.ok) return null;
  const rel = await r.json();
  const version = String(rel.tag_name || '').replace(/^v/i, '');
  if (!version || !newer(version, app.getVersion())) return null;
  const asset = (rel.assets || []).find(a => a.name === ASSET);
  const prefix = `https://github.com/${REPO}/releases/download/`;
  if (!asset || !String(asset.browser_download_url).startsWith(prefix)) return null;
  return {
    version,
    url: asset.browser_download_url,
    size: asset.size,
    notes: String(rel.body || '').slice(0, 2000),
  };
}

// Downloads the installer (reporting 0-100), then runs it and closes Dustoff. The installer
// replaces the app files, keeps games, saves and settings, and opens the new version.
async function install(info, onPct) {
  const file = path.join(os.tmpdir(), `DustoffSetup-${info.version.replace(/[^0-9.]/g, '')}.exe`);
  const r = await fetch(info.url, { headers: { 'User-Agent': UA } });
  if (!r.ok || !r.body) throw new Error('download failed');
  const total = +r.headers.get('content-length') || info.size || 0;
  const out = fs.createWriteStream(file);
  let done = 0,
    last = -1;
  for await (const chunk of r.body) {
    done += chunk.length;
    if (!out.write(chunk)) await new Promise(res => out.once('drain', res));
    const pct = total ? Math.floor((done / total) * 100) : 0;
    if (pct !== last) onPct((last = pct));
  }
  await new Promise((res, rej) => out.end(err => (err ? rej(err) : res())));
  if (info.size && fs.statSync(file).size !== info.size) throw new Error('download was incomplete');
  spawn(file, [], { detached: true, stdio: 'ignore' }).unref();
  setTimeout(() => app.quit(), 500);
}

module.exports = { check, install, isInstalled, _test: { newer } };
