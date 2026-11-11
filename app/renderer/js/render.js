/* Dustoff renderer: Drawing the current screen, focus, and clicks on any button. */
/* ---------- render + focus ---------- */
function focusEl(el, instant) {
  if (!el) return;
  el.focus({ preventScroll: true });
  el.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: instant || reduce ? 'auto' : 'smooth' });
}
function render() {
  const active = document.activeElement;
  if (osk || (active && active.matches('input') && stage.contains(active))) {
    state.pendingRender = true;
    return;
  }
  state.pendingRender = false;
  const prevAct = active && stage.contains(active) && active.dataset ? active.dataset.act : null;
  if (state.sys !== 'all' && !present().includes(state.sys)) state.sys = 'all';
  const keep = [...stage.querySelectorAll('.lb-main, .sp-strip, .lb-side')].map(e => [
    e.className,
    e.scrollTop,
    e.scrollLeft,
  ]);
  document.body.dataset.ui = curTheme().id;
  stage.innerHTML =
    state.screen === 'lib'
      ? libRender()
      : state.screen === 'settings'
        ? settingsRender()
        : state.screen === 'controls'
          ? ctlRender()
          : state.screen === 'theme'
            ? themeRender()
            : homeRender();
  for (const [cls, t, l] of keep) {
    const e = stage.querySelector('.' + cls.split(' ')[0]);
    if (e) {
      e.scrollTop = t;
      e.scrollLeft = l;
    }
  }
  const navOn = state.screen === 'controls' ? state.ctl.from : state.screen;
  document.querySelectorAll('.navbtn').forEach(b => b.classList.toggle('on', b.dataset.screen === navOn));
  $('#libcount').textContent = gameCount(LIB.games.length);
  drawHints();
  if (state.screen === 'theme') {
    const id = state.thPrev || curTheme().id;
    drawThemePreview(id);
    focusEl(
      (prevAct === 'theme-sound' && stage.querySelector('[data-act="theme-sound"]')) ||
        stage.querySelector(`.thp-item[data-theme="${id}"]`),
      true,
    );
    return;
  }
  if (state.screen === 'controls') {
    focusEl(
      (state.ctl.focus && stage.querySelector(`[data-ctl="${state.ctl.focus}"]`)) ||
        (prevAct && stage.querySelector(`[data-act="${prevAct}"]`)) ||
        stage.querySelector('[data-f]'),
      true,
    );
    return;
  }
  if (state.screen === 'settings') {
    fillSwitchStatus();
    focusEl((prevAct && stage.querySelector(`[data-act="${prevAct}"]`)) || stage.querySelector('[data-f]'), true);
    return;
  }
  const el =
    stage.querySelector(`[data-game="${state.sel}"]`) ||
    stage.querySelector('[data-game]') ||
    stage.querySelector('[data-f]');
  if (el) focusEl(el, true);
  if (el && el.dataset.game) select(byId(el.dataset.game));
  const again = prevAct && stage.querySelector(`[data-act="${prevAct}"]`);
  if (again && prevAct !== 'home' && prevAct !== 'library') focusEl(again, true);
}
stage.addEventListener('focusout', e => {
  if (e.target.matches && e.target.matches('input'))
    setTimeout(() => {
      if (state.pendingRender && !(document.activeElement && document.activeElement.matches('input'))) render();
    }, 0);
});
function select(g) {
  if (!g) return;
  if (state.screen === 'lib') libSelect(g);
  else homeSelect(g);
  maybeProgress(g);
}
const progressAsked = new Set();
async function maybeProgress(g) {
  const ra = LIB.settings.ra || {};
  if (!g.raGameId || !ra.apiKey || progressAsked.has(g.id)) return;
  progressAsked.add(g.id);
  const p = await api.raProgress(g.id);
  if (p) {
    g.ra = p;
    if (state.sel === g.id) select(g);
  }
}
function go(screen) {
  state.screen = screen;
  render();
}

stage.addEventListener('focusin', e => {
  const tid =
    state.screen === 'theme' && e.target.classList && e.target.classList.contains('thp-item') && e.target.dataset.theme;
  if (tid && tid !== state.thPrev) drawThemePreview(tid);
  const id = e.target.dataset && e.target.dataset.game;
  if (id && id !== state.sel) {
    state.sel = id;
    select(byId(id));
  }
});
stage.addEventListener('pointermove', e => {
  if (e.pointerType !== 'mouse' || osk || !$('#launch').hidden) return;
  const el = e.target.closest('[data-game]');
  if (el && document.activeElement !== el) {
    setMode('kb');
    userInput();
    el.focus({ preventScroll: true });
  }
});
// Tick whenever the highlight moves because of the user (keyboard, controller or mouse).
document.addEventListener('focusin', e => {
  if (performance.now() - lastInput > 250 || !e.target.matches || !e.target.matches('[data-f], .navbtn')) return;
  const tid = state.screen === 'theme' && e.target.classList.contains('thp-item') && e.target.dataset.theme;
  sfx('move', tid ? HubThemes.get(tid) : null);
});
document.addEventListener('pointerdown', userInput, true);
stage.addEventListener('click', async e => {
  const b = e.target.closest('[data-f]');
  if (!b) return;
  const act = b.dataset.act;
  if (b.dataset.pending) return toast('This game is still being added. It will be ready in a moment.');
  if (!b.dataset.game && !['theme-pick', 'theme-sound', 'play', 'continue', 'remove'].includes(act))
    sfx(act === 'fs-start' || act === 'ctl-mode' || (b.dataset.ctl && !capture) ? 'toggle' : 'select');
  if (b.dataset.game) {
    const g = byId(b.dataset.game);
    return launchGame(g.id, !!g.resume);
  }
  if (b.dataset.sys) {
    state.sys = b.dataset.sys;
    return render();
  }
  const g = byId(state.sel);
  if (act === 'play' && g) launchGame(g.id, false);
  else if (act === 'continue' && g) launchGame(g.id, true);
  else if (act === 'sys') cycleSys(1);
  else if (act === 'library') go('lib');
  else if (act === 'settings') go('settings');
  else if (act === 'profile') {
    go('settings');
    const i = $('#pf-name');
    if (i) {
      $('#pfcard').scrollIntoView({ block: 'start' });
      focusEl(i, true);
    }
  } else if (act === 'pf-save') {
    const v = ($('#pf-name') || {}).value || '';
    await api.setSettings({ profile: { name: v } });
    toast(v.trim() ? `Saved. Your badge says ${v.trim()}.` : 'Saved. Your badge says Player 1.');
  } else if (act === 'pf-color') {
    await api.setSettings({ profile: { color: b.dataset.color } });
    if ((LIB.settings.profile || {}).icon) await api.clearProfilePic();
  } else if (act === 'pf-pic') {
    const r = await api.pickProfilePic();
    if (r && r.ok) toast('Profile picture set.');
  } else if (act === 'pf-nopic') {
    await api.clearProfilePic();
    toast('Picture removed. Your badge uses its color again.');
  } else if (act === 'art-set' && g) {
    const r = await api.pickArt(g.id);
    if (r && r.error) toast(r.error);
    else if (r && r.ok) toast(`New picture set for ${g.title}.`);
  } else if (act === 'art-reset' && g) {
    toast('Finding the original picture…');
    const r = await api.resetArt(g.id);
    toast(r && r.ok ? 'Original picture is back.' : "Couldn't find a picture online, so it shows the generated one.");
  } else if (act === 'theme') go('theme');
  else if (act === 'theme-pick') {
    const t = HubThemes.get(b.dataset.theme);
    state.thPrev = t.id;
    sfx('start', t);
    await api.setSettings({ theme: t.id });
    toast(`${t.name} is on.`);
  } else if (act === 'theme-sound') {
    const on = !soundsOn();
    if (on) HubThemes.sfx(curTheme(), 'toggle');
    await api.setSettings({ themeSounds: on });
    toast(on ? 'Menu sounds on.' : 'Menu sounds off.');
  } else if (act === 'remove') {
    sfx('error');
    removeSel();
  } else if (act === 'home') go('home');
  else if (act === 'sort') {
    const k = Object.keys(SORTS);
    state.sort = k[(k.indexOf(state.sort) + 1) % k.length];
    render();
    focusEl(stage.querySelector('[data-act="sort"]'), true);
  } else if (act === 'rename') state.mode === 'pad' ? openRenameOsk() : startRename();
  else if (act === 'remove') removeSel();
  else if (act === 'add') $('#filein').click();
  else if (act === 'fs-start') {
    await api.setSettings({ startFullscreen: !LIB.settings.startFullscreen });
  } else if (act === 'fs-now') api.toggleFullscreen();
  else if (act === 'games-folder') api.open('games');
  else if (act === 'sw-open') {
    api.openSwitchEmu();
    toast('Opening Ryubing. Come back here when you are done.');
  } else if (act === 'sw-folder') api.open('switch');
  else if (act === 'sw-pick') {
    const r = await api.pickSwitchEmu();
    if (r && r.error) toast(r.error);
    else if (r && r.ok) toast('Ryubing is set up. Drop your Switch keys and firmware here next.');
  } else if (act === 'wu-open') {
    api.openWiiuEmu();
    toast('Opening Cemu. Come back here when you are done.');
  } else if (act === 'wu-folder') api.open('wiiu');
  else if (act === 'ctl-open') openControls(b.dataset.ctlsys, null);
  else if (act === 'ctl-game' && g) openControls(g.sys, g.id);
  else if (act === 'ctl-edit') ctlEdit(b.dataset.ctl);
  else if (act === 'ctl-mode') ctlCycleMode();
  else if (act === 'ctl-reset') ctlReset();
  else if (act === 'ctl-done') ctlClose();
  else if (act === 'ra-login') raLogin();
  else if (act === 'ra-logout') {
    await api.raLogout();
    toast('Signed out of RetroAchievements.');
  } else if (act === 'ra-savekey') {
    await api.setSettings({ ra: { apiKey: $('#ra-key').value.trim() } });
    progressAsked.clear();
    toast('Saved. Progress shows on each game.');
  }
});
async function raLogin() {
  const u = $('#ra-user').value.trim(),
    p = $('#ra-pass').value;
  const msg = $('#ra-msg');
  if (!u || !p) {
    msg.className = 'err';
    msg.textContent = 'Enter your username and password.';
    return;
  }
  msg.className = '';
  msg.textContent = 'Signing in…';
  const r = await api.raLogin(u, p);
  if (r.error) {
    msg.className = 'err';
    msg.textContent = r.error;
    return;
  }
  toast(`Signed in as ${r.user}.`);
}
document.querySelectorAll('.navbtn').forEach(b =>
  b.addEventListener('click', () => {
    sfx('select');
    go(b.dataset.screen);
  }),
);
