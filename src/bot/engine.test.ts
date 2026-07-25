import { describe, expect, it } from "vitest";
import { createInitialState, type CardType, type GameState } from "../game";
import { GameStore, type StorageLike } from "../store";
import {
  answerBotRequest,
  buildTaskQueue,
  cardZoneMembership,
  resolveBotResponseEvent,
  startBotTurn,
} from "./engine";
import { nextUint32, rollD6, shuffleWithState } from "./random";

class MemoryStorage implements StorageLike {
  private values = new Map<string, string>();
  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

function cardOfType(state: GameState, type: CardType, excluded = new Set<string>()): string {
  const card = Object.values(state.cards).find(
    (candidate) => candidate.countryId === "germany" && candidate.type === type && !excluded.has(candidate.id),
  );
  if (card) return card.id;
  const id = `test-${type}-${excluded.size}`;
  state.cards[id] = {
    id,
    countryId: "germany",
    name: `Test ${type}`,
    description: "Bot engine test card",
    type,
    edition: "custom",
    isCustom: true,
  };
  return id;
}

function withWindow(types: CardType[]): GameState {
  const state = createInitialState(new Date("2026-01-01T00:00:00Z"), () => 123456);
  const used = new Set<string>();
  const ids = types.map((type) => {
    const id = cardOfType(state, type, used);
    used.add(id);
    return id;
  });
  state.cardZones.germany.deck = [...ids].reverse();
  state.bot.controllers.germany = "BOT";
  state.bot.rngState = 12345;
  return state;
}

function seedForDie(predicate: (roll: number) => boolean): number {
  for (let seed = 1; seed < 1000; seed += 1) {
    if (predicate(rollD6(seed).value)) return seed;
  }
  throw new Error("No matching die seed");
}

describe("solo bot domain engine", () => {
  it("does not start a bot session for a HUMAN country", () => {
    const state = createInitialState();
    expect(startBotTurn(state)).toBe(state);
    expect(state.bot.session).toBeNull();
  });

  it("creates one inspection window of at most eight cards", () => {
    const state = withWindow([
      "response",
      "sea-battle",
      "build-army",
      "event",
      "status",
      "economic",
      "build-navy",
      "land-battle",
      "event",
    ]);
    const started = startBotTurn(state);
    expect(started.bot.session?.inspectionWindow).toHaveLength(8);
    expect(started.cardZones.germany.inspection).toHaveLength(8);
    expect(started.cardZones.germany.deck).toHaveLength(1);
  });

  it("keeps nonmatching and ineffective cards in the inspection buffer", () => {
    let state = withWindow(["response", "sea-battle", "build-army", "build-navy"]);
    state = startBotTurn(state);
    state = answerBotRequest(state, "YES");
    const responseId = state.bot.session!.inspectionWindow[0]!.cardInstanceId;
    const firstBuild = state.bot.session!.pendingManualRequest!.associatedCardId!;
    expect(state.cards[firstBuild]?.type).toBe("build-army");
    expect(state.cardZones.germany.inspection).toContain(responseId);
    expect(state.cardZones.germany.discard).not.toContain(responseId);

    state = answerBotRequest(state, "INEFFECTIVE");
    expect(state.cardZones.germany.inspection).toContain(firstBuild);
    expect(state.cardZones.germany.discard).not.toContain(firstBuild);
    expect(
      state.bot.session!.inspectionWindow.find((entry) => entry.cardInstanceId === firstBuild)?.disposition,
    ).toBe("RETURN_TO_DECK");
  });

  it("returns a card to the buffer when manual execution is impossible", () => {
    let state = withWindow(["build-army"]);
    state = startBotTurn(state);
    state = answerBotRequest(state, "YES");
    const cardId = state.bot.session!.pendingManualRequest!.associatedCardId!;
    state = answerBotRequest(state, "EFFECTIVE");
    state = answerBotRequest(state, "CANNOT_EXECUTE");
    expect(state.cardZones.germany.resolution).not.toContain(cardId);
    expect(state.cardZones.germany.discard).not.toContain(cardId);
    expect([...state.cardZones.germany.inspection, ...state.cardZones.germany.deck]).toContain(cardId);
    expect(
      state.bot.session!.inspectionWindow.find((entry) => entry.cardInstanceId === cardId)?.disposition,
    ).toBe("RETURN_TO_DECK");
  });

  it("moves a completed ordinary card to the discard pile", () => {
    let state = withWindow(["build-army"]);
    state = startBotTurn(state);
    state = answerBotRequest(state, "YES");
    const cardId = state.bot.session!.pendingManualRequest!.associatedCardId!;
    state = answerBotRequest(state, "EFFECTIVE");
    state = answerBotRequest(state, "BUILD_ARMY");
    state = answerBotRequest(state, "COMPLETED");
    expect(state.cardZones.germany.discard).toContain(cardId);
    expect(state.cardZones.germany.resolution).not.toContain(cardId);
  });

  it("deploys Status and Response cards into their persistent zones", () => {
    for (const type of ["status", "response"] as const) {
      let state = withWindow([type]);
      state = startBotTurn(state);
      state = answerBotRequest(state, "NO");
      state = answerBotRequest(state, "NO");
      const cardId = state.bot.session!.pendingManualRequest!.associatedCardId!;
      state = answerBotRequest(state, "EFFECTIVE");
      expect(type === "status" ? state.cardZones.germany.status : state.cardZones.germany.response).toContain(cardId);
      expect(state.cardZones.germany.discard).not.toContain(cardId);
    }
  });

  it("builds finite early and late round task queues without recursive mode expansion", () => {
    expect(buildTaskQueue("EXPANSION", 6, false).map((task) => task.type)).toEqual([
      "SEARCH_EFFECTIVE_BUILD",
      "SEARCH_EFFECTIVE_EVENT",
      "DISCARD_TOP_CARD",
      "SEARCH_EFFECTIVE_BUILD",
      "PLAY_ALL_EFFECTIVE_BOLSTER",
      "SEARCH_EFFECTIVE_AIR_FORCE",
      "CLEANUP_INSPECTION_WINDOW",
    ]);
    expect(buildTaskQueue("AGGRESSIVE", 6, false).map((task) => task.type).at(-4)).toBe(
      "SEARCH_EFFECTIVE_BATTLE",
    );
    const lateDefensive = buildTaskQueue("DEFENSIVE", 16, true);
    expect(lateDefensive.length).toBeLessThan(14);
    expect(lateDefensive.at(-2)?.type).toBe("TOTAL_WAR_DISCARD");
    expect(lateDefensive.at(-1)?.type).toBe("CLEANUP_INSPECTION_WINDOW");
  });

  it("replays dice and shuffle results from the same seed", () => {
    expect(rollD6(12345)).toEqual(rollD6(12345));
    expect(nextUint32(12345)).toEqual(nextUint32(12345));
    expect(shuffleWithState([1, 2, 3, 4, 5], 12345)).toEqual(
      shuffleWithState([1, 2, 3, 4, 5], 12345),
    );
  });

  it("persists and restores an unfinished bot session", () => {
    const storage = new MemoryStorage();
    const store = new GameStore(storage);
    store.execute({ type: "SET_CONTROLLER", countryId: "germany", controller: "BOT" });
    expect(store.startCurrentBotTurn()).toBe(true);
    const requestId = store.state.bot.session?.pendingManualRequest?.id;
    const restored = new GameStore(storage);
    expect(restored.state.bot.session?.pendingManualRequest?.id).toBe(requestId);
    expect(restored.state.bot.session?.isComplete).toBe(false);
  });

  it("discards five cards and creates two manual operations when home liberation succeeds", () => {
    let state = createInitialState();
    state.bot.controllers.germany = "BOT";
    state.bot.rngState = seedForDie((roll) => roll >= 4);
    state.areas.germany!.units.push({ countryId: "united-kingdom", kind: "army", count: 1 });
    const deckSize = state.cardZones.germany.deck.length;
    state = startBotTurn(state);
    expect(state.cardZones.germany.deck).toHaveLength(deckSize - 5);
    expect(state.cardZones.germany.discard).toHaveLength(5);
    expect(state.bot.session?.pendingManualRequest?.continuation).toBe("HOME_REMOVE_OCCUPIER");
    state = answerBotRequest(state, "COMPLETED");
    expect(state.bot.session?.pendingManualRequest?.continuation).toBe("HOME_BUILD_ARMY");
  });

  it("keeps a Response on 1-3 and triggers at most one Response on 4-6", () => {
    const low = withWindow(["response", "response"]);
    const responseIds = [...low.cardZones.germany.deck].reverse();
    low.cardZones.germany.deck = [];
    low.cardZones.germany.response = [...responseIds];
    low.bot.rngState = seedForDie((roll) => roll <= 3);
    const kept = resolveBotResponseEvent(low, { type: "BotPieceWouldBeRemoved", countryId: "germany" });
    expect(kept.resolution.triggered).toBe(false);
    expect(kept.state.cardZones.germany.response).toEqual(responseIds);

    kept.state.bot.rngState = seedForDie((roll) => roll >= 4);
    const triggered = resolveBotResponseEvent(kept.state, {
      type: "BotPieceWouldBeRemoved",
      countryId: "germany",
    });
    expect(triggered.resolution.triggered).toBe(true);
    expect(triggered.resolution.preventRemoval).toBe(true);
    expect(triggered.state.cardZones.germany.discard).toContain(responseIds[0]);
    expect(triggered.state.cardZones.germany.response).toEqual([responseIds[1]]);
  });

  it("never puts one card in two bot card zones", () => {
    let state = withWindow(["build-army"]);
    state = startBotTurn(state);
    state = answerBotRequest(state, "YES");
    state = answerBotRequest(state, "EFFECTIVE");
    const membership = cardZoneMembership(state, "germany");
    expect([...membership.values()].every((zones) => zones.length === 1)).toBe(true);
  });

  it("runs the documented round-six Expansion acceptance window", () => {
    let state = withWindow([
      "response",
      "sea-battle",
      "build-army",
      "event",
      "status",
      "economic",
      "build-navy",
      "land-battle",
      "event",
    ]);
    state.turnNumber = 6;
    const originalCount = state.cardZones.germany.deck.length;
    state = startBotTurn(state);
    const window = state.bot.session!.inspectionWindow.map((entry) => entry.cardInstanceId);
    const ruleDiscard = state.cardZones.germany.deck[0]!;

    state = answerBotRequest(state, "YES");
    expect(state.bot.session?.pendingManualRequest?.associatedCardId).toBe(window[2]);
    state = answerBotRequest(state, "EFFECTIVE");
    state = answerBotRequest(state, "BUILD_ARMY");
    state = answerBotRequest(state, "COMPLETED");

    expect(state.bot.session?.pendingManualRequest?.associatedCardId).toBe(window[3]);
    state = answerBotRequest(state, "EFFECTIVE");
    state = answerBotRequest(state, "COMPLETED");

    expect(state.bot.session?.pendingManualRequest?.associatedCardId).toBe(window[6]);
    expect(state.cardZones.germany.discard).toContain(ruleDiscard);
    state = answerBotRequest(state, "EFFECTIVE");
    state = answerBotRequest(state, "BUILD_NAVY");
    state = answerBotRequest(state, "COMPLETED");

    expect(state.bot.session?.isComplete).toBe(true);
    expect(state.cardZones.germany.discard).toEqual(
      expect.arrayContaining([window[2]!, window[3]!, window[6]!, ruleDiscard]),
    );
    expect(state.cardZones.germany.deck).toEqual(
      expect.arrayContaining([window[0]!, window[1]!, window[4]!, window[5]!, window[7]!]),
    );
    expect(state.cardZones.germany.inspection).toHaveLength(0);
    const membership = cardZoneMembership(state, "germany");
    expect([...membership.values()].every((zones) => zones.length === 1)).toBe(true);
    expect([...membership.keys()]).toHaveLength(originalCount);
  });
});
