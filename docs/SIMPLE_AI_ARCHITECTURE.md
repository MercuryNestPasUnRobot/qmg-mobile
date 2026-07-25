# Solo Bot architecture

## Integration status

The stable application is a manual board-state and card assistant, not a rules
engine. Solo Bot was developed on `agent/simple-ai-bot` so its history remains
isolated, then merged into `main` as an experimental, player-assisted mode.

## State ownership

`GameState.bot` is saved and undone with the rest of the game:

- per-country `HUMAN | BOT` controllers;
- per-country inspection-window and discard-recycling settings;
- Total War configuration;
- serializable RNG state;
- at most one active `BotTurnSession`.

The session contains its finite task queue, current task, inspection metadata,
pending card, minimal manual request, decisions, random events and detailed log.
Refreshing while a prompt is open restores the same continuation.

## Card zones

Existing human zones remain intact. Three zones were added so Bot card movement
is explicit:

| Bot name | State field |
| --- | --- |
| DRAW_DECK | `deck` |
| INSPECTION_BUFFER | `inspection` |
| RESOLUTION | `resolution` |
| DISCARD_PILE | `discard` |
| FACE_UP_STATUS | `status` |
| FACE_DOWN_RESPONSE | `response` |
| REMOVED_FROM_GAME | `removed` |

The engine never interprets “not Effective” as discard. Cleanup shuffles only
AVAILABLE/RETURN_TO_DECK cards plus the configured number of randomly selected
discard cards back into the draw deck.

## Execution model

`src/bot/engine.ts` is a pure state transformer. Mode functions do not call one
another recursively. `buildTaskQueue()` expands a mode once into a bounded list
of typed tasks, including the round 1–10 and 11–20 additions.

`runBotUntilPause()` silently performs deterministic work until one of three
manual request types is needed:

1. board-state question;
2. Effective decision;
3. physical/manual operation.

The UI renders only that request. It can be collapsed so the player can edit the
map, cards or score before returning to “已完成”.

Changing the viewed faction or manually selected country does not destroy the
active session. A second Bot cannot start while another Bot is waiting. The UI
warns the player and returns focus to the existing request; after completion,
turn advancement is calculated from that session's country.

## Randomness

Bot randomness uses a single xorshift32 state stored in `GameState`. Dice,
shuffles and random card selection consume that state. Tests can start from a
known seed and reproduce the same sequence. Initial game-deck shuffling still
uses the browser cryptographic source.

The setup screen applies one strength profile to all six countries. The Save
view exposes the same values per Bot at its bottom. Defaults are an eight-card
inspection window and zero discard cards recycled after the turn.

## Turn gate

- HUMAN current country: click ends the turn.
- BOT current country without a session: click starts its Bot workflow.
- Running Bot: click reopens the pending request.
- Completed Bot: click advances once; if the next country is BOT, its workflow
  starts as a consequence of that same player click.

There is no automatic country-to-country loop.

## Current automation boundary

Card type scanning, inspection movement, mode queues, random behavior, early
round discards, Total War discard, home liberation and Response rolls are
automated. Supply, control, pathfinding and most card text remain manual
questions because the prototype map state does not yet encode ownership,
supplied status or a full card-effect DSL.
