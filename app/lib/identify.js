// Works out what a dropped file is: system, real title, region, whether it is a
// known good copy, box art, and its RetroAchievements game ID.
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { execFile } = require('child_process');
const { P, SYS } = require('./store');

const UA = 'GameLauncherHub/0.1.0 (Windows)';
const EXT = {
  nes: 'nes',
  unf: 'nes',
  fds: 'nes',
  sfc: 'snes',
  smc: 'snes',
  z64: 'n64',
  n64: 'n64',
  v64: 'n64',
  iso: 'disc',
  gcm: 'disc',
  rvz: 'disc',
  wia: 'disc',
  wbfs: 'disc',
  ciso: 'disc',
  gcz: 'disc',
  nsp: 'switch',
  xci: 'switch',
  nsz: 'switch',
  xcz: 'switch',
  gb: 'gb',
  sgb: 'gb',
  gbc: 'gbc',
  cgb: 'gbc',
  gba: 'gba',
  agb: 'gba',
  wua: 'wiiu',
  wux: 'wiiu',
  wud: 'wiiu',
};
// Cartridge systems recognized by hashing the whole ROM.
const ROM_SYS = ['nes', 'snes', 'n64', 'gb', 'gbc', 'gba'];
const ARCHIVES = new Set(['zip', '7z']);
const DAT = {
  nes: 'Nintendo - Nintendo Entertainment System',
  snes: 'Nintendo - Super Nintendo Entertainment System',
  n64: 'Nintendo - Nintendo 64',
  gb: 'Nintendo - Game Boy',
  gbc: 'Nintendo - Game Boy Color',
  gba: 'Nintendo - Game Boy Advance',
};
const THUMBS = {
  nes: 'Nintendo_-_Nintendo_Entertainment_System',
  snes: 'Nintendo_-_Super_Nintendo_Entertainment_System',
  n64: 'Nintendo_-_Nintendo_64',
  gb: 'Nintendo_-_Game_Boy',
  gbc: 'Nintendo_-_Game_Boy_Color',
  gba: 'Nintendo_-_Game_Boy_Advance',
};

const extOf = f => path.extname(f).slice(1).toLowerCase();

/* ---------- hashing ---------- */
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return ((c ^ 0xffffffff) >>> 0).toString(16).toUpperCase().padStart(8, '0');
}
const md5 = buf => crypto.createHash('md5').update(buf).digest('hex').toUpperCase();

// Returns the ROM bytes in the form the databases expect.
function normalizeRom(sys, buf) {
  if (sys === 'nes' && buf.slice(0, 4).toString('latin1') === 'NES\x1a') return { full: buf, body: buf.subarray(16) };
  if (sys === 'snes' && buf.length % 1024 === 512) return { full: buf, body: buf.subarray(512) };
  if (sys === 'n64') {
    const m = buf.readUInt32BE(0);
    const out = Buffer.from(buf);
    if (m === 0x37804012) {
      for (let i = 0; i + 1 < out.length; i += 2) {
        const a = out[i];
        out[i] = out[i + 1];
        out[i + 1] = a;
      }
    } else if (m === 0x40123780) {
      for (let i = 0; i + 3 < out.length; i += 4) {
        out.writeUInt32BE(buf.readUInt32LE(i), i);
      }
    }
    return { full: out, body: out };
  }
  return { full: buf, body: buf };
}

/* ---------- cached downloads ---------- */
async function cachedText(name, url, maxAgeDays = 30) {
  const file = path.join(P.cache, name);
  try {
    const st = await fsp.stat(file);
    if (Date.now() - st.mtimeMs < maxAgeDays * 864e5) return await fsp.readFile(file, 'utf8');
  } catch {}
  try {
    const r = await fetch(url, { headers: { 'User-Agent': UA } });
    if (!r.ok) throw new Error(r.status);
    const text = await r.text();
    await fsp.writeFile(file, text);
    return text;
  } catch (e) {
    try {
      return await fsp.readFile(file, 'utf8');
    } catch {
      return null;
    }
  }
}

const datCache = {};
async function loadDat(sys) {
  if (datCache[sys]) return datCache[sys];
  const url = `https://raw.githubusercontent.com/libretro/libretro-database/master/metadat/no-intro/${encodeURIComponent(DAT[sys])}.dat`;
  const text = await cachedText(`${sys}.dat`, url);
  const byCrc = new Map(),
    byMd5 = new Map();
  if (text) {
    // ROM names contain parentheses, e.g. rom ( name "Zelda (USA).sfc" size 1 crc ... ), so match to end of line.
    const re = /game \(\s*name "((?:[^"\\]|\\.)*)"[\s\S]*?rom \( name "(?:[^"\\]|\\.)*"([^\n]*)\)/g;
    let m;
    while ((m = re.exec(text))) {
      const name = m[1],
        rom = m[2];
      const crc = (rom.match(/crc ([0-9A-Fa-f]{8})/) || [])[1];
      const h = (rom.match(/md5 ([0-9A-Fa-f]{32})/) || [])[1];
      if (crc && !byCrc.has(crc.toUpperCase())) byCrc.set(crc.toUpperCase(), name);
      if (h && !byMd5.has(h.toUpperCase())) byMd5.set(h.toUpperCase(), name);
    }
  }
  return (datCache[sys] = { byCrc, byMd5, loaded: !!text });
}

let tdb = null;
async function loadTdb() {
  if (tdb) return tdb;
  const text = await cachedText('wiitdb.txt', 'https://www.gametdb.com/wiitdb.txt?LANG=EN');
  tdb = new Map();
  if (text)
    for (const line of text.split(/\r?\n/)) {
      const m = line.match(/^(\w{4,6}) = (.+)$/);
      if (m) tdb.set(m[1], m[2].trim());
    }
  return tdb;
}

/* ---------- names ---------- */
// "Legend of Zelda, The - A Link to the Past (USA) (Rev 1)" -> title + region
function niceTitle(datName) {
  const tags = [...datName.matchAll(/\(([^)]+)\)/g)].map(m => m[1]);
  let base = datName.replace(/\s*[\(\[][^\)\]]*[\)\]n.replace(/[&*/:`<>?\|]/g, '').trim();
  base = base.replace(/^(.*?), (The|A|An)( - |$)/, '$2 $1$3').replace(/ - /g, ': ');
  return { title: base, region: tags[0] || '' };
}
function cleanFileName(file) {
  let n = path.basename(file).replace(/\.[^.]+$/, '');
  n = n
    .replace(/\[[^\]]*\]|\([^)]*\)/g, ' ')
    .replace(/[_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return n.replace(/^(.*?), (The|A|An)( - |$)/, '$2 $1$3').replace(/ - /g, ': ') || path.basename(file);
}

/* ---------- disc images (GameCube / Wii) ---------- */
async function readDiscHeader(file) {
  const fh = await fsp.open(file, 'r');
  try {
    const head = Buffer.alloc(0x8100);
    await fh.read(head, 0, head.length, 0);
    let off = 0;
    const magic = head.slice(0, 4).toString('latin1');
    if (magic === 'WBFS') off = 0x200;
    else if (magic === 'WIA\x01' || magic === 'RVZ\x01') off = 0x58;
    else if (magic === 'CISO') off = 0x8000;
    const d = head.subarray(off, off + 0x80);
    const id = d.slice(0, 6).toString('latin1');
    if (!/^[A-Z0-9]{6}$/.test(id)) return null;
    const isWii = d.readUInt32BE(0x18) === 0x5d1c9ea3;
    const isGc = d.readUInt32BE(0x1c) === 0xc2339f3d;
    const internal = d.slice(0x20, 0x60).toString('latin1').replace(/\0.*$/s, '').trim();
    return { id, sys: isWii ? 'wii' : isGc ? 'gc' : magic === 'WBFS' ? 'wii' : null, internal };
  } finally {
    await fh.close();
  }
}

/* ---------- Wii U ---------- */
// Title ID -> { name, code } from the WiiUBrew title list, and GameTDB IDs for names and box art.
let wiiuTitles = null,
  wiiuTdb = null;
async function loadWiiuTitles() {
  if (wiiuTitles) return wiiuTitles;
  const html = await cachedText('wiiu-titles.html', 'https://wiiubrew.org/wiki/Title_database');
  const map = new Map();
  if (html) {
    const re =
      /<td>\s*([0-9A-Fa-f]{8})-([0-9A-Fa-f]{8})\s*<\/td>\s*<td>([\s\S]*?)<\/td>\s*<td>\s*WUP-[A-Z]-([A-Z0-9]{4})/g;
    let m;
    while ((m = re.exec(html))) {
      const tid = (m[1] + m[2]).toUpperCase();
      const name = m[3]
        .replace(/<[^>]+>/g, '')
        .replace(/&amp;/g, '&')
        .replace(/&#39;/g, "'")
        .replace(/&quot;/g, '"')
        .trim();
      if (!map.has(tid)) map.set(tid, { name, code: m[4] });
    }
  }
  if (map.size) wiiuTitles = map; // keep trying next time if the list couldn't be downloaded
  return map;
}
async function loadWiiuTdb() {
  if (wiiuTdb) return wiiuTdb;
  const text = await cachedText('wiiutdb.txt', 'https://www.gametdb.com/wiiutdb.txt?LANG=EN');
  wiiuTdb = { byId: new Map(), byCode: new Map() };
  if (text)
    for (const line of text.split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9]{6}) = (.+)$/);
      if (!m) continue;
      wiiuTdb.byId.set(m[1], m[2].trim());
      const c = m[1].slice(0, 4);
      if (!wiiuTdb.byCode.has(c)) wiiuTdb.byCode.set(c, m[1]);
    }
  return wiiuTdb;
}
const readAt = async (fh, pos, len) => {
  const b = Buffer.alloc(len);
  const { bytesRead } = await fh.read(b, 0, len, pos);
  return b.subarray(0, bytesRead);
};

// .wua (Cemu archive): titles are stored as folders named <16-hex title ID>_v<version>.
async function wuaTitleIds(file) {
  const fh = await fsp.open(file, 'r');
  try {
    const size = (await fh.stat()).size;
    let names = null;
    if (size > 144) {
      const f = await readAt(fh, size - 144, 144);
      if (f.readUInt32BE(140) === 0x169f52d6) {
        const off = Number(f.readBigUInt64BE(32)),
          len = Number(f.readBigUInt64BE(40));
        if (off + len <= size && len < 64 * 1024 * 1024) names = await readAt(fh, off, len);
      }
    }
    if (!names) names = await readAt(fh, Math.max(0, size - 8 * 1024 * 1024), Math.min(size, 8 * 1024 * 1024));
    const ids = new Set();
    for (const m of names.toString('latin1').matchAll(/([0-9a-fA-F]{16})_v\d+/g))
      if (!/^0+$/.test(m[1])) ids.add(m[1].toUpperCase());
    return [...ids];
  } finally {
    await fh.close();
  }
}
// .wud is a raw disc; .wux is the same disc compressed in sectors. The disc starts with its product code.
async function wiiuDiscCode(file) {
  const fh = await fsp.open(file, 'r');
  try {
    let head = await readAt(fh, 0, 0x40);
    if (head.slice(0, 4).toString('latin1') === 'WUX0') {
      const sectorSize = head.readUInt32LE(8);
      const total = Number(head.readBigUInt64LE(16));
      const count = Math.ceil(total / sectorSize);
      const sectors = Math.ceil((0x20 + count * 4) / sectorSize) * sectorSize;
      const idx = (await readAt(fh, 0x20, 4)).readUInt32LE(0);
      head = await readAt(fh, sectors + idx * sectorSize, 0x40);
    }
    const m = head.toString('latin1').match(/^WUP-[A-Z]-([A-Z0-9]{4})/);
    return m ? m[1] : null;
  } finally {
    await fh.close();
  }
}
async function inspectWiiu(info) {
  let code = null;
  if (info.ext === 'wua') {
    const ids = await wuaTitleIds(info.file).catch(() => []);
    const base = ids.find(t => t.startsWith('00050000')) || ids[0];
    if (base) {
      info.titleId = '00050000' + base.slice(8);
      const t = (await loadWiiuTitles()).get(info.titleId);
      if (t) {
        code = t.code;
        info.title = t.name;
      }
    }
  } else {
    code = await wiiuDiscCode(info.file).catch(() => null);
  }
  // Some .wua files store no usable title ID; fall back to matching the file name against GameTDB.
  if (!code) {
    const tdb = await loadWiiuTdb();
    const norm = t =>
      t
        .toLowerCase()
        .replace(/&/g, 'and')
        .replace(/[^a-z0-9n.replace(/[&*/:`<>?\|]/g, '');
    const want = norm(cleanFileName(info.file));
    const reg = /\(USA/i.test(info.file)
      ? 'E'
      : /\(Europe/i.test(info.file)
        ? 'P'
        : /\(Japan/i.test(info.file)
          ? 'J'
          : 'E';
    const hits = want ? [...tdb.byId].filter(([, t]) => norm(t) === want).map(([gid]) => gid) : [];
    const gid = hits.find(x => x[3] === reg) || hits[0];
    if (gid) code = gid.slice(0, 4);
  }
  if (code) {
    const tdb = await loadWiiuTdb();
    const gid = tdb.byCode.get(code);
    if (gid) {
      info.wiiuId = gid;
      info.title = tdb.byId.get(gid) || info.title;
    }
    info.region = { E: 'USA', P: 'Europe', J: 'Japan' }[code[3]] || '';
  }
  return info;
}

/* ---------- Switch ---------- */
async function switchTitleId(file) {
  const fromName = path.basename(file).match(/\b(01[0-9A-Fa-f]{14})\b/);
  if (fromName) return fromName[1].toUpperCase();
  if (extOf(file) !== 'nsp') return null;
  const fh = await fsp.open(file, 'r');
  try {
    const head = Buffer.alloc(0x4000);
    await fh.read(head, 0, head.length, 0);
    if (head.slice(0, 4).toString('latin1') !== 'PFS0') return null;
    const n = head.readUInt32LE(4),
      strOff = 0x10 + n * 0x18;
    const names = head
      .slice(strOff, strOff + head.readUInt32LE(8))
      .toString('latin1')
      .split('\0');
    const tik = names.find(s => /^[0-9a-f]{32}\.tik$/i.test(s));
    return tik ? tik.slice(0, 16).toUpperCase() : null;
  } finally {
    await fh.close();
  }
}

/* ---------- art + achievements ---------- */
async function download(url, dest) {
  try {
    const r = await fetch(url, { headers: { 'User-Agent': UA } });
    if (!r.ok) return false;
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length < 500) return false;
    await fsp.writeFile(dest, buf);
    return true;
  } catch {
    return false;
  }
}
// Every place a game's box art might be, best first. Also used for the Discord status picture.
function artUrls(g) {
  const urls = [];
  if (g.datName && THUMBS[g.sys]) {
    // Exact database name first, then the same game without revision tags, then common regions.
    const core = g.datName.replace(/\s*\(.*$/, '');
    const names = [g.datName, g.datName.replace(/\s*\((Rev|v)[^)]*\)/gi, '')];
    for (const r of ['(USA)', '(USA, Europe)', '(World)', '(Europe)', '(Japan, USA)', '(Japan)'])
      names.push(`${core} ${r}`);
    for (const n of [...new Set(names)]) {
      const name = n.replace(/[&*/:`<>?\\|]/g, '_');
      urls.push(
        `https://raw.githubusercontent.com/libretro-thumbnails/${THUMBS[g.sys]}/master/Named_Boxarts/${encodeURIComponent(name)}.png`,
      );
    }
  }
  if (g.wiiuId) {
    const r = { E: 'US', P: 'EN', J: 'JA' }[g.wiiuId[3]] || 'US';
    for (const region of [...new Set([r, 'US', 'EN'])])
      for (const kind of ['coverHQ', 'coverM', 'cover'])
        urls.push(`https://art.gametdb.com/wiiu/${kind}/${region}/${g.wiiuId}.jpg`);
  }
  if (g.discId) {
    const r = { E: 'US', P: 'EN', J: 'JA', D: 'DE', F: 'FR', K: 'KO' }[g.discId[3]] || 'US';
    for (const region of [...new Set([r, 'US', 'EN'])])
      for (const kind of ['coverHQ', 'coverM', 'cover'])
        urls.push(`https://art.gametdb.com/wii/${kind}/${region}/${g.discId}.png`);
  }
  return urls;
}
async function fetchArt(g) {
  const dest = path.join(P.art, g.id + '.png');
  for (const url of artUrls(g)) {
    if (await download(url, dest)) {
      g.artUrl = url;
      return dest;
    }
  }
  return null;
}
// Finds the web address of a game's box art without downloading it (for games added before artUrl existed).
async function findArtUrl(g) {
  for (const url of artUrls(g)) {
    try {
      const r = await fetch(url, { method: 'HEAD', headers: { 'User-Agent': UA } });
      if (r.ok) return url;
    } catch {
      return null;
    }
  }
  return null;
}
async function raGameId(hash) {
  try {
    const r = await fetch(`https://retroachievements.org/dorequest.php?r=gameid&m=${hash.toLowerCase()}`, {
      headers: { 'User-Agent': UA },
    });
    const j = await r.json();
    return j.Success && j.GameID ? j.GameID : null;
  } catch {
    return null;
  }
}

/* ---------- archives ---------- */
function extract(archive) {
  return new Promise((resolve, reject) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hub-'));
    execFile('C:\\Windows\\System32\\tar.exe', ['-xf', archive, '-C', dir], err => (err ? reject(err) : resolve(dir)));
  });
}
async function walk(p, out = []) {
  const st = await fsp.stat(p);
  if (st.isDirectory()) {
    for (const f of await fsp.readdir(p)) await walk(path.join(p, f), out);
  } else out.push(p);
  return out;
}

/* ---------- main entry ---------- */
// Looks at one file and returns facts about it (no copying).
async function inspect(file) {
  const ext = extOf(file);
  let kind = EXT[ext];
  if (!kind) return null;
  const info = { file, ext, sys: kind, title: cleanFileName(file), region: '', verified: null };
  if (kind === 'disc') {
    const h = await readDiscHeader(file).catch(() => null);
    info.sys = (h && h.sys) || (ext === 'wbfs' ? 'wii' : ext === 'gcm' || ext === 'gcz' ? 'gc' : 'wii');
    if (h) {
      info.discId = h.id;
      const t = (await loadTdb()).get(h.id);
      info.title = t || h.internal || info.title;
      info.region = { E: 'USA', P: 'Europe', J: 'Japan' }[h.id[3]] || '';
      info.verified = null; // recognized by disc ID; full disc hashing is too slow to do on add
    }
    return info;
  }
  if (kind === 'wiiu') return inspectWiiu(info);
  if (kind === 'switch') {
    info.titleId = await switchTitleId(file).catch(() => null);
    return info;
  }
  const buf = await fsp.readFile(file);
  // A .gb file that only runs on Game Boy Color (header flag 0xC0) belongs with GBC.
  if (kind === 'gb' && buf.length > 0x150 && buf[0x143] === 0xc0) info.sys = kind = 'gbc';
  const { full, body } = normalizeRom(kind, buf);
  info.crc = crc32(body);
  info.raHash = md5(body);
  const dat = await loadDat(kind);
  const hit = dat.byCrc.get(crc32(full)) || dat.byCrc.get(info.crc) || dat.byMd5.get(info.raHash);
  if (hit) {
    info.datName = hit;
    Object.assign(info, niceTitle(hit));
    info.verified = true;
  } else if (dat.loaded) info.verified = false;
  return info;
}

module.exports = {
  inspect,
  fetchArt,
  findArtUrl,
  raGameId,
  extract,
  walk,
  extOf,
  EXT,
  ARCHIVES,
  ROM_SYS,
  cleanFileName,
};
