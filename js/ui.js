import * as E from './engine.js';
import { History, loadSetup, saveSetup } from './history.js';

const app = document.getElementById('app');

const DEFAULT_SETUP = {
  names: ['', '', '', '', ''],
  merlin: true,
  percival: true,
  oberon: false,
  mordred: false,
  lady: false,
  shuffleSeats: false,
  voteMode: 'quick',
  fiveRejections: 'autofail',
  evilCount: 4,
};

let history = History.load();
let setup = { ...DEFAULT_SETUP, ...(loadSetup() || {}) };
if (!Array.isArray(setup.names) || setup.names.length < E.MIN_PLAYERS) setup.names = [...DEFAULT_SETUP.names];

// Per-screen state that is never part of the game or its history.
let ui = freshUi();
let logOpen = false;

function freshUi() {
  return { gate: false, selection: [], votes: {}, revealed: false, pick: null, error: '', modal: null };
}

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ---------- actions ----------

function dispatch(action) {
  try {
    history.push(E.reduce(history.current, action));
    ui = freshUi();
  } catch (err) {
    ui.error = err.message;
  }
  render();
}

function configFromSetup() {
  return {
    players: setup.names.map((n) => n.trim()).filter(Boolean),
    merlin: setup.merlin,
    percival: setup.percival && setup.merlin,
    oberon: setup.oberon,
    mordred: setup.mordred,
    lady: setup.lady,
    shuffleSeats: setup.shuffleSeats,
    voteMode: setup.voteMode,
    fiveRejections: setup.fiveRejections,
    evilCount: setup.evilCount,
  };
}

function startGame(config) {
  try {
    const first = E.createGame(config);
    history.clear();
    history.push(first);
    ui = freshUi();
  } catch (err) {
    ui.error = err.message;
  }
  render();
}

function runConfirmed(action) {
  if (action.kind === 'revert') history.revertTo(action.index);
  else if (action.kind === 'setup') history.clear();
  else if (action.kind === 'rematch') return startGame(history.current.config);
  ui = freshUi();
  render();
}

function exportText() {
  const s = history.current;
  const lines = ['The Resistance: Avalon — game log', ''];
  history.log.forEach((e) => lines.push(e.text));
  if (s.phase === 'gameOver') {
    lines.push('', 'Roles:');
    s.players.forEach((p) => lines.push(`  ${p}: ${E.ROLES[s.roles[p]].name}`));
  }
  return lines.join('\n');
}

function downloadLog() {
  const url = URL.createObjectURL(new Blob([exportText()], { type: 'text/plain' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = 'avalon-log.txt';
  a.click();
  URL.revokeObjectURL(url);
}

// ---------- setup screen ----------

function setupView() {
  const rows = setup.names.map((name, i) => `
    <li>
      <span class="num">${i + 1}</span>
      <input class="name" data-i="${i}" value="${esc(name)}" maxlength="${E.MAX_NAME_LENGTH}"
        placeholder="Player ${i + 1}" autocomplete="off" autocapitalize="words" enterkeyhint="next">
      <button class="icon" data-act="remove-name" data-i="${i}" aria-label="Remove player ${i + 1}"
        ${setup.names.length <= E.MIN_PLAYERS ? 'disabled' : ''}>×</button>
    </li>`).join('');

  const check = (key, label, hint, disabled = false) => `
    <label class="option ${disabled ? 'disabled' : ''}">
      <input type="checkbox" data-opt="${key}" ${setup[key] && !disabled ? 'checked' : ''} ${disabled ? 'disabled' : ''}>
      <span><strong>${label}</strong><small>${hint}</small></span>
    </label>`;

  const select = (key, label, options) => `
    <label class="option select">
      <span><strong>${label}</strong></span>
      <select data-opt="${key}">
        ${options.map(([v, t]) => `<option value="${v}" ${setup[key] === v ? 'selected' : ''}>${t}</option>`).join('')}
      </select>
    </label>`;

  return `
    <header class="topbar"><h1>Avalon</h1></header>
    <main class="setup">
      <section class="panel">
        <h2>Players</h2>
        <p class="muted">Enter ${E.MIN_PLAYERS}–${E.MAX_PLAYERS} names in seating order. The leader passes around in this order.</p>
        <ol class="names">${rows}</ol>
        <button class="btn" data-act="add-name" ${setup.names.length >= E.MAX_PLAYERS ? 'disabled' : ''}>+ Add player</button>
      </section>
      <section class="panel">
        <h2>Roles</h2>
        ${check('merlin', 'Merlin & Assassin', 'Merlin knows Evil; the Assassin can win by naming Merlin.')}
        ${check('percival', 'Percival & Morgana', 'Percival sees Merlin and Morgana, not which is which.', !setup.merlin)}
        ${check('mordred', 'Mordred', 'Evil, hidden from Merlin.')}
        ${check('oberon', 'Oberon', 'Evil, unknown to the other Evil players.')}
        <h2>Options</h2>
        ${check('lady', 'Lady of the Lake', 'After missions 2, 3 and 4 the holder learns one player’s allegiance. Suggested for 7+.')}
        ${check('shuffleSeats', 'Shuffle seating', 'Randomize the seating order when the game starts.')}
        ${select('voteMode', 'Team votes', [['quick', 'Record the outcome only'], ['individual', 'Record each player’s vote']])}
        ${select('fiveRejections', 'After 5 rejected teams', [['autofail', 'The mission fails'], ['evilwins', 'Evil wins the game (official)']])}
      </section>
      <section class="panel" id="setup-summary"></section>
    </main>`;
}

function setupSummaryHtml() {
  const config = configFromSetup();
  const n = config.players.length;
  const errors = E.validateConfig(config);
  const inRange = n >= E.MIN_PLAYERS && n <= E.MAX_PLAYERS;
  let body = '';
  if (inRange) {
    const evil = E.evilCountFor(config);
    const sizes = E.MISSION_SIZES[n].map((size, i) => `${size}${E.needsTwoFails(n, i + 1) ? '*' : ''}`).join(' · ');
    body += `<p class="big">${n} players: <span class="good">${n - evil} Good</span> vs <span class="evil">${evil} Evil</span></p>`;
    if (E.EVIL_OPTIONS[n]) {
      body += `<div class="segmented" role="group" aria-label="Evil players">
        ${E.EVIL_OPTIONS[n].map((c) => `<button data-act="evil-count" data-i="${c}" class="${evil === c ? 'on' : ''}">${c} Evil</button>`).join('')}
      </div>`;
    }
    body += `<p>Mission team sizes: <strong>${sizes}</strong></p>`;
    if (n >= 7) body += `<p class="muted">* Mission 4 needs two Fails to fail.</p>`;
    if (E.HOUSE_RULE_COUNTS.includes(n)) body += `<p class="muted">11 and 12 players use house rules; official Avalon stops at 10.</p>`;
    if (!errors.length) {
      const deck = E.buildDeck(config);
      const tally = (keys) => {
        const counts = {};
        keys.forEach((k) => { counts[k] = (counts[k] || 0) + 1; });
        return Object.entries(counts).map(([k, c]) => `${c > 1 ? c + '× ' : ''}${E.ROLES[k].name}`).join(', ');
      };
      body += `<p><span class="good">Good:</span> ${tally(deck.good)}</p><p><span class="evil">Evil:</span> ${tally(deck.evil)}</p>`;
    }
  }
  const allErrors = ui.error ? [...errors, ui.error] : errors;
  body += allErrors.map((e) => `<p class="error">${esc(e)}</p>`).join('');
  return `<h2>Summary</h2>${body}
    <button class="btn primary wide" data-act="start" ${errors.length ? 'disabled' : ''}>Deal roles &amp; start</button>`;
}

function updateSetupSummary() {
  const el = document.getElementById('setup-summary');
  if (el) el.innerHTML = setupSummaryHtml();
}

// ---------- game: board and log ----------

function boardView(s) {
  const n = s.players.length;
  const over = s.phase === 'gameOver';
  const missions = E.MISSION_SIZES[n].map((size, i) => {
    const m = s.missions[i];
    const cls = m ? (m.pass ? 'pass' : 'fail') : (i === s.round - 1 && !over ? 'current' : '');
    const label = m ? (m.pass ? 'Success' : 'Failed') : `Mission ${i + 1}`;
    return `<div class="mission ${cls}"><span class="m-size">${size}${E.needsTwoFails(n, i + 1) ? '*' : ''}</span><span class="m-label">${label}</span></div>`;
  }).join('');

  const pips = Array.from({ length: E.MAX_REJECTIONS }, (_, i) => `<span class="pip ${i < s.rejections ? 'on' : ''}"></span>`).join('');
  const showLeader = ['proposal', 'teamVote', 'mission', 'missionReveal'].includes(s.phase);
  const showTeam = ['teamVote', 'mission', 'missionReveal'].includes(s.phase);
  const seats = s.players.map((p, i) => {
    const leader = showLeader && i === s.leaderIndex;
    const onTeam = showTeam && s.team.includes(p);
    const lady = s.lady && s.lady.holder === p && !over;
    return `<span class="seat ${leader ? 'leader' : ''} ${onTeam ? 'on-team' : ''}">${leader ? '♛ ' : ''}${esc(p)}${lady ? ' <span title="Lady of the Lake">☾</span>' : ''}</span>`;
  }).join('<span class="arrow">→</span>');

  return `
    <section class="panel board">
      <div class="missions">${missions}</div>
      <div class="rejections"><span class="muted">Rejected teams</span><span class="pips">${pips}</span></div>
      <div class="seats">${seats}</div>
      <p class="muted legend">♛ leader${showTeam ? ' · outlined = on the team' : ''}${s.lady ? ' · ☾ Lady of the Lake' : ''}${n >= 7 ? ' · * needs two Fails' : ''}</p>
    </section>`;
}

function logView() {
  const entries = history.log;
  const items = [...entries].reverse().map((e) => `<li class="${e.kind}">${esc(e.text)}</li>`).join('');
  return `
    <aside class="panel log ${logOpen ? 'open' : ''}">
      <button class="log-toggle" data-act="toggle-log" aria-expanded="${logOpen}">
        <h2>Game log</h2><span class="muted">${entries.length} entries ${logOpen ? '▴' : '▾'}</span>
      </button>
      <ol class="log-list">${items}</ol>
    </aside>`;
}

// ---------- game: phase screens ----------

function gateView(name, title, button) {
  return `
    <div class="gate">
      <p class="muted">${title}</p>
      <p class="pass-to">Pass the device to<br><strong>${esc(name)}</strong></p>
      <button class="btn primary wide" data-act="open-gate">${button}</button>
    </div>`;
}

function holdView(secretHtml, tone, doneAct, doneLabel) {
  return `
    <div class="secret concealed ${tone}" id="secret">${secretHtml}</div>
    <button class="btn hold wide" id="hold">Hold to reveal</button>
    <button class="btn primary wide" id="after-hold" data-act="${doneAct}" ${ui.revealed ? '' : 'disabled'}>${doneLabel}</button>
    <p class="muted center">Make sure nobody else can see the screen.</p>`;
}

function revealStage(s) {
  const p = s.players[s.revealIndex];
  const progress = `Role reveal ${s.revealIndex + 1} of ${s.players.length}`;
  if (!ui.gate) return gateView(p, progress, `I am ${esc(p)}`);
  const role = E.ROLES[s.roles[p]];
  const k = s.knowledge[p];
  const secret = `
    <p class="role-name">${role.name}</p>
    <p class="role-team">Team ${role.team === 'good' ? 'Good' : 'Evil'}</p>
    <p class="role-desc">${role.desc}</p>
    ${k.heading ? `<p class="know-head">${k.heading}</p>` : ''}
    ${k.seen.length ? `<ul class="know-list">${k.seen.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
    ${k.note ? `<p class="know-note">${k.note}</p>` : ''}`;
  return `<h2>${esc(p)}, your role</h2>${holdView(secret, role.team, 'next-reveal', 'Hide &amp; pass on')}`;
}

function proposalStage(s) {
  const size = E.teamSize(s);
  const two = E.needsTwoFails(s.players.length, s.round);
  const chips = s.players.map((p, i) => `
    <button class="chip ${ui.selection.includes(i) ? 'on' : ''}" data-act="toggle-pick" data-i="${i}" aria-pressed="${ui.selection.includes(i)}">${esc(p)}</button>`).join('');
  return `
    <h2>Mission ${s.round}: team proposal</h2>
    <p><strong>${esc(E.leaderOf(s))}</strong> is the leader and picks <strong>${size}</strong> players.</p>
    ${two ? '<p class="notice">This mission needs two Fails to fail.</p>' : ''}
    ${s.rejections === E.MAX_REJECTIONS - 1 ? `<p class="notice">Last chance: if this team is rejected, ${s.config.fiveRejections === 'evilwins' ? 'Evil wins' : 'the mission fails'}.</p>` : ''}
    <div class="chips">${chips}</div>
    <button class="btn primary wide" data-act="propose" ${ui.selection.length === size ? '' : 'disabled'}>
      Propose team (${ui.selection.length}/${size})
    </button>`;
}

function teamVoteStage(s) {
  const team = `<div class="chips static">${s.team.map((p) => `<span class="chip on">${esc(p)}</span>`).join('')}</div>`;
  const head = `<h2>Mission ${s.round}: team vote</h2><p><strong>${esc(E.leaderOf(s))}</strong> proposes:</p>${team}`;
  if (s.config.voteMode !== 'individual') {
    return `${head}
      <p>Everyone votes at the table. Did a majority approve? A tie is a rejection.</p>
      <div class="pair">
        <button class="btn good-btn" data-act="quick-vote" data-i="1">Approved</button>
        <button class="btn evil-btn" data-act="quick-vote" data-i="0">Rejected</button>
      </div>`;
  }
  const rows = s.players.map((p, i) => `
    <li>
      <span>${esc(p)}</span>
      <span class="vote-btns">
        <button class="mini ${ui.votes[i] === true ? 'yes' : ''}" data-act="vote" data-i="${i}" data-v="1" aria-pressed="${ui.votes[i] === true}">Approve</button>
        <button class="mini ${ui.votes[i] === false ? 'no' : ''}" data-act="vote" data-i="${i}" data-v="0" aria-pressed="${ui.votes[i] === false}">Reject</button>
      </span>
    </li>`).join('');
  const cast = Object.keys(ui.votes).length;
  const yes = Object.values(ui.votes).filter(Boolean).length;
  return `${head}
    <p>Everyone votes at the table at once, then record each vote here.</p>
    <div class="pair small"><button class="btn" data-act="vote-all" data-i="1">All approve</button><button class="btn" data-act="vote-all" data-i="0">All reject</button></div>
    <ul class="vote-list">${rows}</ul>
    <button class="btn primary wide" data-act="submit-votes" ${cast === s.players.length ? '' : 'disabled'}>
      Submit votes (${yes} approve, ${cast - yes} reject)
    </button>`;
}

function missionStage(s) {
  const p = s.team[s.voteIndex];
  const progress = `Mission ${s.round}: card ${s.voteIndex + 1} of ${s.team.length}`;
  if (!ui.gate) return gateView(p, progress, `I am ${esc(p)}`);
  const pass = `<button class="btn card-btn good-btn" data-act="card" data-v="pass">Success</button>`;
  const fail = `<button class="btn card-btn evil-btn" data-act="card" data-v="fail">Fail</button>`;
  return `
    <h2>${esc(p)}, choose your mission card</h2>
    <p class="muted">Good players must play Success. Your choice is secret.</p>
    <div class="pair cards">${s.swapButtons ? fail + pass : pass + fail}</div>`;
}

function missionRevealStage(s) {
  return `
    <div class="gate">
      <p class="muted">Mission ${s.round}</p>
      <p class="pass-to">All cards are in.<br><strong>Put the device where everyone can see.</strong></p>
      <button class="btn primary wide" data-act="reveal-mission">Reveal mission result</button>
    </div>`;
}

function missionResultStage(s) {
  const m = s.missions[s.missions.length - 1];
  const wins = E.missionWins(s);
  let next = 'Next mission';
  if (wins.good >= 3) next = s.config.merlin ? 'Proceed to the Assassin' : 'End game';
  else if (wins.evil >= 3) next = 'End game';
  const cards = m.cards.map((c) => `<span class="card ${c}">${c === 'pass' ? 'Success' : 'Fail'}</span>`).join('');
  return `
    <h2>Mission ${m.round} result</h2>
    <div class="cards-row">${cards}</div>
    <p class="verdict ${m.pass ? 'good' : 'evil'}">${m.pass ? 'Mission succeeded' : 'Mission failed'}</p>
    <p class="center">${m.fails} Fail${m.fails === 1 ? '' : 's'} played. Team: ${m.team.map(esc).join(', ')}.</p>
    <p class="center muted">Score: Good ${wins.good}, Evil ${wins.evil}</p>
    <button class="btn primary wide" data-act="continue">${next}</button>`;
}

function pickList(candidates, s) {
  return `<div class="chips">${candidates.map((p) => {
    const i = s.players.indexOf(p);
    return `<button class="chip ${ui.pick === i ? 'on' : ''}" data-act="pick" data-i="${i}" aria-pressed="${ui.pick === i}">${esc(p)}</button>`;
  }).join('')}</div>`;
}

function ladyStage(s) {
  return `
    <h2>Lady of the Lake</h2>
    <p><strong>${esc(s.lady.holder)}</strong> chooses a player to examine. Players who have already held the Lady cannot be chosen.</p>
    ${pickList(E.ladyCandidates(s), s)}
    <button class="btn primary wide" data-act="lady-pick" ${ui.pick === null ? 'disabled' : ''}>Examine${ui.pick === null ? '' : ' ' + esc(s.players[ui.pick])}</button>`;
}

function ladyRevealStage(s) {
  const { holder, target } = s.lady;
  if (!ui.gate) return gateView(holder, 'Lady of the Lake', `I am ${esc(holder)}`);
  const team = E.teamOfRole(s.roles[target]);
  const secret = `<p class="role-team">${esc(target)} is</p><p class="role-name">${team === 'good' ? 'Good' : 'Evil'}</p>`;
  return `<h2>${esc(holder)}, the Lady shows you</h2>
    ${holdView(secret, team, 'lady-done', 'Hide &amp; continue')}
    <p class="muted center">You may say anything about what you saw. ${esc(target)} takes the Lady next.</p>`;
}

function assassinStage(s) {
  const assassin = E.findRole(s, 'assassin');
  return `
    <h2>The Assassin strikes</h2>
    <p>Good has won three missions. Evil may talk it over, then <strong>${esc(assassin)}</strong>, the Assassin, names the player they believe is Merlin.</p>
    ${pickList(E.assassinTargets(s), s)}
    <button class="btn evil-btn wide" data-act="assassinate" ${ui.pick === null ? 'disabled' : ''}>Assassinate${ui.pick === null ? '' : ' ' + esc(s.players[ui.pick])}</button>`;
}

function rolesTable(s) {
  return `<ul class="roles-list">${s.players.map((p) => {
    const role = E.ROLES[s.roles[p]];
    return `<li><span>${esc(p)}</span><span class="${role.team}">${role.name}</span></li>`;
  }).join('')}</ul>`;
}

function gameOverStage(s) {
  return `
    <p class="winner ${s.winner}">${s.winner === 'good' ? 'Good wins' : 'Evil wins'}</p>
    <p class="center">${esc(s.winReason)}</p>
    <h2>Roles</h2>
    ${rolesTable(s)}
    <h2>Missions</h2>
    ${recordHtml(s)}
    <div class="pair">
      <button class="btn primary" data-act="rematch">Rematch, same players</button>
      <button class="btn" data-act="to-setup">Change setup</button>
    </div>
    <button class="btn wide" data-act="download-log">Download log</button>`;
}

function recordHtml(s) {
  if (!s.proposals.length) return '<p class="muted">Nothing yet.</p>';
  const individual = s.proposals.some((p) => p.votes);
  const missions = s.missions.map((m) => `
    <li class="${m.pass ? 'good' : 'evil'}">Mission ${m.round}: ${m.pass ? 'succeeded' : 'failed'}
      ${m.autoFail ? '(five rejections)' : `(${m.fails} Fail${m.fails === 1 ? '' : 's'}; leader ${esc(m.leader)}; team ${m.team.map(esc).join(', ')})`}</li>`).join('');
  const head = `<tr><th>#</th><th>Leader</th><th>Team</th><th>Vote</th>${individual ? s.players.map((p) => `<th>${esc(p)}</th>`).join('') : ''}</tr>`;
  const rows = s.proposals.map((p) => `
    <tr>
      <td>${p.round}.${p.attempt}</td><td>${esc(p.leader)}</td><td>${p.team.map(esc).join(', ')}</td>
      <td class="${p.approved ? 'good' : 'evil'}">${p.approved ? 'Approved' : 'Rejected'}</td>
      ${individual ? s.players.map((pl) => (p.votes ? `<td class="${p.votes[pl] ? 'good' : 'evil'}">${p.votes[pl] ? '✓' : '✗'}</td>` : '<td></td>')).join('') : ''}
    </tr>`).join('');
  return `${missions ? `<ul class="mission-list">${missions}</ul>` : ''}
    <div class="table-wrap"><table>${head}${rows}</table></div>`;
}

const STAGES = {
  reveal: revealStage,
  proposal: proposalStage,
  teamVote: teamVoteStage,
  mission: missionStage,
  missionReveal: missionRevealStage,
  missionResult: missionResultStage,
  lady: ladyStage,
  ladyReveal: ladyRevealStage,
  assassin: assassinStage,
  gameOver: gameOverStage,
};

function gameView(s) {
  return `
    <header class="topbar">
      <h1>Avalon</h1>
      <nav>
        <button class="btn small" data-act="undo">↶ Undo</button>
        <button class="btn small" data-act="open-modal" data-v="revert">Revert to…</button>
        <button class="btn small" data-act="open-modal" data-v="menu" aria-label="Menu">☰</button>
      </nav>
    </header>
    <main class="layout">
      ${boardView(s)}
      <section class="panel stage">
        ${STAGES[s.phase](s)}
        ${ui.error ? `<p class="error">${esc(ui.error)}</p>` : ''}
      </section>
      ${logView()}
    </main>`;
}

// ---------- modals ----------

function modalView() {
  const m = ui.modal;
  if (!m) return '';
  const s = history.current;
  let title = '';
  let body = '';
  if (m.type === 'confirm') {
    title = m.title;
    body = `<p>${m.text}</p>
      <div class="pair"><button class="btn" data-act="close-modal">Cancel</button><button class="btn primary" data-act="confirm-yes">${m.yes}</button></div>`;
  } else if (m.type === 'revert') {
    title = 'Revert to an earlier step';
    const last = history.length - 1;
    const steps = history.entries.map((e, i) => `
      <li class="${i === last ? 'now' : ''}">
        <span><span class="muted">${i + 1}.</span> ${esc(e.label)}</span>
        ${i === last ? '<span class="muted">now</span>' : `<button class="mini" data-act="revert" data-i="${i}">Revert here</button>`}
      </li>`).reverse().join('');
    body = `<p class="muted">The game returns to just after the chosen step. Later steps are removed from the log. Anything random that is replayed is drawn again.</p>
      <ol class="steps">${steps}</ol>
      <button class="btn wide" data-act="to-setup">Back to setup (discard this deal)</button>`;
  } else if (m.type === 'menu') {
    title = 'Menu';
    body = `
      <button class="btn wide" data-act="open-modal" data-v="record">Missions &amp; votes so far</button>
      <button class="btn wide" data-act="open-modal" data-v="rules">Roles &amp; rules in this game</button>
      <button class="btn wide" data-act="download-log">Download log</button>
      <button class="btn wide" data-act="to-setup">New game</button>`;
  } else if (m.type === 'record') {
    title = 'Missions & votes';
    body = recordHtml(s);
  } else if (m.type === 'rules') {
    title = 'Roles & rules in this game';
    const deck = E.buildDeck(s.config);
    const keys = [...new Set([...deck.good, ...deck.evil])];
    const n = s.players.length;
    body = `
      <ul class="rules-roles">${keys.map((k) => `<li><strong class="${E.ROLES[k].team}">${E.ROLES[k].name}</strong> ${E.ROLES[k].desc}</li>`).join('')}</ul>
      <ul class="rules">
        <li>${n} players: ${deck.good.length} Good, ${deck.evil.length} Evil.</li>
        <li>Team sizes: ${E.MISSION_SIZES[n].join(', ')}.${n >= 7 ? ' Mission 4 needs two Fails to fail.' : ''}</li>
        <li>The leader passes to the next seat after every proposal.</li>
        <li>A team needs a strict majority to be approved. After ${E.MAX_REJECTIONS} rejections in a row, ${s.config.fiveRejections === 'evilwins' ? 'Evil wins' : 'the mission fails'}.</li>
        <li>Three successful missions win for Good${s.config.merlin ? ', unless the Assassin then names Merlin' : ''}. Three failed missions win for Evil.</li>
        ${s.config.lady ? '<li>Lady of the Lake: after missions 2, 3 and 4 the holder privately learns one player’s allegiance, then that player takes the Lady.</li>' : ''}
      </ul>`;
  }
  return `
    <div class="overlay" data-act="close-modal" data-self="1">
      <div class="modal" role="dialog" aria-modal="true" aria-label="${esc(title)}">
        <div class="modal-head"><h2>${esc(title)}</h2><button class="icon" data-act="close-modal" aria-label="Close">×</button></div>
        ${body}
      </div>
    </div>`;
}

function askConfirm(title, text, yes, action) {
  ui.modal = { type: 'confirm', title, text, yes, action };
  render();
}

// ---------- render and events ----------

function render() {
  const s = history.current;
  app.innerHTML = (s ? gameView(s) : setupView()) + modalView();
  if (!s) updateSetupSummary();
  bindHold();
}

function bindHold() {
  const hold = document.getElementById('hold');
  const secret = document.getElementById('secret');
  if (!hold || !secret) return;
  const show = (e) => {
    e.preventDefault();
    secret.classList.remove('concealed');
    ui.revealed = true;
    document.getElementById('after-hold').disabled = false;
    // Capture keeps the reveal up if the finger drifts off the button; it is optional.
    try { hold.setPointerCapture(e.pointerId); } catch { /* no active pointer */ }
  };
  const hide = () => secret.classList.add('concealed');
  hold.addEventListener('pointerdown', show);
  ['pointerup', 'pointercancel', 'lostpointercapture', 'blur'].forEach((t) => hold.addEventListener(t, hide));
  hold.addEventListener('contextmenu', (e) => e.preventDefault());
  hold.addEventListener('keydown', (e) => { if (e.key === ' ' || e.key === 'Enter') show(e); });
  hold.addEventListener('keyup', hide);
}

function focusName(i) {
  const input = app.querySelector(`input.name[data-i="${i}"]`);
  if (input) input.focus();
}

function addName() {
  if (setup.names.length >= E.MAX_PLAYERS) return;
  setup.names.push('');
  saveSetup(setup);
  render();
  focusName(setup.names.length - 1);
}

app.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if (!el || el.disabled) return;
  // The overlay closes only when the backdrop itself is clicked.
  if (el.dataset.self && e.target !== el) return;
  const s = history.current;
  const i = Number(el.dataset.i);
  const v = el.dataset.v;

  switch (el.dataset.act) {
    // setup
    case 'add-name': addName(); break;
    case 'remove-name':
      setup.names.splice(i, 1);
      saveSetup(setup);
      render();
      break;
    case 'evil-count':
      setup.evilCount = i;
      saveSetup(setup);
      updateSetupSummary();
      break;
    case 'start': startGame(configFromSetup()); break;

    // top bar and modals
    case 'undo':
      if (history.length > 1) {
        history.undo();
        ui = freshUi();
        render();
      } else {
        askConfirm('Back to setup?', 'This discards the current deal. Roles are dealt again when you restart.', 'Back to setup', { kind: 'setup' });
      }
      break;
    case 'open-modal': ui.modal = { type: v }; render(); break;
    case 'close-modal': ui.modal = null; render(); break;
    case 'revert':
      askConfirm('Revert?', `Go back to just after step ${i + 1} (“${esc(history.entries[i].label)}”)? The ${history.length - 1 - i} later step(s) are removed and cannot be restored.`, 'Revert', { kind: 'revert', index: i });
      break;
    case 'to-setup':
      askConfirm('Leave this game?', 'The current game is discarded. Player names and options are kept.', 'Leave game', { kind: 'setup' });
      break;
    case 'rematch':
      askConfirm('Rematch?', 'Deal new roles to the same players with the same options.', 'Deal again', { kind: 'rematch' });
      break;
    case 'confirm-yes': runConfirmed(ui.modal.action); break;
    case 'download-log': downloadLog(); break;
    case 'toggle-log': logOpen = !logOpen; render(); break;

    // game
    case 'open-gate': ui.gate = true; render(); break;
    case 'next-reveal': dispatch({ type: 'NEXT_REVEAL' }); break;
    case 'toggle-pick':
      ui.selection = ui.selection.includes(i) ? ui.selection.filter((x) => x !== i) : [...ui.selection, i];
      render();
      break;
    case 'propose': dispatch({ type: 'PROPOSE', team: ui.selection.map((x) => s.players[x]) }); break;
    case 'quick-vote': dispatch({ type: 'TEAM_VOTE', approved: i === 1 }); break;
    case 'vote': ui.votes[i] = v === '1'; render(); break;
    case 'vote-all':
      s.players.forEach((_, idx) => { ui.votes[idx] = i === 1; });
      render();
      break;
    case 'submit-votes': {
      const votes = {};
      s.players.forEach((p, idx) => { votes[p] = ui.votes[idx]; });
      dispatch({ type: 'TEAM_VOTE', votes });
      break;
    }
    case 'card': dispatch({ type: 'MISSION_CARD', card: v }); break;
    case 'reveal-mission': dispatch({ type: 'REVEAL_MISSION' }); break;
    case 'continue': dispatch({ type: 'CONTINUE' }); break;
    case 'pick': ui.pick = ui.pick === i ? null : i; render(); break;
    case 'lady-pick': dispatch({ type: 'LADY_PICK', target: s.players[ui.pick] }); break;
    case 'lady-done': dispatch({ type: 'LADY_DONE' }); break;
    case 'assassinate': dispatch({ type: 'ASSASSINATE', target: s.players[ui.pick] }); break;
  }
});

app.addEventListener('input', (e) => {
  if (!e.target.matches('input.name')) return;
  setup.names[Number(e.target.dataset.i)] = e.target.value;
  ui.error = '';
  saveSetup(setup);
  updateSetupSummary();
});

app.addEventListener('change', (e) => {
  const opt = e.target.dataset.opt;
  if (!opt) return;
  setup[opt] = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
  if (!setup.merlin) setup.percival = false;
  ui.error = '';
  saveSetup(setup);
  render();
});

app.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && ui.modal) {
    ui.modal = null;
    render();
    return;
  }
  if (e.key !== 'Enter' || !e.target.matches('input.name')) return;
  e.preventDefault();
  const i = Number(e.target.dataset.i);
  if (i + 1 < setup.names.length) focusName(i + 1);
  else addName();
});

render();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}
