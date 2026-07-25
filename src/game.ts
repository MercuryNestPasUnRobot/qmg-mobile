import {
  AREAS,
  COUNTRIES,
  TURN_ORDER,
  areaById,
  connectionBetween,
  countryById,
  type CountryId,
  type Faction,
  type UnitKind,
} from "./prototype-data";
import { CARD_CATALOG } from "./generated-card-catalog";
import type {
  BotRuntimeState,
  BotStrengthSettings,
  ControllerType,
  TotalWarDiscardMode,
} from "./bot/types";

export const SAVE_VERSION = 1;
export const DEFAULT_BOT_INSPECTION_WINDOW = 8;
export const DEFAULT_BOT_DISCARD_RECYCLE = 0;
export const MIN_BOT_INSPECTION_WINDOW = 1;
export const MAX_BOT_INSPECTION_WINDOW = 20;
export const MIN_BOT_DISCARD_RECYCLE = 0;
export const MAX_BOT_DISCARD_RECYCLE = 20;
export const PHASES = ["开始", "出牌", "空军（Total War）", "补给", "计分", "弃牌", "抽牌"] as const;
const LEGACY_PHASES = ["部署", "行动", "战斗"] as const;
export type Phase = (typeof PHASES)[number] | (typeof LEGACY_PHASES)[number];
export type CardType =
  | "build"
  | "build-army"
  | "build-navy"
  | "land-battle"
  | "sea-battle"
  | "economic"
  | "event"
  | "response"
  | "status"
  | "air-power"
  | "bolster"
  | "other";
export type AuxiliaryNation = "china" | "france";
export type RandomUint32 = () => number;

export interface UnitStack {
  countryId: CountryId;
  kind: UnitKind;
  auxiliary?: AuxiliaryNation;
  count: number;
}

export interface AreaState {
  id: string;
  units: UnitStack[];
}

export interface Card {
  id: string;
  countryId: CountryId;
  name: string;
  description: string;
  type: CardType;
  edition: "base" | "total-war" | "custom";
  image?: string;
  sourceId?: number;
  isCustom: boolean;
  expansionPackId?: string;
  expansionDestination?: "hand" | "deck";
}

export interface ExpansionCardDefinition {
  countryId: CountryId;
  name: string;
  description: string;
  cardType: CardType;
  destination: "hand" | "deck";
}

export interface ExpansionPack {
  id: string;
  name: string;
  cardIds: string[];
  createdAt: string;
}

export interface CardZones {
  deck: string[];
  hand: string[];
  discard: string[];
  status: string[];
  response: string[];
  inspection: string[];
  resolution: string[];
  removed: string[];
}

export interface LogEntry {
  id: number;
  at: string;
  message: string;
}

export interface GameState {
  version: typeof SAVE_VERSION;
  activeFaction: Faction;
  turnCountry: CountryId;
  turnNumber: number;
  phase: Phase;
  areas: Record<string, AreaState>;
  cards: Record<string, Card>;
  cardZones: Record<CountryId, CardZones>;
  expansionPacks: Record<string, ExpansionPack>;
  bot: BotRuntimeState;
  victoryPoints: Record<Faction, number>;
  log: LogEntry[];
  nextLogId: number;
  nextCustomCardId: number;
  updatedAt: string;
}

export type GameAction =
  | { type: "SWITCH_FACTION"; faction: Faction }
  | { type: "SET_TURN_COUNTRY"; countryId: CountryId }
  | { type: "SET_PHASE"; phase: Phase }
  | { type: "END_TURN" }
  | { type: "SET_CONTROLLER"; countryId: CountryId; controller: ControllerType }
  | { type: "SET_BOT_CONFIG"; totalWarEnabled: boolean; discardMode: TotalWarDiscardMode }
  | {
      type: "SET_BOT_STRENGTH";
      countryId: CountryId;
      inspectionWindowSize: number;
      discardRecycleCount: number;
    }
  | {
      type: "SET_ALL_BOT_STRENGTH";
      inspectionWindowSize: number;
      discardRecycleCount: number;
    }
  | { type: "CLEAR_BOT_SESSION" }
  | { type: "PLACE_UNIT"; areaId: string; countryId: CountryId; kind: UnitKind; auxiliary?: AuxiliaryNation }
  | { type: "REMOVE_UNIT"; areaId: string; countryId: CountryId; kind: UnitKind; auxiliary?: AuxiliaryNation }
  | { type: "DRAW_CARD"; countryId: CountryId }
  | { type: "DISCARD_CARD"; countryId: CountryId; cardId: string }
  | { type: "DISCARD_DECK_CARD"; countryId: CountryId; cardId: string }
  | { type: "SEARCH_DECK_CARD"; countryId: CountryId; cardId: string }
  | { type: "SHUFFLE_DECK"; countryId: CountryId; order: string[] }
  | { type: "MOVE_DECK_CARD"; countryId: CountryId; cardId: string; placement: "top" | "bottom" }
  | { type: "RECOVER_DISCARD_CARD"; countryId: CountryId; cardId: string; destination: "hand" | "deck-top" }
  | { type: "RESHUFFLE_DISCARD"; countryId: CountryId; order: string[] }
  | { type: "PLAY_CARD_TO_SLOT"; countryId: CountryId; cardId: string; slot: "status" | "response" }
  | { type: "RESOLVE_SLOT_CARD"; countryId: CountryId; cardId: string; slot: "status" | "response" }
  | { type: "RETURN_SLOT_CARD"; countryId: CountryId; cardId: string; slot: "status" | "response" }
  | {
      type: "ADD_CUSTOM_CARD";
      countryId: CountryId;
      name: string;
      description: string;
      cardType: CardType;
      destination: "hand" | "deck";
      packId: string;
      packName?: string;
    }
  | {
      type: "IMPORT_EXPANSION_PACK";
      packId: string;
      name: string;
      cards: ExpansionCardDefinition[];
    }
  | { type: "REMOVE_EXPANSION_PACK"; packId: string }
  | { type: "ADJUST_VP"; faction: Faction; amount: number }
  | { type: "SET_VP"; faction: Faction; value: number };

function emptyZones(): Record<CountryId, CardZones> {
  const zones = {} as Record<CountryId, CardZones>;
  for (const country of COUNTRIES) {
    zones[country.id] = {
      deck: [],
      hand: [],
      discard: [],
      status: [],
      response: [],
      inspection: [],
      resolution: [],
      removed: [],
    };
  }
  return zones;
}

const STARTING_UNITS: ReadonlyArray<{ areaId: string; unit: UnitStack }> = [
  { areaId: "germany", unit: { countryId: "germany", kind: "army", count: 1 } },
  { areaId: "japan", unit: { countryId: "japan", kind: "army", count: 1 } },
  { areaId: "italy", unit: { countryId: "italy", kind: "army", count: 1 } },
  { areaId: "united-kingdom", unit: { countryId: "united-kingdom", kind: "army", count: 1 } },
  { areaId: "moscow", unit: { countryId: "soviet-union", kind: "army", count: 1 } },
  { areaId: "united-states", unit: { countryId: "united-states", kind: "army", count: 1 } },
  { areaId: "hawaii", unit: { countryId: "united-states", kind: "army", count: 1 } },
  {
    areaId: "western-europe",
    unit: { countryId: "united-kingdom", kind: "army", auxiliary: "france", count: 1 },
  },
  {
    areaId: "eastern-china",
    unit: { countryId: "united-states", kind: "army", auxiliary: "china", count: 1 },
  },
];

function initialAreas(): Record<string, AreaState> {
  const areas = Object.fromEntries(AREAS.map((area) => [area.id, { id: area.id, units: [] }])) as Record<
    string,
    AreaState
  >;
  for (const placement of STARTING_UNITS) areas[placement.areaId]!.units.push(structuredClone(placement.unit));
  return areas;
}

function defaultBotStrength(): BotStrengthSettings {
  return {
    inspectionWindowSize: DEFAULT_BOT_INSPECTION_WINDOW,
    discardRecycleCount: DEFAULT_BOT_DISCARD_RECYCLE,
  };
}

function allCountryBotStrength(): Record<CountryId, BotStrengthSettings> {
  return Object.fromEntries(COUNTRIES.map((country) => [country.id, defaultBotStrength()])) as Record<
    CountryId,
    BotStrengthSettings
  >;
}

function requireBotStrength(inspectionWindowSize: number, discardRecycleCount: number): void {
  if (
    !Number.isInteger(inspectionWindowSize) ||
    inspectionWindowSize < MIN_BOT_INSPECTION_WINDOW ||
    inspectionWindowSize > MAX_BOT_INSPECTION_WINDOW
  ) {
    throw new Error(`检查窗口必须为 ${MIN_BOT_INSPECTION_WINDOW}–${MAX_BOT_INSPECTION_WINDOW}`);
  }
  if (
    !Number.isInteger(discardRecycleCount) ||
    discardRecycleCount < MIN_BOT_DISCARD_RECYCLE ||
    discardRecycleCount > MAX_BOT_DISCARD_RECYCLE
  ) {
    throw new Error(`弃牌洗回数量必须为 ${MIN_BOT_DISCARD_RECYCLE}–${MAX_BOT_DISCARD_RECYCLE}`);
  }
}

function normalizedBotStrength(value?: Partial<BotStrengthSettings>): BotStrengthSettings {
  const inspectionWindowSize = Number.isInteger(value?.inspectionWindowSize)
    ? Math.min(
        MAX_BOT_INSPECTION_WINDOW,
        Math.max(MIN_BOT_INSPECTION_WINDOW, value!.inspectionWindowSize!),
      )
    : DEFAULT_BOT_INSPECTION_WINDOW;
  const discardRecycleCount = Number.isInteger(value?.discardRecycleCount)
    ? Math.min(
        MAX_BOT_DISCARD_RECYCLE,
        Math.max(MIN_BOT_DISCARD_RECYCLE, value!.discardRecycleCount!),
      )
    : DEFAULT_BOT_DISCARD_RECYCLE;
  return { inspectionWindowSize, discardRecycleCount };
}

export function createInitialState(now = new Date(), randomUint32?: RandomUint32): GameState {
  const cards: Record<string, Card> = {};
  const cardZones = emptyZones();

  for (const country of COUNTRIES) {
    const countryCards = CARD_CATALOG.filter((card) => card.countryId === country.id);
    for (const definition of countryCards) {
      cards[definition.id] = {
        ...definition,
        countryId: country.id,
        type: definition.type,
        edition: definition.edition,
        isCustom: false,
      };
      cardZones[country.id].deck.push(definition.id);
    }
  }

  const timestamp = now.toISOString();
  return shuffleAllCardsIntoDecks(
    {
      version: SAVE_VERSION,
      activeFaction: "axis",
      turnCountry: "germany",
      turnNumber: 1,
      phase: "开始",
      areas: initialAreas(),
      cards,
      cardZones,
      expansionPacks: {},
      bot: {
        controllers: Object.fromEntries(COUNTRIES.map((country) => [country.id, "HUMAN"])) as Record<
          CountryId,
          ControllerType
        >,
        countrySettings: allCountryBotStrength(),
        config: { totalWarEnabled: false, totalWarDiscardMode: "TOP_CARD" },
        rngState: randomUint32?.() ?? secureRandomUint32(),
        session: null,
      },
      victoryPoints: { axis: 0, allies: 0 },
      log: [{ id: 1, at: timestamp, message: "新战局已创建并洗牌" }],
      nextLogId: 2,
      nextCustomCardId: 1,
      updatedAt: timestamp,
    },
    randomUint32,
  );
}

function cloneState(state: GameState): GameState {
  return structuredClone(state);
}

function secureRandomUint32(): number {
  const values = new Uint32Array(1);
  globalThis.crypto.getRandomValues(values);
  return values[0]!;
}

function shuffleInPlace<T>(values: T[], randomUint32: RandomUint32): void {
  const uint32Range = 0x1_0000_0000;
  for (let index = values.length - 1; index > 0; index -= 1) {
    const choices = index + 1;
    const unbiasedLimit = Math.floor(uint32Range / choices) * choices;
    let sample: number;
    do {
      sample = randomUint32() >>> 0;
    } while (sample >= unbiasedLimit);
    const swapIndex = sample % choices;
    [values[index], values[swapIndex]] = [values[swapIndex]!, values[index]!];
  }
}

export function shuffleAllCardsIntoDecks(
  state: GameState,
  randomUint32: RandomUint32 = secureRandomUint32,
): GameState {
  const next = cloneState(state);
  for (const country of COUNTRIES) {
    const zones = next.cardZones[country.id];
    const allCards = [
      ...zones.deck,
      ...zones.hand,
      ...zones.discard,
      ...zones.status,
      ...zones.response,
      ...zones.inspection,
      ...zones.resolution,
      ...zones.removed,
    ];
    shuffleInPlace(allCards, randomUint32);
    zones.deck = allCards;
    zones.hand = [];
    zones.discard = [];
    zones.status = [];
    zones.response = [];
    zones.inspection = [];
    zones.resolution = [];
    zones.removed = [];
  }
  return next;
}

function addLog(state: GameState, message: string, now = new Date()): void {
  state.log.push({ id: state.nextLogId, at: now.toISOString(), message });
  state.nextLogId += 1;
  if (state.log.length > 200) state.log = state.log.slice(-200);
  state.updatedAt = now.toISOString();
}

function findStack(
  area: AreaState,
  countryId: CountryId,
  kind: UnitKind,
  auxiliary?: AuxiliaryNation,
): UnitStack | undefined {
  return area.units.find(
    (stack) =>
      stack.countryId === countryId && stack.kind === kind && (stack.auxiliary ?? undefined) === auxiliary,
  );
}

function auxiliaryName(auxiliary?: AuxiliaryNation): string {
  if (auxiliary === "china") return "中国";
  if (auxiliary === "france") return "法国";
  return "";
}

function requireValidAuxiliary(countryId: CountryId, auxiliary?: AuxiliaryNation): void {
  if (!auxiliary) return;
  if (
    (auxiliary === "china" && countryId !== "united-states") ||
    (auxiliary === "france" && countryId !== "united-kingdom")
  ) {
    throw new Error("该国家不能使用所选附属国");
  }
}

function requireCompatibleArea(areaId: string, kind: UnitKind): void {
  const area = areaById(areaId);
  if (kind === "army" && area.kind !== "land") throw new Error("陆军只能位于陆地区域");
  if (kind === "navy" && area.kind !== "sea") throw new Error("海军只能位于海域");
}

function isStraitOpen(state: GameState, controllerId: string, countryId: CountryId): boolean {
  const controller = state.areas[controllerId];
  if (!controller) return false;
  const axisControls = controller.units.some(
    (stack) => stack.kind === "army" && stack.count > 0 && countryById(stack.countryId).faction === "axis",
  );
  return countryById(countryId).faction === "axis" ? axisControls : !axisControls;
}

export function canMoveUnit(
  state: GameState,
  fromAreaId: string,
  toAreaId: string,
  countryId: CountryId,
  kind: UnitKind,
): boolean {
  const from = areaById(fromAreaId);
  const to = areaById(toAreaId);
  if (kind === "air-force") return fromAreaId !== toAreaId;
  if (from.kind !== to.kind) return false;
  if ((kind === "army" && from.kind !== "land") || (kind === "navy" && from.kind !== "sea")) return false;
  const connection = connectionBetween(fromAreaId, toAreaId);
  if (!connection) return false;
  if (connection.kind === "border") return true;
  return kind === "navy" && Boolean(connection.controller) && isStraitOpen(state, connection.controller!, countryId);
}

export function describeAction(action: GameAction, state: GameState): string {
  switch (action.type) {
    case "SWITCH_FACTION":
      return `切换至${action.faction === "axis" ? "轴心国" : "同盟国"}`;
    case "SET_TURN_COUNTRY":
      return `回合国家改为${countryById(action.countryId).name}`;
    case "SET_PHASE":
      return `阶段改为${action.phase}`;
    case "END_TURN": {
      const index = TURN_ORDER.indexOf(state.turnCountry);
      return `结束${countryById(state.turnCountry).name}回合，交给${countryById(TURN_ORDER[(index + 1) % TURN_ORDER.length]!).name}`;
    }
    case "SET_CONTROLLER":
      return `${countryById(action.countryId).name}控制方式设为${action.controller === "BOT" ? "机器人" : "玩家"}`;
    case "SET_BOT_CONFIG":
      return `机器人全面战争规则${action.totalWarEnabled ? "开启" : "关闭"}`;
    case "SET_BOT_STRENGTH":
      return `${countryById(action.countryId).name}机器人强度：检查 ${action.inspectionWindowSize}，洗回 ${action.discardRecycleCount}`;
    case "SET_ALL_BOT_STRENGTH":
      return `统一机器人强度：检查 ${action.inspectionWindowSize}，洗回 ${action.discardRecycleCount}`;
    case "CLEAR_BOT_SESSION":
      return "清除已完成的机器人回合";
    case "PLACE_UNIT":
      return `${auxiliaryName(action.auxiliary) || countryById(action.countryId).name}在${areaById(action.areaId).name}放置1支${
        action.kind === "army" ? "陆军" : action.kind === "navy" ? "海军" : "空军"
      }`;
    case "REMOVE_UNIT":
      return `${auxiliaryName(action.auxiliary) || countryById(action.countryId).name}从${areaById(action.areaId).name}移除1支${
        action.kind === "army" ? "陆军" : action.kind === "navy" ? "海军" : "空军"
      }`;
    case "DRAW_CARD":
      return `${countryById(action.countryId).name}抽1张牌`;
    case "DISCARD_CARD":
      return `${countryById(action.countryId).name}弃掉「${state.cards[action.cardId]?.name ?? "未知卡牌"}」`;
    case "DISCARD_DECK_CARD":
      return `${countryById(action.countryId).name}从牌堆弃掉「${state.cards[action.cardId]?.name ?? "未知卡牌"}」`;
    case "SEARCH_DECK_CARD":
      return `${countryById(action.countryId).name}从牌堆找到「${state.cards[action.cardId]?.name ?? "未知卡牌"}」并加入手牌`;
    case "SHUFFLE_DECK":
      return `${countryById(action.countryId).name}洗牌`;
    case "MOVE_DECK_CARD":
      return `${countryById(action.countryId).name}将「${state.cards[action.cardId]?.name ?? "未知卡牌"}」置于牌堆${action.placement === "top" ? "顶" : "底"}`;
    case "RECOVER_DISCARD_CARD":
      return `${countryById(action.countryId).name}从弃牌堆回收「${state.cards[action.cardId]?.name ?? "未知卡牌"}」到${action.destination === "hand" ? "手牌" : "牌堆顶"}`;
    case "RESHUFFLE_DISCARD":
      return `${countryById(action.countryId).name}将弃牌堆洗回牌堆`;
    case "PLAY_CARD_TO_SLOT":
      return `${countryById(action.countryId).name}将「${state.cards[action.cardId]?.name ?? "未知卡牌"}」放入${action.slot === "status" ? "状态" : "响应"}栏`;
    case "RESOLVE_SLOT_CARD":
      return `${countryById(action.countryId).name}结算并弃置「${state.cards[action.cardId]?.name ?? "未知卡牌"}」`;
    case "RETURN_SLOT_CARD":
      return `${countryById(action.countryId).name}将「${state.cards[action.cardId]?.name ?? "未知卡牌"}」收回手牌`;
    case "ADD_CUSTOM_CARD":
      return `${countryById(action.countryId).name}向「${state.expansionPacks[action.packId]?.name ?? action.packName ?? "拓展包"}」添加1张卡牌`;
    case "IMPORT_EXPANSION_PACK":
      return `加入拓展包「${action.name}」（${action.cards.length}张牌）`;
    case "REMOVE_EXPANSION_PACK":
      return `移除拓展包「${state.expansionPacks[action.packId]?.name ?? "未知拓展包"}」`;
    case "ADJUST_VP":
      return `${action.faction === "axis" ? "轴心国" : "同盟国"}胜利点${action.amount >= 0 ? "+" : ""}${action.amount}`;
    case "SET_VP":
      return `${action.faction === "axis" ? "轴心国" : "同盟国"}胜利点设为${action.value}`;
  }
}

export function reduceGame(state: GameState, action: GameAction, now = new Date()): GameState {
  const next = cloneState(state);
  const description = describeAction(action, state);

  switch (action.type) {
    case "SWITCH_FACTION":
      next.activeFaction = action.faction;
      break;
    case "SET_TURN_COUNTRY":
      countryById(action.countryId);
      next.turnCountry = action.countryId;
      break;
    case "SET_PHASE":
      if (!(PHASES as readonly string[]).includes(action.phase)) throw new Error("无效阶段");
      next.phase = action.phase;
      break;
    case "END_TURN": {
      const currentIndex = TURN_ORDER.indexOf(next.turnCountry);
      const nextIndex = (currentIndex + 1) % TURN_ORDER.length;
      const nextCountry = TURN_ORDER[nextIndex]!;
      next.turnCountry = nextCountry;
      next.activeFaction = countryById(nextCountry).faction;
      next.phase = "开始";
      if (nextIndex === 0) next.turnNumber += 1;
      break;
    }
    case "SET_CONTROLLER":
      next.bot.controllers[action.countryId] = action.controller;
      break;
    case "SET_BOT_CONFIG":
      next.bot.config = {
        totalWarEnabled: action.totalWarEnabled,
        totalWarDiscardMode: action.discardMode,
      };
      break;
    case "SET_BOT_STRENGTH":
      requireBotStrength(action.inspectionWindowSize, action.discardRecycleCount);
      next.bot.countrySettings[action.countryId] = {
        inspectionWindowSize: action.inspectionWindowSize,
        discardRecycleCount: action.discardRecycleCount,
      };
      break;
    case "SET_ALL_BOT_STRENGTH":
      requireBotStrength(action.inspectionWindowSize, action.discardRecycleCount);
      for (const country of COUNTRIES) {
        next.bot.countrySettings[country.id] = {
          inspectionWindowSize: action.inspectionWindowSize,
          discardRecycleCount: action.discardRecycleCount,
        };
      }
      break;
    case "CLEAR_BOT_SESSION":
      next.bot.session = null;
      break;
    case "PLACE_UNIT": {
      requireCompatibleArea(action.areaId, action.kind);
      countryById(action.countryId);
      requireValidAuxiliary(action.countryId, action.auxiliary);
      const area = next.areas[action.areaId];
      if (!area) throw new Error("区域不存在");
      const stack = findStack(area, action.countryId, action.kind, action.auxiliary);
      if (stack) stack.count += 1;
      else area.units.push({ countryId: action.countryId, kind: action.kind, auxiliary: action.auxiliary, count: 1 });
      break;
    }
    case "REMOVE_UNIT": {
      requireValidAuxiliary(action.countryId, action.auxiliary);
      const area = next.areas[action.areaId];
      if (!area) throw new Error("区域不存在");
      const stack = findStack(area, action.countryId, action.kind, action.auxiliary);
      if (!stack?.count) throw new Error("没有可移除的单位");
      stack.count -= 1;
      if (stack.count === 0) area.units = area.units.filter((candidate) => candidate !== stack);
      break;
    }
    case "DRAW_CARD": {
      const zones = next.cardZones[action.countryId];
      const cardId = zones.deck.pop();
      if (!cardId) throw new Error("牌堆已空");
      zones.hand.push(cardId);
      break;
    }
    case "DISCARD_CARD": {
      const zones = next.cardZones[action.countryId];
      const index = zones.hand.indexOf(action.cardId);
      if (index < 0) throw new Error("该卡牌不在手牌中");
      zones.hand.splice(index, 1);
      zones.discard.push(action.cardId);
      break;
    }
    case "DISCARD_DECK_CARD": {
      const zones = next.cardZones[action.countryId];
      const index = zones.deck.indexOf(action.cardId);
      if (index < 0) throw new Error("该卡牌不在牌堆中");
      zones.deck.splice(index, 1);
      zones.discard.push(action.cardId);
      break;
    }
    case "SEARCH_DECK_CARD": {
      const zones = next.cardZones[action.countryId];
      const index = zones.deck.indexOf(action.cardId);
      if (index < 0) throw new Error("该卡牌不在牌堆中");
      zones.deck.splice(index, 1);
      zones.hand.push(action.cardId);
      break;
    }
    case "SHUFFLE_DECK": {
      const zones = next.cardZones[action.countryId];
      if (
        action.order.length !== zones.deck.length ||
        new Set(action.order).size !== action.order.length ||
        action.order.some((id) => !zones.deck.includes(id))
      ) {
        throw new Error("洗牌顺序无效");
      }
      zones.deck = [...action.order];
      break;
    }
    case "MOVE_DECK_CARD": {
      const zones = next.cardZones[action.countryId];
      const index = zones.deck.indexOf(action.cardId);
      if (index < 0) throw new Error("该卡牌不在牌堆中");
      zones.deck.splice(index, 1);
      if (action.placement === "top") zones.deck.push(action.cardId);
      else zones.deck.unshift(action.cardId);
      break;
    }
    case "RECOVER_DISCARD_CARD": {
      const zones = next.cardZones[action.countryId];
      const index = zones.discard.indexOf(action.cardId);
      if (index < 0) throw new Error("该卡牌不在弃牌堆中");
      zones.discard.splice(index, 1);
      if (action.destination === "hand") zones.hand.push(action.cardId);
      else zones.deck.push(action.cardId);
      break;
    }
    case "RESHUFFLE_DISCARD": {
      const zones = next.cardZones[action.countryId];
      const combined = [...zones.deck, ...zones.discard];
      if (
        action.order.length !== combined.length ||
        new Set(action.order).size !== action.order.length ||
        action.order.some((id) => !combined.includes(id))
      ) {
        throw new Error("洗回顺序无效");
      }
      zones.deck = [...action.order];
      zones.discard = [];
      break;
    }
    case "PLAY_CARD_TO_SLOT": {
      const zones = next.cardZones[action.countryId];
      const index = zones.hand.indexOf(action.cardId);
      if (index < 0) throw new Error("该卡牌不在手牌中");
      const card = next.cards[action.cardId];
      const compatible =
        action.slot === "status" ? card?.type === "status" || card?.type === "bolster" : card?.type === "response";
      if (!compatible) throw new Error(action.slot === "status" ? "只有状态或增强牌可进入状态栏" : "只有响应牌可进入响应栏");
      zones.hand.splice(index, 1);
      zones[action.slot].push(action.cardId);
      break;
    }
    case "RESOLVE_SLOT_CARD": {
      const zones = next.cardZones[action.countryId];
      const index = zones[action.slot].indexOf(action.cardId);
      if (index < 0) throw new Error("该卡牌不在栏位中");
      zones[action.slot].splice(index, 1);
      zones.discard.push(action.cardId);
      break;
    }
    case "RETURN_SLOT_CARD": {
      const zones = next.cardZones[action.countryId];
      const index = zones[action.slot].indexOf(action.cardId);
      if (index < 0) throw new Error("该卡牌不在栏位中");
      zones[action.slot].splice(index, 1);
      zones.hand.push(action.cardId);
      break;
    }
    case "ADD_CUSTOM_CARD": {
      const name = action.name.trim();
      if (!name) throw new Error("请输入卡牌名称");
      const packId = action.packId.trim();
      if (!packId) throw new Error("请选择拓展包");
      let pack = next.expansionPacks[packId];
      if (!pack) {
        const packName = action.packName?.trim();
        if (!packName) throw new Error("请输入新拓展包名称");
        pack = next.expansionPacks[packId] = {
          id: packId,
          name: packName,
          cardIds: [],
          createdAt: now.toISOString(),
        };
      }
      const zones = next.cardZones[action.countryId];
      const id = `custom-${next.nextCustomCardId}`;
      next.nextCustomCardId += 1;
      next.cards[id] = {
        id,
        countryId: action.countryId,
        name,
        description: action.description.trim() || "自定义卡牌，效果由玩家手动处理。",
        type: action.cardType,
        edition: "custom",
        isCustom: true,
        expansionPackId: packId,
        expansionDestination: action.destination,
      };
      zones[action.destination].push(id);
      pack.cardIds.push(id);
      break;
    }
    case "IMPORT_EXPANSION_PACK": {
      const name = action.name.trim();
      if (!name) throw new Error("拓展包名称不能为空");
      if (!action.cards.length) throw new Error("拓展包中没有卡牌");
      if (next.expansionPacks[action.packId]) throw new Error("拓展包编号已存在");
      const pack: ExpansionPack = {
        id: action.packId,
        name,
        cardIds: [],
        createdAt: now.toISOString(),
      };
      for (const definition of action.cards) {
        countryById(definition.countryId);
        const cardName = definition.name.trim();
        if (!cardName) throw new Error("拓展包中存在无名称卡牌");
        const id = `custom-${next.nextCustomCardId}`;
        next.nextCustomCardId += 1;
        next.cards[id] = {
          id,
          countryId: definition.countryId,
          name: cardName,
          description: definition.description.trim() || "自定义卡牌，效果由玩家手动处理。",
          type: definition.cardType,
          edition: "custom",
          isCustom: true,
          expansionPackId: action.packId,
          expansionDestination: definition.destination,
        };
        next.cardZones[definition.countryId][definition.destination].push(id);
        pack.cardIds.push(id);
      }
      next.expansionPacks[action.packId] = pack;
      break;
    }
    case "REMOVE_EXPANSION_PACK": {
      const pack = next.expansionPacks[action.packId];
      if (!pack) throw new Error("找不到该拓展包");
      const removing = new Set(pack.cardIds);
      for (const country of COUNTRIES) {
        const zones = next.cardZones[country.id];
        zones.deck = zones.deck.filter((id) => !removing.has(id));
        zones.hand = zones.hand.filter((id) => !removing.has(id));
        zones.discard = zones.discard.filter((id) => !removing.has(id));
        zones.status = zones.status.filter((id) => !removing.has(id));
        zones.response = zones.response.filter((id) => !removing.has(id));
        zones.inspection = zones.inspection.filter((id) => !removing.has(id));
        zones.resolution = zones.resolution.filter((id) => !removing.has(id));
        zones.removed = zones.removed.filter((id) => !removing.has(id));
      }
      for (const id of removing) delete next.cards[id];
      delete next.expansionPacks[action.packId];
      break;
    }
    case "ADJUST_VP":
      next.victoryPoints[action.faction] += action.amount;
      break;
    case "SET_VP":
      if (!Number.isFinite(action.value)) throw new Error("胜利点必须是数字");
      next.victoryPoints[action.faction] = Math.trunc(action.value);
      break;
  }

  addLog(next, description, now);
  return next;
}

export function appendUndoLog(state: GameState, actionDescription: string, now = new Date()): GameState {
  const next = cloneState(state);
  addLog(next, `撤销：${actionDescription}`, now);
  return next;
}

const LEGACY_AREA_MAPPINGS: Readonly<Record<string, string>> = {
  atlantic: "north-atlantic",
  pacific: "central-pacific",
  arctic: "north-pacific",
  china: "eastern-china",
  "central-asia": "kazakhstan",
};

function mergeAreaUnits(target: AreaState, source: AreaState): void {
  for (const sourceStack of source.units) {
    const targetStack = target.units.find(
      (stack) =>
        stack.countryId === sourceStack.countryId &&
        stack.kind === sourceStack.kind &&
        (stack.auxiliary ?? undefined) === sourceStack.auxiliary,
    );
    if (targetStack) targetStack.count += sourceStack.count;
    else target.units.push(structuredClone(sourceStack));
  }
}

function normalizeCards(state: GameState): void {
  state.expansionPacks = state.expansionPacks ?? {};
  for (const country of COUNTRIES) {
    const zones = state.cardZones[country.id];
    zones.status = Array.isArray(zones.status) ? zones.status : [];
    zones.response = Array.isArray(zones.response) ? zones.response : [];
    zones.inspection = Array.isArray(zones.inspection) ? zones.inspection : [];
    zones.resolution = Array.isArray(zones.resolution) ? zones.resolution : [];
    zones.removed = Array.isArray(zones.removed) ? zones.removed : [];
    zones.deck = zones.deck.filter((id) => !id.includes("-prototype-"));
    zones.hand = zones.hand.filter((id) => !id.includes("-prototype-"));
    zones.discard = zones.discard.filter((id) => !id.includes("-prototype-"));
    zones.status = zones.status.filter((id) => !id.includes("-prototype-"));
    zones.response = zones.response.filter((id) => !id.includes("-prototype-"));
    zones.inspection = zones.inspection.filter((id) => !id.includes("-prototype-"));
    zones.resolution = zones.resolution.filter((id) => !id.includes("-prototype-"));
    zones.removed = zones.removed.filter((id) => !id.includes("-prototype-"));
  }
  for (const id of Object.keys(state.cards)) {
    if (id.includes("-prototype-")) delete state.cards[id];
  }

  const placed = new Set(
    COUNTRIES.flatMap((country) => {
      const zones = state.cardZones[country.id];
      return [
        ...zones.deck,
        ...zones.hand,
        ...zones.discard,
        ...zones.status,
        ...zones.response,
        ...zones.inspection,
        ...zones.resolution,
        ...zones.removed,
      ];
    }),
  );

  for (const definition of CARD_CATALOG) {
    const existing = state.cards[definition.id];
    state.cards[definition.id] = {
      ...existing,
      id: definition.id,
      sourceId: definition.sourceId,
      countryId: definition.countryId,
      name: definition.name,
      description: definition.description,
      type: definition.type,
      edition: definition.edition,
      image: definition.image,
      isCustom: false,
    };
    if (!placed.has(definition.id)) {
      state.cardZones[definition.countryId].deck.push(definition.id);
      placed.add(definition.id);
    }
  }

  for (const card of Object.values(state.cards)) {
    if (!card.description) card.description = "自定义卡牌，效果由玩家手动处理。";
    if (!card.edition) card.edition = card.isCustom ? "custom" : "base";
    if (card.isCustom && !card.expansionPackId) card.expansionPackId = "local-custom";
    if (card.isCustom && !card.expansionDestination) {
      card.expansionDestination = state.cardZones[card.countryId].hand.includes(card.id) ? "hand" : "deck";
    }
  }

  const customCards = Object.values(state.cards).filter((card) => card.isCustom);
  if (customCards.some((card) => card.expansionPackId === "local-custom") && !state.expansionPacks["local-custom"]) {
    state.expansionPacks["local-custom"] = {
      id: "local-custom",
      name: "本机自定义牌",
      cardIds: [],
      createdAt: state.updatedAt,
    };
  }
  for (const pack of Object.values(state.expansionPacks)) {
    pack.cardIds = customCards
      .filter((card) => card.expansionPackId === pack.id)
      .map((card) => card.id);
  }
  for (const card of customCards) {
    const packId = card.expansionPackId!;
    const pack =
      state.expansionPacks[packId] ??
      (state.expansionPacks[packId] = {
        id: packId,
        name: "已导入拓展包",
        cardIds: [],
        createdAt: state.updatedAt,
      });
    if (!pack.cardIds.includes(card.id)) pack.cardIds.push(card.id);
  }
}

export function normalizeGameState(state: GameState): GameState {
  const normalized = cloneState(state);
  normalized.bot = normalized.bot ?? {
    controllers: Object.fromEntries(COUNTRIES.map((country) => [country.id, "HUMAN"])) as Record<
      CountryId,
      ControllerType
    >,
    config: { totalWarEnabled: false, totalWarDiscardMode: "TOP_CARD" },
    countrySettings: allCountryBotStrength(),
    rngState: 0x6d2b79f5,
    session: null,
  };
  normalized.bot.controllers = Object.fromEntries(
    COUNTRIES.map((country) => [
      country.id,
      normalized.bot.controllers?.[country.id] === "BOT" ? "BOT" : "HUMAN",
    ]),
  ) as Record<CountryId, ControllerType>;
  normalized.bot.countrySettings = Object.fromEntries(
    COUNTRIES.map((country) => [
      country.id,
      normalizedBotStrength(normalized.bot.countrySettings?.[country.id]),
    ]),
  ) as Record<CountryId, BotStrengthSettings>;
  normalized.bot.config = {
    totalWarEnabled: Boolean(normalized.bot.config?.totalWarEnabled),
    totalWarDiscardMode:
      normalized.bot.config?.totalWarDiscardMode === "RANDOM_FROM_DECK" ? "RANDOM_FROM_DECK" : "TOP_CARD",
  };
  normalized.bot.rngState = Number.isInteger(normalized.bot.rngState)
    ? normalized.bot.rngState >>> 0
    : 0x6d2b79f5;
  for (const area of AREAS) {
    if (!normalized.areas[area.id]) normalized.areas[area.id] = { id: area.id, units: [] };
    for (const stack of normalized.areas[area.id]!.units) {
      if (
        (stack.auxiliary === "china" && stack.countryId !== "united-states") ||
        (stack.auxiliary === "france" && stack.countryId !== "united-kingdom") ||
        (stack.auxiliary && stack.auxiliary !== "china" && stack.auxiliary !== "france")
      ) {
        delete stack.auxiliary;
      }
    }
  }
  for (const [legacyId, targetId] of Object.entries(LEGACY_AREA_MAPPINGS)) {
    const legacy = normalized.areas[legacyId];
    const target = normalized.areas[targetId];
    if (legacy && target && legacy !== target) mergeAreaUnits(target, legacy);
    delete normalized.areas[legacyId];
  }
  if ((LEGACY_PHASES as readonly string[]).includes(normalized.phase)) {
    normalized.phase = "出牌";
  }
  normalizeCards(normalized);
  return normalized;
}

export function isGameState(value: unknown): value is GameState {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<GameState>;
  if (
    candidate.version !== SAVE_VERSION ||
    (candidate.activeFaction !== "axis" && candidate.activeFaction !== "allies") ||
    typeof candidate.turnCountry !== "string" ||
    !TURN_ORDER.includes(candidate.turnCountry as CountryId) ||
    typeof candidate.turnNumber !== "number" ||
    ![...PHASES, ...LEGACY_PHASES].includes(candidate.phase as Phase) ||
    typeof candidate.nextLogId !== "number" ||
    typeof candidate.nextCustomCardId !== "number" ||
    typeof candidate.updatedAt !== "string" ||
    !candidate.areas ||
    !candidate.cards ||
    !candidate.cardZones ||
    !candidate.victoryPoints ||
    typeof candidate.victoryPoints.axis !== "number" ||
    typeof candidate.victoryPoints.allies !== "number" ||
    !Array.isArray(candidate.log)
  ) {
    return false;
  }

  return COUNTRIES.every((country) => {
    const zones = candidate.cardZones?.[country.id];
    return zones && Array.isArray(zones.deck) && Array.isArray(zones.hand) && Array.isArray(zones.discard);
  });
}
