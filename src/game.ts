import {
  AREAS,
  COUNTRIES,
  TURN_ORDER,
  areaById,
  connectionBetween,
  countryById,
  prototypeCardsFor,
  type CountryId,
  type Faction,
  type UnitKind,
} from "./prototype-data";

export const SAVE_VERSION = 1;
export const PHASES = ["开始", "出牌", "空军（Total War）", "补给", "计分", "弃牌", "抽牌"] as const;
const LEGACY_PHASES = ["部署", "行动", "战斗"] as const;
export type Phase = (typeof PHASES)[number] | (typeof LEGACY_PHASES)[number];
export type CardType = "build" | "event" | "response" | "status" | "other";

export interface UnitStack {
  countryId: CountryId;
  kind: UnitKind;
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
  type: CardType;
  isCustom: boolean;
}

export interface CardZones {
  deck: string[];
  hand: string[];
  discard: string[];
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
  | { type: "PLACE_UNIT"; areaId: string; countryId: CountryId; kind: UnitKind }
  | { type: "MOVE_UNIT"; fromAreaId: string; toAreaId: string; countryId: CountryId; kind: UnitKind }
  | { type: "REMOVE_UNIT"; areaId: string; countryId: CountryId; kind: UnitKind }
  | { type: "DRAW_CARD"; countryId: CountryId }
  | { type: "DISCARD_CARD"; countryId: CountryId; cardId: string }
  | { type: "ADD_CUSTOM_CARD"; countryId: CountryId; name: string; cardType: CardType; destination: "hand" | "deck" }
  | { type: "ADJUST_VP"; faction: Faction; amount: number }
  | { type: "SET_VP"; faction: Faction; value: number };

function emptyZones(): Record<CountryId, CardZones> {
  const zones = {} as Record<CountryId, CardZones>;
  for (const country of COUNTRIES) {
    zones[country.id] = { deck: [], hand: [], discard: [] };
  }
  return zones;
}

export function createInitialState(now = new Date()): GameState {
  const cards: Record<string, Card> = {};
  const cardZones = emptyZones();

  for (const country of COUNTRIES) {
    prototypeCardsFor(country).forEach((definition, index) => {
      const id = `${country.id}-prototype-${index + 1}`;
      cards[id] = {
        id,
        countryId: country.id,
        name: definition.name,
        type: definition.type,
        isCustom: false,
      };
      cardZones[country.id].deck.push(id);
    });
  }

  const timestamp = now.toISOString();
  return {
    version: SAVE_VERSION,
    activeFaction: "axis",
    turnCountry: "germany",
    turnNumber: 1,
    phase: "开始",
    areas: Object.fromEntries(AREAS.map((area) => [area.id, { id: area.id, units: [] }])),
    cards,
    cardZones,
    victoryPoints: { axis: 0, allies: 0 },
    log: [{ id: 1, at: timestamp, message: "新战局已创建" }],
    nextLogId: 2,
    nextCustomCardId: 1,
    updatedAt: timestamp,
  };
}

function cloneState(state: GameState): GameState {
  return structuredClone(state);
}

function addLog(state: GameState, message: string, now = new Date()): void {
  state.log.push({ id: state.nextLogId, at: now.toISOString(), message });
  state.nextLogId += 1;
  if (state.log.length > 200) state.log = state.log.slice(-200);
  state.updatedAt = now.toISOString();
}

function findStack(area: AreaState, countryId: CountryId, kind: UnitKind): UnitStack | undefined {
  return area.units.find((stack) => stack.countryId === countryId && stack.kind === kind);
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
    case "PLACE_UNIT":
      return `${countryById(action.countryId).name}在${areaById(action.areaId).name}放置1支${action.kind === "army" ? "陆军" : "海军"}`;
    case "MOVE_UNIT":
      return `${countryById(action.countryId).name}${action.kind === "army" ? "陆军" : "海军"}：${areaById(action.fromAreaId).name} → ${areaById(action.toAreaId).name}`;
    case "REMOVE_UNIT":
      return `${countryById(action.countryId).name}从${areaById(action.areaId).name}移除1支${action.kind === "army" ? "陆军" : "海军"}`;
    case "DRAW_CARD":
      return `${countryById(action.countryId).name}抽1张牌`;
    case "DISCARD_CARD":
      return `${countryById(action.countryId).name}弃掉「${state.cards[action.cardId]?.name ?? "未知卡牌"}」`;
    case "ADD_CUSTOM_CARD":
      return `${countryById(action.countryId).name}添加1张自定义卡牌到${action.destination === "hand" ? "手牌" : "牌堆"}`;
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
    case "PLACE_UNIT": {
      requireCompatibleArea(action.areaId, action.kind);
      countryById(action.countryId);
      const area = next.areas[action.areaId];
      if (!area) throw new Error("区域不存在");
      const stack = findStack(area, action.countryId, action.kind);
      if (stack) stack.count += 1;
      else area.units.push({ countryId: action.countryId, kind: action.kind, count: 1 });
      break;
    }
    case "MOVE_UNIT": {
      requireCompatibleArea(action.fromAreaId, action.kind);
      requireCompatibleArea(action.toAreaId, action.kind);
      const connection = connectionBetween(action.fromAreaId, action.toAreaId);
      if (!connection) throw new Error("只能移动到相邻区域");
      if (!canMoveUnit(next, action.fromAreaId, action.toAreaId, action.countryId, action.kind)) {
        if (connection.kind === "strait") throw new Error("该阵营目前不能通过此海峡");
        throw new Error("单位只能在相同地形的相邻区域间移动");
      }
      const from = next.areas[action.fromAreaId];
      const to = next.areas[action.toAreaId];
      if (!from || !to) throw new Error("区域不存在");
      const sourceStack = findStack(from, action.countryId, action.kind);
      if (!sourceStack?.count) throw new Error("没有可移动的单位");
      sourceStack.count -= 1;
      if (sourceStack.count === 0) from.units = from.units.filter((stack) => stack !== sourceStack);
      const targetStack = findStack(to, action.countryId, action.kind);
      if (targetStack) targetStack.count += 1;
      else to.units.push({ countryId: action.countryId, kind: action.kind, count: 1 });
      break;
    }
    case "REMOVE_UNIT": {
      const area = next.areas[action.areaId];
      if (!area) throw new Error("区域不存在");
      const stack = findStack(area, action.countryId, action.kind);
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
    case "ADD_CUSTOM_CARD": {
      const name = action.name.trim();
      if (!name) throw new Error("请输入卡牌名称");
      const zones = next.cardZones[action.countryId];
      const id = `custom-${next.nextCustomCardId}`;
      next.nextCustomCardId += 1;
      next.cards[id] = {
        id,
        countryId: action.countryId,
        name,
        type: action.cardType,
        isCustom: true,
      };
      zones[action.destination].push(id);
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
      (stack) => stack.countryId === sourceStack.countryId && stack.kind === sourceStack.kind,
    );
    if (targetStack) targetStack.count += sourceStack.count;
    else target.units.push(structuredClone(sourceStack));
  }
}

export function normalizeGameState(state: GameState): GameState {
  const normalized = cloneState(state);
  for (const area of AREAS) {
    if (!normalized.areas[area.id]) normalized.areas[area.id] = { id: area.id, units: [] };
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
