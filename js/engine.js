// Avalon rules. No DOM in here: every step is (state, action) -> { state, log, label }.
// `log` holds only the entries produced by that step, so the running log is the
// concatenation over the current history stack and reverting drops entries for free.

import * as defaultRng from './random.js';

export const MIN_PLAYERS = 5;
export const MAX_PLAYERS = 12;
export const MAX_NAME_LENGTH = 20;
export const MAX_REJECTIONS = 5;

// 5-10 are the official tables; 11 and 12 are house rules.
export const EVIL_COUNT = { 5: 2, 6: 2, 7: 3, 8: 3, 9: 3, 10: 4, 11: 4, 12: 4 };
export const EVIL_OPTIONS = { 12: [4, 5] };
export const MISSION_SIZES = {
  5: [2, 3, 2, 3, 3],
  6: [2, 3, 4, 3, 4],
  7: [2, 3, 3, 4, 4],
  8: [3, 4, 4, 5, 5],
  9: [3, 4, 4, 5, 5],
  10: [3, 4, 4, 5, 5],
  11: [4, 5, 5, 6, 6],
  12: [4, 5, 5, 6, 6],
};
export const HOUSE_RULE_COUNTS = [11, 12];
const LADY_ROUNDS = [2, 3, 4];

export const ROLES = {
  servant: { name: 'Loyal Servant of Arthur', team: 'good', desc: 'No special knowledge.' },
  merlin: { name: 'Merlin', team: 'good', desc: 'Knows the Evil players (except Mordred). Must stay hidden from the Assassin.' },
  percival: { name: 'Percival', team: 'good', desc: 'Sees Merlin and Morgana, but not which is which.' },
  minion: { name: 'Minion of Mordred', team: 'evil', desc: 'Knows the other Evil players (except Oberon).' },
  assassin: { name: 'Assassin', team: 'evil', desc: 'If Good wins three missions, names one player as Merlin. A correct guess wins for Evil.' },
  morgana: { name: 'Morgana', team: 'evil', desc: 'Appears as Merlin to Percival.' },
  mordred: { name: 'Mordred', team: 'evil', desc: 'Hidden from Merlin.' },
  oberon: { name: 'Oberon', team: 'evil', desc: 'Unknown to the other Evil players, and does not know them.' },
};

const KNOWN_EVIL = ['minion', 'assassin', 'morgana', 'mordred'];

const clone = (o) => JSON.parse(JSON.stringify(o));
const entry = (text, kind = 'info') => ({ text, kind });

export function teamOfRole(role) {
  return ROLES[role].team;
}

export function evilCountFor(config) {
  const n = config.players.length;
  const options = EVIL_OPTIONS[n];
  if (options && options.includes(config.evilCount)) return config.evilCount;
  return EVIL_COUNT[n];
}

// round is 1-based
export function needsTwoFails(playerCount, round) {
  return playerCount >= 7 && round === 4;
}

export function teamSize(state) {
  return MISSION_SIZES[state.players.length][state.round - 1];
}

export function leaderOf(state) {
  return state.players[state.leaderIndex];
}

export function missionWins(state) {
  const good = state.missions.filter((m) => m.pass).length;
  return { good, evil: state.missions.length - good };
}

export function ladyCandidates(state) {
  if (!state.lady) return [];
  return state.players.filter((p) => !state.lady.used.includes(p));
}

// The Assassin may name anyone they do not already know to be Evil (so Oberon is a legal, wrong, guess).
export function assassinTargets(state) {
  return state.players.filter((p) => !KNOWN_EVIL.includes(state.roles[p]));
}

export function findRole(state, role) {
  return state.players.find((p) => state.roles[p] === role) || null;
}

export function validateConfig(config) {
  const errors = [];
  const names = config.players;
  const n = names.length;
  if (n < MIN_PLAYERS || n > MAX_PLAYERS) {
    errors.push(`Enter between ${MIN_PLAYERS} and ${MAX_PLAYERS} player names (you have ${n}).`);
  }
  if (names.some((p) => p.length > MAX_NAME_LENGTH)) {
    errors.push(`Names can be at most ${MAX_NAME_LENGTH} characters.`);
  }
  const lowered = names.map((p) => p.toLowerCase());
  if (new Set(lowered).size !== n) errors.push('Player names must be unique.');
  if (config.percival && !config.merlin) errors.push('Percival & Morgana require Merlin & Assassin.');
  if (n >= MIN_PLAYERS && n <= MAX_PLAYERS) {
    const evil = evilCountFor(config);
    const specials = [config.merlin, config.percival, config.oberon, config.mordred].filter(Boolean).length;
    if (specials > evil) {
      errors.push(`You selected ${specials} special Evil roles, but only ${evil} Evil players exist.`);
    }
  }
  return errors;
}

// Returns { good: [roleKeys], evil: [roleKeys] }.
export function buildDeck(config) {
  const n = config.players.length;
  const evilTotal = evilCountFor(config);
  const good = [];
  const evil = [];
  if (config.merlin) { good.push('merlin'); evil.push('assassin'); }
  if (config.percival) { good.push('percival'); evil.push('morgana'); }
  if (config.mordred) evil.push('mordred');
  if (config.oberon) evil.push('oberon');
  while (good.length < n - evilTotal) good.push('servant');
  while (evil.length < evilTotal) evil.push('minion');
  return { good, evil };
}

function computeKnowledge(players, roles, config, rng) {
  const withRoles = (keys, except) => players.filter((p) => p !== except && keys.includes(roles[p]));
  const knowledge = {};
  for (const p of players) {
    const role = roles[p];
    let heading = '';
    let seen = [];
    let note = '';
    if (role === 'merlin') {
      heading = 'These players are Evil:';
      seen = withRoles(['minion', 'assassin', 'morgana', 'oberon']);
      if (config.mordred) note = 'Mordred is also Evil, but is hidden from you.';
    } else if (role === 'percival') {
      heading = 'Merlin is one of:';
      seen = withRoles(['merlin', 'morgana']);
      note = 'The other is Morgana.';
    } else if (KNOWN_EVIL.includes(role)) {
      seen = withRoles(KNOWN_EVIL, p);
      heading = seen.length ? 'Your fellow Evil:' : 'You know no other Evil players.';
      if (config.oberon) note = 'Oberon is also Evil, but you do not know who it is.';
    } else if (role === 'oberon') {
      note = 'You do not know the other Evil players, and they do not know you.';
    }
    knowledge[p] = { heading, seen: rng.shuffle(seen), note };
  }
  return knowledge;
}

function missionIntro(state) {
  const two = needsTwoFails(state.players.length, state.round) ? ', two Fails needed' : '';
  return entry(`Mission ${state.round}: ${leaderOf(state)} leads (team of ${teamSize(state)}${two}).`, 'round');
}

export function createGame(config, rng = defaultRng) {
  const errors = validateConfig(config);
  if (errors.length) throw new Error(errors[0]);
  config = clone(config);
  const players = config.shuffleSeats ? rng.shuffle(config.players) : [...config.players];
  const deck = buildDeck(config);
  const dealt = rng.shuffle([...deck.good, ...deck.evil]);
  const roles = {};
  players.forEach((p, i) => { roles[p] = dealt[i]; });

  const state = {
    phase: 'reveal',
    config,
    players,
    roles,
    knowledge: computeKnowledge(players, roles, config, rng),
    revealIndex: 0,
    leaderIndex: rng.randInt(players.length),
    round: 1,
    rejections: 0,
    team: [],
    cards: [],
    voteIndex: 0,
    swapButtons: false,
    missions: [],
    proposals: [],
    lady: null,
    winner: null,
    winReason: '',
    assassinTarget: null,
  };

  const evil = deck.evil.length;
  const specials = [...deck.good, ...deck.evil]
    .filter((r) => r !== 'servant' && r !== 'minion')
    .map((r) => ROLES[r].name);
  const log = [
    entry(`Game started with ${players.length} players (${players.length - evil} Good, ${evil} Evil).`, 'round'),
    entry(`Seating: ${players.join(' → ')}.`),
    entry(`Special roles: ${specials.length ? specials.join(', ') : 'none'}.`),
    entry('Roles dealt.'),
  ];
  if (config.lady) {
    const holder = players[rng.randInt(players.length)];
    state.lady = { holder, used: [holder], target: null };
    log.push(entry(`${holder} holds the Lady of the Lake.`));
  }
  return { state, log, label: 'Game started, roles dealt' };
}

function endGame(state, log, winner, reason) {
  state.phase = 'gameOver';
  state.winner = winner;
  state.winReason = reason;
  log.push(entry(`${winner === 'good' ? 'Good' : 'Evil'} wins. ${reason}`, winner));
}

function advanceLeader(state) {
  state.leaderIndex = (state.leaderIndex + 1) % state.players.length;
}

// Called once the current round's mission has been recorded.
function afterMission(state, log) {
  const wins = missionWins(state);
  if (wins.good >= 3) {
    if (state.config.merlin) {
      state.phase = 'assassin';
      log.push(entry('Good has three missions. The Assassin may now name Merlin.', 'round'));
    } else {
      endGame(state, log, 'good', 'Three missions succeeded.');
    }
    return;
  }
  if (wins.evil >= 3) {
    endGame(state, log, 'evil', 'Three missions failed.');
    return;
  }
  const finished = state.round;
  state.round += 1;
  state.rejections = 0;
  state.team = [];
  advanceLeader(state);
  if (state.lady && LADY_ROUNDS.includes(finished) && ladyCandidates(state).length) {
    state.phase = 'lady';
  } else {
    state.phase = 'proposal';
    log.push(missionIntro(state));
  }
}

function expectPhase(state, phase) {
  if (state.phase !== phase) throw new Error(`That action is not available right now.`);
}

export function reduce(prev, action, rng = defaultRng) {
  const s = clone(prev);
  const log = [];
  let label = '';

  switch (action.type) {
    case 'NEXT_REVEAL': {
      expectPhase(s, 'reveal');
      label = `${s.players[s.revealIndex]} viewed their role`;
      s.revealIndex += 1;
      if (s.revealIndex >= s.players.length) {
        s.phase = 'proposal';
        log.push(entry('All players have seen their roles.'));
        log.push(missionIntro(s));
      }
      break;
    }

    case 'PROPOSE': {
      expectPhase(s, 'proposal');
      const picked = new Set(action.team);
      const team = s.players.filter((p) => picked.has(p));
      if (team.length !== picked.size || team.length !== teamSize(s)) {
        throw new Error(`Select exactly ${teamSize(s)} players.`);
      }
      s.team = team;
      s.phase = 'teamVote';
      log.push(entry(`${leaderOf(s)} proposes: ${team.join(', ')}.`));
      label = `${leaderOf(s)} proposed a team`;
      break;
    }

    case 'TEAM_VOTE': {
      expectPhase(s, 'teamVote');
      let approved;
      let votes = null;
      let tally = '';
      if (action.votes) {
        votes = {};
        for (const p of s.players) {
          if (typeof action.votes[p] !== 'boolean') throw new Error('Every player must vote.');
          votes[p] = action.votes[p];
        }
        const yes = s.players.filter((p) => votes[p]).length;
        approved = yes > s.players.length - yes;
        tally = ` (${yes}–${s.players.length - yes})`;
      } else {
        approved = !!action.approved;
      }
      const leader = leaderOf(s);
      s.proposals.push({ round: s.round, attempt: s.rejections + 1, leader, team: [...s.team], approved, votes });
      if (approved) {
        s.phase = 'mission';
        s.cards = [];
        s.voteIndex = 0;
        s.swapButtons = rng.randInt(2) === 1;
        log.push(entry(`Team approved${tally}.`));
        label = `${leader}'s team approved`;
        break;
      }
      s.rejections += 1;
      label = `${leader}'s team rejected`;
      log.push(entry(`Team rejected${tally}. Rejections: ${s.rejections}/${MAX_REJECTIONS}.`));
      if (s.rejections < MAX_REJECTIONS) {
        advanceLeader(s);
        s.team = [];
        s.phase = 'proposal';
        log.push(entry(`${leaderOf(s)} is the new leader.`));
      } else if (s.config.fiveRejections === 'evilwins') {
        endGame(s, log, 'evil', `${MAX_REJECTIONS} teams in a row were rejected.`);
      } else {
        s.missions.push({ round: s.round, leader, team: [], pass: false, fails: 0, cards: [], autoFail: true });
        log.push(entry(`Mission ${s.round} fails automatically after ${MAX_REJECTIONS} rejections.`, 'evil'));
        afterMission(s, log);
      }
      break;
    }

    case 'MISSION_CARD': {
      expectPhase(s, 'mission');
      const voter = s.team[s.voteIndex];
      // Good players cannot fail a mission; their choice is silently counted as Success.
      const card = action.card === 'fail' && teamOfRole(s.roles[voter]) === 'evil' ? 'fail' : 'pass';
      s.cards.push(card);
      s.voteIndex += 1;
      label = `${voter} played a mission card`;
      if (s.voteIndex >= s.team.length) {
        s.phase = 'missionReveal';
        log.push(entry('All mission cards are in.'));
      } else {
        s.swapButtons = rng.randInt(2) === 1;
      }
      break;
    }

    case 'REVEAL_MISSION': {
      expectPhase(s, 'missionReveal');
      const fails = s.cards.filter((c) => c === 'fail').length;
      const pass = needsTwoFails(s.players.length, s.round) ? fails < 2 : fails === 0;
      s.missions.push({
        round: s.round,
        leader: leaderOf(s),
        team: [...s.team],
        pass,
        fails,
        cards: rng.shuffle(s.cards),
        autoFail: false,
      });
      s.cards = [];
      s.phase = 'missionResult';
      const failText = `${fails} Fail${fails === 1 ? '' : 's'} of ${s.team.length}`;
      log.push(entry(`Mission ${s.round} ${pass ? 'succeeded' : 'failed'} (${failText}).`, pass ? 'good' : 'evil'));
      label = `Mission ${s.round} revealed`;
      break;
    }

    case 'CONTINUE': {
      expectPhase(s, 'missionResult');
      label = `Continued after mission ${s.round}`;
      afterMission(s, log);
      break;
    }

    case 'LADY_PICK': {
      expectPhase(s, 'lady');
      if (!ladyCandidates(s).includes(action.target)) throw new Error('That player cannot be examined.');
      s.lady.target = action.target;
      s.phase = 'ladyReveal';
      log.push(entry(`${s.lady.holder} uses the Lady of the Lake on ${action.target}.`));
      label = `Lady of the Lake used on ${action.target}`;
      break;
    }

    case 'LADY_DONE': {
      expectPhase(s, 'ladyReveal');
      label = `${s.lady.holder} saw ${s.lady.target}'s allegiance`;
      s.lady.holder = s.lady.target;
      s.lady.used.push(s.lady.target);
      s.lady.target = null;
      s.phase = 'proposal';
      log.push(entry(`${s.lady.holder} now holds the Lady of the Lake.`));
      log.push(missionIntro(s));
      break;
    }

    case 'ASSASSINATE': {
      expectPhase(s, 'assassin');
      if (!assassinTargets(s).includes(action.target)) throw new Error('That player cannot be chosen.');
      s.assassinTarget = action.target;
      log.push(entry(`The Assassin names ${action.target} as Merlin.`));
      if (s.roles[action.target] === 'merlin') {
        endGame(s, log, 'evil', `${action.target} was Merlin.`);
      } else {
        endGame(s, log, 'good', `${action.target} was not Merlin.`);
      }
      label = `Assassin chose ${action.target}`;
      break;
    }

    default:
      throw new Error(`Unknown action: ${action.type}`);
  }

  return { state: s, log, label };
}
