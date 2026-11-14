// A small DSU ("cemuhook") controller server. Dolphin and Cemu both read controllers over this
// protocol, so a friend's controller can show up in the game as Player 2, 3 or 4 without any
// driver. Only listens on this PC (127.0.0.1).
//
// Each slot is one friend. Slots are always reported as connected while hosting, so the
// emulators keep stable device names (DSUClient/0/Dustoff, /1, /2) and a friend who joins
// mid-game works right away.
const dgram = require('dgram');

const PORT = 26770; // not the usual 26760, so it never clashes with DS4Windows or BetterJoy
const NAME = 'Dustoff';
const SLOTS = 3;
const PROTO = 1001;
const SERVER_ID = (Math.random() * 0xffffffff) >>> 0;

// Xbox button bits (XInput wButtons).
const X = {
  UP: 0x1,
  DOWN: 0x2,
  LEFT: 0x4,
  RIGHT: 0x8,
  START: 0x10,
  BACK: 0x20,
  LS: 0x40,
  RS: 0x80,
  LB: 0x100,
  RB: 0x200,
  A: 0x1000,
  B: 0x2000,
  X: 0x4000,
  Y: 0x8000,
};

/* ---------- CRC32 (same as zlib) ---------- */
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
  return (c ^ 0xffffffff) >>> 0;
}

/* ---------- messages ---------- */
function header(buf, type) {
  buf.write('DSUS', 0, 'ascii');
  buf.writeUInt16LE(PROTO, 4);
  buf.writeUInt16LE(buf.length - 16, 6);
  buf.writeUInt32LE(0, 8);
  buf.writeUInt32LE(SERVER_ID, 12);
  buf.writeUInt32LE(type, 16);
}
function finish(buf) {
  buf.writeUInt32LE(0, 8);
  buf.writeUInt32LE(crc32(buf), 8);
  return buf;
}
function portInfo(buf, slot) {
  buf[20] = slot;
  buf[21] = 2; // connected
  buf[22] = 2; // full gyro model (harmless; no motion is sent)
  buf[23] = 1; // USB
  buf.set([0x00, 0x44, 0x55, 0x53, 0x54, 0x10 + slot], 24); // made-up MAC, one per slot
  buf[30] = 0xef; // charged
}
function versionResponse() {
  const b = Buffer.alloc(24);
  header(b, 0x100000);
  b.writeUInt16LE(PROTO, 20);
  return finish(b);
}
function portInfoMsg(slot) {
  const b = Buffer.alloc(32);
  header(b, 0x100001);
  portInfo(b, slot);
  return finish(b);
}

// Pad state from the guest: { b: XInput buttons, lt, rt (0-255), lx, ly, rx, ry (-32768..32767) }.
const NEUTRAL = { b: 0, lt: 0, rt: 0, lx: 0, ly: 0, rx: 0, ry: 0 };
const stick = v => Math.max(0, Math.min(255, Math.round((v / 32767) * 127.5 + 128)));
function padData(slot, st, counter) {
  const b = Buffer.alloc(100);
  header(b, 0x100002);
  portInfo(b, slot);
  b[31] = 1; // active
  b.writeUInt32LE(counter >>> 0, 32);
  const on = bit => (st.b & bit ? 1 : 0);
  // Button bits (Cemu reads these).
  b[36] =
    on(X.BACK) |
    (on(X.LS) << 1) |
    (on(X.RS) << 2) |
    (on(X.START) << 3) |
    (on(X.UP) << 4) |
    (on(X.RIGHT) << 5) |
    (on(X.DOWN) << 6) |
    (on(X.LEFT) << 7);
  b[37] =
    (st.lt > 30 ? 1 : 0) |
    ((st.rt > 30 ? 1 : 0) << 1) |
    (on(X.LB) << 2) |
    (on(X.RB) << 3) |
    (on(X.Y) << 4) |
    (on(X.B) << 5) |
    (on(X.A) << 6) |
    (on(X.X) << 7);
  b[38] = 0; // PS
  b[39] = 0; // touch
  // Sticks: Y is "up = high" in this protocol.
  b[40] = stick(st.lx);
  b[41] = stick(st.ly);
  b[42] = stick(st.rx);
  b[43] = stick(st.ry);
  // Analog bytes (Dolphin reads these for the D-pad and face buttons).
  const an = bit => (st.b & bit ? 255 : 0);
  b[44] = an(X.LEFT);
  b[45] = an(X.DOWN);
  b[46] = an(X.RIGHT);
  b[47] = an(X.UP);
  b[48] = an(X.X); // Square
  b[49] = an(X.A); // Cross
  b[50] = an(X.B); // Circle
  b[51] = an(X.Y); // Triangle
  b[52] = an(X.RB); // R1
  b[53] = an(X.LB); // L1
  b[54] = Math.max(0, Math.min(255, st.rt | 0)); // R2
  b[55] = Math.max(0, Math.min(255, st.lt | 0)); // L2
  // Touch points stay zero. Motion: timestamp + "resting flat" so nothing drifts.
  b.writeBigUInt64LE(BigInt(Date.now()) * 1000n, 68);
  b.writeFloatLE(0, 76);
  b.writeFloatLE(-1, 80);
  b.writeFloatLE(0, 84);
  return finish(b);
}

/* ---------- server ---------- */
let sock = null;
const pads = Array.from({ length: SLOTS }, () => Object.assign({}, NEUTRAL));
const counters = new Array(SLOTS).fill(0);
const clients = new Map(); // "ip:port" -> { addr, port, slots: Set, all: bool, until }
let tick = null;

function sendTo(c, buf) {
  if (sock) sock.send(buf, c.port, c.addr, () => {});
}
function pushSlot(slot) {
  const now = Date.now();
  let msg = null;
  for (const [k, c] of clients) {
    if (c.until < now) {
      clients.delete(k);
      continue;
    }
    if (!c.all && !c.slots.has(slot)) continue;
    msg = msg || padData(slot, pads[slot], ++counters[slot]);
    sendTo(c, msg);
  }
}
function onMessage(msg, rinfo) {
  if (msg.length < 20 || msg.toString('ascii', 0, 4) !== 'DSUC') return;
  const type = msg.readUInt32LE(16);
  const c = { addr: rinfo.address, port: rinfo.port };
  if (type === 0x100000) sendTo(c, versionResponse());
  else if (type === 0x100001 && msg.length >= 28) {
    const n = Math.min(4, msg.readUInt32LE(20));
    for (let i = 0; i < n; i++) {
      const slot = msg[24 + i];
      if (slot < SLOTS) sendTo(c, portInfoMsg(slot));
    }
  } else if (type === 0x100002 && msg.length >= 28) {
    // Subscribe: flags 0 = all pads, 1 = by slot, 2 = by MAC. Subscriptions last 5 seconds;
    // clients repeat the request about once a second.
    const flags = msg[20],
      slot = msg[21];
    const key = `${c.addr}:${c.port}`;
    const cur = clients.get(key) || Object.assign(c, { slots: new Set(), all: false, until: 0 });
    if (flags === 0 || flags === 2) cur.all = true;
    else if (slot < SLOTS) cur.slots.add(slot);
    cur.until = Date.now() + 5000;
    clients.set(key, cur);
  }
}

function start() {
  if (sock) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = dgram.createSocket('udp4');
    s.on('error', e => {
      if (sock !== s) return reject(e);
      console.error('DSU server error', e.message);
    });
    s.on('message', onMessage);
    s.bind(PORT, '127.0.0.1', () => {
      sock = s;
      // Keep every slot fresh even when nobody is pressing anything (emulators expect a steady feed).
      tick = setInterval(() => {
        for (let i = 0; i < SLOTS; i++) pushSlot(i);
      }, 50);
      resolve();
    });
  });
}
function stop() {
  clearInterval(tick);
  tick = null;
  clients.clear();
  for (let i = 0; i < SLOTS; i++) pads[i] = Object.assign({}, NEUTRAL);
  if (sock) {
    try {
      sock.close();
    } catch {}
  }
  sock = null;
}
// Called whenever a friend's controller changes.
function setPad(slot, st) {
  if (slot < 0 || slot >= SLOTS) return;
  const p = pads[slot];
  p.b = st.b & 0xffff;
  for (const k of ['lt', 'rt']) p[k] = Math.max(0, Math.min(255, +st[k] || 0));
  for (const k of ['lx', 'ly', 'rx', 'ry']) p[k] = Math.max(-32768, Math.min(32767, +st[k] || 0));
  pushSlot(slot);
}
const clearPad = slot => setPad(slot, NEUTRAL);

module.exports = { start, stop, setPad, clearPad, PORT, NAME, SLOTS, X, _test: { padData, crc32 } };
