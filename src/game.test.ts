import { describe, expect, it } from "vitest";
import { canMoveUnit, createInitialState, normalizeGameState, reduceGame } from "./game";
import { CARD_CATALOG } from "./generated-card-catalog";
import { AREAS, MAP_CONNECTIONS, areaById, connectionBetween, countriesForFaction } from "./prototype-data";
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

  it("places and removes a unit without requiring a move workflow", () => {
    let state = createInitialState();
    state = reduceGame(state, {
      type: "PLACE_UNIT",
      areaId: "western-europe",
      countryId: "germany",
      kind: "army",
    });
    expect(state.areas["western-europe"]?.units[0]?.count).toBe(1);

    state = reduceGame(state, {
      type: "REMOVE_UNIT",
      areaId: "western-europe",
      countryId: "germany",
      kind: "army",
    });
    expect(state.areas["western-europe"]?.units).toHaveLength(0);
  });

  it("rejects units placed on incompatible terrain", () => {
    const state = createInitialState();
    expect(() =>
      reduceGame(state, {
        type: "PLACE_UNIT",
        areaId: "north-atlantic",
        countryId: "germany",
        kind: "army",
      }),
    ).toThrow("陆军只能位于陆地区域");
  });

  it("keeps every map connection valid and the two point-contact exceptions disconnected", () => {
    const ids = new Set(AREAS.map((area) => area.id));
    const pairs = new Set<string>();
    for (const connection of MAP_CONNECTIONS) {
      expect(ids.has(connection.a)).toBe(true);
      expect(ids.has(connection.b)).toBe(true);
      const pair = [connection.a, connection.b].sort().join("|");
      expect(pairs.has(pair)).toBe(false);
      pairs.add(pair);
      if (connection.kind === "strait") {
        expect(areaById(connection.a).kind).toBe("sea");
        expect(areaById(connection.b).kind).toBe("sea");
        expect(areaById(connection.controller!).kind).toBe("land");
      }
    }
    expect(connectionBetween("middle-east", "balkans")).toBeUndefined();
    expect(connectionBetween("black-sea", "mediterranean")).toBeUndefined();
    expect(connectionBetween("east-pacific", "southeast-pacific")?.kind).toBe("border");
  });

  it("opens controlled straits to exactly one faction", () => {
    let state = createInitialState();
    expect(canMoveUnit(state, "north-atlantic", "mediterranean", "united-kingdom", "navy")).toBe(true);
    expect(canMoveUnit(state, "north-atlantic", "mediterranean", "germany", "navy")).toBe(false);

    state = reduceGame(state, {
      type: "PLACE_UNIT",
      areaId: "north-africa",
      countryId: "germany",
      kind: "army",
    });
    expect(canMoveUnit(state, "north-atlantic", "mediterranean", "united-kingdom", "navy")).toBe(false);
    expect(canMoveUnit(state, "north-atlantic", "mediterranean", "germany", "navy")).toBe(true);
  });

  it("draws and discards cards into the correct country's private zones", () => {
    let state = createInitialState();
    const originalDeckSize = state.cardZones.germany.deck.length;
    const originalHandSize = state.cardZones.germany.hand.length;
    state = reduceGame(state, { type: "DRAW_CARD", countryId: "germany" });
    expect(state.cardZones.germany.deck).toHaveLength(originalDeckSize - 1);
    expect(state.cardZones.germany.hand).toHaveLength(originalHandSize + 1);
    expect(state.cardZones.japan.hand).toHaveLength(7);

    const cardId = state.cardZones.germany.hand.at(-1)!;
    state = reduceGame(state, { type: "DISCARD_CARD", countryId: "germany", cardId });
    expect(state.cardZones.germany.hand).toHaveLength(originalHandSize);
    expect(state.cardZones.germany.discard).toEqual([cardId]);
  });

  it("includes the complete six-country card catalog with images and independent descriptions", () => {
    const state = createInitialState();
    expect(CARD_CATALOG).toHaveLength(380);
    expect(Object.keys(state.cards)).toHaveLength(380);
    expect(
      Object.fromEntries(
        countriesForFaction("axis")
          .concat(countriesForFaction("allies"))
          .map((country) => [
            country.id,
            Object.values(state.cards).filter((card) => card.countryId === country.id).length,
          ]),
      ),
    ).toEqual({
      germany: 68,
      japan: 62,
      italy: 54,
      "united-kingdom": 66,
      "soviet-union": 58,
      "united-states": 72,
    });
    expect(Object.values(state.cards).every((card) => card.name && card.description && card.image)).toBe(true);
    expect(Object.values(state.cardZones).every((zones) => zones.hand.length === 7)).toBe(true);
  });

  it("classifies every persistent British card as status and repairs existing saves", () => {
    const persistentBritishCards = [
      "澳大利亚劳管局",
      "维克托·霍普宣布印度参战",
      "麦肯齐·金起草国家资源动员法",
      "反法西斯抵抗运动",
      "英国皇家海军",
      "流亡政府",
      "自由法国",
      "塞内加尔步兵团",
      "波兰主权",
      "霍巴特滑稽坦克",
    ];
    const catalogCards = CARD_CATALOG.filter(
      (card) => card.countryId === "united-kingdom" && persistentBritishCards.includes(card.name),
    );
    expect(catalogCards).toHaveLength(persistentBritishCards.length);
    expect(catalogCards.every((card) => card.type === "status")).toBe(true);

    const saved = createInitialState();
    saved.cards["card-15332"]!.type = "other";
    expect(normalizeGameState(saved).cards["card-15332"]?.type).toBe("status");
  });

  it("places and removes an air force token", () => {
    let state = createInitialState();
    state = reduceGame(state, {
      type: "PLACE_UNIT",
      areaId: "germany",
      countryId: "germany",
      kind: "air-force",
    });
    expect(state.areas.germany?.units[0]).toMatchObject({ countryId: "germany", kind: "air-force", count: 1 });
    state = reduceGame(state, {
      type: "REMOVE_UNIT",
      areaId: "germany",
      countryId: "germany",
      kind: "air-force",
    });
    expect(state.areas.germany?.units).toHaveLength(0);
  });

  it("preserves deck order while drawing, finding, discarding, recovering, and shuffling", () => {
    let state = createInitialState();
    const originalTop = state.cardZones.germany.deck.at(-1)!;
    state = reduceGame(state, { type: "DRAW_CARD", countryId: "germany" });
    expect(state.cardZones.germany.hand.at(-1)).toBe(originalTop);

    const reversed = state.cardZones.germany.deck.slice().reverse();
    state = reduceGame(state, { type: "SHUFFLE_DECK", countryId: "germany", order: reversed });
    expect(state.cardZones.germany.deck).toEqual(reversed);

    const foundCard = state.cardZones.germany.deck[3]!;
    state = reduceGame(state, { type: "SEARCH_DECK_CARD", countryId: "germany", cardId: foundCard });
    expect(state.cardZones.germany.hand.at(-1)).toBe(foundCard);
    expect(state.cardZones.germany.deck).not.toContain(foundCard);

    const discardedFromDeck = state.cardZones.germany.deck[2]!;
    state = reduceGame(state, { type: "DISCARD_DECK_CARD", countryId: "germany", cardId: discardedFromDeck });
    expect(state.cardZones.germany.discard.at(-1)).toBe(discardedFromDeck);
    state = reduceGame(state, {
      type: "RECOVER_DISCARD_CARD",
      countryId: "germany",
      cardId: discardedFromDeck,
      destination: "deck-top",
    });
    expect(state.cardZones.germany.deck.at(-1)).toBe(discardedFromDeck);

    const bottomCandidate = state.cardZones.germany.deck.at(-1)!;
    state = reduceGame(state, {
      type: "MOVE_DECK_CARD",
      countryId: "germany",
      cardId: bottomCandidate,
      placement: "bottom",
    });
    expect(state.cardZones.germany.deck[0]).toBe(bottomCandidate);

    const handCard = state.cardZones.germany.hand.at(-1)!;
    state = reduceGame(state, { type: "DISCARD_CARD", countryId: "germany", cardId: handCard });
    const combinedOrder = [...state.cardZones.germany.deck, ...state.cardZones.germany.discard].reverse();
    state = reduceGame(state, { type: "RESHUFFLE_DISCARD", countryId: "germany", order: combinedOrder });
    expect(state.cardZones.germany.discard).toHaveLength(0);
    expect(state.cardZones.germany.deck).toEqual(combinedOrder);
  });

  it("keeps status and response cards in dedicated active slots", () => {
    let state = createInitialState();
    const statusCard = Object.values(state.cards).find(
      (card) =>
        card.countryId === "germany" &&
        (card.type === "status" || card.type === "bolster") &&
        state.cardZones.germany.deck.includes(card.id),
    )!;
    const responseCard = Object.values(state.cards).find(
      (card) => card.type === "response" && state.cardZones[card.countryId].deck.includes(card.id),
    )!;
    const responseCountry = responseCard.countryId;

    state = reduceGame(state, { type: "SEARCH_DECK_CARD", countryId: "germany", cardId: statusCard.id });
    state = reduceGame(state, {
      type: "PLAY_CARD_TO_SLOT",
      countryId: "germany",
      cardId: statusCard.id,
      slot: "status",
    });
    expect(state.cardZones.germany.status).toEqual([statusCard.id]);
    state = reduceGame(state, {
      type: "RETURN_SLOT_CARD",
      countryId: "germany",
      cardId: statusCard.id,
      slot: "status",
    });
    expect(state.cardZones.germany.hand).toContain(statusCard.id);

    state = reduceGame(state, { type: "SEARCH_DECK_CARD", countryId: responseCountry, cardId: responseCard.id });
    state = reduceGame(state, {
      type: "PLAY_CARD_TO_SLOT",
      countryId: responseCountry,
      cardId: responseCard.id,
      slot: "response",
    });
    expect(state.cardZones[responseCountry].response).toEqual([responseCard.id]);
    state = reduceGame(state, {
      type: "RESOLVE_SLOT_CARD",
      countryId: responseCountry,
      cardId: responseCard.id,
      slot: "response",
    });
    expect(state.cardZones[responseCountry].response).toHaveLength(0);
    expect(state.cardZones[responseCountry].discard).toContain(responseCard.id);
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
    const originalHandSize = store.state.cardZones.germany.hand.length;
    store.execute({
      type: "ADD_CUSTOM_CARD",
      countryId: "germany",
      name: "测试牌",
      description: "由玩家手动执行",
      cardType: "other",
      destination: "hand",
    });
    const imported = parseImportedSave(store.exportJson());
    expect(imported.cardZones.germany.hand).toHaveLength(originalHandSize + 1);
    expect(Object.values(imported.cards).find((card) => card.name === "测试牌")?.description).toBe("由玩家手动执行");
    expect(imported.log.at(-1)?.message).not.toContain("测试牌");
    expect(() => parseImportedSave('{"hello":"world"}')).toThrow("兼容");
  });
});
