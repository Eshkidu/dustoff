// Discord status: shows the game you're playing ("Playing New Super Mario Bros. U") with its box art,
// instead of the emulator's own status. Talks to the Discord app on this PC over its local pipe.
// Does nothing if Discord isn't running. Off switch: Settings > Display.
const net = require('net');
const store = require('./store');

const CLIENT_ID = '1571006981009973318'; // Discord application ID for "Dustoff" (discord.com/developers/applications)
const LOGO = 'https://raw.githubusercontent.com/Eshkidu/dustoff/main/app/icon/dustoff.png';
const SITE = 'https://github.com/Eshkidu/dustoff';

let sock = null,
  ready = false,
  want = null, // activity to show, or null
  retry = null,
  buf = Buffer.alloc(0),
  nonce = 0;

const enabled = () => !!CLIENT_ID && store.get().settings.discord !== false;

function frame(op, data) {
  const json = Buffer.from(JSON.stringify(data), 'utf8');
  const head = Buffer.alloc(8);
  head.writeUInt32LE(op, 0);
  head.writeUInt32LE(json.length, 4);
  return Buffer.concat([head, json]);
}

function send() {
  if (!sock || !ready) return;
  sock.write(frame(1, { cmd: 'SET_ACTIVITY', args: { pid: process.pid, activity: want }, nonce: String(++nonce) }));
}

function connect(i = 0) {
  if (sock || !enabled()) return;
  if (i > 9) return scheduleRetry();
  const s = net.createConnection('\\\\?\\pipe\\discord-ipc-' + i);
  s.once('error', () => {
    s.destroy();
    if (sock === s) sock = null;
    if (!ready) connect(i + 1);
  });
  s.once('connect', () => {
    sock = s;
    s.removeAllListeners('error');
    s.on('error', () => {});
    s.write(frame(0, { v: 1, client_id: CLIENT_ID }));
  });
  s.on('data', d => {
    buf = Buffer.concat([buf, d]);
    while (buf.length >= 8) {
      const op = buf.readUInt32LE(0),
        len = buf.readUInt32LE(4);
      if (buf.length < 8 + len) break;
      const body = buf.subarray(8, 8 + len);
      buf = buf.subarray(8 + len);
      let msg = {};
      try {
        msg = JSON.parse(body.toString('utf8'));
      } catch {}
      if (op === 3)
        s.write(frame(4, msg)); // ping -> pong
      else if (op === 2)
        s.end(); // Discord closed us
      else if (msg.evt === 'READY') {
        ready = true;
        send();
      }
    }
  });
  s.on('close', () => {
    if (sock !== s) return;
    sock = null;
    ready = false;
    buf = Buffer.alloc(0);
    if (want) scheduleRetry(); // Discord restarted or opened late: try again while a game is running
  });
}

function scheduleRetry() {
  if (retry || !want) return;
  retry = setTimeout(() => {
    retry = null;
    connect();
  }, 20000);
}

function disconnect() {
  clearTimeout(retry);
  retry = null;
  if (sock) {
    const s = sock;
    sock = null;
    ready = false;
    s.end();
  }
}

// g = the game, friends = how many friends joined (0 if playing alone).
function playing(g, friends = 0) {
  if (!enabled()) return;
  const sys = store.SYS[g.sys] || {};
  want = {
    type: 0,
    status_display_type: 2, // friends list says "Playing <game>" instead of "Playing Dustoff"
    details: g.title.slice(0, 128),
    state: (friends ? `${sys.name} with ${friends} friend${friends > 1 ? 's' : ''}` : sys.name || '').slice(0, 128),
    timestamps: { start: Date.now() },
    assets: {
      large_image: (!g.customArt && g.artUrl) || LOGO,
      large_text: g.title.slice(0, 128),
      small_image: LOGO,
      small_text: 'Dustoff',
    },
    buttons: [{ label: 'Get Dustoff', url: SITE }],
  };
  if (ready) send();
  else connect();
  // Games added before the art address was saved: look it up once, then show it.
  if (!g.artUrl && !g.customArt) {
    require('./identify')
      .findArtUrl(g)
      .then(url => {
        if (!url) return;
        g.artUrl = url;
        store.save();
        if (want && want.details === g.title.slice(0, 128)) {
          want.assets.large_image = url;
          send();
        }
      });
  }
}

function friends(n) {
  if (!want) return;
  const sysName = want.state.replace(/ with \d+ friends?$/, '');
  want.state = n ? `${sysName} with ${n} friend${n > 1 ? 's' : ''}` : sysName;
  send();
}

function stopped() {
  want = null;
  if (ready) send(); // clears the status
  setTimeout(() => !want && disconnect(), 1500);
}

module.exports = { playing, friends, stopped, enabled: () => !!CLIENT_ID };
