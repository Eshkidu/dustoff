/* Dustoff renderer: Startup, live updates from the main process, and the self-test. */
/* ---------- boot ---------- */
api.on('lib:changed', data => {
  LIB = data;
  render();
});
api.on('lib:pending', d => {
  if (d.done) {
    if (PENDING.delete(d.key)) render();
    return;
  }
  const old = PENDING.get(d.key),
    p = Object.assign({}, old || {}, d);
  PENDING.set(d.key, p);
  if (!old || old.name !== p.name || old.sys !== p.sys) render();
  else updatePending(p);
});
api.getLibrary().then(async data => {
  LIB = data;
  drawHints();
  render();
  requestAnimationFrame(poll);
  if (api.selftestInfo && (await api.selftestInfo())) runSelfTest();
});
// Renders every screen in every theme (plus controls, keyboard and sounds) and reports any errors.
async function runSelfTest() {
  const errors = [];
  addEventListener('error', e => errors.push(String(e.message || e)));
  addEventListener('unhandledrejection', e => errors.push('promise: ' + ((e.reason && e.reason.message) || e.reason)));
  const savedTheme = LIB.settings.theme;
  let steps = 0;
  const step = (name, fn) => {
    try {
      if (document.activeElement) document.activeElement.blur();
      fn();
      steps++;
    } catch (e) {
      errors.push(`${name}: ${e.message}`);
    }
  };
  for (const t of HubThemes.list) {
    LIB.settings.theme = t.id;
    for (const scr of ['home', 'lib', 'settings', 'theme'])
      step(`${t.id}/${scr}`, () => {
        state.screen = scr;
        render();
        const tiles = stage.querySelectorAll('[data-game]');
        if (tiles[1]) tiles[1].focus();
        if (scr === 'theme') drawThemePreview(t.id);
      });
  }
  for (const sys of Object.keys((LIB.controls || {}).systems || {}))
    step(`controls/${sys}`, () => {
      state.screen = 'settings';
      openControls(sys, null);
    });
  step('keyboard', () => {
    openOsk({ label: 'Test', placeholder: '' });
    oskKey('a');
    oskKey('back');
    closeOsk(false);
  });
  step('sounds', () => HubThemes.sfx(HubThemes.get('pocket'), 'select'));
  step('pending tile', () => {
    PENDING.set('t', { key: 't', name: 'Test Game', stage: 'copying', pct: 50 });
    state.screen = 'home';
    render();
    PENDING.delete('t');
    render();
  });
  LIB.settings.theme = savedTheme;
  await new Promise(r => setTimeout(r, 800));
  api.selftestDone({ ok: errors.length === 0, errors, steps, games: LIB.games.length, themes: HubThemes.list.length });
}
