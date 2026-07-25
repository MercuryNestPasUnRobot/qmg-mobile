import {
  appendUndoLog,
  createInitialState,
  describeAction,
  isGameState,
  normalizeGameState,
  reduceGame,
  SAVE_VERSION,
  shuffleAllCardsIntoDecks,
  type CardType,
  type ExpansionCardDefinition,
  type GameAction,
  type GameState,
  type RandomUint32,
} from "./game";
import { COUNTRIES, countryById, type CountryId } from "./prototype-data";
import { answerBotRequest, startBotTurn } from "./bot/engine";
import type { BotAnswer } from "./bot/types";

const STORAGE_KEY = "qmg-mobile.prototype.save.v1";
const MAX_UNDO = 50;

interface HistoryEntry {
  state: GameState;
  description: string;
}

interface StoredSession {
  format: "qmg-mobile-session";
  version: typeof SAVE_VERSION;
  state: GameState;
  history: HistoryEntry[];
}

interface ExportedSave {
  format: "qmg-mobile-save";
  version: typeof SAVE_VERSION;
  exportedAt: string;
  state: GameState;
}

interface ExpansionPackFile {
  format: "qmg-mobile-expansion";
  version: 1;
  name: string;
  exportedAt: string;
  cards: ExpansionCardDefinition[];
}

const CARD_TYPES = new Set<CardType>([
  "build",
  "build-army",
  "build-navy",
  "land-battle",
  "sea-battle",
  "economic",
  "event",
  "response",
  "status",
  "air-power",
  "bolster",
  "other",
]);
const COUNTRY_IDS = new Set(COUNTRIES.map((country) => country.id));

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function isStoredSession(value: unknown): value is StoredSession {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<StoredSession>;
  return (
    candidate.format === "qmg-mobile-session" &&
    candidate.version === SAVE_VERSION &&
    isGameState(candidate.state) &&
    Array.isArray(candidate.history)
  );
}

export function parseImportedSave(text: string): GameState {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("JSON 格式无效");
  }

  if (isGameState(parsed)) return normalizeGameState(parsed);
  if (parsed && typeof parsed === "object" && isGameState((parsed as Partial<ExportedSave>).state)) {
    return normalizeGameState((parsed as ExportedSave).state);
  }
  throw new Error("这不是兼容的 QMG Mobile 存档");
}

export function parseExpansionPack(text: string): Pick<ExpansionPackFile, "name" | "cards"> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("拓展包 JSON 格式无效");
  }
  if (!parsed || typeof parsed !== "object") throw new Error("这不是兼容的 QMG 拓展包");
  const candidate = parsed as Partial<ExpansionPackFile>;
  if (
    candidate.format !== "qmg-mobile-expansion" ||
    candidate.version !== 1 ||
    typeof candidate.name !== "string" ||
    !candidate.name.trim() ||
    !Array.isArray(candidate.cards) ||
    !candidate.cards.length
  ) {
    throw new Error("这不是兼容的 QMG 拓展包");
  }
  const cards = candidate.cards.map((value) => {
    const card = value as Partial<ExpansionCardDefinition>;
    if (
      !COUNTRY_IDS.has(card.countryId as CountryId) ||
      typeof card.name !== "string" ||
      !card.name.trim() ||
      typeof card.description !== "string" ||
      !CARD_TYPES.has(card.cardType as CardType) ||
      (card.destination !== "hand" && card.destination !== "deck")
    ) {
      throw new Error("拓展包中包含无效卡牌");
    }
    return {
      countryId: card.countryId as CountryId,
      name: card.name.trim(),
      description: card.description.trim(),
      cardType: card.cardType as CardType,
      destination: card.destination,
    };
  });
  return { name: candidate.name.trim(), cards };
}

export class GameStore {
  state: GameState;
  private history: HistoryEntry[] = [];

  constructor(private readonly storage?: StorageLike, now = new Date()) {
    this.state = createInitialState(now);
    this.restore();
  }

  private restore(): void {
    if (!this.storage) return;
    try {
      const raw = this.storage.getItem(STORAGE_KEY);
      if (!raw) return;
      const saved: unknown = JSON.parse(raw);
      if (!isStoredSession(saved)) return;
      this.state = normalizeGameState(saved.state);
      this.history = saved.history.filter(
        (entry): entry is HistoryEntry =>
          Boolean(entry) && typeof entry.description === "string" && isGameState(entry.state),
      ).map((entry) => ({ ...entry, state: normalizeGameState(entry.state) }));
    } catch {
      // Corrupt or unavailable storage falls back to a fresh local game.
    }
  }

  private persist(): void {
    if (!this.storage) return;
    const session: StoredSession = {
      format: "qmg-mobile-session",
      version: SAVE_VERSION,
      state: this.state,
      history: this.history,
    };
    this.storage.setItem(STORAGE_KEY, JSON.stringify(session));
  }

  execute(action: GameAction, now = new Date()): void {
    const description = describeAction(action, this.state);
    const next = reduceGame(this.state, action, now);
    this.history.push({ state: this.state, description });
    if (this.history.length > MAX_UNDO) this.history.shift();
    this.state = next;
    this.persist();
  }

  undo(now = new Date()): boolean {
    const previous = this.history.pop();
    if (!previous) return false;
    this.state = appendUndoLog(previous.state, previous.description, now);
    this.persist();
    return true;
  }

  canUndo(): boolean {
    return this.history.length > 0;
  }

  startCurrentBotTurn(): boolean {
    const next = startBotTurn(this.state);
    if (next === this.state) return false;
    this.history.push({
      state: this.state,
      description: `开始 ${countryById(this.state.turnCountry).name}机器人回合`,
    });
    if (this.history.length > MAX_UNDO) this.history.shift();
    this.state = next;
    this.persist();
    return true;
  }

  answerCurrentBotRequest(answer: BotAnswer): void {
    const prompt = this.state.bot.session?.pendingManualRequest?.prompt ?? "机器人请求";
    const next = answerBotRequest(this.state, answer);
    this.history.push({ state: this.state, description: prompt });
    if (this.history.length > MAX_UNDO) this.history.shift();
    this.state = next;
    this.persist();
  }

  newGame(now = new Date(), randomUint32?: RandomUint32): void {
    const packs = Object.values(this.state.expansionPacks).map((pack) => ({
      id: pack.id,
      name: pack.name,
      cards: this.expansionCards(pack.id),
    }));
    this.state = createInitialState(now, randomUint32);
    this.history = [];
    for (const pack of packs) {
      this.state = reduceGame(
        this.state,
        { type: "IMPORT_EXPANSION_PACK", packId: pack.id, name: pack.name, cards: pack.cards },
        now,
      );
    }
    this.state = shuffleAllCardsIntoDecks(this.state, randomUint32);
    this.persist();
  }

  importJson(text: string): void {
    this.state = structuredClone(parseImportedSave(text));
    this.history = [];
    this.persist();
  }

  exportJson(now = new Date()): string {
    const save: ExportedSave = {
      format: "qmg-mobile-save",
      version: SAVE_VERSION,
      exportedAt: now.toISOString(),
      state: this.state,
    };
    return JSON.stringify(save, null, 2);
  }

  private expansionCards(packId: string): ExpansionCardDefinition[] {
    const pack = this.state.expansionPacks[packId];
    if (!pack) throw new Error("找不到该拓展包");
    return pack.cardIds
      .map((id) => this.state.cards[id])
      .filter((card) => Boolean(card))
      .map((card) => ({
        countryId: card!.countryId,
        name: card!.name,
        description: card!.description,
        cardType: card!.type,
        destination: card!.expansionDestination ?? "deck",
      }));
  }

  exportExpansionPack(packId: string, now = new Date()): string {
    const pack = this.state.expansionPacks[packId];
    if (!pack) throw new Error("找不到该拓展包");
    const file: ExpansionPackFile = {
      format: "qmg-mobile-expansion",
      version: 1,
      name: pack.name,
      exportedAt: now.toISOString(),
      cards: this.expansionCards(packId),
    };
    return JSON.stringify(file, null, 2);
  }

  importExpansionPack(text: string): string {
    const parsed = parseExpansionPack(text);
    const packId = `pack-${Date.now()}-${this.state.nextCustomCardId}`;
    this.execute({ type: "IMPORT_EXPANSION_PACK", packId, name: parsed.name, cards: parsed.cards });
    return packId;
  }
}
