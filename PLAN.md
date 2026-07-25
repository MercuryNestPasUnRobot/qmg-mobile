# Simple AI Bot delivery plan

The implementation was developed on `agent/simple-ai-bot` and then merged into
`main`. The branch remains available as a milestone.

## Architecture baseline

- The repository is a static TypeScript/Vite PWA. It contains no Python package,
  `pytest`, `mypy`, or `ruff` configuration.
- `src/game.ts` owns the immutable `GameState` reducer.
- `src/store.ts` persists the full state and undo history to `localStorage`.
- `src/prototype-data.ts` supplies typed country IDs and the map graph.
- `src/generated-card-catalog.ts` supplies 380 card instances and basic types.
- `src/main.ts` is the mobile renderer and event-delegation layer.

## Delivery phases

1. **Domain foundation** — controller settings, serializable Bot session, seven
   Bot card zones, task/request enums, seeded RNG.
2. **Core turn runner** — one configurable inspection window, finite mode queues,
   Effective decisions, manual-operation continuations, cleanup and conservation.
3. **Rule extensions** — early/late-round chains, Total War discard, home
   liberation, Status/Response, Bolster and Air Force extension points.
4. **Event hooks** — Build, Attack, pending removal and adjacent enemy Build
   Response checks.
5. **Mobile UI** — per-country HUMAN/BOT setup, minimal intervention panel,
   collapsible Bot log, explicit next-turn gate.
6. **Strength controls** — global setup values and per-country in-game values
   for inspection-window length and random discard recycling.
7. **Hardening** — acceptance scenario, save migration, deck exhaustion policy,
   richer automatic supply/control/path evaluation.

## Non-negotiable behavior

- A country advances only after the player clicks the turn button.
- A completed Bot turn never advances itself to the next country.
- Nonmatching or ineffective inspected cards are not discarded.
- Automated dice, card scanning, rule discards and shuffles do not require
  confirmation; they are recorded in the Bot log.
- Every task, request, inspected card and RNG state is serializable.
- Rule code stays outside the renderer.
