/* Dustoff renderer: On-screen keyboard, keyboard shortcuts and Xbox controller input. */
/* ---------- on-screen keyboard ---------- */
const OSK_ROWS = ['1234567890', 'qwertyuiop', "asdfghjkl'", 'zxcvbnm-.&'];
const oskEl = $('#osk'),
  oskKeys = $('#osk-keys');
let osk = null;
oskKeys.innerHTML =
  OSK_ROWS.map(r =>
    [...r].map(c => /* HTML */ `<button class="ok" data-f data-k="${esc(c)}">${esc(c)}</button>`).join(''),
  ).join('') +
  '<button class="ok sp wide2" data-f data-k="shift">Shift</button><button class="ok sp wide4" data-f data-k="space">Space</button><button class="ok sp" data-f data-k="back" aria-label="Delete">&#9003;</button><button class="ok sp" data-f data-k="clear">Clear</button><button class="ok sp wide2 done" data-f data-k="done">Done</button>';
oskKeys.addEventListener('click', e => {
  const b = e.target.closest('.ok');
  if (b) {
    if (b.dataset.k !== 'done') sfx(b.dataset.k === 'back' || b.dataset.k === 'clear' ? 'back' : 'toggle');
    oskKey(b.dataset.k);
  }
});
function openOsk(o) {
  osk = Object.assign({ text: '', shift: false }, o);
  oskEl.hidden = false;
  $('#osk-label').textContent = o.label;
  drawOsk();
  focusEl(oskKeys.querySelector('[data-k="a"]'), true);
}
function drawOsk() {
  const caret = '<span class="caret"></span>';
  const shown = osk.mask ? '•'.repeat(osk.text.length) : osk.text;
  $('#osk-field').innerHTML = shown
    ? esc(shown) + caret
    : caret + /* HTML */ `<span class="ph">${esc(osk.placeholder || '')}</span>`;
  $('#osk-info').textContent = osk.info ? osk.info(osk.text) : '';
  oskKeys.querySelectorAll('[data-k]').forEach(b => {
    const k = b.dataset.k;
    if (/^[a-z]$/.test(k)) b.textContent = osk.shift ? k.toUpperCase() : k;
  });
  oskKeys.querySelector('[data-k="shift"]').classList.toggle('on', osk.shift);
}
function oskKey(k) {
  if (!osk) return;
  if (k === 'done') return closeOsk(true);
  if (k === 'shift') {
    osk.shift = !osk.shift;
    return drawOsk();
  }
  if (k === 'back') osk.text = osk.text.slice(0, -1);
  else if (k === 'clear') osk.text = '';
  else if (k === 'space') osk.text += ' ';
  else {
    osk.text += osk.shift ? k.toUpperCase() : k;
    osk.shift = false;
  }
  osk.text = osk.text.slice(0, 120);
  if (osk.onInput) osk.onInput(osk.text);
  drawOsk();
}
function oskType(ch) {
  if (!osk) return;
  osk.text = (osk.text + ch).slice(0, 120);
  if (osk.onInput) osk.onInput(osk.text);
  drawOsk();
}
function closeOsk(save) {
  if (!osk) return;
  const o = osk;
  osk = null;
  oskEl.hidden = true;
  sfx(save ? 'select' : 'back');
  if (save) {
    if (o.onDone) o.onDone(o.text);
  } else if (o.onCancel) o.onCancel(o.text);
  if (state.pendingRender) render();
}
function openInputOsk(input) {
  const isSearch = input.id === 'lbsearch';
  openOsk({
    label: input.getAttribute('aria-label') || 'Type',
    placeholder: input.placeholder,
    text: input.value,
    mask: input.type === 'password',
    onInput: isSearch ? applySearch : null,
    info: isSearch ? () => gameCount(libList().length) + ' found' : null,
    onDone: t => {
      input.value = t;
      if (isSearch) {
        applySearch(t);
        focusEl(stage.querySelector('#lbgrid [data-game]') || input);
      } else focusEl(input);
    },
    onCancel: () => focusEl(isSearch ? stage.querySelector('#lbgrid [data-game]') || input : input),
  });
}
function openSearchOsk() {
  if (state.screen !== 'lib') go('lib');
  const s = $('#lbsearch');
  if (s) openInputOsk(s);
}
function openRenameOsk() {
  const g = byId(state.sel);
  if (!g) return;
  openOsk({
    label: 'Rename',
    placeholder: 'Game title',
    text: g.title,
    onDone: t => {
      if (t.trim() && t.trim() !== g.title) api.update(g.id, { title: t.trim() });
      else focusEl(stage.querySelector(`[data-game="${g.id}"]`));
    },
    onCancel: () => focusEl(stage.querySelector(`[data-game="${g.id}"]`)),
  });
}

/* ---------- keyboard ---------- */
function setMode(m) {
  if (state.mode !== m) {
    state.mode = m;
    drawHints();
  }
}
// Footer hints. Each hint is [keys, label]; a key is 'a' | 'b' | 'x' | 'y' (face buttons),
// 'LB', 'RB', 'LT', 'RT', 'Menu', 'View' (controller) or any keyboard key text.
const PAD_STYLE = {
  a: 'a',
  b: 'b',
  x: 'x',
  y: 'y',
  LB: 'bump',
  RB: 'bump',
  LT: 'trig',
  RT: 'trig',
  Menu: 'view',
  View: 'view',
};
const padKey = k =>
  /* HTML */ `<span class="g ${PAD_STYLE[k] || 'view'}">${k.length === 1 ? k.toUpperCase() : k}</span>`;
const kbKey = k => /* HTML */ `<kbd class="k">${k}</kbd>`;
function hintBar(hints, note) {
  const keyHtml = state.mode === 'pad' ? padKey : kbKey;
  const items = hints.map(([keys, label]) => /* HTML */ `<span>${keys.map(keyHtml).join('')}${label}</span>`);
  if (note) items.push(/* HTML */ `<span class="grow">${note}</span>`);
  return items.join('');
}
function drawHints() {
  const scr = state.screen;
  const pad = state.mode === 'pad';
  const yLabel = scr === 'lib' ? 'Home' : 'Library';
  const UPDOWN = '&uarr;&darr;';
  let html;
  if (scr === 'theme') {
    html = pad
      ? hintBar(
          [
            [['a'], 'Use theme'],
            [['b'], 'Back'],
          ],
          'Move up and down to preview each theme',
        )
      : hintBar([
          [[UPDOWN], 'Preview'],
          [['Enter'], 'Use theme'],
          [['Esc'], 'Back'],
        ]);
  } else if (scr === 'friends') {
    html = pad
      ? hintBar([
          [['a'], 'Select'],
          [['b'], 'Back'],
          [['y'], 'Library'],
        ])
      : hintBar([
          [['&larr;&uarr;&darr;&rarr;'], 'Move'],
          [['Enter'], 'Select'],
          [['Esc'], 'Back'],
        ]);
  } else if (scr === 'controls') {
    html = pad
      ? hintBar(
          [
            [['a'], 'Change'],
            [['b'], 'Back'],
          ],
          'Pick a row, then press the button you want for it',
        )
      : hintBar(
          [
            [[UPDOWN], 'Move'],
            [['Enter'], 'Change'],
            [['Esc'], 'Back'],
          ],
          'Changing a button needs your controller',
        );
  } else if (pad) {
    html = hintBar(
      [
        [['a'], scr === 'settings' ? 'Select' : 'Play'],
        [['b'], 'Back'],
        [['x'], 'Search'],
        [['y'], yLabel],
        [['LB', 'RB'], 'System'],
        [['LT', 'RT'], 'Jump 5'],
        [['Menu'], 'Settings'],
      ],
      `Hold ${padKey('View')} + ${padKey('Menu')} in a game for the menu`,
    );
  } else {
    html = hintBar(
      [
        [['&larr;&uarr;&darr;&rarr;'], 'Move'],
        [['Enter'], 'Play'],
        [['Esc'], 'Back'],
        [['/'], 'Search'],
        [['Y'], yLabel],
        [['Q', 'E'], 'System'],
        [['PgUp', 'PgDn'], 'Jump'],
        [['F11'], 'Fullscreen'],
      ],
      'Drag games anywhere to add them',
    );
  }
  $('#hints').innerHTML = html;
}
addEventListener('keydown', e => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  setMode('kb');
  userInput();
  if (!launchEl.hidden) {
    e.preventDefault();
    return;
  }
  const k = e.key;
  if (capture) {
    e.preventDefault();
    if (k === 'Escape') endCapture(null);
    return;
  }
  if ((state.screen === 'controls' || state.screen === 'theme') && /^[yYqQeE/]$/.test(k)) return;
  if (osk) {
    const od = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    e.preventDefault();
    if (od[k]) move(...od[k]);
    else if (k === 'Escape') closeOsk(false);
    else if (k === 'Enter') closeOsk(true);
    else if (k === 'Backspace') oskKey('back');
    else if (k.length === 1) oskType(k);
    return;
  }
  if (e.target.matches && e.target.matches('input')) {
    if (k === 'ArrowDown' && e.target.id === 'lbsearch') {
      e.preventDefault();
      move(0, 1);
    } else if (k === 'Escape') {
      e.target.blur();
      focusEl(stage.querySelector(`[data-game="${state.sel}"]`) || stage.querySelector('[data-f]'));
    } else if (k === 'Enter' && (e.target.id === 'ra-pass' || e.target.id === 'ra-user')) raLogin();
    else if (k === 'Enter' && e.target.id === 'pf-name') stage.querySelector('[data-act="pf-save"]').click();
    else if (k === 'Enter' && e.target.id === 'ra-key') stage.querySelector('[data-act="ra-savekey"]').click();
    return;
  }
  const dirs = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
  if (dirs[k]) {
    e.preventDefault();
    move(...dirs[k]);
    return;
  }
  if (k === 'q' || k === 'Q') cycleSys(-1);
  else if (k === 'e' || k === 'E') cycleSys(1);
  else if (k === 'y' || k === 'Y') go(state.screen === 'lib' ? 'home' : 'lib');
  else if (k === 'Escape') back();
  else if (k === 'PageDown') {
    e.preventDefault();
    jump(5);
  } else if (k === 'PageUp') {
    e.preventDefault();
    jump(-5);
  } else if (k === '/') {
    e.preventDefault();
    if (state.screen !== 'lib') go('lib');
    $('#lbsearch').focus();
  } else if (k === 'Enter' && !document.activeElement.matches('button, input')) {
    e.preventDefault();
    activate();
  }
});

/* ---------- Xbox controller (Gamepad API) ---------- */
const pad = { held: {}, next: {} };
let padSeen = false,
  lastPad = null;
function padStatus(gp) {
  const on = !!gp;
  $('#padpill').classList.toggle('on', on);
  $('#padtxt').textContent = !on
    ? 'Press a button on your controller'
    : /xbox|xinput|045e/i.test(gp.id)
      ? 'Xbox controller connected'
      : 'Controller connected';
}
addEventListener('gamepadconnected', e => padStatus(e.gamepad));
addEventListener('gamepaddisconnected', () => {
  padSeen = false;
  padStatus(null);
});
function rumble() {
  if (state.mode !== 'pad' || !lastPad) return;
  try {
    const a = lastPad.vibrationActuator;
    if (a && a.playEffect)
      a.playEffect('dual-rumble', { duration: 140, strongMagnitude: 0.35, weakMagnitude: 0.6 }).catch(() => {});
  } catch (err) {}
}
function padPress(k) {
  setMode('pad');
  userInput();
  if (!launchEl.hidden) return;
  if (osk) {
    if (k === 'a') {
      const el = document.activeElement;
      if (el && oskKeys.contains(el)) el.click();
      else focusEl(oskKeys.querySelector('[data-k="a"]'));
    } else if (k === 'b') closeOsk(false);
    else if (k === 'x') oskKey('back');
    else if (k === 'y') oskKey('space');
    else if (k === 'lt') oskKey('shift');
    else if (k === 'menu') closeOsk(true);
    return;
  }
  if ((state.screen === 'controls' || state.screen === 'theme') && ['x', 'y', 'lb', 'rb', 'lt', 'rt'].includes(k))
    return;
  if (k === 'a') activate();
  else if (k === 'b') back();
  else if (k === 'x') openSearchOsk();
  else if (k === 'y') go(state.screen === 'lib' ? 'home' : 'lib');
  else if (k === 'lb') cycleSys(-1);
  else if (k === 'rb') cycleSys(1);
  else if (k === 'lt') jump(-5);
  else if (k === 'rt') jump(5);
  else if (k === 'menu') go(state.screen === 'settings' ? 'home' : 'settings');
  else if (k === 'view') api.toggleFullscreen();
}
function poll(t) {
  let gp = null;
  try {
    gp = Array.from(navigator.getGamepads ? navigator.getGamepads() : []).find(Boolean) || null;
  } catch (err) {}
  if (capture) {
    captureTick(t);
    requestAnimationFrame(poll);
    return;
  }
  if (gp && !state.running && document.hasFocus()) {
    lastPad = gp;
    if (!padSeen) {
      padSeen = true;
      padStatus(gp);
    }
    const ax = gp.axes || [],
      b = i => !!(gp.buttons[i] && gp.buttons[i].pressed);
    const dirs = {
      up: [b(12) || ax[1] < -0.55, 0, -1],
      down: [b(13) || ax[1] > 0.55, 0, 1],
      left: [b(14) || ax[0] < -0.55, -1, 0],
      right: [b(15) || ax[0] > 0.55, 1, 0],
    };
    for (const [d, [on, dx, dy]] of Object.entries(dirs)) {
      if (on) {
        const first = !pad.held[d];
        if (first || t > pad.next[d]) {
          pad.held[d] = true;
          pad.next[d] = t + (first ? 380 : 110);
          setMode('pad');
          if (launchEl.hidden) move(dx, dy);
        }
      } else pad.held[d] = false;
    }
    for (const [k, i] of Object.entries({ a: 0, b: 1, x: 2, y: 3, lb: 4, rb: 5, lt: 6, rt: 7, view: 8, menu: 9 })) {
      const on = b(i);
      if (on && !pad.held[k]) padPress(k);
      pad.held[k] = on;
    }
  } else if (gp && !padSeen) {
    padSeen = true;
    padStatus(gp);
  } else if (gp) {
    // Game running or window in background: remember what is held so nothing fires on return.
    for (const [k, i] of Object.entries({ a: 0, b: 1, x: 2, y: 3, lb: 4, rb: 5, lt: 6, rt: 7, view: 8, menu: 9 }))
      pad.held[k] = !!(gp.buttons[i] && gp.buttons[i].pressed);
  }
  requestAnimationFrame(poll);
}
