/* Dustoff renderer: Moving the highlight, launching games, rename/remove, and adding games by drag and drop. */
/* ---------- navigation ---------- */
function move(dx, dy) {
  userInput();
  const root = osk ? oskKeys : stage;
  const items = [...root.querySelectorAll('[data-f]')].filter(e => e.offsetParent !== null);
  const cur = document.activeElement;
  if (!root.contains(cur) || !cur.matches('[data-f]')) {
    focusEl((root === stage && stage.querySelector(`[data-game="${state.sel}"]`)) || items[0]);
    return;
  }
  const r = cur.getBoundingClientRect(),
    cx = r.left + r.width / 2,
    cy = r.top + r.height / 2;
  let best = null,
    bs = Infinity;
  for (const e of items) {
    if (e === cur) continue;
    const q = e.getBoundingClientRect(),
      x = q.left + q.width / 2,
      y = q.top + q.height / 2;
    const main = dx ? (x - cx) * dx : (y - cy) * dy;
    if (main <= 4) continue;
    const cross = dx ? Math.abs(y - cy) : Math.abs(x - cx);
    const overlap = dx ? q.bottom > r.top && q.top < r.bottom : q.right > r.left && q.left < r.right;
    const s = main + cross * (overlap ? 0.4 : 3);
    if (s < bs) {
      bs = s;
      best = e;
    }
  }
  if (best) focusEl(best);
}
function cycleSys(d) {
  const opts = ['all', ...present()];
  state.sys = opts[(opts.indexOf(state.sys) + d + opts.length) % opts.length];
  render();
}
function jump(n) {
  const items = [...stage.querySelectorAll('[data-game]')].filter(e => e.offsetParent !== null);
  if (!items.length) return;
  let i = items.indexOf(document.activeElement);
  if (i < 0) i = 0;
  focusEl(items[Math.max(0, Math.min(items.length - 1, i + n))]);
}
function back() {
  if (state.screen === 'controls') {
    sfx('back');
    ctlClose();
  } else if (state.screen !== 'home') {
    sfx('back');
    go('home');
  }
}
function activate() {
  const el = document.activeElement;
  if (el && el.matches('input') && stage.contains(el)) {
    openInputOsk(el);
    return;
  }
  if (el && stage.contains(el) && el.matches('[data-f]')) el.click();
  else move(0, 0);
}

/* ---------- launching ---------- */
const launchEl = $('#launch');
let launchingId = null;
async function launchGame(id, resume) {
  if (state.running || launchingId) return;
  const g = byId(id);
  if (!g) return;
  launchingId = id;
  $('#l-art').innerHTML = art(g);
  $('#l-sys').textContent = SYS(g.sys).full;
  $('#l-title').textContent = g.title;
  $('#l-msg').textContent = `${resume ? 'Continuing' : 'Starting'} in ${SYS(g.sys).emu}…`;
  $('#l-bar').classList.remove('done');
  launchEl.hidden = false;
  rumble();
  sfx('start');
  const r = await api.launch(id, resume);
  if (!r || r.error) {
    launchEl.hidden = true;
    launchingId = null;
    toast(r ? r.error : 'Something went wrong starting the game.');
  }
}
api.on('game:state', d => {
  if (d.running) {
    state.running = true;
    $('#l-bar').classList.add('done');
    $('#l-msg').textContent =
      'Playing. Hold View + Menu on your controller for the in-game menu. Quit from there to come back here.';
  } else {
    state.running = false;
    const id = launchingId;
    launchingId = null;
    launchEl.hidden = true;
    if (id) state.sel = id;
    const g = byId(id);
    if (d.secs > 5) toast(`Played ${fmtDur(d.secs)}.${g && g.resume ? ' Continue is ready for next time.' : ''}`);
  }
});

/* ---------- rename / remove ---------- */
function startRename() {
  const g = byId(state.sel);
  if (!g) return;
  $('#lbtitlewrap').innerHTML = /* HTML */ `<input
    id="lbrename"
    class="lb-rename"
    value="${esc(g.title)}"
    aria-label="Game title"
  />`;
  const i = $('#lbrename');
  i.focus();
  i.select();
  let ran = false;
  const done = save => {
    if (ran) return;
    ran = true;
    if (save && i.value.trim() && i.value.trim() !== g.title) api.update(g.id, { title: i.value.trim() });
    else render();
  };
  i.addEventListener('keydown', e => {
    e.stopPropagation();
    if (e.key === 'Enter') {
      e.preventDefault();
      done(true);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      done(false);
    }
  });
  i.addEventListener('blur', () => done(true));
}
async function removeSel() {
  const g = byId(state.sel);
  if (!g) return;
  const btn = $('#lbremove');
  if (!removeArmed) {
    removeArmed = true;
    btn.textContent = 'Press again to remove';
    btn.classList.add('armed');
    return;
  }
  const L = libList(),
    i = L.indexOf(g),
    next = L[i + 1] || L[i - 1];
  state.sel = next ? next.id : null;
  removeArmed = false;
  await api.remove(g.id);
  toast(`Removed ${g.title} from the library. The game file is still in your games folder.`);
}

/* ---------- adding games ---------- */
let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 5200);
}
api.on('toast', toast);
async function addPaths(paths) {
  if (!paths.length) return;
  toast(`Adding ${paths.length === 1 ? 'your game' : paths.length + ' items'}…`);
  const r = await api.addPaths(paths);
  const parts = [...(r.installed || [])];
  if (r.added.length === 1) parts.push(`Added ${r.added[0].title} to ${SYS(r.added[0].sys).name}.`);
  else if (r.added.length) parts.push(`Added ${r.added.length} games.`);
  const unverified = r.added.filter(g => g.verified === false).length;
  if (unverified)
    parts.push(
      `${unverified} didn't match the game database, so ${unverified === 1 ? 'it may be' : 'they may be'} a modified or bad copy.`,
    );
  if (r.dupes.length)
    parts.push(`${r.dupes.length === 1 ? r.dupes[0] + ' is' : r.dupes.length + ' games are'} already in your library.`);
  if (r.unknown.length)
    parts.push(
      `Skipped ${r.unknown.length} file${r.unknown.length === 1 ? '' : 's'} that ${r.unknown.length === 1 ? "isn't a" : "aren't"} supported game file${r.unknown.length === 1 ? '' : 's'}.`,
    );
  if (r.failed.length) parts.push(`Couldn't add: ${r.failed.join('; ')}.`);
  if (r.added.length) {
    state.sel = r.added[0].id;
    state.sys = 'all';
    if (state.screen === 'settings') state.screen = 'home';
    render();
  }
  toast(parts.join(' ') || 'Nothing to add.');
}
$('#addbtn').addEventListener('click', () => $('#filein').click());
$('#filein').addEventListener('change', e => {
  addPaths([...e.target.files].map(f => api.pathForFile(f)));
  e.target.value = '';
});
let dragDepth = 0;
const hasFiles = e => e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files');
addEventListener('dragenter', e => {
  if (!hasFiles(e)) return;
  e.preventDefault();
  dragDepth++;
  $('#drop').hidden = false;
});
addEventListener('dragover', e => {
  if (hasFiles(e)) e.preventDefault();
});
addEventListener('dragleave', () => {
  dragDepth = Math.max(0, dragDepth - 1);
  if (!dragDepth) $('#drop').hidden = true;
});
addEventListener('drop', e => {
  e.preventDefault();
  dragDepth = 0;
  $('#drop').hidden = true;
  if (!e.dataTransfer) return;
  const paths = [...e.dataTransfer.files].map(f => api.pathForFile(f)).filter(Boolean);
  const pics = paths.filter(p => /\.(png|jpe?g|webp|gif|bmp)$/i.test(p));
  if (pics.length && pics.length === paths.length) {
    const g = byId(state.sel);
    if (state.screen === 'lib' && g)
      api
        .setArtFile(g.id, pics[0])
        .then(r =>
          toast(r && r.ok ? `New picture set for ${g.title}.` : (r && r.error) || "Couldn't use that picture."),
        );
    else toast('To change a picture, open the game in the Library first, then drop the picture on the window.');
    return;
  }
  addPaths(paths);
});
