/* Guest side: connects to the host with the friend code, shows the game full screen,
   and sends this PC's controller to the host. */
const $ = s => document.querySelector(s);
const video = $('#video');
const X = { UP: 0x1, DOWN: 0x2, START: 0x10, BACK: 0x20, A: 0x1000, B: 0x2000 };
let cfg = null,
  peer = null,
  conn = null,
  call = null,
  seq = 0,
  player = 0,
  state = 'connecting', // connecting | waiting | playing | ended
  menuOpen = false,
  menuSel = 0,
  comboSince = 0,
  prevB = 0,
  rtt = 0;

coop.on('coop:init', d => {
  cfg = d;
  $('#card-eyebrow').textContent = `Friend code ${d.show}`;
  card('sleepy', 'Connecting to your friend…', 'This usually takes a few seconds.', true);
  start();
});

/* ---------- messages on screen ---------- */
function card(mood, title, text, busy, button) {
  const c = $('#card');
  c.classList.remove('gone');
  $('#card-mascot').src = `../renderer/img/mascot-${mood}.png`;
  $('#card-title').textContent = title;
  $('#card-text').textContent = text || '';
  $('#card-dots').hidden = !busy;
  $('#card-btns').hidden = !button;
}
const hideCard = () => $('#card').classList.add('gone');
function end(title, text) {
  if (state === 'ended') return;
  state = 'ended';
  closeMenu();
  video.srcObject = null;
  $('#chip').hidden = true;
  card('surprised', title, text, false, true);
  try {
    if (peer) peer.destroy();
  } catch {}
}
let chipTimer = null;
function showChip() {
  const c = $('#chip');
  c.hidden = false;
  c.classList.remove('fade');
  clearTimeout(chipTimer);
  chipTimer = setTimeout(() => c.classList.add('fade'), 7000);
}
function drawNet() {
  const el = $('#chip-net');
  if (!rtt) return (el.textContent = '');
  const [cls, word] = rtt < 60 ? ['net-good', 'Great'] : rtt < 120 ? ['net-ok', 'OK'] : ['net-slow', 'Slow'];
  el.className = cls;
  el.textContent = `${word} connection`;
}

/* ---------- connecting ---------- */
function start() {
  peer = new Peer(COOP_PEER_OPTS);
  const giveUp = setTimeout(() => {
    if (state === 'connecting')
      end(
        "Couldn't connect to your friend",
        'Make sure your friend is still on the friend code screen or in the game, then try again.',
      );
  }, 25000);
  peer.on('open', () => {
    conn = peer.connect(coopPeerId(cfg.code), {
      reliable: false,
      serialization: 'json',
      metadata: { proto: cfg.proto, name: cfg.name },
    });
    conn.on('open', () => {
      clearTimeout(giveUp);
      if (state === 'connecting') {
        state = 'waiting';
        card('sleepy', 'Connected!', 'Waiting for the picture from your friend…', true);
      }
      ping();
    });
    conn.on('data', onData);
    conn.on('close', () => {
      if (state !== 'ended')
        end('Lost the connection to your friend', 'Their game may have closed, or the internet dropped.');
    });
  });
  peer.on('call', c => {
    call = c;
    c.answer(undefined, { sdpTransform: coopTuneSdp });
    c.on('stream', s => {
      video.srcObject = s;
      video.play().catch(() => {});
      lowLatency(c.peerConnection);
    });
    const pc = c.peerConnection;
    pc.addEventListener('connectionstatechange', () => {
      if (pc.connectionState === 'failed')
        end(
          "Couldn't reach your friend's PC",
          'One of your internet connections is blocking a direct link. Try again, or try from a different network.',
        );
    });
  });
  peer.on('error', e => {
    clearTimeout(giveUp);
    if (e.type === 'peer-unavailable')
      end('No game with that code', 'No one is hosting with that code right now. Check the code with your friend.');
    else if (['network', 'server-error', 'socket-error', 'socket-closed'].includes(e.type) && state === 'connecting')
      end("Couldn't reach the internet", 'Check your connection and try again.');
    else console.warn('peer error', e.type, e.message);
  });
}
video.addEventListener('playing', () => {
  if (state === 'ended') return;
  state = 'playing';
  hideCard();
  showChip();
});
// Show frames as soon as they arrive instead of buffering for smoothness.
function lowLatency(pc) {
  for (const r of pc.getReceivers()) {
    try {
      r.playoutDelayHint = 0;
    } catch {}
    try {
      if ('jitterBufferTarget' in r) r.jitterBufferTarget = 0;
    } catch {}
  }
}
function onData(d) {
  if (!d || typeof d !== 'object') return;
  if (d.t === 'welcome') {
    player = d.player;
    if (!noPad) $('#chip-player').textContent = `Player ${player}`;
    $('#menu-title').textContent = d.title || '';
    if (state !== 'playing')
      card('happy', `You're Player ${player}`, `Getting ${d.title || 'the game'} on your screen…`, true);
  } else if (d.t === 'full')
    end(
      'That game is full',
      d.max === 1
        ? 'This game only has room for one friend, and someone already joined.'
        : `Every spot in this game is taken (${d.max || 3} friends).`,
    );
  else if (d.t === 'old')
    end(
      'Dustoff versions don’t match',
      'You and your friend need the same version of Dustoff. Update to the newest one.',
    );
  else if (d.t === 'bye') end('Your friend stopped the game', 'Thanks for playing!');
  else if (d.t === 'pong') {
    rtt = Math.round(performance.now() - d.at);
    drawNet();
  }
}
function ping() {
  if (state === 'ended' || !conn || !conn.open) return;
  try {
    conn.send({ t: 'ping', at: performance.now() });
  } catch {}
  setTimeout(ping, 2000);
}

/* ---------- controller ---------- */
let noPad = null;
coop.on('coop:pad', p => {
  if (!!p.none !== noPad) {
    noPad = !!p.none;
    $('#chip-player').textContent = noPad
      ? 'No controller found. Plug one in to play.'
      : player
        ? `Player ${player}`
        : 'Controller ready';
    if (state === 'playing') showChip();
  }
  const b = p.b || 0;
  const pressed = b & ~prevB;
  prevB = b;
  // Hold View + Menu for the menu (same as when playing alone).
  const combo = b & X.BACK && b & X.START;
  if (combo) {
    if (!comboSince) comboSince = performance.now();
    else if (comboSince > 0 && performance.now() - comboSince > 700) {
      comboSince = -1;
      menuOpen ? closeMenu() : openMenu();
    }
  } else comboSince = 0;

  if (state === 'ended') {
    if (pressed & X.A) coop.leave();
    return;
  }
  if (menuOpen) {
    if (pressed & X.UP || pressed & X.DOWN) {
      menuSel = 1 - menuSel;
      drawMenu();
    }
    if (pressed & X.A) menuSel === 0 ? closeMenu() : coop.leave();
    if (pressed & X.B) closeMenu();
  }
  if (!conn || !conn.open) return;
  // While the menu is open, or while holding the menu combo, the game sees nothing pressed.
  const s = menuOpen
    ? COOP_NEUTRAL
    : [combo ? b & ~(X.BACK | X.START) : b, p.lt | 0, p.rt | 0, p.lx | 0, p.ly | 0, p.rx | 0, p.ry | 0];
  try {
    conn.send({ t: 'pad', q: ++seq, s });
  } catch {}
});

/* ---------- menu ---------- */
function openMenu() {
  if (state === 'ended') return;
  menuOpen = true;
  menuSel = 0;
  drawMenu();
  $('#menu').hidden = false;
}
function closeMenu() {
  menuOpen = false;
  $('#menu').hidden = true;
  if (state === 'playing') showChip();
}
function drawMenu() {
  document.querySelectorAll('#menu li').forEach((li, i) => li.classList.toggle('sel', i === menuSel));
}
$('#menu-list').addEventListener('click', e => {
  const li = e.target.closest('li');
  if (!li) return;
  if (li.dataset.i === '0') closeMenu();
  else coop.leave();
});
$('#card-btns').addEventListener('click', () => coop.leave());
addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    e.preventDefault();
    if (state === 'ended') coop.leave();
    else menuOpen ? closeMenu() : openMenu();
  } else if (e.key === 'Enter' && state === 'ended') coop.leave();
  else if (menuOpen && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
    menuSel = 1 - menuSel;
    drawMenu();
  } else if (menuOpen && e.key === 'Enter') menuSel === 0 ? closeMenu() : coop.leave();
});
// Show the mouse pointer only while it moves.
let cursorTimer = null;
addEventListener('mousemove', () => {
  document.body.classList.remove('hidecursor');
  clearTimeout(cursorTimer);
  cursorTimer = setTimeout(() => document.body.classList.add('hidecursor'), 2000);
});
