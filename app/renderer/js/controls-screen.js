/* Dustoff renderer: Controls screen: remap buttons per system or per game, with "press a button" capture. */
/* ---------- controls ---------- */
const CDEF = () => LIB.controls || { systems: {}, inputs: {}, groups: {} };
function ctlSaved() {
  const c = state.ctl;
  if (!c) return null;
  if (c.gid) {
    const g = byId(c.gid);
    return g ? g.controls || null : null;
  }
  return (LIB.settings.controls || {})[c.sys] || null;
}
// Same merge rule as the main process: defaults, then system, then game.
function ctlEffective() {
  const c = state.ctl,
    def = CDEF().systems[c.sys];
  const sysSaved = (LIB.settings.controls || {})[c.sys] || null;
  const gameSaved = c.gid ? (byId(c.gid) || {}).controls || null : null;
  let mode = (gameSaved && gameSaved.mode) || (sysSaved && sysSaved.mode) || def.defMode;
  if (!def.modes[mode]) mode = def.defMode;
  const map = {};
  for (const x of def.modes[mode].controls) map[x.id] = x.def;
  for (const src of [sysSaved, gameSaved]) Object.assign(map, (src && src.map && src.map[mode]) || {});
  return { mode, map, def };
}
function openControls(sys, gid) {
  if (!CDEF().systems[sys]) return;
  state.ctl = { sys, gid, from: state.screen === 'controls' ? state.ctl.from : state.screen, focus: null };
  go('controls');
}
function ctlClose() {
  const c = state.ctl;
  state.ctl = null;
  state.screen = (c && c.from) || 'settings';
  render();
  if (c && state.screen === 'settings') focusEl(stage.querySelector(`[data-ctlsys="${c.sys}"]`), true);
  if (c && c.gid && state.screen === 'lib') focusEl(stage.querySelector('[data-act="ctl-game"]'), true);
}
function ctlValueLabel(x, v) {
  const D = CDEF();
  return x.type === 'group' ? D.groups[v] || v : D.inputs[v] || v;
}
function ctlRender() {
  const c = state.ctl,
    { mode, map, def } = ctlEffective(),
    D = CDEF();
  const g = c.gid ? byId(c.gid) : null;
  const sysName = SYS(c.sys).name;
  const modes = Object.entries(def.modes);
  const md = def.modes[mode];
  const sub = g
    ? g.controls
      ? `Custom controls for this game. Everything else uses your ${esc(sysName)} controls.`
      : `Using your ${esc(sysName)} controls. Change anything here to give this game its own.`
    : `For every ${esc(sysName)} game, unless a game has its own controls.`;
  const rows = md.controls
    .map(x => {
      const v = map[x.id];
      const changed = v !== x.def;
      return /* HTML */ `<button class="ctl-row" data-f data-act="ctl-edit" data-ctl="${x.id}">
        <span class="ctl-k">${esc(x.label)}</span
        ><span class="ctl-v${v === 'none' ? ' off' : ''}"
          >${x.type === 'group' ? '<i class="cyc">&#8644;</i>' : ''}${esc(ctlValueLabel(x, v))}${changed ? '<i class="chg" title="Changed"></i>' : ''}</span
        >
      </button>`;
    })
    .join('');
  return /* HTML */ `<div class="d d-st">
    <div class="ctl-wrap">
      <p class="lb-eyebrow">Controls · ${esc(SYS(c.sys).full)}</p>
      <h1>${esc(g ? g.title : sysName)}</h1>
      <p class="ctl-sub">${sub}</p>
      ${
        modes.length > 1
          ? /* HTML */ `<button class="ctl-row mode" data-f data-act="ctl-mode">
              <span class="ctl-k">Controller type</span
              ><span class="ctl-v"><i class="cyc">&#8644;</i>${esc(md.label)}</span>
            </button>`
          : ''
      }
      ${md.note ? /* HTML */ `<p class="ctl-note">${esc(md.note)}</p>` : ''}
      ${c.sys === 'switch' ? '<p class="ctl-note">Stick directions can\'t be used as Switch buttons.</p>' : ''}
      <div class="ctl-head"><span>${esc(sysName)} button</span><span>Your controller</span></div>
      <div class="ctl-list">${rows || '<p class="ctl-note">Nothing to set for this controller type.</p>'}</div>
      <div class="ctl-actions">
        <button class="sbtn primary" data-f data-act="ctl-done">Done</button
        ><button class="sbtn" data-f data-act="ctl-reset">
          ${g ? `Use ${esc(sysName)} controls` : 'Reset to default'}
        </button>
      </div>
    </div>
  </div>`;
}
function ctlSave(mutate) {
  const c = state.ctl,
    cur = ctlSaved();
  const data = {
    mode: (cur && cur.mode) || ctlEffective().mode,
    map: JSON.parse(JSON.stringify((cur && cur.map) || {})),
  };
  mutate(data);
  api.setControls(c.sys, c.gid, data);
}
function ctlSet(id, value) {
  const { mode } = ctlEffective();
  state.ctl.focus = id;
  ctlSave(d => {
    d.mode = mode;
    d.map[mode] = d.map[mode] || {};
    d.map[mode][id] = value;
  });
}
function ctlCycleMode() {
  const { mode, def } = ctlEffective(),
    keys = Object.keys(def.modes);
  const next = keys[(keys.indexOf(mode) + 1) % keys.length];
  state.ctl.focus = null;
  ctlSave(d => {
    d.mode = next;
  });
}
function ctlReset() {
  const c = state.ctl,
    g = c.gid && byId(c.gid);
  api.setControls(c.sys, c.gid, null);
  toast(
    g
      ? `${g.title} now uses your ${SYS(c.sys).name} controls.`
      : `${SYS(c.sys).name} controls are back to the default.`,
  );
}
function ctlEdit(id) {
  const { mode, map, def } = ctlEffective();
  const x = def.modes[mode].controls.find(k => k.id === id);
  if (!x) return;
  if (x.type === 'group') {
    const o = x.opts;
    return ctlSet(id, o[(o.indexOf(map[id]) + 1) % o.length]);
  }
  startCapture(x);
}
/* "Press a button" capture with the Gamepad API (standard Xbox layout). */
const CAP_BTNS = [
  'a',
  'b',
  'x',
  'y',
  'lb',
  'rb',
  'lt',
  'rt',
  'back',
  'start',
  'ls',
  'rs',
  'dup',
  'ddown',
  'dleft',
  'dright',
];
let capture = null;
function padNow() {
  try {
    return Array.from(navigator.getGamepads ? navigator.getGamepads() : []).find(Boolean) || null;
  } catch {
    return null;
  }
}
function capInputs(gp) {
  const out = [];
  CAP_BTNS.forEach((id, i) => {
    const b = gp.buttons[i];
    if (b && (b.pressed || b.value > 0.5)) out.push(id);
  });
  const a = gp.axes || [],
    T = 0.6;
  if (a[0] < -T) out.push('lsl');
  if (a[0] > T) out.push('lsr');
  if (a[1] < -T) out.push('lsu');
  if (a[1] > T) out.push('lsd');
  if (a[2] < -T) out.push('rsl');
  if (a[2] > T) out.push('rsr');
  if (a[3] < -T) out.push('rsu');
  if (a[3] > T) out.push('rsd');
  return out;
}
function startCapture(x) {
  if (!padNow()) {
    toast('Connect your controller to change buttons.');
    return;
  }
  capture = { id: x.id, label: x.label, waitRelease: true, until: performance.now() + 7000 };
  const el = $('#capture');
  $('#cap-k').textContent = x.label;
  $('#cap-sys').textContent = state.ctl.gid ? (byId(state.ctl.gid) || {}).title || '' : SYS(state.ctl.sys).name;
  el.hidden = false;
}
function endCapture(inputId) {
  const c = capture;
  capture = null;
  $('#capture').hidden = true;
  // Treat everything as held so the press that was just captured doesn't also move or click.
  for (const k of ['a', 'b', 'x', 'y', 'lb', 'rb', 'lt', 'rt', 'view', 'menu', 'up', 'down', 'left', 'right'])
    pad.held[k] = true;
  if (!inputId) {
    focusEl(stage.querySelector(`[data-ctl="${c.id}"]`), true);
    return;
  }
  const def = CDEF().systems[state.ctl.sys];
  if (def.noStickButtons && /^[lr]s[udlr]$/.test(inputId)) {
    toast("Switch buttons can't use a stick direction. Pick a button instead.");
    focusEl(stage.querySelector(`[data-ctl="${c.id}"]`), true);
    return;
  }
  sfx('select');
  ctlSet(c.id, inputId);
  rumble();
}
function captureTick(t) {
  const gp = padNow();
  if (!gp || t > capture.until) return endCapture(null);
  const list = capInputs(gp);
  if (capture.waitRelease) {
    if (!list.length) capture.waitRelease = false;
    $('#cap-time').style.setProperty('--p', Math.max(0, (capture.until - t) / 7000));
    return;
  }
  $('#cap-time').style.setProperty('--p', Math.max(0, (capture.until - t) / 7000));
  if (list.length) endCapture(list[0]);
}
