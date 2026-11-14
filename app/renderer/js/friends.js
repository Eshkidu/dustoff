/* Dustoff renderer: Friends screen. Invite a friend (pick a game, get a code) or join one (type their code). */
const COOP_SYS = new Set(['gc', 'wii', 'wiiu']);
// Multiplayer games only (when the game database knows; GameCube games are always allowed).
const canInvite = g => g && COOP_SYS.has(g.sys) && g.players !== 1;
const playersText = g => (g.players ? (g.players === 1 ? '1 player' : `1 to ${g.players} players`) : '');
const cleanCode = t =>
  String(t || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');

function friendsRender() {
  const games = sorted(LIB.games.filter(canInvite), 'recent');
  const list = games.length
    ? games
        .map(
          g =>
            /* HTML */ `<button class="fr-game" data-f data-act="coop-host" data-gid="${g.id}">
              <span class="fr-art">${art(g)}</span
              ><span class="fr-t"
                ><b>${esc(g.title)}</b
                ><span>${esc([SYS(g.sys).name, playersText(g)].filter(Boolean).join(' · '))}</span></span
              >
            </button>`,
        )
        .join('')
    : /* HTML */ `<p>Add a GameCube, Wii or Wii U game to invite friends.</p>`;
  return /* HTML */ `<div class="d d-st">
    <div class="st-wrap">
      <h1>Play with a friend</h1>
      <section class="card fr-join">
        ${mascotImg('happy', 'fr-mascot')}
        <h2>Join a friend</h2>
        <p>
          When your friend starts a game with Play with a friend, they get a code. Type it here and you're in as Player
          2, 3 or 4. You don't need the game.
        </p>
        <div class="row">
          <button class="sbtn primary" data-f data-act="coop-join">Enter a friend code</button>
        </div>
      </section>
      <section class="card">
        <h2>Invite a friend</h2>
        <p>
          Pick a game. It starts right away and shows a code for your friend. Up to 3 friends can join, as many as the
          game allows.
        </p>
        <div class="fr-list">${list}</div>
      </section>
      <section class="card wide">
        <h2>Good to know</h2>
        <p>
          Your friend sees and hears your game, and their controller works like a second controller plugged into your
          PC. Works with GameCube, Wii and Wii U games for now. A wired internet connection makes it smoothest.
        </p>
      </section>
    </div>
  </div>`;
}

/* ---------- hosting ---------- */
async function hostGame(id, resume) {
  if (state.running || launchingId) return;
  const g = byId(id);
  if (!g) return;
  if (!canInvite(g)) {
    toast(
      g.players === 1
        ? `${g.title} is a one-player game, so there's no spot for a friend.`
        : 'Playing with a friend works with GameCube, Wii and Wii U games for now.',
      'surprised',
    );
    return;
  }
  launchingId = id;
  state.coopCode = null;
  $('#l-art').innerHTML = art(g);
  $('#l-sys').textContent = SYS(g.sys).full;
  $('#l-title').textContent = g.title;
  $('#l-msg').textContent = 'Getting a friend code…';
  $('#l-bar').classList.remove('done');
  $('#l-mascot').src = MASCOT.sleepy;
  launchEl.hidden = false;
  rumble();
  sfx('start');
  const r = await api.coopHost(id, resume);
  if (!r || r.error) {
    launchEl.hidden = true;
    launchingId = null;
    toast(r ? r.error : 'Something went wrong starting the game.', 'surprised');
    return;
  }
  state.coopCode = r.code;
  drawCodeMsg(state.running);
}
function drawCodeMsg(playing) {
  const m = $('#l-msg');
  m.textContent = '';
  const code = document.createElement('b');
  code.className = 'l-code';
  code.textContent = state.coopCode;
  m.append(
    'Friend code ',
    code,
    document.createElement('br'),
    playing
      ? 'Your friend opens Dustoff, goes to Friends and types this code. It also shows in the corner of your game.'
      : 'Starting the game…',
  );
}

/* ---------- joining ---------- */
function openJoin() {
  openOsk({
    label: 'Friend code',
    placeholder: 'Like K7P-2QX',
    info: t => {
      const c = cleanCode(t);
      return c.length === 6 ? 'Press Done to join' : `${c.length} of 6`;
    },
    onDone: async t => {
      const r = await api.coopJoin(cleanCode(t));
      if (r && r.error) toast(r.error, 'surprised');
    },
    onCancel: () => focusEl(stage.querySelector('[data-act="coop-join"]')),
  });
}
api.on('coop:left-game', () => toast('Back from your friend’s game. Thanks for playing!', 'happy'));
