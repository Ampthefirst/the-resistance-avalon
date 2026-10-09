// Rules self-check. Run with `npm test`, or open tests/engine.test.html in a browser.
import * as E from '../js/engine.js';

const results = [];
function test(name, fn) {
  try {
    fn();
    results.push({ name, ok: true });
  } catch (err) {
    results.push({ name, ok: false, message: err.message });
  }
}
function assert(cond, message) {
  if (!cond) throw new Error(message || 'assertion failed');
}
function equal(a, b, message) {
  assert(JSON.stringify(a) === JSON.stringify(b), `${message || 'not equal'}: ${JSON.stringify(a)} vs ${JSON.stringify(b)}`);
}

// Deterministic rng so failures are reproducible.
function makeRng(seed) {
  let x = seed >>> 0 || 1;
  const next = () => {
    x ^= x << 13; x >>>= 0;
    x ^= x >>> 17;
    x ^= x << 5; x >>>= 0;
    return x;
  };
  const randInt = (n) => next() % n;
  const shuffle = (items) => {
    const out = [...items];
    for (let i = out.length - 1; i > 0; i--) {
      const j = randInt(i + 1);
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  };
  return { randInt, shuffle };
}

const NAMES = ['Ann', 'Bob', 'Cat', 'Dan', 'Eve', 'Fay', 'Gus', 'Hal', 'Ivy', 'Jon', 'Kim', 'Lee'];
function config(n, extra = {}) {
  return {
    players: NAMES.slice(0, n), merlin: true, percival: true, oberon: false, mordred: false,
    lady: false, shuffleSeats: false, voteMode: 'quick', fiveRejections: 'autofail', evilCount: 4, ...extra,
  };
}

// Drives a game: step(action) applies it and returns the new state.
function game(cfg, seed = 7) {
  const rng = makeRng(seed);
  let { state, log } = E.createGame(cfg, rng);
  const allLog = [...log];
  const api = {
    get state() { return state; },
    log: allLog,
    step(action) {
      const r = E.reduce(state, action, rng);
      state = r.state;
      allLog.push(...r.log);
      return state;
    },
    reveals() {
      while (state.phase === 'reveal') api.step({ type: 'NEXT_REVEAL' });
    },
    // Proposes the given team (default: first N seats), approves it, plays cards and reveals.
    mission(wantFail, team) {
      team = team || state.players.slice(0, E.teamSize(state));
      api.step({ type: 'PROPOSE', team });
      api.step({ type: 'TEAM_VOTE', approved: true });
      while (state.phase === 'mission') api.step({ type: 'MISSION_CARD', card: wantFail ? 'fail' : 'pass' });
      api.step({ type: 'REVEAL_MISSION' });
      return state.missions[state.missions.length - 1];
    },
    reject() {
      api.step({ type: 'PROPOSE', team: state.players.slice(0, E.teamSize(state)) });
      api.step({ type: 'TEAM_VOTE', approved: false });
    },
  };
  return api;
}

const evilPlayers = (s) => s.players.filter((p) => E.teamOfRole(s.roles[p]) === 'evil');
const goodPlayers = (s) => s.players.filter((p) => E.teamOfRole(s.roles[p]) === 'good');

test('role counts are right for every player count', () => {
  for (let n = 5; n <= 12; n++) {
    for (let seed = 1; seed <= 20; seed++) {
      const s = E.createGame(config(n), makeRng(seed)).state;
      equal(evilPlayers(s).length, E.EVIL_COUNT[n], `evil count at ${n}`);
      const roles = Object.values(s.roles);
      for (const r of ['merlin', 'assassin', 'percival', 'morgana']) {
        equal(roles.filter((x) => x === r).length, 1, `${r} at ${n}`);
      }
      assert(s.leaderIndex >= 0 && s.leaderIndex < n, 'leader in range');
    }
  }
});

test('12 players can use 5 evil; other counts ignore the setting', () => {
  equal(evilPlayers(E.createGame(config(12, { evilCount: 5 }), makeRng(3)).state).length, 5);
  equal(evilPlayers(E.createGame(config(10, { evilCount: 5 }), makeRng(3)).state).length, 4);
});

test('setup validation', () => {
  assert(E.validateConfig(config(4)).length, 'too few');
  assert(E.validateConfig({ ...config(5), players: ['a', 'A', 'b', 'c', 'd'] }).length, 'duplicates ignore case');
  assert(E.validateConfig(config(5, { merlin: false })).length, 'percival needs merlin');
  assert(E.validateConfig(config(5, { oberon: true })).length, 'three evil specials at 5 players');
  equal(E.validateConfig(config(7, { oberon: true })), [], 'three evil specials at 7 players');
  equal(E.validateConfig(config(12, { oberon: true, mordred: true })), []);
});

test('knowledge: Merlin, Percival, Evil, Oberon, Mordred', () => {
  for (let seed = 1; seed <= 30; seed++) {
    const s = E.createGame(config(10, { oberon: true, mordred: true }), makeRng(seed)).state;
    const who = (r) => E.findRole(s, r);
    const sorted = (a) => [...a].sort();
    const merlinSees = s.knowledge[who('merlin')].seen;
    assert(!merlinSees.includes(who('mordred')), 'Merlin must not see Mordred');
    assert(merlinSees.includes(who('oberon')), 'Merlin sees Oberon');
    equal(merlinSees.length, 3);
    equal(sorted(s.knowledge[who('percival')].seen), sorted([who('merlin'), who('morgana')]));
    equal(s.knowledge[who('oberon')].seen, []);
    const assassinSees = s.knowledge[who('assassin')].seen;
    equal(sorted(assassinSees), sorted([who('morgana'), who('mordred')]));
    for (const p of goodPlayers(s).filter((x) => s.roles[x] === 'servant')) equal(s.knowledge[p].seen, []);
  }
});

test('leader rotates one seat per proposal', () => {
  const g = game(config(6));
  g.reveals();
  const start = g.state.leaderIndex;
  g.reject();
  equal(g.state.leaderIndex, (start + 1) % 6);
  g.reject();
  equal(g.state.leaderIndex, (start + 2) % 6);
  g.mission(false);
  g.step({ type: 'CONTINUE' });
  equal(g.state.leaderIndex, (start + 3) % 6);
  equal(g.state.round, 2);
  equal(g.state.rejections, 0);
});

test('a Fail from a Good player counts as Success', () => {
  const g = game(config(5));
  g.reveals();
  const team = goodPlayers(g.state).slice(0, 2);
  const m = g.mission(true, team);
  equal(m.fails, 0);
  assert(m.pass, 'mission passes');
});

test('one Fail from Evil fails a normal mission', () => {
  const g = game(config(5));
  g.reveals();
  const team = [evilPlayers(g.state)[0], goodPlayers(g.state)[0]];
  const m = g.mission(true, team);
  equal(m.fails, 1);
  assert(!m.pass, 'mission fails');
});

test('mission 4 with 7+ players needs two Fails', () => {
  for (const [fails, expected] of [[1, true], [2, false]]) {
    const g = game(config(7));
    g.reveals();
    for (let i = 0; i < 3; i++) {
      // Alternate results so nobody reaches three before mission 4.
      const good = goodPlayers(g.state);
      const evil = evilPlayers(g.state);
      const size = E.teamSize(g.state);
      const team = i === 1 ? [evil[0], ...good.slice(0, size - 1)] : good.slice(0, size);
      g.mission(true, team);
      g.step({ type: 'CONTINUE' });
    }
    equal(g.state.round, 4);
    const good = goodPlayers(g.state);
    const evil = evilPlayers(g.state);
    const team = [...evil.slice(0, fails), ...good.slice(0, E.teamSize(g.state) - fails)];
    const m = g.mission(true, team);
    equal(m.fails, fails);
    equal(m.pass, expected, `mission 4 with ${fails} fail(s)`);
  }
});

test('mission 4 with 6 players fails on one Fail', () => {
  equal(E.needsTwoFails(6, 4), false);
  equal(E.needsTwoFails(7, 4), true);
  equal(E.needsTwoFails(12, 4), true);
  equal(E.needsTwoFails(12, 3), false);
});

test('five rejections: mission auto-fails', () => {
  const g = game(config(5));
  g.reveals();
  for (let i = 0; i < 5; i++) g.reject();
  equal(g.state.missions.length, 1);
  assert(g.state.missions[0].autoFail && !g.state.missions[0].pass, 'auto fail recorded');
  equal(g.state.round, 2);
  equal(g.state.rejections, 0);
  equal(g.state.phase, 'proposal');
});

test('five rejections: evil wins when configured', () => {
  const g = game(config(5, { fiveRejections: 'evilwins' }));
  g.reveals();
  for (let i = 0; i < 5; i++) g.reject();
  equal(g.state.phase, 'gameOver');
  equal(g.state.winner, 'evil');
});

test('individual votes: strict majority, ties reject', () => {
  const g = game(config(6, { voteMode: 'individual' }));
  g.reveals();
  const propose = () => g.step({ type: 'PROPOSE', team: g.state.players.slice(0, E.teamSize(g.state)) });
  const votes = (yes) => Object.fromEntries(g.state.players.map((p, i) => [p, i < yes]));
  propose();
  g.step({ type: 'TEAM_VOTE', votes: votes(3) });
  equal(g.state.phase, 'proposal', '3-3 is rejected');
  propose();
  g.step({ type: 'TEAM_VOTE', votes: votes(4) });
  equal(g.state.phase, 'mission', '4-2 is approved');
  equal(g.state.proposals.length, 2);
  assert(g.state.proposals[1].votes, 'votes recorded');
});

test('three failed missions: evil wins', () => {
  const g = game(config(5));
  g.reveals();
  for (let i = 0; i < 3; i++) {
    const team = [evilPlayers(g.state)[0], ...goodPlayers(g.state)].slice(0, E.teamSize(g.state));
    g.mission(true, team);
    g.step({ type: 'CONTINUE' });
  }
  equal(g.state.winner, 'evil');
});

function threeGoodMissions(cfg) {
  const g = game(cfg);
  g.reveals();
  for (let i = 0; i < 3; i++) {
    g.mission(false);
    g.step({ type: 'CONTINUE' });
  }
  return g;
}

test('assassin: hitting Merlin wins for Evil, missing wins for Good', () => {
  let g = threeGoodMissions(config(5));
  equal(g.state.phase, 'assassin');
  g.step({ type: 'ASSASSINATE', target: E.findRole(g.state, 'merlin') });
  equal(g.state.winner, 'evil');

  g = threeGoodMissions(config(5));
  g.step({ type: 'ASSASSINATE', target: E.findRole(g.state, 'percival') });
  equal(g.state.winner, 'good');
});

test('assassin cannot target known Evil, but can target Oberon', () => {
  const g = threeGoodMissions(config(7, { oberon: true }));
  const targets = E.assassinTargets(g.state);
  assert(targets.includes(E.findRole(g.state, 'oberon')), 'Oberon is a legal target');
  assert(!targets.includes(E.findRole(g.state, 'morgana')), 'Morgana is not');
  let threw = false;
  try { g.step({ type: 'ASSASSINATE', target: E.findRole(g.state, 'morgana') }); } catch { threw = true; }
  assert(threw, 'illegal target rejected');
});

test('without Merlin, three successes win outright', () => {
  const g = threeGoodMissions(config(5, { merlin: false, percival: false }));
  equal(g.state.phase, 'gameOver');
  equal(g.state.winner, 'good');
});

test('Lady of the Lake: used after missions 2-4, passes on, no repeats', () => {
  const g = game(config(7, { lady: true }));
  g.reveals();
  const first = g.state.lady.holder;
  const playRound = (fail) => {
    const good = goodPlayers(g.state);
    const evil = evilPlayers(g.state);
    const size = E.teamSize(g.state);
    g.mission(true, fail ? [evil[0], ...good.slice(0, size - 1)] : good.slice(0, size));
    g.step({ type: 'CONTINUE' });
  };
  playRound(false);
  equal(g.state.phase, 'proposal', 'no Lady after mission 1');
  playRound(true);
  equal(g.state.phase, 'lady', 'Lady after mission 2');
  assert(!E.ladyCandidates(g.state).includes(first), 'holder cannot pick themselves');
  const target = E.ladyCandidates(g.state)[0];
  g.step({ type: 'LADY_PICK', target });
  equal(g.state.phase, 'ladyReveal');
  g.step({ type: 'LADY_DONE' });
  equal(g.state.lady.holder, target);
  equal(g.state.phase, 'proposal');
  assert(!E.ladyCandidates(g.state).includes(first), 'previous holder cannot be examined');
  playRound(false);
  equal(g.state.phase, 'lady', 'Lady after mission 3');
});

test('reduce never mutates the previous state', () => {
  const rng = makeRng(11);
  let { state } = E.createGame(config(8, { lady: true }), rng);
  const steps = [];
  const apply = (action) => {
    const before = JSON.stringify(state);
    const next = E.reduce(state, action, rng).state;
    equal(JSON.stringify(state), before, `mutation on ${action.type}`);
    steps.push(action.type);
    state = next;
  };
  while (state.phase === 'reveal') apply({ type: 'NEXT_REVEAL' });
  apply({ type: 'PROPOSE', team: state.players.slice(0, E.teamSize(state)) });
  apply({ type: 'TEAM_VOTE', approved: true });
  while (state.phase === 'mission') apply({ type: 'MISSION_CARD', card: 'fail' });
  apply({ type: 'REVEAL_MISSION' });
  apply({ type: 'CONTINUE' });
  assert(steps.length > 10);
});

test('wrong-phase and wrong-size actions are rejected', () => {
  const g = game(config(5));
  const throws = (action) => { try { g.step(action); return false; } catch { return true; } };
  assert(throws({ type: 'PROPOSE', team: [] }), 'propose during reveal');
  g.reveals();
  assert(throws({ type: 'PROPOSE', team: g.state.players.slice(0, 1) }), 'team too small');
  assert(throws({ type: 'PROPOSE', team: ['Nobody', 'Ann'] }), 'unknown player');
  assert(throws({ type: 'REVEAL_MISSION' }), 'reveal before cards');
});

test('the log never contains individual mission cards or roles before the end', () => {
  const g = game(config(7, { oberon: true }));
  g.reveals();
  g.mission(true, [evilPlayers(g.state)[0], goodPlayers(g.state)[0]]);
  const text = g.log.map((e) => e.text).join('\n');
  for (const p of g.state.players) {
    assert(!new RegExp(`${p} (played|chose) (Fail|Success)`, 'i').test(text), 'card leak');
  }
  assert(!/is (Merlin|the Assassin|Morgana|Oberon|Evil|Good)\b/.test(text), 'role leak');
});

test('random full games at every player count always finish', () => {
  for (let n = 5; n <= 12; n++) {
    for (let seed = 1; seed <= 40; seed++) {
      const rng = makeRng(seed * 31 + n);
      const cfg = config(n, {
        lady: seed % 2 === 0, oberon: n >= 7 && seed % 3 === 0, mordred: n >= 10 && seed % 5 === 0,
        fiveRejections: seed % 4 === 0 ? 'evilwins' : 'autofail', shuffleSeats: seed % 2 === 1,
        evilCount: seed % 2 ? 4 : 5,
      });
      let { state } = E.createGame(cfg, rng);
      let guard = 0;
      const act = (action) => { state = E.reduce(state, action, rng).state; };
      while (state.phase !== 'gameOver') {
        assert(++guard < 2000, `game did not finish (n=${n}, seed=${seed})`);
        switch (state.phase) {
          case 'reveal': act({ type: 'NEXT_REVEAL' }); break;
          case 'proposal': act({ type: 'PROPOSE', team: rng.shuffle(state.players).slice(0, E.teamSize(state)) }); break;
          case 'teamVote': act({ type: 'TEAM_VOTE', approved: rng.randInt(3) > 0 }); break;
          case 'mission': act({ type: 'MISSION_CARD', card: rng.randInt(2) ? 'fail' : 'pass' }); break;
          case 'missionReveal': act({ type: 'REVEAL_MISSION' }); break;
          case 'missionResult': act({ type: 'CONTINUE' }); break;
          case 'lady': act({ type: 'LADY_PICK', target: E.ladyCandidates(state)[0] }); break;
          case 'ladyReveal': act({ type: 'LADY_DONE' }); break;
          case 'assassin': { const t = E.assassinTargets(state); act({ type: 'ASSASSINATE', target: t[rng.randInt(t.length)] }); break; }
          default: throw new Error(`unexpected phase ${state.phase}`);
        }
      }
      assert(state.winner === 'good' || state.winner === 'evil', 'has a winner');
      assert(state.missions.length <= 5, 'at most five missions');
      state.missions.forEach((m, i) => equal(m.round, i + 1, 'one mission per round'));
    }
  }
});

const failed = results.filter((r) => !r.ok);
const summary = `${results.length - failed.length}/${results.length} passed`;
if (typeof document !== 'undefined') {
  document.body.innerHTML = `<h1>${summary}</h1><ul>${results.map((r) => `<li style="color:${r.ok ? 'green' : 'red'}">${r.ok ? 'PASS' : 'FAIL'} ${r.name}${r.ok ? '' : ': ' + r.message}</li>`).join('')}</ul>`;
} else {
  results.forEach((r) => console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.ok ? '' : '\n      ' + r.message}`));
  console.log(summary);
  if (failed.length) process.exit(1);
}
