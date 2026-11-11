/* Dustoff renderer: Settings screen. */
/* ---------- Settings ---------- */
// About card: version, link, and the mascot's four moods with where each one shows up.
function aboutCard() {
  const moods = [
    ['normal', 'Normal', 'Empty library, and searches with no results'],
    ['happy', 'Happy', 'When a game is added, and while you play'],
    ['sleepy', 'Sleepy', 'While a game is being added or starting'],
    ['surprised', 'Surprised', 'When something goes wrong'],
  ];
  return /* HTML */ `<section class="card wide">
    <h2>About Dustoff</h2>
    <p>
      Version ${esc(LIB.version || '')} ·
      <a href="https://github.com/Eshkidu/dustoff" target="_blank" rel="noopener">github.com/Eshkidu/dustoff</a>
    </p>
    <div class="mascots">
      ${moods
        .map(
          ([m, name, where]) =>
            `<figure>${mascotImg(m)}<figcaption><b>${name}</b><span>${where}</span></figcaption></figure>`,
        )
        .join('')}
    </div>
  </section>`;
}
function settingsRender() {
  const s = LIB.settings,
    ra = s.ra || {};
  const total = LIB.games.reduce((t, g) => t + (g.playSeconds || 0), 0);
  const weekAgo = Date.now() - 7 * 864e5;
  const week = LIB.games.reduce(
    (t, g) => t + (g.sessions || []).filter(x => x.at > weekAgo).reduce((a, x) => a + x.secs, 0),
    0,
  );
  const top = sorted(
    LIB.games.filter(g => g.playSeconds),
    'played',
  ).slice(0, 5);
  const raCard =
    ra.user && ra.token
      ? /* HTML */ `<p>
            Signed in as <b>${esc(ra.user)}</b>. Achievements unlock in NES, SNES, N64, Game Boy, GBC, GBA and supported
            GameCube games.
          </p>
          <p>To show your progress in the hub, paste your Web API key from your RetroAchievements settings page.</p>
          <div class="row">
            <input
              class="sinput"
              id="ra-key"
              data-f
              type="password"
              placeholder="Web API key (optional)"
              aria-label="Web API key"
              value="${esc(ra.apiKey || '')}"
            /><button class="sbtn" data-f data-act="ra-savekey">Save key</button>
          </div>
          <div class="row"><button class="sbtn" data-f data-act="ra-logout">Sign out</button></div>`
      : /* HTML */ `<p>
            Sign in with a free <b>retroachievements.org</b> account to earn achievements in supported games. Your
            password is only used to sign in and isn't saved.
          </p>
          <div class="row">
            <input class="sinput" id="ra-user" data-f placeholder="Username" aria-label="Username" autocomplete="off" />
          </div>
          <div class="row">
            <input
              class="sinput"
              id="ra-pass"
              data-f
              type="password"
              placeholder="Password"
              aria-label="Password"
            /><button class="sbtn primary" data-f data-act="ra-login">Sign in</button>
          </div>
          <p id="ra-msg"></p>`;
  const ctlCard = /* HTML */ `<section class="card wide">
    <h2>Controls</h2>
    <p>
      Choose what each button on your Xbox controller does, for each system. A single game can also get its own controls
      from its page in the Library.
    </p>
    <div class="ctl-sys">
      ${ORDER.map(k => /* HTML */ `<button class="sbtn" data-f data-act="ctl-open" data-ctlsys="${k}"><span class="dot" style="--h:${HUE[k]}"></span>${esc(SYS(k).name)}${LIB.settings.controls && LIB.settings.controls[k] ? ' <em>custom</em>' : ''}</button>`).join('')}
    </div>
  </section>`;
  const pf = profile();
  const pfCard = /* HTML */ `<section class="card wide" id="pfcard">
    <h2>Profile</h2>
    <p>Your name and picture on the Home Row theme's badge.</p>
    <div class="pf">
      <span class="pf-av" style="${pf.avatar}"></span>
      <div class="pf-side">
        <div class="row">
          <input
            class="sinput"
            id="pf-name"
            data-f
            maxlength="20"
            placeholder="Player 1"
            aria-label="Your name"
            autocomplete="off"
            value="${esc((LIB.settings.profile || {}).name || '')}"
          /><button class="sbtn primary" data-f data-act="pf-save">Save name</button>
        </div>
        <div class="row pf-colors">
          ${Object.entries(PF_COLORS)
            .map(
              ([k, v]) =>
                /* HTML */ `<button
                  class="pf-sw${!pf.icon && pf.color === k ? ' on' : ''}"
                  data-f
                  data-act="pf-color"
                  data-color="${k}"
                  style="${badgeStyle(k)}"
                  aria-label="${k} badge with a ${PF_MOODS[k]} mascot"
                  title="${k}"
                ></button>`,
            )
            .join('')}
          <button class="sbtn" data-f data-act="pf-pic">Choose picture</button
          >${pf.icon ? '<button class="sbtn" data-f data-act="pf-nopic">Remove picture</button>' : ''}
        </div>
      </div>
    </div>
  </section>`;
  return /* HTML */ `<div class="d d-st">
    <div class="st-wrap">
      <h1>Settings</h1>
      ${pfCard}${ctlCard}${aboutCard()}
      <section class="card">
        <h2>Display</h2>
        <button class="toggle${s.startFullscreen ? ' on' : ''}" data-f data-act="fs-start">
          Start Dustoff in fullscreen<span class="sw"></span>
        </button>
        <button class="toggle${soundsOn() ? ' on' : ''}" data-f data-act="theme-sound">
          Menu sounds<span class="sw"></span>
        </button>
        <div class="row">
          <button class="sbtn" data-f data-act="fs-now">Toggle fullscreen now</button
          ><span style="color:#8a90a3">or press F11, or View on the controller</span>
        </div>
      </section>
      <section class="card">
        <h2>RetroAchievements</h2>
        ${raCard}
      </section>
      <section class="card">
        <h2>Switch setup</h2>
        <p class="sw-text">
          Switch games need the keys and firmware from your own Switch. Drag your prod.keys file and firmware zip onto
          this window, the same way you add games.
        </p>
        <div class="status" id="swstatus"><b></b><span>Checking…</span></div>
        <div class="row sw-btns">
          <button class="sbtn primary" data-f data-act="sw-open">Open Ryubing</button
          ><button class="sbtn" data-f data-act="sw-folder">Open Switch folder</button>
        </div>
      </section>
      <section class="card">
        <h2>Wii U setup</h2>
        <p>
          Wii U games run in Cemu. A .wua file plays without keys. For .wux or .wud discs, drag the keys.txt from your
          own Wii U onto this window.
        </p>
        <div class="status" id="wustatus"><b></b><span>Checking…</span></div>
        <p style="font-size:13px">Your controller is set up automatically. Change Wii U buttons in Controls above.</p>
        <div class="row">
          <button class="sbtn primary" data-f data-act="wu-open">Open Cemu</button
          ><button class="sbtn" data-f data-act="wu-folder">Open Wii U folder</button>
        </div>
      </section>
      <section class="card">
        <h2>Play time</h2>
        <div class="stats">
          <div class="stat"><b>${fmtDur(total) || '0m'}</b><span>All time</span></div>
          <div class="stat"><b>${fmtDur(week) || '0m'}</b><span>Last 7 days</span></div>
          <div class="stat"><b>${LIB.games.length}</b><span>Games</span></div>
        </div>
        ${
          top.length
            ? /* HTML */ `<ul class="toplist">
                ${top.map(g => /* HTML */ `<li><span>${esc(g.title)}</span><span>${fmtDur(g.playSeconds)}</span></li>`).join('')}
              </ul>`
            : '<p>Play something and your hours show up here.</p>'
        }
      </section>
      <section class="card">
        <h2>Games folder</h2>
        <p>Every game you add is copied here, sorted by system. Removing a game from the hub never deletes the file.</p>
        <div class="row">
          <button class="sbtn" data-f data-act="games-folder">Open games folder</button
          ><button class="sbtn" data-f data-act="add">Add games</button>
        </div>
      </section>
      <section class="card">
        <h2>Controls</h2>
        <div class="ctl">
          <span class="g a">A</span><span>Play or select</span><span class="g b">B</span><span>Back</span>
          <span class="g x">X</span><span>Search</span><span class="g y">Y</span
          ><span>Switch between Home and Library</span>
          <span><span class="g bump">LB</span> <span class="g bump">RB</span></span
          ><span>Change system</span><span><span class="g trig">LT</span> <span class="g trig">RT</span></span
          ><span>Jump 5 games</span> <span class="g view">Menu</span><span>Settings</span
          ><span><span class="g view">View</span> + <span class="g view">Menu</span></span
          ><span>Hold in a game to open the in-game menu</span>
        </div>
      </section>
    </div>
  </div>`;
}
async function fillSwitchStatus() {
  const el = $('#swstatus');
  if (!el) return;
  const s = await api.switchStatus();
  const row = (ok, yes, no) => /* HTML */ `<b class="${ok ? 'ok' : ''}"></b><span>${ok ? yes : no}</span>`;
  const card = el.closest('.card');
  if (!s.installed) {
    card.querySelector('.sw-text').textContent =
      "Switch games need Ryubing, which isn't included with Dustoff. If you have it, choose the folder it's in and Dustoff sets it up for you.";
    el.innerHTML = row(false, '', 'Ryubing not found');
    card.querySelector('.sw-btns').innerHTML =
      '<button class="sbtn primary" data-f data-act="sw-pick">Choose Ryubing folder</button>';
    return fillWiiuStatus(row);
  }
  el.innerHTML =
    row(true, 'Ryubing ready', '') +
    row(s.keys, 'Keys installed', 'Keys missing') +
    row(s.firmware, 'Firmware installed', 'Firmware missing');
  return fillWiiuStatus(row);
}
async function fillWiiuStatus(row) {
  const wu = $('#wustatus');
  if (!wu) return;
  const w = await api.wiiuStatus();
  wu.innerHTML = row(w.keys, 'keys.txt installed (for .wux and .wud)', 'No keys.txt (only needed for .wux and .wud)');
}
