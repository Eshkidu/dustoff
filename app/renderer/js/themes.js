/* Dustoff themes. Each one restyles Home (its own layout) and recolors the rest of the app.
   All are original designs inspired by how each console era felt: no Nintendo logos, menus or sounds.
   home(L, c) returns the Home screen for game list L; detail(g, c) is the part that changes with the
   selected game (it lives in #thdetail). c = helpers from app.js (art, esc, tags, meta, attr, sel, now, preview). */
(function () {
  const ICON = {
    home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"><path d="M3 11l9-7 9 7v9H5v-9"/></svg>',
    mail: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"><rect x="3" y="6" width="18" height="12" rx="2"/><path d="M3 8l9 6 9-6"/></svg>',
    gear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="12" cy="12" r="3.5"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/></svg>',
    lib: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"><rect x="3" y="4" width="7" height="7" rx="1.5"/><rect x="14" y="4" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>',
    brush:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"><path d="M14 4l6 6-8 8H6v-6z"/><path d="M11 7l6 6"/></svg>',
    plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  };
  // Shelf theme: box sizes per system in prototype pixels (w = cover width, h = height, d = spine
  // thickness). Cardboard boxes for the cartridge systems, plastic cases for disc and card systems.
  const SH_BOX = {
    nes: { w: 120, h: 168, d: 34, k: 'cb' },
    gb: { w: 104, h: 108, d: 26, k: 'cb' },
    gbc: { w: 104, h: 108, d: 26, k: 'cb' },
    snes: { w: 172, h: 124, d: 40, k: 'cb' },
    n64: { w: 172, h: 124, d: 40, k: 'cb' },
    gba: { w: 104, h: 108, d: 26, k: 'cb' },
    gc: { w: 124, h: 166, d: 24, k: 'case' },
    wii: { w: 118, h: 166, d: 21, k: 'case' },
    wiiu: { w: 118, h: 148, d: 21, k: 'case' },
    switch: { w: 100, h: 160, d: 17, k: 'case' },
  };
  const SH_SHORT = {
    nes: 'NES',
    gb: 'GB',
    gbc: 'GBC',
    snes: 'SNES',
    n64: 'N64',
    gba: 'GBA',
    gc: 'GC',
    wii: 'Wii',
    wiiu: 'Wii U',
    switch: 'Switch',
  };
  function shSpine(g, c, i) {
    const B = SH_BOX[g.sys] || SH_BOX.wii,
      src = c.artSrc(g);
    return /* HTML */ `<button
      class="th-tile sh-box k-${B.k} sb-${SH_BOX[g.sys] ? g.sys : 'new'}${c.sel(i)}"
      ${c.attr(g)}
      style="--w:${B.w};--h:${B.h};--d:${B.d};--hue:${c.hue(g)}"
      aria-label="${c.esc(g.title)}"
    >
      <span class="sh-cube"
        ><span class="sh-spine"
          >${src ? `<img class="sh-sbg" src="${src}" alt="" draggable="false" />` : ''}<span class="sh-band"
            >${SH_SHORT[g.sys] || 'New'}</span
          ><span class="sh-t">${c.esc(g.title)}</span><i class="sh-dot"></i></span
        ><span class="sh-face">${c.art(g)}${c.tags(g)}</span></span
      >
    </button>`;
  }
  // Shelf sounds: built from filtered noise and soft tones so they feel like cardboard, plastic
  // cases and console clicks rather than beeps. opt.dur sets how long the disc spin-up lasts.
  let shNoise = null;
  function shelfSound(kind, ac, opt = {}) {
    if (!shNoise || shNoise.sampleRate !== ac.sampleRate) {
      shNoise = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
      const d = shNoise.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    const T = ac.currentTime + 0.005,
      vary = () => 0.92 + Math.random() * 0.16;
    const hit = (at, dur, freq, gain, type = 'bandpass', q = 1, sweep) => {
      const s = ac.createBufferSource(),
        f = ac.createBiquadFilter(),
        g = ac.createGain(),
        t = T + at;
      s.buffer = shNoise;
      f.type = type;
      f.Q.value = q;
      f.frequency.setValueAtTime(freq, t);
      if (sweep) f.frequency.exponentialRampToValueAtTime(sweep, t + dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(gain, t + Math.min(0.006, dur / 4));
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      s.connect(f).connect(g).connect(ac.destination);
      s.start(t, Math.random() * 0.4, dur + 0.05);
    };
    const tone = (at, freq, dur, gain, type = 'sine', to) => {
      const o = ac.createOscillator(),
        g = ac.createGain(),
        t = T + at;
      o.type = type;
      o.frequency.setValueAtTime(freq, t);
      if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(gain, t + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(ac.destination);
      o.start(t);
      o.stop(t + dur + 0.05);
    };
    const clack = (at, v = 1) => {
      hit(at, 0.035, 3000 * vary(), 0.32 * v, 'bandpass', 1.4);
      hit(at + 0.05, 0.045, 1700 * vary(), 0.24 * v, 'bandpass', 1.2);
      tone(at, 230 * vary(), 0.06, 0.05 * v, 'triangle');
    };
    switch (kind) {
      case 'move': // a case sliding a little way out of the shelf
        hit(0, 0.07, 900 * vary(), 0.11, 'bandpass', 0.7, 2200);
        tone(0, 150 * vary(), 0.06, 0.05);
        break;
      case 'select':
        clack(0, 0.8);
        break;
      case 'toggle':
        hit(0, 0.025, 4200, 0.2, 'bandpass', 2);
        tone(0, 1250, 0.035, 0.025);
        break;
      case 'back':
      case 'close':
        clack(0, 0.9);
        hit(0.04, 0.09, 420, 0.25, 'lowpass', 0.7);
        tone(0.04, 120, 0.1, 0.12, 'sine', 80);
        break;
      case 'open': // pulled off the shelf, then the lid snaps open
        hit(0, 0.32, 600, 0.12, 'lowpass', 0.8, 2400);
        clack(0.62, 1);
        break;
      case 'spin': {
        // disc drive spinning up: a rising motor hum plus air hiss
        const dur = opt.dur || 2,
          o = ac.createOscillator(),
          f = ac.createBiquadFilter(),
          g = ac.createGain();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(45, T);
        o.frequency.exponentialRampToValueAtTime(330, T + dur);
        f.type = 'lowpass';
        f.frequency.setValueAtTime(260, T);
        f.frequency.exponentialRampToValueAtTime(1500, T + dur);
        g.gain.setValueAtTime(0.0001, T);
        g.gain.exponentialRampToValueAtTime(0.045, T + 0.35);
        g.gain.setValueAtTime(0.045, T + dur - 0.1);
        g.gain.exponentialRampToValueAtTime(0.0001, T + dur + 0.35);
        o.connect(f).connect(g).connect(ac.destination);
        o.start(T);
        o.stop(T + dur + 0.4);
        hit(0, Math.min(dur + 0.3, 0.95), 500, 0.05, 'bandpass', 0.6, 4000);
        tone(0, 1800, 0.05, 0.02); // laser seek ticks
        tone(dur * 0.45, 2100, 0.04, 0.02);
        break;
      }
      case 'insert': // cartridge or card seating into the slot
        hit(0, 0.1, 520, 0.4, 'lowpass', 0.8);
        tone(0, 88, 0.18, 0.3, 'sine', 60);
        hit(0.09, 0.025, 2600, 0.18, 'bandpass', 2);
        break;
      case 'power':
      case 'start':
        hit(0, 0.02, 3500, 0.16, 'bandpass', 2);
        tone(0.04, 523.25, 0.16, 0.06);
        tone(0.13, 783.99, 0.34, 0.06);
        tone(0.13, 1567.98, 0.25, 0.012);
        break;
      case 'error':
        hit(0, 0.08, 300, 0.3, 'lowpass');
        hit(0.13, 0.1, 260, 0.3, 'lowpass');
        tone(0, 110, 0.1, 0.05, 'triangle');
        tone(0.13, 98, 0.14, 0.05, 'triangle');
        break;
      default:
        tone(0, 520, 0.05, 0.05);
    }
  }
  const BLK = ['#e4202e', '#f5c400', '#1aa84a', '#2156d6'];
  const empties = (n, cols, min) => Math.max(min, Math.ceil(n / cols) * cols) - n;
  const wrap = (id, inner) => /* HTML */ `<div class="d th th-${id}"><div class="th-box">${inner}</div></div>`;
  const tile = (c, g, i, cls, inner) =>
    /* HTML */ `<button class="th-tile ${cls}${c.sel(i)}" ${c.attr(g)}>${inner}</button>`;
  const clock = c => /* HTML */ `<span data-clock="t">${c.now().time}</span>`;
  // Channels: pages of 4 x 3 tiles that always fit the screen. Down goes straight down; right from the
  // last column slides to the next page (like the Wii menu), so the grid never scrolls up and down.
  const chPages = (L, c) => {
    const pages = [];
    for (let p = 0; p === 0 || p * 12 < L.length; p++) {
      const part = L.slice(p * 12, p * 12 + 12);
      pages.push(
        `<div class="ch-page">${part.map((g, i) => tile(c, g, p * 12 + i, 'ch-tile', c.art(g) + c.tags(g))).join('')}${'<div class="ch-tile ch-empty"></div>'.repeat(12 - part.length)}</div>`,
      );
    }
    const arrows =
      pages.length > 1
        ? '<span class="ch-arrow l" aria-hidden="true"></span><span class="ch-arrow r" aria-hidden="true"></span>'
        : '';
    return `<div class="ch-pages">${pages.join('')}</div>${arrows}`;
  };

  const THEMES = [
    {
      id: 'shelf',
      name: 'Shelf',
      era: 'Default',
      sw: ['#1c3231', '#7a4a2a', '#e0ab4a', '#f2e9d8'],
      desc: 'Every system gets its own wooden shelf with your games standing spine-out. Pick one and its case slides out and opens, then the disc spins up or the cartridge clicks into the console.',
      chips: [
        ['Layout', 'A shelf per system'],
        ['Font', 'Manrope'],
        ['Motion', 'Cases open, discs spin'],
        ['Sound', 'Cardboard, plastic, clicks'],
      ],
      sfx: ['sine', 520, 0.05],
      sound: shelfSound,
      home(L, c) {
        const groups = new Map();
        for (const g of L) {
          const k = g.pending && !SH_BOX[g.sys] ? 'new' : g.sys;
          if (!groups.has(k)) groups.set(k, []);
          groups.get(k).push(g);
        }
        const order = ['new', 'nes', 'gb', 'gbc', 'snes', 'n64', 'gba', 'gc', 'wii', 'wiiu', 'switch'];
        const keys = [...groups.keys()].sort((a, b) => order.indexOf(a) - order.indexOf(b));
        let i = 0,
          first = null;
        const shelves = keys
          .map(k => {
            const games = groups
              .get(k)
              .slice()
              .sort((a, b) => (a.pending ? -1 : b.pending ? 1 : a.title.localeCompare(b.title)));
            first = first || games[0];
            // Room the cubby needs so a picked case can turn out without the shelf changing size.
            const bs = games.map(g => SH_BOX[g.sys] || SH_BOX.wii),
              need = bs.reduce((n, b) => n + b.d + 3, 0) + Math.max(...bs.map(b => b.w - b.d)) + 24 + 16 + 36;
            const name = k === 'new' ? 'Being added' : c.sysName(games[0]);
            return /* HTML */ `<section class="sh-shelf" style="--need:${need}">
              <div class="sh-head">
                <span class="sh-plaque"
                  >${c.esc(name)}<small>${games.length} game${games.length === 1 ? '' : 's'}</small></span
                >
              </div>
              <div class="sh-row th-scroll">
                ${games.map(g => shSpine(g, c, i++)).join('')}<span class="sh-end" aria-hidden="true"></span>
              </div>
              <div class="sh-plank" aria-hidden="true"></div>
            </section>`;
          })
          .join('');
        return wrap(
          'shelf',
          /* HTML */ `<div class="sh">
            <div class="sh-top" id="thdetail">${this.detail(first, c)}</div>
            <div class="sh-shelves th-scroll">${shelves}</div>
          </div>`,
        );
      },
      detail(g, c) {
        return g ? `<b>${c.esc(g.title)}</b><small>${c.esc(c.meta(g))}</small>` : '';
      },
    },

    {
      id: 'channels',
      name: 'Channels',
      era: 'Wii era',
      sw: ['#f4f5f7', '#c9cdd4', '#4fc3f0', '#8f959d'],
      desc: 'A calm grid of rounded TV-style tiles on soft pinstripes, a glowing outline on the one you pick, and a big clock along the bottom.',
      chips: [
        ['Layout', '4-wide tile grid'],
        ['Font', 'Nunito'],
        ['Motion', 'Pulsing glow'],
        ['Sound', 'Bright chime'],
      ],
      sfx: ['triangle', 1320, 0.09],
      home(L, c) {
        const t = c.now();
        return wrap(
          'channels',
          /* HTML */ `<div class="ch">
            <div class="ch-grid">${chPages(L, c)}</div>
            <div class="ch-bar">
              <span class="ch-btn">${ICON.home}</span>
              <div class="ch-mid">
                <div class="ch-name" id="thdetail">${this.detail(L[0], c)}</div>
                <div class="ch-clock">${clock(c)}<small data-clock="d">${t.date}</small></div>
              </div>
              <span class="ch-btn r">${ICON.mail}</span>
            </div>
          </div>`,
        );
      },
      detail(g, c) {
        return g ? `${c.esc(g.title)}<em>${c.esc(c.meta(g))}</em>` : '';
      },
    },

    {
      id: 'homerow',
      name: 'Home Row',
      era: 'Switch era',
      sw: ['#2d2f34', '#3e4148', '#3fd0e2', '#f2f3f5'],
      desc: 'One clean row of big square tiles with a bright outline, a player badge up top and round shortcut buttons below.',
      chips: [
        ['Layout', 'Single row'],
        ['Font', 'Figtree'],
        ['Motion', 'Glowing outline'],
        ['Sound', 'Crisp click'],
      ],
      sfx: ['square', 880, 0.03],
      home(L, c) {
        const btn = c.preview ? 'tabindex="-1"' : 'data-f';
        return wrap(
          'homerow',
          /* HTML */ `<div class="hr">
            <div class="hr-top">
              <button class="hr-me" ${c.preview ? 'tabindex="-1"' : 'data-f'} data-act="profile" title="Edit profile">
                <i style="${c.profile().avatar}"></i><span>${c.esc(c.profile().name)}</span></button
              ><span class="hr-st">${clock(c)}<span class="bat"></span></span>
            </div>
            <div class="hr-title" id="thdetail">${this.detail(L[0], c)}</div>
            <div class="hr-row th-scroll">
              ${L.map((g, i) => tile(c, g, i, 'hr-tile', c.art(g) + c.tags(g))).join('')}
            </div>
            <div class="hr-icons">
              ${[
                ['library', 'lib', 'Library'],
                ['settings', 'gear', 'Settings'],
                ['theme', 'brush', 'Theme'],
                ['add', 'plus', 'Add games'],
              ]
                .map(
                  ([a, ic, l]) =>
                    /* HTML */ `<button class="hr-ic" ${btn} data-act="${a}" title="${l}" aria-label="${l}">
                      ${ICON[ic]}
                    </button>`,
                )
                .join('')}
            </div>
            <div class="hr-foot">
              <span><b>B</b>Back</span><span><b>A</b>Start</span>
            </div>
          </div>`,
        );
      },
      detail(g, c) {
        return g ? `${c.esc(g.title)}<small>${c.esc(c.meta(g))}</small>` : '';
      },
    },

    {
      id: 'cube',
      name: 'Cube',
      era: 'GameCube era',
      sw: ['#0d0626', '#2a1873', '#7a55ff', '#b493ff'],
      desc: 'Deep purple space, a spinning cube that shows the game you picked, and a menu of glowing slanted bars.',
      chips: [
        ['Layout', 'Menu list + 3D cube'],
        ['Font', 'Chakra Petch'],
        ['Motion', 'Spinning cube'],
        ['Sound', 'Low synth swoosh'],
      ],
      sfx: ['sawtooth', 220, 0.12],
      home(L, c) {
        const deco = [
          [44, 6, 0],
          [92, 10, 2],
          [84, 82, 4],
          [52, 90, 1],
          [96, 50, 3],
        ]
          .map(([x, y, d]) => /* HTML */ `<i class="cb-deco" style="left:${x}%;top:${y}%;animation-delay:-${d}s"></i>`)
          .join('');
        return wrap(
          'cube',
          /* HTML */ `<div class="cb">
            ${deco}
            <div class="cb-list th-scroll">${L.map((g, i) => tile(c, g, i, 'cb-item', c.esc(g.title))).join('')}</div>
            <div class="cb-stage" id="thdetail">${this.detail(L[0], c)}</div>
          </div>`,
        );
      },
      detail(g, c) {
        return g
          ? /* HTML */ `<div class="cube">
                ${[1, 2, 3, 4, 5, 6].map(n => /* HTML */ `<div class="face f${n}">${c.art(g)}</div>`).join('')}
              </div>
              <div class="cb-cap"><b>${c.esc(g.title)}</b><span>${c.esc(c.meta(g))}</span></div>`
          : '';
      },
    },

    {
      id: 'plaza',
      name: 'Plaza',
      era: 'Wii U era',
      sw: ['#f6f7f9', '#dff4fb', '#2fb9ec', '#7e8792'],
      desc: 'Bright and friendly: white cards on a dotted background, with bubbles drifting along the top showing what you played lately.',
      chips: [
        ['Layout', '5-wide card grid'],
        ['Font', 'M PLUS Rounded'],
        ['Motion', 'Drifting bubbles'],
        ['Sound', 'Bubbly pop'],
      ],
      sfx: ['sine', 990, 0.07],
      home(L, c) {
        const bub = L.slice(0, 5)
          .map((g, k) => {
            const [x, y, d] = [
              [3, 20, 0],
              [26, 54, 2],
              [52, 16, 4],
              [72, 56, 1],
              [80, 12, 3],
            ][k];
            return /* HTML */ `<span class="pz-bub" style="left:${x}%;top:${y}%;animation-delay:-${d}s"
              ><i>${c.art(g)}</i>${c.esc(g.title.length > 24 ? g.title.slice(0, 23) + '…' : g.title)}</span
            >`;
          })
          .join('');
        return wrap(
          'plaza',
          /* HTML */ `<div class="pz">
            <div class="pz-top">
              <span class="ic"><i></i><i></i><i></i></span
              ><span class="pz-name" id="thdetail">${this.detail(L[0], c)}</span><b>${clock(c)}</b>
            </div>
            <div class="pz-band">${bub}</div>
            <div class="pz-grid th-scroll">
              ${L.map((g, i) => tile(c, g, i, 'pz-tile', c.art(g) + c.tags(g))).join('')}${'<div class="pz-tile empty"></div>'.repeat(empties(L.length, 5, 10))}
            </div>
          </div>`,
        );
      },
      detail(g, c) {
        return g ? c.esc(g.title) : '';
      },
    },

    {
      id: 'pocket',
      name: 'Pocket',
      era: 'Game Boy era',
      sw: ['#9bbc0f', '#8bac0f', '#306230', '#0f380f'],
      desc: 'Four shades of green, chunky pixel letters and a blinking arrow, like a handheld screen from 1989.',
      chips: [
        ['Layout', 'Text list'],
        ['Font', 'Press Start 2P'],
        ['Motion', 'Blinking cursor'],
        ['Sound', 'Square-wave beep'],
      ],
      sfx: ['square', 523, 0.06],
      home(L, c) {
        return wrap(
          'pocket',
          /* HTML */ `<div class="pk">
            <div class="pk-head"><span>SELECT GAME</span><span>${L.length} GAME${L.length === 1 ? '' : 'S'}</span></div>
            <div class="pk-body">
              <div class="pk-list th-scroll">
                ${L.map((g, i) => tile(c, g, i, 'pk-item', /* HTML */ `<i>&#9654;</i><span>${c.esc(g.title.toUpperCase())}</span>`)).join('')}
              </div>
              <div class="pk-side" id="thdetail">${this.detail(L[0], c)}</div>
            </div>
            <div class="pk-foot"><span>A:START</span><span>B:BACK</span><span>Y:LIBRARY</span></div>
          </div>`,
        );
      },
      detail(g, c) {
        return g
          ? /* HTML */ `<div class="pk-art">${c.art(g)}</div>
              <p>${c.esc(c.meta(g).toUpperCase())}</p>`
          : '';
      },
    },

    {
      id: 'brick',
      name: 'Brick',
      era: 'NES era',
      sw: ['#c8c8c8', '#8e8e91', '#161616', '#d8262f'],
      desc: 'Gray plastic, black stripes and red lettering. Your games sit in a row like cartridges and the one you pick pops up.',
      chips: [
        ['Layout', 'Cartridge row'],
        ['Font', 'Silkscreen'],
        ['Motion', 'Cartridge lifts'],
        ['Sound', 'Chunky blip'],
      ],
      sfx: ['square', 330, 0.05],
      home(L, c) {
        return wrap(
          'brick',
          /* HTML */ `<div class="bk">
            <div class="bk-top">SELECT A GAME</div>
            <div class="bk-row th-scroll">
              ${L.map((g, i) => tile(c, g, i, 'cart', c.art(g) + '<i class="bk-ptr">&#9650;</i>')).join('')}
            </div>
            <div class="bk-bot" id="thdetail">${this.detail(L[0], c)}</div>
          </div>`,
        );
      },
      detail(g, c) {
        return g
          ? /* HTML */ `<b>${c.esc(g.title.toUpperCase())}</b
              ><span>${c.esc(c.sysName(g).toUpperCase())} · PUSH START</span>`
          : '';
      },
    },

    {
      id: 'super',
      name: 'Super',
      era: 'SNES era',
      sw: ['#e7e4f0', '#b8b1d6', '#5d4fae', '#e0303a'],
      desc: 'Light gray and lavender with four colored dots, soft concave tiles and purple buttons along the bottom.',
      chips: [
        ['Layout', '4-wide tile grid'],
        ['Font', 'Fredoka'],
        ['Motion', 'Tiles press up'],
        ['Sound', 'Warm two-note'],
      ],
      sfx: ['triangle', 784, 0.08],
      home(L, c) {
        return wrap(
          'super',
          /* HTML */ `<div class="su">
            <div class="su-top">
              <b id="thdetail">${this.detail(L[0], c)}</b
              ><span class="su-dots"
                ><i style="background:#2c9a52"></i><i style="background:#2f58c8"></i><i style="background:#e9b31c"></i
                ><i style="background:#d7303a"></i
              ></span>
            </div>
            <div class="su-grid th-scroll">
              ${L.map((g, i) =>
                tile(
                  c,
                  g,
                  i,
                  'su-tile',
                  /* HTML */ `<span class="su-art">${c.art(g)}${c.tags(g)}</span>
                    <p>${c.esc(g.title)}</p>`,
                ),
              ).join('')}
            </div>
            <div class="su-bot"><span>Y Library</span><span>B Back</span><span>A Play</span></div>
          </div>`,
        );
      },
      detail(g, c) {
        return g ? c.esc(c.meta(g)) : '';
      },
    },

    {
      id: 'sixtyfour',
      name: 'Sixty-Four',
      era: 'N64 era',
      sw: ['#09090f', '#e4202e', '#f5c400', '#1aa84a'],
      desc: 'Bold primary-color blocks floating over a 3D grid floor, with a big chunky title that shows off its depth.',
      chips: [
        ['Layout', '3D block row'],
        ['Font', 'Bungee'],
        ['Motion', 'Blocks tilt toward you'],
        ['Sound', 'Bouncy boing'],
      ],
      sfx: ['sine', 330, 0.12, 660],
      home(L, c) {
        return wrap(
          'sixtyfour',
          /* HTML */ `<div class="sx">
            <div class="sx-floor"></div>
            <div class="sx-title" id="thdetail">${this.detail(L[0], c)}</div>
            <div class="sx-row th-scroll">
              ${L.map((g, i) => tile(c, g, i, 'blk', c.art(g)).replace('class="th-tile', `style="--c:${BLK[i % 4]}" class="th-tile`)).join('')}
            </div>
            <div class="sx-bot">
              <span><i style="background:#2156d6"></i>A START</span><span><i style="background:#1aa84a"></i>B BACK</span
              ><span><i style="background:#f5c400"></i>Y LIBRARY</span>
            </div>
          </div>`,
        );
      },
      detail(g, c) {
        return g ? `${c.esc(g.title)}<small>${c.esc(c.meta(g))}</small>` : '';
      },
    },

    {
      id: 'dual',
      name: 'Two Screens',
      era: 'DS / 3DS era',
      sw: ['#f4f5f7', '#2e3238', '#29a8e0', '#11141a'],
      desc: 'A clamshell layout: the game you pick fills the top screen, and every game sits as a small icon on the bottom one.',
      chips: [
        ['Layout', 'Top + bottom screen'],
        ['Font', 'Varela Round'],
        ['Motion', 'Icon zoom'],
        ['Sound', 'Light tap'],
      ],
      sfx: ['sine', 1175, 0.04],
      home(L, c) {
        return wrap(
          'dual',
          /* HTML */ `<div class="ds">
            <div class="ds-scr ds-up" id="thdetail">${this.detail(L[0], c)}</div>
            <div class="ds-hinge"></div>
            <div class="ds-scr ds-low th-scroll">
              ${L.map((g, i) => tile(c, g, i, 'ds-ic', c.art(g) + c.tags(g))).join('')}
            </div>
          </div>`,
        );
      },
      detail(g, c) {
        return g ? `${c.art(g)}<div><b>${c.esc(g.title)}</b><small>${c.esc(c.meta(g))}</small></div>` : '';
      },
    },
  ];

  // Interface sounds made on the fly from each theme's base tone (original tones, no recordings).
  // Each kind is a list of notes: [pitch multiplier, start delay (s), length (s)].
  const KINDS = {
    move: [[1, 0, 0]],
    select: [
      [1, 0, 0.05],
      [1.5, 0.06, 0.09],
    ],
    back: [
      [1.2, 0, 0.05],
      [0.8, 0.06, 0.09],
    ],
    toggle: [[1.26, 0, 0.07]],
    start: [
      [1, 0, 0.07],
      [1.26, 0.08, 0.07],
      [1.5, 0.16, 0.16],
    ],
    error: [
      [0.6, 0, 0.1],
      [0.55, 0.12, 0.16],
    ],
  };
  let actx = null,
    lastMove = 0;
  function sfx(theme, kind = 'move', opt) {
    try {
      const now = performance.now();
      if (kind === 'move') {
        if (now - lastMove < 35) return;
        lastMove = now;
      }
      actx = actx || new AudioContext();
      if (actx.state === 'suspended') actx.resume();
      if (theme.sound) return theme.sound(kind, actx, opt);
      const [type, f, d, f2] = theme.sfx,
        peak = type === 'square' || type === 'sawtooth' ? 0.035 : 0.09;
      for (const [mul, delay, len] of KINDS[kind] || KINDS.move) {
        const o = actx.createOscillator(),
          g = actx.createGain(),
          t0 = actx.currentTime + delay,
          dur = len || d;
        o.type = type;
        o.frequency.setValueAtTime(f * mul, t0);
        if (f2 && kind === 'move') o.frequency.exponentialRampToValueAtTime(f2, t0 + dur);
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(peak, t0 + 0.008);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur + 0.07);
        o.connect(g).connect(actx.destination);
        o.start(t0);
        o.stop(t0 + dur + 0.1);
      }
    } catch (e) {}
  }
  const beep = (theme, big) => sfx(theme, big ? 'start' : 'move');

  window.HubThemes = {
    list: THEMES,
    get: id => THEMES.find(t => t.id === id) || THEMES[0],
    sfx,
    beep,
    shelfBox: s => SH_BOX[s] || SH_BOX.wii,
  };
})();
