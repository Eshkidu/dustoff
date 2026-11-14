/* Shared by host.js and guest.js: connection settings and stream tuning. */
// Public STUN servers let the two PCs find a direct path to each other. No game data goes through them.
const COOP_PEER_OPTS = {
  debug: 1,
  config: {
    iceServers: [
      { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
      { urls: 'stun:stun.cloudflare.com:3478' },
    ],
  },
};
const coopPeerId = code => 'dustoff-v1-' + String(code).toLowerCase();
const COOP_NEUTRAL = [0, 0, 0, 0, 0, 0, 0];

// Prefer H.264 for video (graphics cards can encode it with almost no cost) and send stereo game sound.
function coopTuneSdp(sdp) {
  const lines = sdp.split('\r\n');
  const mIdx = lines.findIndex(l => l.startsWith('m=video'));
  if (mIdx >= 0) {
    const h264 = [];
    for (const l of lines) {
      const m = l.match(/^a=rtpmap:(\d+) H264\/90000/i);
      if (m) h264.push(m[1]);
    }
    const rtx = [];
    for (const l of lines) {
      const m = l.match(/^a=fmtp:(\d+) apt=(\d+)/);
      if (m && h264.includes(m[2])) rtx.push(m[1]);
    }
    const want = [...h264, ...rtx];
    if (want.length) {
      const parts = lines[mIdx].split(' ');
      const head = parts.slice(0, 3),
        pts = parts.slice(3);
      lines[mIdx] = [...head, ...want.filter(p => pts.includes(p)), ...pts.filter(p => !want.includes(p))].join(' ');
    }
  }
  let opus = null;
  for (const l of lines) {
    const m = l.match(/^a=rtpmap:(\d+) opus\/48000/i);
    if (m) opus = m[1];
  }
  if (opus) {
    const i = lines.findIndex(l => l.startsWith(`a=fmtp:${opus} `));
    if (i >= 0 && !/stereo=1/.test(lines[i])) lines[i] += ';stereo=1;sprop-stereo=1;maxaveragebitrate=160000';
  }
  return lines.join('\r\n');
}
