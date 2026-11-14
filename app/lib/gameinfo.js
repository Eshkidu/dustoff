// How many people can play each Wii / Wii U game together, and which controllers it supports.
// Data: GameTDB (gametdb.com) full databases, downloaded once a month and cached as small JSON.
// GameCube games aren't covered by GameTDB's download, so they come back as unknown (null).
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const { execFile } = require('child_process');
const { P } = require('./store');

const UA = 'Dustoff (Windows)';
const SOURCES = {
  wii: 'https://www.gametdb.com/wiitdb.zip?LANG=EN',
  wiiu: 'https://www.gametdb.com/wiiutdb.zip?LANG=EN',
};
const MAX_AGE = 30 * 864e5;
const loaded = {};

// One <game> block -> { players, ctrls: [...], required: [...] }
function parse(xml) {
  const out = {};
  for (const block of xml.split('<game ').slice(1)) {
    const id = (block.match(/<id>([^<]+)<\/id>/) || [])[1];
    const players = +((block.match(/<input players="(\d+)"/) || [])[1] || 0);
    if (!id || !players) continue;
    const ctrls = [],
      required = [];
    for (const m of block.matchAll(/<control type="([^"]+)" required="([^"]+)"/g)) {
      ctrls.push(m[1]);
      if (m[2] === 'true') required.push(m[1]);
    }
    out[id] = { players, ctrls, required };
  }
  return out;
}

async function download(kind) {
  const zip = path.join(P.cache, `gametdb-${kind}.zip`);
  const dir = path.join(P.cache, `gametdb-${kind}`);
  const r = await fetch(SOURCES[kind], { headers: { 'User-Agent': UA } });
  if (!r.ok) throw new Error('download failed ' + r.status);
  await fsp.writeFile(zip, Buffer.from(await r.arrayBuffer()));
  await fsp.rm(dir, { recursive: true, force: true });
  await fsp.mkdir(dir, { recursive: true });
  await new Promise((res, rej) =>
    execFile('C:\\Windows\\System32\\tar.exe', ['-xf', zip, '-C', dir], e => (e ? rej(e) : res())),
  );
  const xmlName = (await fsp.readdir(dir)).find(n => n.endsWith('.xml'));
  if (!xmlName) throw new Error('no xml in download');
  const data = parse(await fsp.readFile(path.join(dir, xmlName), 'utf8'));
  await fsp.writeFile(path.join(P.cache, `gameinfo-${kind}.json`), JSON.stringify(data));
  fsp.rm(dir, { recursive: true, force: true }).catch(() => {});
  fsp.rm(zip, { force: true }).catch(() => {});
  return data;
}

async function load(kind) {
  if (loaded[kind]) return loaded[kind];
  const file = path.join(P.cache, `gameinfo-${kind}.json`);
  let data = null,
    fresh = false;
  try {
    const st = await fsp.stat(file);
    data = JSON.parse(await fsp.readFile(file, 'utf8'));
    fresh = Date.now() - st.mtimeMs < MAX_AGE;
  } catch {}
  if (!fresh) {
    try {
      data = await download(kind);
    } catch {
      // Offline: keep using the old copy if there is one.
    }
  }
  if (data && Object.keys(data).length) loaded[kind] = data;
  return loaded[kind] || null;
}

// { players, ctrls, required }, null when the game isn't in the database, or undefined when the
// database couldn't be loaded (offline), so the caller can try again later.
async function lookup(g) {
  const kind = g.sys === 'wii' ? 'wii' : g.sys === 'wiiu' ? 'wiiu' : null;
  const id = g.sys === 'wii' ? g.discId : g.wiiuId;
  if (!kind || !id) return null;
  const db = await load(kind);
  if (!db) return undefined;
  return db[id] || db[id.slice(0, 4) + '01'] || null;
}

module.exports = { lookup, _test: { parse, download } };
