// Windows-only helpers: read the Xbox controller while a game has focus (XInput),
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

// Returns the first connected controller's state, or null.
function readPad() {
  if (!ok) return null;
  for (let i = 0; i < 4; i++) {
    const s = {};
    if (XInputGetState(i, s) === 0) {
      const g = s.Gamepad;
      let b = g.wButtons;
      if (g.sThumbLY > 16000) b |= BTN.UP;
      if (g.sThumbLY < -16000) b |= BTN.DOWN;
      if (g.sThumbLX < -16000) b |= BTN.LEFT;
      if (g.sThumbLX > 16000) b |= BTN.RIGHT;
      return { buttons: b };
    }
  }
  return null;
}

// Full state of the first connected controller (for sending to a friend who is hosting), or null.
// { b: buttons, lt, rt: 0-255, lx, ly, rx, ry: -32768..32767 }
function readPadFull() {
  if (!ok) return null;
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

module.exports = { ok, readPad, readPadFull, mainWindowOf, tapKey, BTN, VK, wait };
