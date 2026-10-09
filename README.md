# The Resistance: Avalon

A pass-and-play web app for running Avalon on one shared phone, tablet or PC, for 5 to 12 players.
It is plain HTML, CSS and JavaScript with no build step, so it runs from any static host.

## Run it locally

```bash
python -m http.server 8080
```

Then open http://localhost:8080. (Opening `index.html` straight from disk will not work; browsers block ES modules on `file://`.)

## Publish on GitHub Pages

1. Push this folder to a GitHub repository.
2. In the repository, go to Settings → Pages.
3. Under "Build and deployment", choose "Deploy from a branch", pick `main` and `/ (root)`, and save.
4. The site appears at `https://<user>.github.io/<repo>/` after a minute or so.

On a phone, use the browser's "Add to Home Screen" to install it. It works offline after the first visit.

## How it plays

- **Setup:** enter names in seating order and pick roles and options.
- **Role reveal:** the device goes round the table; each player holds a button to see their role.
- **Missions:** the leader proposes a team, the table votes, and team members secretly play Success or Fail.
- **Ending:** three successes win for Good (unless the Assassin names Merlin); three failures win for Evil.

### What is random

The role deal, the starting leader, the first Lady of the Lake holder, the order of names in every "who you know" list,
the order mission cards are shown, and which side the Success and Fail buttons appear on.
Seating can be shuffled too. The leader is the one thing that is not random: it rotates one seat per proposal.

### Undo and revert

"Undo" steps back one action. "Revert to…" jumps back to any earlier step.
The game log only ever shows the current line of play; reverted steps leave no trace.
Random events that are replayed after a revert are drawn again.

### Options

- Merlin & Assassin, Percival & Morgana, Mordred, Oberon
- Lady of the Lake (after missions 2, 3 and 4)
- Team votes recorded as an outcome only, or per player
- Five rejected teams in a row: the mission fails, or Evil wins (the official rule)

### Player counts

| Players | Good | Evil | Team sizes | Mission 4 needs two Fails |
|---|---|---|---|---|
| 5 | 3 | 2 | 2, 3, 2, 3, 3 | No |
| 6 | 4 | 2 | 2, 3, 4, 3, 4 | No |
| 7 | 4 | 3 | 2, 3, 3, 4, 4 | Yes |
| 8 | 5 | 3 | 3, 4, 4, 5, 5 | Yes |
| 9 | 6 | 3 | 3, 4, 4, 5, 5 | Yes |
| 10 | 6 | 4 | 3, 4, 4, 5, 5 | Yes |
| 11 | 7 | 4 | 4, 5, 5, 6, 6 | Yes |
| 12 | 8 or 7 | 4 or 5 | 4, 5, 5, 6, 6 | Yes |

11 and 12 players are house rules; official Avalon stops at 10.

## Code layout

- `js/engine.js`: the rules, as pure `(state, action) → new state` functions
- `js/random.js`: crypto-backed shuffle and pick
- `js/history.js`: the undo stack and saving to the browser
- `js/ui.js`: the screens
- `sw.js`, `manifest.webmanifest`, `icons/`: offline support and install
- `tests/`: rules self-check; run `npm test`, or open `tests/engine.test.html` through the local server

`atr_2-3-1-public.py` is the original Tkinter version, kept for reference.

Developed by Adway Patel.
