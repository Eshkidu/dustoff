// Windows-only helpers: read the Xbox controller while a game has focus (XInput),
// and press keys in an emulator window (for Dolphin's save/pause hotkeys).
let ok = false,
  XInputGetState,
  keybd_event,
  MapVirtualKeyW;
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

const wait = ms => new Promise(r => setTimeout(r, ms));
async function tapKey(vk) {
  if (!ok) return;
  const scan = MapVirtualKeyW(vk, 0);
  keybd_event(vk, scan, 0, 0);
  await wait(80);
  keybd_event(vk, scan, 2, 0);
}

module.exports = { ok, readPad, tapKey, BTN, VK, wait };
