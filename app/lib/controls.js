// Button mapping: one definition per system, saved in the library, and written
// into each emulator's own config right before a game starts.
const fs = require('fs');
const path = require('path');
const { P, ryuData } = require('./store');

/* ---------- Xbox inputs ---------- */
// ra = RetroArch xinput bind, dol = Dolphin expression, cemu = Cemu XInput code, ryu = Ryubing gamepad name.
const INPUTS = {
  a: { label: 'A', ra: { btn: '0' }, dol: 'Button A', cemu: 12, ryu: 'A' },
  b: { label: 'B', ra: { btn: '1' }, dol: 'Button B', cemu: 13, ryu: 'B' },
  x: { label: 'X', ra: { btn: '2' }, dol: 'Button X', cemu: 14, ryu: 'X' },
  y: { label: 'Y', ra: { btn: '3' }, dol: 'Button Y', cemu: 15, ryu: 'Y' },
  lb: { label: 'LB', ra: { btn: '4' }, dol: 'Shoulder L', cemu: 8, ryu: 'LeftShoulder' },
  rb: { label: 'RB', ra: { btn: '5' }, dol: 'Shoulder R', cemu: 9, ryu: 'RightShoulder' },
  lt: { label: 'LT', ra: { axis: '+4' }, dol: 'Trigger L', cemu: 42, ryu: 'LeftTrigger' },
  rt: { label: 'RT', ra: { axis: '+5' }, dol: 'Trigger R', cemu: 43, ryu: 'RightTrigger' },
  back: { label: 'View', ra: { btn: '7' }, dol: 'Back', cemu: 5, ryu: 'Back' },
  start: { label: 'Menu', ra: { btn: '6' }, dol: 'Start', cemu: 4, ryu: 'Start' },
  ls: { label: 'Left stick click', ra: { btn: '8' }, dol: 'Thumb L', cemu: 6, ryu: 'LeftStick' },
  rs: { label: 'Right stick click', ra: { btn: '9' }, dol: 'Thumb R', cemu: 7, ryu: 'RightStick' },
  dup: { label: 'D-pad up', ra: { btn: 'h0up' }, dol: 'Pad N', cemu: 0, ryu: 'DpadUp' },
  ddown: { label: 'D-pad down', ra: { btn: 'h0down' }, dol: 'Pad S', cemu: 1, ryu: 'DpadDown' },
  dleft: { label: 'D-pad left', ra: { btn: 'h0left' }, dol: 'Pad W', cemu: 2, ryu: 'DpadLeft' },
  dright: { label: 'D-pad right', ra: { btn: 'h0right' }, dol: 'Pad E', cemu: 3, ryu: 'DpadRight' },
  lsu: { label: 'Left stick up', ra: { axis: '+1' }, dol: 'Left Y+', cemu: 39 },
  lsd: { label: 'Left stick down', ra: { axis: '-1' }, dol: 'Left Y-', cemu: 45 },
  lsl: { label: 'Left stick left', ra: { axis: '-0' }, dol: 'Left X-', cemu: 44 },
  lsr: { label: 'Left stick right', ra: { axis: '+0' }, dol: 'Left X+', cemu: 38 },
  rsu: { label: 'Right stick up', ra: { axis: '+3' }, dol: 'Right Y+', cemu: 41 },
  rsd: { label: 'Right stick down', ra: { axis: '-3' }, dol: 'Right Y-', cemu: 47 },
  rsl: { label: 'Right stick left', ra: { axis: '-2' }, dol: 'Right X-', cemu: 46 },
  rsr: { label: 'Right stick right', ra: { axis: '+2' }, dol: 'Right X+', cemu: 40 },
  none: { label: 'Not set' },
};
// Whole-stick choices for analog sticks and D-pads. Order: up, down, left, right.
const GROUPS = {
  left: { label: 'Left stick', dirs: ['lsu', 'lsd', 'lsl', 'lsr'] },
  right: { label: 'Right stick', dirs: ['rsu', 'rsd', 'rsl', 'rsr'] },
  dpad: { label: 'D-pad', dirs: ['dup', 'ddown', 'dleft', 'dright'] },
  both: { label: 'D-pad + left stick', dirs: ['dup', 'ddown', 'dleft', 'dright'], also: ['lsu', 'lsd', 'lsl', 'lsr'] },
  none: { label: 'Off', dirs: [] },
};

/* ---------- console controls ---------- */
const B = (id, label, def, to) => ({ id, label, type: 'btn', def, to });
const G = (id, label, opts, def, to) => ({ id, label, type: 'group', opts, def, to });
const DIRS = ['up', 'down', 'left', 'right'];

const RA_DPAD = { up: 'up', down: 'down', left: 'left', right: 'right' };
const RA_LSTICK = { up: 'l_y_minus', down: 'l_y_plus', left: 'l_x_minus', right: 'l_x_plus' };
const raPad = (opts = ['dpad', 'left', 'both']) => G('dpad', 'D-pad', opts, 'dpad', RA_DPAD);
const std = controls => ({ std: { label: 'Controller', controls } });

const SYSTEMS = {
  nes: {
    emu: 'ra',
    modes: std([
      raPad(),
      B('a', 'A', 'b', 'a'),
      B('b', 'B', 'a', 'b'),
      B('select', 'Select', 'back', 'select'),
      B('start', 'Start', 'start', 'start'),
    ]),
  },
  snes: {
    emu: 'ra',
    modes: std([
      raPad(),
      B('a', 'A', 'b', 'a'),
      B('b', 'B', 'a', 'b'),
      B('x', 'X', 'y', 'x'),
      B('y', 'Y', 'x', 'y'),
      B('l', 'L', 'lb', 'l'),
      B('r', 'R', 'rb', 'r'),
      B('select', 'Select', 'back', 'select'),
      B('start', 'Start', 'start', 'start'),
    ]),
  },
  gb: {
    emu: 'ra',
    modes: std([
      raPad(),
      B('a', 'A', 'b', 'a'),
      B('b', 'B', 'a', 'b'),
      B('select', 'Select', 'back', 'select'),
      B('start', 'Start', 'start', 'start'),
    ]),
  },
  gbc: {
    emu: 'ra',
    modes: std([
      raPad(),
      B('a', 'A', 'b', 'a'),
      B('b', 'B', 'a', 'b'),
      B('select', 'Select', 'back', 'select'),
      B('start', 'Start', 'start', 'start'),
    ]),
  },
  gba: {
    emu: 'ra',
    modes: std([
      raPad(),
      B('a', 'A', 'b', 'a'),
      B('b', 'B', 'a', 'b'),
      B('l', 'L', 'lb', 'l'),
      B('r', 'R', 'rb', 'r'),
      B('select', 'Select', 'back', 'select'),
      B('start', 'Start', 'start', 'start'),
    ]),
  },
  n64: {
    emu: 'ra',
    modes: std([
      G('stick', 'Control stick', ['left', 'right', 'dpad'], 'left', RA_LSTICK),
      B('a', 'A', 'a', 'b'),
      B('b', 'B', 'x', 'y'),
      B('z', 'Z', 'lt', 'l2'),
      B('l', 'L', 'lb', 'l'),
      B('r', 'R', 'rb', 'r'),
      B('start', 'Start', 'start', 'start'),
      B('cu', 'C-Up', 'rsu', 'r_y_minus'),
      B('cd', 'C-Down', 'rsd', 'r_y_plus'),
      B('cl', 'C-Left', 'rsl', 'r_x_minus'),
      B('cr', 'C-Right', 'rsr', 'r_x_plus'),
      G('dpad', 'D-pad', ['dpad', 'left', 'right', 'none'], 'dpad', RA_DPAD),
    ]),
  },

  gc: {
    emu: 'dolphin',
    modes: std([
      G('main', 'Control stick', ['left', 'right', 'dpad'], 'left', 'Main Stick'),
      G('c', 'C-stick', ['right', 'left', 'none'], 'right', 'C-Stick'),
      B('a', 'A', 'a', 'Buttons/A'),
      B('b', 'B', 'x', 'Buttons/B'),
      B('x', 'X', 'b', 'Buttons/X'),
      B('y', 'Y', 'y', 'Buttons/Y'),
      B('z', 'Z', 'rb', 'Buttons/Z'),
      B('l', 'L', 'lt', ['Triggers/L', 'Triggers/L-Analog']),
      B('r', 'R', 'rt', ['Triggers/R', 'Triggers/R-Analog']),
      B('start', 'Start', 'start', 'Buttons/Start'),
      G('dpad', 'D-pad', ['dpad', 'left', 'right', 'none'], 'dpad', 'D-Pad'),
    ]),
  },

  wii: {
    emu: 'dolphin',
    modes: {
      side: {
        label: 'Wii Remote (sideways)',
        controls: [
          G('dpad', 'D-pad', ['both', 'dpad', 'left'], 'both', 'D-Pad'),
          B('1', '1', 'x', 'Buttons/1'),
          B('2', '2', 'a', 'Buttons/2'),
          B('a', 'A', 'b', 'Buttons/A'),
          B('b', 'B', 'rt', 'Buttons/B'),
          B('minus', '−', 'back', 'Buttons/-'),
          B('plus', '+', 'start', 'Buttons/+'),
          B('home', 'Home', 'rs', 'Buttons/Home'),
          B('shake', 'Shake', 'y', ['Shake/X', 'Shake/Y', 'Shake/Z']),
          B('tiltl', 'Tilt left', 'lb', 'Tilt/Left'),
          B('tiltr', 'Tilt right', 'rb', 'Tilt/Right'),
          G('ir', 'Pointer', ['right', 'left', 'none'], 'right', 'IR'),
        ],
      },
      nun: {
        label: 'Wii Remote + Nunchuk',
        controls: [
          G('stick', 'Nunchuk stick', ['left', 'right', 'dpad'], 'left', 'Nunchuk/Stick'),
          G('ir', 'Pointer', ['right', 'left', 'none'], 'right', 'IR'),
          B('a', 'A', 'a', 'Buttons/A'),
          B('b', 'B', 'rt', 'Buttons/B'),
          B('c', 'C', 'lb', 'Nunchuk/Buttons/C'),
          B('z', 'Z', 'lt', 'Nunchuk/Buttons/Z'),
          B('1', '1', 'x', 'Buttons/1'),
          B('2', '2', 'y', 'Buttons/2'),
          B('minus', '−', 'back', 'Buttons/-'),
          B('plus', '+', 'start', 'Buttons/+'),
          B('home', 'Home', 'rs', 'Buttons/Home'),
          B('shake', 'Shake remote', 'b', ['Shake/X', 'Shake/Y', 'Shake/Z']),
          B('nshake', 'Shake Nunchuk', 'rb', ['Nunchuk/Shake/X', 'Nunchuk/Shake/Y', 'Nunchuk/Shake/Z']),
          G('dpad', 'D-pad', ['dpad', 'none'], 'dpad', 'D-Pad'),
        ],
      },
      cls: {
        label: 'Classic Controller',
        controls: [
          G('ls', 'Left stick', ['left', 'right', 'dpad'], 'left', 'Classic/Left Stick'),
          G('rstick', 'Right stick', ['right', 'left', 'none'], 'right', 'Classic/Right Stick'),
          B('a', 'A', 'a', 'Classic/Buttons/A'),
          B('b', 'B', 'b', 'Classic/Buttons/B'),
          B('x', 'X', 'x', 'Classic/Buttons/X'),
          B('y', 'Y', 'y', 'Classic/Buttons/Y'),
          B('l', 'L', 'lt', ['Classic/Triggers/L', 'Classic/Triggers/L-Analog']),
          B('r', 'R', 'rt', ['Classic/Triggers/R', 'Classic/Triggers/R-Analog']),
          B('zl', 'ZL', 'lb', 'Classic/Buttons/ZL'),
          B('zr', 'ZR', 'rb', 'Classic/Buttons/ZR'),
          B('minus', '−', 'back', 'Classic/Buttons/-'),
          B('plus', '+', 'start', 'Classic/Buttons/+'),
          B('home', 'Home', 'rs', 'Classic/Buttons/Home'),
          G('dpad', 'D-pad', ['dpad', 'left', 'both', 'none'], 'dpad', 'Classic/D-Pad'),
        ],
      },
      gc: {
        label: 'GameCube controller',
        note: 'Only for Wii games that support a GameCube controller. It uses your GameCube controls.',
        controls: [],
      },
    },
    defMode: 'side',
  },

  wiiu: {
    emu: 'cemu',
    modes: std([
      G('ls', 'Left stick', ['left', 'right', 'dpad'], 'left', [17, 18, 19, 20]),
      G('rstick', 'Right stick', ['right', 'left', 'dpad'], 'right', [21, 22, 23, 24]),
      B('a', 'A', 'a', 1),
      B('b', 'B', 'b', 2),
      B('x', 'X', 'x', 3),
      B('y', 'Y', 'y', 4),
      B('l', 'L', 'lb', 5),
      B('r', 'R', 'rb', 6),
      B('zl', 'ZL', 'lt', 7),
      B('zr', 'ZR', 'rt', 8),
      B('plus', '+', 'start', 9),
      B('minus', '−', 'back', 10),
      B('lsc', 'Left stick click', 'ls', 15),
      B('rsc', 'Right stick click', 'rs', 16),
      G('dpad', 'D-pad', ['dpad', 'left', 'right'], 'dpad', [11, 12, 13, 14]),
      B('home', 'Home', 'none', 27),
      B('screen', 'Swap screens', 'none', 26),
    ]),
  },

  switch: {
    emu: 'ryu',
    noStickButtons: true,
    modes: std([
      G('ls', 'Left stick', ['left', 'right'], 'left', 'left_joycon_stick'),
      G('rstick', 'Right stick', ['right', 'left'], 'right', 'right_joycon_stick'),
      B('a', 'A', 'a', 'right_joycon.button_a'),
      B('b', 'B', 'b', 'right_joycon.button_b'),
      B('x', 'X', 'x', 'right_joycon.button_x'),
      B('y', 'Y', 'y', 'right_joycon.button_y'),
      B('l', 'L', 'lb', 'left_joycon.button_l'),
      B('r', 'R', 'rb', 'right_joycon.button_r'),
      B('zl', 'ZL', 'lt', 'left_joycon.button_zl'),
      B('zr', 'ZR', 'rt', 'right_joycon.button_zr'),
      B('minus', '−', 'back', 'left_joycon.button_minus'),
      B('plus', '+', 'start', 'right_joycon.button_plus'),
      B('lsc', 'Left stick click', 'ls', 'left_joycon_stick.stick_button'),
      B('rsc', 'Right stick click', 'rs', 'right_joycon_stick.stick_button'),
    ]),
  },
};
for (const s of Object.values(SYSTEMS)) s.defMode = s.defMode || 'std';

/* ---------- saved data -> effective controls ---------- */
// Saved shape: { mode, map: { [mode]: { [controlId]: value } } }. A game's own entry sits on top of its system's.
function effective(sys, sysSaved, gameSaved) {
  const def = SYSTEMS[sys];
  if (!def) return null;
  const mode = (gameSaved && gameSaved.mode) || (sysSaved && sysSaved.mode) || def.defMode;
  const m = def.modes[mode] ? mode : def.defMode;
  const map = {};
  for (const c of def.modes[m].controls) map[c.id] = c.def;
  for (const src of [sysSaved, gameSaved]) Object.assign(map, (src && src.map && src.map[m]) || {});
  return { mode: m, map };
}

// Data the renderer needs to draw the screen.
function forRenderer() {
  const systems = {};
  for (const [k, s] of Object.entries(SYSTEMS)) {
    systems[k] = { emu: s.emu, defMode: s.defMode, noStickButtons: !!s.noStickButtons, modes: {} };
    for (const [m, md] of Object.entries(s.modes)) {
      systems[k].modes[m] = {
        label: md.label,
        note: md.note || '',
        controls: md.controls.map(c => ({ id: c.id, label: c.label, type: c.type, opts: c.opts, def: c.def })),
      };
    }
  }
  const inputs = {};
  for (const [k, v] of Object.entries(INPUTS)) inputs[k] = v.label;
  const groups = {};
  for (const [k, v] of Object.entries(GROUPS)) groups[k] = v.label;
  return { systems, inputs, groups };
}

/* ---------- writers ---------- */
const controlsOf = (sys, mode) => SYSTEMS[sys].modes[mode].controls;

// RetroArch: returns lines for the per-launch append config. Autodetect is turned off for the game
// so only these binds apply; every RetroPad bind is written so nothing leftover leaks through.
const RA_ALL = [
  'b',
  'y',
  'select',
  'start',
  'up',
  'down',
  'left',
  'right',
  'a',
  'x',
  'l',
  'r',
  'l2',
  'r2',
  'l3',
  'r3',
  'l_x_plus',
  'l_x_minus',
  'l_y_plus',
  'l_y_minus',
  'r_x_plus',
  'r_x_minus',
  'r_y_plus',
  'r_y_minus',
];
function raLines(sys, eff) {
  const binds = {};
  for (const n of RA_ALL) binds[n] = { btn: 'nul', axis: 'nul' };
  const put = (name, inputId) => {
    const r = INPUTS[inputId] && INPUTS[inputId].ra;
    if (!r) return;
    if (r.btn) binds[name].btn = r.btn;
    if (r.axis) binds[name].axis = r.axis;
  };
  for (const c of controlsOf(sys, eff.mode)) {
    const v = eff.map[c.id];
    if (c.type === 'btn') put(c.to, v);
    else {
      const g = GROUPS[v] || GROUPS.none;
      DIRS.forEach((d, i) => {
        if (g.dirs[i]) put(c.to[d], g.dirs[i]);
        if (g.also) put(c.to[d], g.also[i]);
      });
    }
  }
  const lines = [
    'input_autodetect_enable = "false"',
    'input_player1_joypad_index = "0"',
    'input_player1_analog_dpad_mode = "0"',
    'input_menu_toggle_btn = "10"',
  ];
  for (const [n, b] of Object.entries(binds))
    lines.push(`input_player1_${n}_btn = "${b.btn}"`, `input_player1_${n}_axis = "${b.axis}"`);
  return lines;
}

// Dolphin ini helpers: replace one [Section] and keep the rest of the file.
function setIniSection(file, section, lines) {
  let text = '';
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch {}
  const out = [];
  let skip = false,
    done = false;
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*\[(.+)\]\s*$/);
    if (m) {
      skip = m[1] === section;
      if (skip) {
        out.push(`[${section}]`, ...lines);
        done = true;
        continue;
      }
    }
    if (!skip) out.push(line);
  }
  if (!done) out.push(`[${section}]`, ...lines);
  const eol = /\r\n/.test(text) ? '\r\n' : '\n';
  fs.writeFileSync(file, out.join(eol).replace(/(\r?\n)*$/, '') + eol);
}
function setIniValue(file, section, key, value) {
  let text = '';
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch {}
  const lines = text.split(/\r?\n/);
  let cur = null,
    set = false,
    secAt = -1;
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^\s*\[(.+)\]\s*$/);
    if (m) {
      cur = m[1];
      if (cur === section) secAt = i;
      continue;
    }
    if (cur === section && lines[i].split('=')[0].trim() === key) {
      lines[i] = `${key} = ${value}`;
      set = true;
    }
  }
  if (!set) {
    if (secAt >= 0) lines.splice(secAt + 1, 0, `${key} = ${value}`);
    else lines.push(`[${section}]`, `${key} = ${value}`);
  }
  fs.writeFileSync(file, lines.join(/\r\n/.test(text) ? '\r\n' : '\n'));
}
function dolLines(sys, eff) {
  const out = [];
  const expr = id => (INPUTS[id] && INPUTS[id].dol ? '`' + INPUTS[id].dol + '`' : '');
  for (const c of controlsOf(sys, eff.mode)) {
    const v = eff.map[c.id];
    if (c.type === 'btn') {
      for (const k of [].concat(c.to)) out.push(`${k} = ${expr(v)}`);
    } else {
      const g = GROUPS[v] || GROUPS.none;
      DIRS.forEach((d, i) => {
        const parts = [g.dirs[i], g.also && g.also[i]].filter(Boolean).map(expr);
        out.push(`${c.to}/${d[0].toUpperCase() + d.slice(1)} = ${parts.join(' | ')}`);
      });
    }
  }
  return out;
}
function applyDolphin(g, eff, gcEff) {
  const cfg = path.join(P.dolphin, 'User', 'Config');
  fs.mkdirSync(cfg, { recursive: true });
  const usesPad = g.sys === 'gc' || eff.mode === 'gc';
  setIniSection(path.join(cfg, 'GCPadNew.ini'), 'GCPad1', [
    'Device = XInput/0/Gamepad',
    ...dolLines('gc', gcEff),
    'Rumble/Motor = `Motor L` | `Motor R`',
  ]);
  setIniValue(path.join(cfg, 'Dolphin.ini'), 'Core', 'SIDevice0', usesPad ? '6' : '0');
  if (g.sys === 'wii') {
    const ext = { side: 'None', nun: 'Nunchuk', cls: 'Classic', gc: 'None' }[eff.mode];
    const lines = [
      'Device = XInput/0/Gamepad',
      'Source = 1',
      `Extension = ${ext}`,
      `Options/Sideways Wiimote = ${eff.mode === 'side' ? 'True' : 'False'}`,
    ];
    if (eff.mode !== 'gc') lines.push(...dolLines('wii', eff));
    lines.push('Rumble/Motor = `Motor L` | `Motor R`');
    setIniSection(path.join(cfg, 'WiimoteNew.ini'), 'Wiimote1', lines);
  }
}

// Cemu: controllerProfiles/controller0.xml as a Wii U GamePad on the first Xbox controller.
function applyCemu(eff) {
  const entries = [];
  const add = (mapping, inputId) => {
    const c = INPUTS[inputId] && INPUTS[inputId].cemu;
    if (c !== undefined) entries.push([mapping, c]);
  };
  for (const c of controlsOf('wiiu', eff.mode)) {
    const v = eff.map[c.id];
    if (c.type === 'btn') add(c.to, v);
    else {
      const g = GROUPS[v] || GROUPS.none;
      c.to.forEach((m, i) => g.dirs[i] && add(m, g.dirs[i]));
    }
  }
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<emulated_controller>
	<type>Wii U GamePad</type>
	<controller>
		<api>XInput</api>
		<uuid>0</uuid>
		<display_name>Controller 1</display_name>
		<rumble>0.5</rumble>
		<axis>
			<deadzone>0.15</deadzone>
			<range>1</range>
		</axis>
		<rotation>
			<deadzone>0.15</deadzone>
			<range>1</range>
		</rotation>
		<trigger>
			<deadzone>0.15</deadzone>
			<range>1</range>
		</trigger>
		<mappings>
${entries.map(([m, b]) => `			<entry>\n				<mapping>${m}</mapping>\n				<button>${b}</button>\n			</entry>`).join('\n')}
		</mappings>
	</controller>
</emulated_controller>
`;
  const dir = path.join(P.cemu, 'portable', 'controllerProfiles');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'controller0.xml'), xml);
}

// Ryubing: edit player 1 in Config.json. Needs the controller picked once in Ryubing (it stores the device ID).
function applyRyu(eff) {
  const file = path.join(ryuData(), 'Config.json');
  let raw;
  try {
    raw = fs.readFileSync(file, 'utf8').replace(/^﻿/, '');
  } catch {
    return 'no-config';
  }
  const cfg = JSON.parse(raw);
  const pad = (cfg.input_config || []).find(p => p.player_index === 'Player1' && /^Gamepad/.test(p.backend || ''));
  if (!pad) return 'no-controller';
  for (const c of controlsOf('switch', eff.mode)) {
    const v = eff.map[c.id];
    if (c.type === 'btn') {
      const [obj, key] = c.to.split('.');
      pad[obj] = pad[obj] || {};
      pad[obj][key] = (INPUTS[v] && INPUTS[v].ryu) || 'Unbound';
    } else {
      pad[c.to] = pad[c.to] || {};
      pad[c.to].joystick = v === 'right' ? 'Right' : 'Left';
    }
  }
  fs.writeFileSync(file, JSON.stringify(cfg, null, 2));
  return 'ok';
}

// Called right before launch. Returns extra RetroArch config lines (or []).
function apply(g, settings) {
  const saved = (settings && settings.controls) || {};
  const eff = effective(g.sys, saved[g.sys], g.controls);
  if (!eff) return [];
  const emu = SYSTEMS[g.sys].emu;
  if (emu === 'ra') return raLines(g.sys, eff);
  if (emu === 'dolphin') {
    const gcEff = g.sys === 'gc' ? eff : effective('gc', saved.gc, null);
    applyDolphin(g, eff, gcEff);
  } else if (emu === 'cemu') applyCemu(eff);
  else if (emu === 'ryu') {
    const r = applyRyu(eff);
    if (r !== 'ok') throw new Error('Switch controls not applied: ' + r);
  }
  return [];
}

module.exports = { apply, effective, forRenderer, setIniValue, SYSTEMS, INPUTS };
