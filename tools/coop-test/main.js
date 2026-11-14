// End-to-end test for "Play with a friend": runs the real host and guest pages on this PC,
// connects them through the internet code server, streams a test animation, and sends
// controller input back. Run: app\node_modules\electron\dist\electron.exe tools\coop-test
const path = require('path');
const { app, BrowserWindow, session, desktopCapturer } = require('electron');

const COOP = path.join(__dirname, '..', '..', 'app', 'coop');
const ABC = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const code = Array.from({ length: 6 }, () => ABC[(Math.random() * ABC.length) | 0]).join('');
const results = {};
const t0 = Date.now();
const log = (...a) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s]`, ...a);
const fail = msg => {
  console.log('FAIL', msg);
  console.log(JSON.stringify(results, null, 2));
  app.exit(1);
};
setTimeout(() => fail('timed out after 60s'), 60000);

app.whenReady().then(async () => {
  // A stand-in for the game window: a moving color animation with a beep.
  const game = new BrowserWindow({ x: 0, y: 0, width: 480, height: 270, frame: false, show: true });
  await game.loadURL(
    'data:text/html,' +
      encodeURIComponent(
        `<body style="margin:0;background:#000"><canvas id=c width=480 height=270></canvas><script>
        let t=0;const x=c.getContext('2d');(function f(){x.fillStyle='hsl('+(t++%360)+',80%,50%)';x.fillRect(0,0,480,270);
        x.fillStyle='#fff';x.font='40px sans-serif';x.fillText('frame '+t,20,140);requestAnimationFrame(f)})();</script></body>`,
      ),
  );
  const hwnd = String(game.getNativeWindowHandle().readUInt32LE(0));

  const ses = session.fromPartition('coop-test-host');
  ses.setDisplayMediaRequestHandler(async (_r, cb) => {
    const sources = await desktopCapturer.getSources({ types: ['window'], thumbnailSize: { width: 0, height: 0 } });
    const src = sources.find(s => s.id.split(':')[1] === hwnd);
    results.sourceFound = !!src;
    cb(src ? { video: src, audio: 'loopback' } : {});
  });
  const web = extra =>
    Object.assign(
      { preload: path.join(COOP, 'preload.js'), contextIsolation: true, sandbox: false, backgroundThrottling: false },
      extra,
    );
  const host = new BrowserWindow({ show: false, webPreferences: web({ partition: 'coop-test-host' }) });
  const guest = new BrowserWindow({
    x: 0,
    y: 300,
    width: 480,
    height: 300,
    show: true,
    webPreferences: web({ autoplayPolicy: 'no-user-gesture-required' }),
  });

  let padSentAt = 0;
  host.webContents.ipc.on('coop:ready', () => {
    log('host got its code', code);
    results.hostReady = true;
    host.webContents.send('coop:capture');
    guest.loadFile(path.join(COOP, 'guest.html'));
  });
  host.webContents.ipc.on('coop:error', (_e, k) => fail('host error ' + k));
  host.webContents.ipc.on('coop:joined', (_e, slot, name) => {
    log('friend joined', slot, name);
    results.joined = { slot, name };
  });
  host.webContents.ipc.on('coop:pad', (_e, slot, st) => {
    if (st.b === 0x1000 && st.lt === 128 && !results.padOk) {
      results.padOk = true;
      results.padSlot = slot;
      results.padLatencyMs = Date.now() - padSentAt;
      log('host received the guest controller', JSON.stringify(st), results.padLatencyMs + 'ms');
    }
  });
  guest.webContents.once('did-finish-load', () =>
    guest.webContents.send('coop:init', { code, show: code, name: 'Tester', proto: 1 }),
  );
  host.webContents.once('did-finish-load', () =>
    host.webContents.send('coop:init', { code, title: 'Test Game', proto: 1 }),
  );
  host.loadFile(path.join(COOP, 'host.html'));

  // Wait until the guest is showing moving video, then test the controller and read stats.
  const poll = setInterval(async () => {
    const s = await guest.webContents
      .executeJavaScript(
        `({ title: document.querySelector('#card-title').textContent, w: video.videoWidth, h: video.videoHeight,
            ready: video.readyState, t: video.currentTime, tracks: video.srcObject ? video.srcObject.getTracks().map(t => t.kind) : [] })`,
      )
      .catch(() => null);
    if (!s) return;
    if (/couldn|no game|lost|full|match/i.test(s.title)) fail('guest says: ' + s.title);
    if (s.w > 0 && s.ready >= 2 && s.t > 1 && !results.video) {
      results.video = { width: s.w, height: s.h, tracks: s.tracks };
      log('guest is showing video', s.w + 'x' + s.h, 'tracks', s.tracks.join('+'));
      padSentAt = Date.now();
      guest.webContents.send('coop:pad', { b: 0x1000, lt: 128, rt: 0, lx: 1000, ly: -1000, rx: 0, ry: 0 });
      setTimeout(async () => {
        results.stats = await guest.webContents.executeJavaScript(`(async () => {
          const st = await call.peerConnection.getStats(); const out = {};
          st.forEach(r => {
            if (r.type === 'inbound-rtp' && r.kind === 'video') Object.assign(out, { fps: r.framesPerSecond, decoded: r.framesDecoded, jitterBufferMs: r.jitterBufferEmittedCount ? Math.round(1000 * r.jitterBufferDelay / r.jitterBufferEmittedCount) : null, codecId: r.codecId });
            if (r.type === 'inbound-rtp' && r.kind === 'audio') out.audioPackets = r.packetsReceived;
            if (r.type === 'candidate-pair' && r.state === 'succeeded' && r.nominated) out.rttMs = Math.round(1000 * (r.currentRoundTripTime || 0));
          });
          st.forEach(r => { if (r.id === out.codecId) out.codec = r.mimeType; });
          out.chip = document.querySelector('#chip-player').textContent;
          return out; })()`);
        clearInterval(poll);
        const ok = results.hostReady && results.joined && results.video && results.padOk;
        console.log(ok ? 'PASS' : 'FAIL', JSON.stringify(results, null, 2));
        app.exit(ok ? 0 : 1);
      }, 2500);
    }
  }, 300);
});
