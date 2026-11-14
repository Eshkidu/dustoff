/* Host side: hands out the friend code, streams the game window + PC sound to each friend,
   and forwards each friend's controller to Dustoff (which makes it Player 2, 3 or 4). */
let cfg = null,
  peer = null,
  opened = false,
  stream = null,
  ending = false;
const waiting = [];
const friends = new Map(); // slot (0-2) -> { conn, call, name, seq }
let SLOTS = [0, 1, 2];

coop.on('coop:init', d => {
  cfg = d;
  SLOTS = [0, 1, 2].slice(0, Math.max(1, Math.min(3, d.max || 3)));
  start();
});
coop.on('coop:capture', () => capture());
coop.on('coop:end', () => {
  ending = true;
  for (const f of friends.values()) {
    try {
      f.conn.send({ t: 'bye' });
    } catch {}
  }
  setTimeout(() => peer && peer.destroy(), 300);
});

function start() {
  peer = new Peer(coopPeerId(cfg.code), COOP_PEER_OPTS);
  peer.on('open', () => {
    opened = true;
    coop.ready();
  });
  peer.on('error', e => {
    if (!opened) coop.error(e.type === 'unavailable-id' ? 'taken' : 'net');
    else console.warn('peer error', e.type, e.message);
  });
  // Lost the code server for a moment: reconnect so more friends can still join. Friends already
  // playing are connected directly and aren't affected.
  peer.on('disconnected', () => {
    if (!ending)
      setTimeout(() => {
        try {
          if (!ending && peer.disconnected) peer.reconnect();
        } catch {}
      }, 2000);
  });
  peer.on('connection', onFriend);
}

/* ---------- the picture and sound ---------- */
async function capture() {
  try {
    const s = await navigator.mediaDevices.getDisplayMedia({
      video: { frameRate: { ideal: 60, max: 60 }, width: { max: 1920 }, height: { max: 1080 }, cursor: 'never' },
      audio: true,
    });
    const v = s.getVideoTracks()[0];
    if (v) v.contentHint = 'motion';
    const old = stream;
    stream = s;
    for (const f of friends.values()) if (f.call) swapTracks(f.call.peerConnection, s);
    if (old) old.getTracks().forEach(t => t.stop());
    waiting.splice(0).forEach(r => r(s));
  } catch (e) {
    console.warn('capture failed, trying again', e && e.message);
    if (!ending) setTimeout(capture, 2000);
  }
}
const getStream = () => (stream ? Promise.resolve(stream) : new Promise(r => waiting.push(r)));
function swapTracks(pc, s) {
  for (const sender of pc.getSenders()) {
    const kind = sender.track ? sender.track.kind : null;
    const t = kind && s.getTracks().find(x => x.kind === kind);
    if (t) sender.replaceTrack(t).catch(() => {});
  }
}
// Low lag over sharpness: keep 60fps, let the picture soften on slow connections.
function tuneSenders(pc) {
  const apply = async () => {
    for (const s of pc.getSenders()) {
      if (!s.track) continue;
      const p = s.getParameters();
      if (!p.encodings || !p.encodings.length) p.encodings = [{}];
      if (s.track.kind === 'video') {
        p.encodings[0].maxBitrate = 12000000;
        p.encodings[0].maxFramerate = 60;
        p.degradationPreference = 'maintain-framerate';
      } else p.encodings[0].maxBitrate = 160000;
      try {
        await s.setParameters(p);
      } catch {}
    }
  };
  pc.addEventListener('connectionstatechange', () => pc.connectionState === 'connected' && apply());
}

/* ---------- friends ---------- */
const cleanName = n =>
  String(n || 'Friend')
    .replace(/[^\p{L}\p{N} '._-]/gu, '')
    .trim()
    .slice(0, 20) || 'Friend';
const slotOf = conn => SLOTS.find(s => friends.get(s) && friends.get(s).conn === conn);

function onFriend(conn) {
  conn.on('open', async () => {
    const m = conn.metadata || {};
    if (m.proto !== cfg.proto) {
      conn.send({ t: 'old', host: cfg.proto });
      setTimeout(() => conn.close(), 800);
      return;
    }
    const slot = SLOTS.find(s => !friends.has(s));
    if (slot === undefined) {
      conn.send({ t: 'full', max: SLOTS.length });
      setTimeout(() => conn.close(), 800);
      return;
    }
    const f = { conn, call: null, name: cleanName(m.name), seq: -1 };
    friends.set(slot, f);
    conn.send({ t: 'welcome', player: slot + 2, title: cfg.title });
    coop.joined(slot, f.name);
    const s = await getStream();
    if (friends.get(slot) !== f) return;
    f.call = peer.call(conn.peer, s, { sdpTransform: coopTuneSdp });
    tuneSenders(f.call.peerConnection);
    f.call.on('error', e => console.warn('call error', e && e.message));
  });
  conn.on('data', d => {
    if (!d || typeof d !== 'object') return;
    const slot = slotOf(conn);
    if (slot === undefined) return;
    const f = friends.get(slot);
    if (d.t === 'pad' && Array.isArray(d.s) && d.s.length === 7) {
      // Messages can arrive out of order; ignore anything older than what we already used.
      const q = +d.q || 0;
      if (q <= f.seq) return;
      f.seq = q;
      const [b, lt, rt, lx, ly, rx, ry] = d.s.map(n => +n || 0);
      coop.pad(slot, { b, lt, rt, lx, ly, rx, ry });
    } else if (d.t === 'ping') conn.send({ t: 'pong', at: d.at });
  });
  const drop = () => {
    const slot = slotOf(conn);
    if (slot === undefined) return;
    const f = friends.get(slot);
    friends.delete(slot);
    try {
      if (f.call) f.call.close();
    } catch {}
    coop.left(slot);
  };
  conn.on('close', drop);
  conn.on('error', drop);
}
