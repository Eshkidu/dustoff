const fs = require('fs');
const path = require('path');
// Windows-only helpers: read the controller while a game has focus (XInput for Xbox, SDL for others),
// and press keys in an emulator window (for Dolphin's save/pause hotkeys).
let ok = false,
  XInputGetState,
  keybd_event,
  MapVirtualKeyW,
  koffiRef,
  EnumWindows,
  ENUMPROC,
  GetWindowThreadProcessId,
  IsWindowVisible,
  GetWindowRect;
try {
  const koffi = require('koffi');
  const xinput = koffi.load('xinput1_4.dll');
  const GAMEPAD = koffi.struct('XINPUT_GAMEPAD', {
    wButtons: 'uint16',
    bLeftTrigger: 'uint8',
    bRightTrigger: 'uint8',
    sThumbLX: 'int16',
    sThumbLY: 'int16',
    sThumbRX: 'int16',
    sThumbRY: 'int16',
  });
  const STATE = koffi.struct('XINPUT_STATE', { dwPacketNumber: 'uint32', Gamepad: GAMEPAD });
  XInputGetState = xinput.func('uint32 __stdcall XInputGetState(uint32 dwUserIndex, _Out_ XINPUT_STATE *pState)');
  const user32 = koffi.load('user32.dll');
  keybd_event = user32.func('void __stdcall keybd_event(uint8 bVk, uint8 bScan, uint32 dwFlags, uintptr dwExtraInfo)');
  MapVirtualKeyW = user32.func('uint32 __stdcall MapVirtualKeyW(uint32 uCode, uint32 uMapType)');
  // Window lookup (for streaming a game window to friends). HWNDs are handled as plain numbers.
  koffiRef = koffi;
  ENUMPROC = koffi.proto('bool __stdcall DustoffEnumProc(intptr hwnd, intptr lParam)');
  EnumWindows = user32.func('bool __stdcall EnumWindows(DustoffEnumProc *cb, intptr lParam)');
  GetWindowThreadProcessId = user32.func('uint32 __stdcall GetWindowThreadProcessId(intptr hwnd, _Out_ uint32 *pid)');
  IsWindowVisible = user32.func('bool __stdcall IsWindowVisible(intptr hwnd)');
  const RECT = koffi.struct('DustoffRect', { left: 'int32', top: 'int32', right: 'int32', bottom: 'int32' });
  GetWindowRect = user32.func('bool __stdcall GetWindowRect(intptr hwnd, _Out_ DustoffRect *r)');
  ok = true;
} catch (e) {
  console.error('Native helpers unavailable:', e.message);
}

const BTN = {
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
const VK = { F5: 0x74, F6: 0x75, F7: 0x76, F8: 0x77, F9: 0x78, F10: 0x79 };

// DUSTOFF_PAD=sdl makes Dustoff treat every controller (even an Xbox one) as a non-Xbox controller,
// so the PlayStation / Switch Pro path can be tested with an Xbox controller.
const FORCE_SDL = process.env.DUSTOFF_PAD === 'sdl';

function readXInput() {
  if (!ok || FORCE_SDL) return null;
  for (let i = 0; i < 4; i++) {
    const s = {};
    if (XInputGetState(i, s) === 0) {
      const g = s.Gamepad;
      return {
        b: g.wButtons,
        lt: g.bLeftTrigger,
        rt: g.bRightTrigger,
        lx: g.sThumbLX,
        ly: g.sThumbLY,
        rx: g.sThumbRX,
        ry: g.sThumbRY,
      };
    }
  }
  return null;
}

/* ---------- SDL: PlayStation, Switch Pro, 8BitDo and other non-Xbox controllers ---------- */
// Xbox controllers always go through XInput (above), exactly as before. SDL is only loaded when
// no Xbox controller is plugged in, using the SDL2.dll that ships with RetroArch.
// Buttons and sticks are by POSITION (bottom face button = A), whatever is printed on them.
let sdl = null; // null = not tried, false = unavailable, else the loaded functions
let sdlPad = null; // { handle, index, name, type }
let sdlScanAt = 0;
const SDL_KIND = { 1: 'xbox', 2: 'xbox', 3: 'ps', 4: 'ps', 7: 'ps', 5: 'nin', 11: 'nin', 12: 'nin', 13: 'nin' };
function sdlLoad() {
  if (sdl !== null) return sdl;
  sdl = false;
  try {
    const koffi = require('koffi');
    const dll = path.join(require('./store').P.retroarch, 'SDL2.dll');
    if (!fs.existsSync(dll)) return sdl;
    const lib = koffi.load(dll);
    const f = {
      SetHint: lib.func('int SDL_SetHint(const char *name, const char *value)'),
      Init: lib.func('int SDL_Init(uint32 flags)'),
      QuitSub: lib.func('void SDL_QuitSubSystem(uint32 flags)'),
      Num: lib.func('int SDL_NumJoysticks()'),
      IsGC: lib.func('int SDL_IsGameController(int index)'),
      Open: lib.func('void *SDL_GameControllerOpen(int index)'),
      Close: lib.func('void SDL_GameControllerClose(void *gc)'),
      Attached: lib.func('int SDL_GameControllerGetAttached(void *gc)'),
      Name: lib.func('const char *SDL_GameControllerName(void *gc)'),
      Type: lib.func('int SDL_GameControllerGetType(void *gc)'),
      Update: lib.func('void SDL_GameControllerUpdate()'),
      Button: lib.func('uint8 SDL_GameControllerGetButton(void *gc, int button)'),
      Axis: lib.func('int16 SDL_GameControllerGetAxis(void *gc, int axis)'),
    };
    // Read the controller while a game window has focus, keep device messages on SDL's own thread
    // (never on Electron's), report buttons by position, and never switch PlayStation pads into
    // rumble mode (that can confuse other programs until the controller is reconnected).
    for (const [k, v] of [
      ['SDL_JOYSTICK_ALLOW_BACKGROUND_EVENTS', '1'],
      ['SDL_JOYSTICK_THREAD', '1'],
      ['SDL_GAMECONTROLLER_USE_BUTTON_LABELS', '0'],
      ['SDL_JOYSTICK_HIDAPI_PS4_RUMBLE', '0'],
      ['SDL_JOYSTICK_HIDAPI_PS5_RUMBLE', '0'],
    ])
      f.SetHint(k, v);
    if (f.Init(0x2000 | 0x200) !== 0) return sdl; // GAMECONTROLLER | JOYSTICK
    sdl = f;
  } catch (e) {
    console.error('SDL unavailable:', e.message);
  }
  return sdl;
}
function sdlFind() {
  const f = sdlLoad();
  if (!f) return null;
  f.Update(); // also notices controllers being plugged in or out
  if (sdlPad && !f.Attached(sdlPad.handle)) {
    f.Close(sdlPad.handle);
    sdlPad = null;
  }
  if (sdlPad || Date.now() < sdlScanAt) return sdlPad;
  sdlScanAt = Date.now() + 1500;
  for (let i = 0; i < f.Num(); i++) {
    if (!f.IsGC(i)) continue;
    const h = f.Open(i);
    if (!h) continue;
    const kind = SDL_KIND[f.Type(h)] || 'other';
    if (kind === 'xbox' && !FORCE_SDL) {
      f.Close(h); // Xbox pads are read through XInput
      continue;
    }
    sdlPad = { handle: h, index: i, name: f.Name(h) || 'Controller', kind };
    break;
  }
  return sdlPad;
}
// SDL button numbers -> XInput button bits, so the rest of Dustoff sees one format.
const SDL_TO_X = [
  [0, 0x1000], // south -> A
  [1, 0x2000], // east -> B
  [2, 0x4000], // west -> X
  [3, 0x8000], // north -> Y
  [4, 0x20], // back / share / minus -> View
  [6, 0x10], // start / options / plus -> Menu
  [7, 0x40],
  [8, 0x80],
  [9, 0x100],
  [10, 0x200],
  [11, 0x1],
  [12, 0x2],
  [13, 0x4],
  [14, 0x8],
];
function readSdl() {
  const p = sdlFind();
  if (!p) return null;
  const f = sdl;
  let b = 0;
  for (const [i, bit] of SDL_TO_X) if (f.Button(p.handle, i)) b |= bit;
  const flip = v => Math.max(-32768, Math.min(32767, -v)); // SDL: down is positive; XInput: up is positive
  return {
    b,
    lt: Math.round(Math.max(0, f.Axis(p.handle, 4)) / 128.5),
    rt: Math.round(Math.max(0, f.Axis(p.handle, 5)) / 128.5),
    lx: f.Axis(p.handle, 0),
    ly: flip(f.Axis(p.handle, 1)),
    rx: f.Axis(p.handle, 2),
    ry: flip(f.Axis(p.handle, 3)),
  };
}

// Restart SDL's controller reading. Called when a game starts: while Dustoff's own menus are on
// screen, Chromium's gamepad reader takes over this process's controller input registration, so
// SDL has to register again or it stops hearing the controller after the first game.
function refreshPads() {
  if (!sdl) return;
  if (sdlPad) {
    sdl.Close(sdlPad.handle);
    sdlPad = null;
  }
  sdl.QuitSub(0x2000 | 0x200);
  if (sdl.Init(0x2000 | 0x200) !== 0) sdl = false;
  sdlScanAt = 0;
}

// Which controller Player 1 is using right now:
// { kind: 'xinput' } for an Xbox controller, { kind: 'sdl', type: 'ps' | 'nin' | 'other' | 'xbox', name, index },
// or null if nothing is plugged in.
function padSource() {
  if (readXInput()) return { kind: 'xinput' };
  const p = sdlFind();
  return p ? { kind: 'sdl', type: p.kind, name: p.name, index: p.index } : null;
}

// Full state of the first connected controller (Xbox first), or null.
// { b: XInput buttons, lt, rt: 0-255, lx, ly, rx, ry: -32768..32767 (up is positive) }
function readPadFull() {
  return readXInput() || readSdl();
}

// Buttons of the first connected controller, with the left stick counted as the D-pad, or null.
function readPad() {
  const g = readPadFull();
  if (!g) return null;
  let b = g.b;
  if (g.ly > 16000) b |= BTN.UP;
  if (g.ly < -16000) b |= BTN.DOWN;
  if (g.lx < -16000) b |= BTN.LEFT;
  if (g.lx > 16000) b |= BTN.RIGHT;
  return { buttons: b };
}

// The biggest visible top-level window that belongs to a process, as a number (HWND), or 0.
function mainWindowOf(pid) {
  if (!ok || !pid) return 0;
  let best = 0,
    bestArea = 0;
  const cb = koffiRef.register((hwnd, _l) => {
    const out = [0];
    GetWindowThreadProcessId(hwnd, out);
    if (out[0] === pid && IsWindowVisible(hwnd)) {
      const r = {};
      if (GetWindowRect(hwnd, r)) {
        const area = Math.max(0, r.right - r.left) * Math.max(0, r.bottom - r.top);
        if (area > bestArea && area > 200 * 150) {
          best = hwnd;
          bestArea = area;
        }
      }
    }
    return true;
  }, koffiRef.pointer(ENUMPROC));
  try {
    EnumWindows(cb, 0);
  } finally {
    koffiRef.unregister(cb);
  }
  return Number(best);
}

const wait = ms => new Promise(r => setTimeout(r, ms));
async function tapKey(vk) {
  if (!ok) return;
  const scan = MapVirtualKeyW(vk, 0);
  keybd_event(vk, scan, 0, 0);
  await wait(80);
  keybd_event(vk, scan, 2, 0);
}

module.exports = { ok, readPad, readPadFull, padSource, refreshPads, mainWindowOf, tapKey, BTN, VK, wait, FORCE_SDL };
