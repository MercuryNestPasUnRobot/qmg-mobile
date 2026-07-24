import { describe, expect, it } from "vitest";
import { createInitialState, reduceGame } from "./game";
import { countriesForFaction } from "./prototype-data";
import { GameStore, parseImportedSave, type StorageLike } from "./store";

class MemoryStorage implements StorageLike {
  private values = new Map<string, string>();
  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

describe("prototype game state", () => {
  it("keeps exactly three country hands visible per faction", () => {
    expect(countriesForFaction("axis").map((country) => country.id)).toEqual(["germany", "japan", "italy"]);
    expect(countriesForFaction("allies").map((country) => country.id)).toEqual([
      "united-kingdom",
      "soviet-union",
      "united-states",
    ]);
  });

  it("places, moves, and removes a unit", () => {
    let state = createInitialState();
    state = reduceGame(state, {
      type: "PLACE_UNIT",
      areaId: "western-europe",
      countryId: "germany",
      kind: "army",
    });
    state = reduceGame(state, {
      type: "MOVE_UNIT",
      fromAreaId: "western-europe",
      toAreaId: "eastern-europe",
      countryId: "germany",
      kind: "army",
    });
    expect(state.areas["western-europe"]?.units).toHaveLength(0);
    expect(state.areas["eastern-europe"]?.units[0]?.count).toBe(1);

    state = reduceGame(state, {
      type: "REMOVE_UNIT",
      areaId: "eastern-europe",
      countryId: "germany",
      kind: "army",
    });
    expect(state.areas["eastern-europe"]?.units).toHaveLength(0);
  });

  it("rejects invalid unit terrain and non-adjacent movement", () => {
    const state = createInitialState();
    expect(() =>
      reduceGame(state, {
        type: "PLACE_UNIT",
        areaId: "atlantic",
        countryId: "germany",
        kind: "army",
      }),
    ).toThrow("陆军只能位于陆地区域");
  });

  it("draws and discards cards into the correct country's private zones", () => {
    let state = createInitialState();
    const originalDeckSize = state.cardZones.germany.deck.length;
    state = reduceGame(state, { type: "DRAW_CARD", countryId: "germany" });
    expect(state.cardZones.germany.deck).toHaveLength(originalDeckSize - 1);
    expect(state.cardZones.germany.hand).toHaveLength(1);
    expect(state.cardZones.japan.hand).toHaveLength(0);

    const cardId = state.cardZones.germany.hand[0]!;
    state = reduceGame(state, { type: "DISCARD_CARD", countryId: "germany", cardId });
    expect(state.cardZones.germany.hand).toHaveLength(0);
    expect(state.cardZones.germany.discard).toEqual([cardId]);
  });

  it("advances through all six countries and increments the round", () => {
    let state = createInitialState();
    for (let index = 0; index < 6; index += 1) state = reduceGame(state, { type: "END_TURN" });
    expect(state.turnCountry).toBe("germany");
    expect(state.turnNumber).toBe(2);
    expect(state.activeFaction).toBe("axis");
  });
});

describe("save, restore, import and undo", () => {
  it("automatically restores the latest local state", () => {
    const storage = new MemoryStorage();
    const store = new GameStore(storage);
    store.execute({ type: "ADJUST_VP", faction: "axis", amount: 3 });
    const restored = new GameStore(storage);
    expect(restored.state.victoryPoints.axis).toBe(3);
  });

  it("undoes the most recent action and persists the result", () => {
    const storage = new MemoryStorage();
    const store = new GameStore(storage);
    store.execute({ type: "ADJUST_VP", faction: "allies", amount: 2 });
    expect(store.undo()).toBe(true);
    expect(store.state.victoryPoints.allies).toBe(0);
    expect(store.state.log.at(-1)?.message).toContain("撤销");
    expect(new GameStore(storage).state.victoryPoints.allies).toBe(0);
  });

  it("round-trips an exported JSON save and rejects unrelated JSON", () => {
    const store = new GameStore();
    store.execute({ type: "ADD_CUSTOM_CARD", countryId: "germany", name: "测试牌", cardType: "other", destination: "hand" });
    const imported = parseImportedSave(store.exportJson());
    expect(imported.cardZones.germany.hand).toHaveLength(1);
    expect(imported.log.at(-1)?.message).not.toContain("测试牌");
    expect(() => parseImportedSave('{"hello":"world"}')).toThrow("兼容");
  });
});
