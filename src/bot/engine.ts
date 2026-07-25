import { AREAS, countryById, type CountryId } from "../prototype-data";
import type { Card, GameState } from "../game";
import { nextInt, rollD6, shuffleWithState } from "./random";
import type {
  BotAnswer,
  BotDomainEvent,
  BotEventResolution,
  BotTask,
  BotTaskType,
  BotTurnMode,
  BotTurnSession,
  ManualRequest,
} from "./types";

function clone(state: GameState): GameState {
  return structuredClone(state);
}

function request(
  session: BotTurnSession,
  type: ManualRequest["type"],
  prompt: string,
  answers: string[],
  continuation: string,
  associatedCardId?: string,
): void {
  session.pendingManualRequest = {
    id: session.nextRequestId++,
    type,
    prompt,
    answers,
    continuation,
    associatedCardId,
  };
  session.phase = "WAITING_FOR_PLAYER";
}

function addTask(
  tasks: BotTask[],
  type: BotTaskType,
  sourceMode: BotTurnMode,
  id: number,
): number {
  tasks.push({ id, type, sourceMode, status: "PENDING", searchIndex: 0 });
  return id + 1;
}

export function buildTaskQueue(
  mode: BotTurnMode,
  round: number,
  totalWarEnabled: boolean,
): BotTask[] {
  const tasks: BotTask[] = [];
  let id = 1;
  const expansionBase = () => {
    id = addTask(tasks, "SEARCH_EFFECTIVE_BUILD", "EXPANSION", id);
    id = addTask(tasks, "SEARCH_EFFECTIVE_EVENT", "EXPANSION", id);
  };
  const aggressiveBase = () => {
    id = addTask(tasks, "SEARCH_EFFECTIVE_BATTLE", "AGGRESSIVE", id);
    id = addTask(tasks, "SEARCH_EFFECTIVE_ECONOMIC_ATTACK", "AGGRESSIVE", id);
    id = addTask(tasks, "SEARCH_EFFECTIVE_EVENT", "AGGRESSIVE", id);
  };
  const defensiveBase = () => {
    id = addTask(tasks, "SEARCH_EFFECTIVE_STATUS_OR_RESPONSE", "DEFENSIVE", id);
    id = addTask(tasks, "SEARCH_EFFECTIVE_EVENT", "DEFENSIVE", id);
  };

  if (mode === "EXPANSION") {
    expansionBase();
    if (round <= 10) {
      id = addTask(tasks, "DISCARD_TOP_CARD", "EXPANSION", id);
      id = addTask(tasks, "SEARCH_EFFECTIVE_BUILD", "EXPANSION", id);
    } else {
      aggressiveBase();
      defensiveBase();
    }
  } else if (mode === "AGGRESSIVE") {
    aggressiveBase();
    if (round <= 10) {
      id = addTask(tasks, "DISCARD_TOP_CARD", "AGGRESSIVE", id);
      id = addTask(tasks, "SEARCH_EFFECTIVE_BATTLE", "AGGRESSIVE", id);
    } else {
      defensiveBase();
    }
  } else {
    defensiveBase();
    expansionBase();
    aggressiveBase();
  }
  id = addTask(tasks, "PLAY_ALL_EFFECTIVE_BOLSTER", mode, id);
  id = addTask(tasks, "SEARCH_EFFECTIVE_AIR_FORCE", mode, id);
  if (totalWarEnabled) id = addTask(tasks, "TOTAL_WAR_DISCARD", mode, id);
  addTask(tasks, "CLEANUP_INSPECTION_WINDOW", mode, id);
  return tasks;
}

function cardMatches(task: BotTaskType, card: Card): boolean {
  switch (task) {
    case "SEARCH_EFFECTIVE_BUILD":
      return card.type === "build" || card.type === "build-army" || card.type === "build-navy";
    case "SEARCH_EFFECTIVE_BATTLE":
      return card.type === "land-battle" || card.type === "sea-battle";
    case "SEARCH_EFFECTIVE_ECONOMIC_ATTACK":
      return card.type === "economic";
    case "SEARCH_EFFECTIVE_EVENT":
      return card.type === "event";
    case "SEARCH_EFFECTIVE_STATUS_OR_RESPONSE":
      return card.type === "status" || card.type === "response";
    case "SEARCH_EFFECTIVE_AIR_FORCE":
      return card.type === "air-power";
    case "PLAY_ALL_EFFECTIVE_BOLSTER":
      return card.type === "bolster";
    default:
      return false;
  }
}

function taskLabel(type: BotTaskType): string {
  if (type === "SEARCH_EFFECTIVE_BUILD") return "Build";
  if (type === "SEARCH_EFFECTIVE_BATTLE") return "Land/Sea Battle";
  if (type === "SEARCH_EFFECTIVE_ECONOMIC_ATTACK") return "Economic Attack";
  if (type === "SEARCH_EFFECTIVE_EVENT") return "Event";
  if (type === "SEARCH_EFFECTIVE_STATUS_OR_RESPONSE") return "Status/Response";
  if (type === "SEARCH_EFFECTIVE_AIR_FORCE") return "Air Force";
  return "Bolster";
}

function finishTask(session: BotTurnSession): void {
  const task = session.taskQueue[session.currentTaskIndex];
  if (task) task.status = "COMPLETE";
  session.currentTaskIndex += 1;
}

function discardTop(state: GameState, countryId: CountryId, reason: string): void {
  const zones = state.cardZones[countryId];
  const cardId = zones.deck.pop();
  if (!cardId) {
    state.bot.session?.log.push(`${reason}：牌库已空`);
    return;
  }
  zones.discard.push(cardId);
  state.bot.session?.log.push(`${reason}：弃掉「${state.cards[cardId]?.name ?? cardId}」`);
}

function completeCard(state: GameState): void {
  const session = state.bot.session!;
  const cardId = session.pendingCardId!;
  const zones = state.cardZones[session.countryId];
  const resolutionIndex = zones.resolution.indexOf(cardId);
  if (resolutionIndex >= 0) zones.resolution.splice(resolutionIndex, 1);
  zones.discard.push(cardId);
  session.log.push(`结算「${state.cards[cardId]?.name ?? cardId}」并进入弃牌堆`);
  session.pendingCardId = null;
  if (session.taskQueue[session.currentTaskIndex]?.type !== "PLAY_ALL_EFFECTIVE_BOLSTER") {
    finishTask(session);
  }
}

function returnPendingCard(state: GameState): void {
  const session = state.bot.session!;
  const cardId = session.pendingCardId!;
  const zones = state.cardZones[session.countryId];
  const resolutionIndex = zones.resolution.indexOf(cardId);
  if (resolutionIndex >= 0) zones.resolution.splice(resolutionIndex, 1);
  if (!zones.inspection.includes(cardId)) zones.inspection.push(cardId);
  const inspected = session.inspectionWindow.find((entry) => entry.cardInstanceId === cardId);
  if (inspected) inspected.disposition = "RETURN_TO_DECK";
  session.log.push(`「${state.cards[cardId]?.name ?? cardId}」改判无效，留在检查窗口`);
  session.pendingCardId = null;
}

function startModeDecision(state: GameState): GameState {
  const next = clone(state);
  const session = next.bot.session!;
  const zones = next.cardZones[session.countryId];
  if (!session.inspectionWindow.length) {
    for (let index = 0; index < 8 && zones.deck.length; index += 1) {
      const cardInstanceId = zones.deck.pop()!;
      zones.inspection.push(cardInstanceId);
      session.inspectionWindow.push({ cardInstanceId, originalIndex: index, disposition: "AVAILABLE" });
    }
    session.log.push(`建立 ${session.inspectionWindow.length} 张检查窗口`);
  }
  request(
    session,
    "BOARD_QUESTION",
    `是否存在一个空的 Supply Space 或 Home Space，与${countryById(session.countryId).name}的一枚有补给部队相邻？`,
    ["YES", "NO"],
    "MODE_EXPANSION",
  );
  return next;
}

export function startBotTurn(state: GameState): GameState {
  const countryId = state.turnCountry;
  if (state.bot.controllers[countryId] !== "BOT") return state;
  if (state.bot.session && !state.bot.session.isComplete) return state;
  const next = clone(state);
  next.bot.session = {
    countryId,
    roundNumber: next.turnNumber,
    turnMode: null,
    phase: "MODE_DECISION",
    taskQueue: [],
    currentTaskIndex: 0,
    inspectionWindow: [],
    pendingCardId: null,
    pendingManualRequest: null,
    decisionStep: 0,
    decisionHistory: [],
    randomEvents: [],
    log: [`${countryById(countryId).name} Bot 回合开始`],
    nextTaskId: 1,
    nextRequestId: 1,
    isComplete: false,
  };
  const home = AREAS.find((area) => area.homeFor === countryId);
  const enemyOccupiesHome = home
    ? next.areas[home.id]?.units.some(
        (stack) => countryById(stack.countryId).faction !== countryById(countryId).faction && stack.count > 0,
      )
    : false;
  if (enemyOccupiesHome) {
    const die = rollD6(next.bot.rngState);
    next.bot.rngState = die.state;
    next.bot.session.randomEvents.push({ kind: "DIE", result: die.value, reason: "本土解放" });
    next.bot.session.log.push(`本土被占领；自动掷 D6：${die.value}`);
    if (die.value >= 4) {
      for (let count = 0; count < 5; count += 1) discardTop(next, countryId, "本土解放");
      request(
        next.bot.session,
        "MANUAL_OPERATION",
        `请移除占领${countryById(countryId).name} Home Space 的敌军。`,
        ["COMPLETED"],
        "HOME_REMOVE_OCCUPIER",
      );
      return next;
    }
    next.victoryPoints[countryById(countryId).faction] += 1;
    next.bot.session.log.push("本土继续被占领；Bot 获得 1 VP");
  }
  return startModeDecision(next);
}

function chooseMode(state: GameState, mode: BotTurnMode): GameState {
  const next = clone(state);
  const session = next.bot.session!;
  session.turnMode = mode;
  session.phase = "RUNNING";
  session.pendingManualRequest = null;
  session.taskQueue = buildTaskQueue(mode, session.roundNumber, next.bot.config.totalWarEnabled);
  session.nextTaskId = session.taskQueue.length + 1;
  session.currentTaskIndex = 0;
  session.log.push(`Turn Mode：${mode}；建立 ${session.taskQueue.length} 项有限任务队列`);
  return runBotUntilPause(next);
}

function continueModeDecision(state: GameState, continuation: string, answer: BotAnswer): GameState {
  const next = clone(state);
  const session = next.bot.session!;
  const prompt = session.pendingManualRequest?.prompt ?? "";
  session.decisionHistory.push({ prompt, answer });
  session.pendingManualRequest = null;
  session.phase = "MODE_DECISION";
  if (continuation === "MODE_EXPANSION") {
    if (answer === "YES") return chooseMode(next, "EXPANSION");
    request(
      session,
      "BOARD_QUESTION",
      `是否存在一枚有补给的敌方部队，与${countryById(session.countryId).name} Home Space 相邻？`,
      ["YES", "NO"],
      "MODE_HOME_THREAT",
    );
    return next;
  }
  if (continuation === "MODE_HOME_THREAT") {
    const deployed = next.cardZones[session.countryId].status.length + next.cardZones[session.countryId].response.length;
    if (deployed < 3) return chooseMode(next, "DEFENSIVE");
    const die = rollD6(next.bot.rngState);
    next.bot.rngState = die.state;
    session.randomEvents.push({ kind: "DIE", result: die.value, reason: "Defensive Turn 判断" });
    session.log.push(`自动掷 D6：${die.value}（Defensive Turn 判断）`);
    if (die.value >= 5) return chooseMode(next, "DEFENSIVE");
    request(
      session,
      "BOARD_QUESTION",
      `${countryById(session.countryId).name}是否有部队邻接敌方控制、可得分的 Supply Space 或 Home Space？`,
      ["YES", "NO"],
      "MODE_AGGRESSIVE",
    );
    return next;
  }
  if (continuation === "MODE_AGGRESSIVE") {
    if (answer === "YES") return chooseMode(next, "AGGRESSIVE");
    request(
      session,
      "BOARD_QUESTION",
      `是否存在一条可用路径，通向敌方控制的 Supply Space 或 Home Space？`,
      ["YES", "NO"],
      "MODE_PATH",
    );
    return next;
  }
  return chooseMode(next, answer === "YES" ? "EXPANSION" : "DEFENSIVE");
}

function cleanup(state: GameState): void {
  const session = state.bot.session!;
  const zones = state.cardZones[session.countryId];
  const returning = session.inspectionWindow
    .filter((entry) => entry.disposition === "AVAILABLE" || entry.disposition === "RETURN_TO_DECK")
    .map((entry) => entry.cardInstanceId)
    .filter((id) => zones.inspection.includes(id));
  zones.inspection = zones.inspection.filter((id) => !returning.includes(id));
  const shuffled = shuffleWithState([...zones.deck, ...returning], state.bot.rngState);
  state.bot.rngState = shuffled.state;
  zones.deck = shuffled.items;
  session.randomEvents.push({ kind: "SHUFFLE", result: returning.length, reason: "检查窗口清理" });
  session.log.push(`${returning.length} 张未使用检查牌洗回抽牌堆`);
  finishTask(session);
  session.phase = "COMPLETE";
  session.isComplete = true;
  session.log.push(`${countryById(session.countryId).name} Bot 回合完成；等待玩家点击下一回合`);
}

export function runBotUntilPause(state: GameState): GameState {
  const next = clone(state);
  const session = next.bot.session;
  if (!session || session.isComplete || session.pendingManualRequest) return next;
  const zones = next.cardZones[session.countryId];

  while (session.currentTaskIndex < session.taskQueue.length && !session.pendingManualRequest) {
    const task = session.taskQueue[session.currentTaskIndex]!;
    task.status = "ACTIVE";
    if (task.type === "DISCARD_TOP_CARD") {
      discardTop(next, session.countryId, "前10轮流程弃牌");
      finishTask(session);
      continue;
    }
    if (task.type === "TOTAL_WAR_DISCARD") {
      if (next.bot.config.totalWarDiscardMode === "TOP_CARD" || zones.deck.length < 2) {
        discardTop(next, session.countryId, "Total War 弃牌");
      } else if (zones.deck.length) {
        const step = nextInt(next.bot.rngState, zones.deck.length);
        next.bot.rngState = step.state;
        const [cardId] = zones.deck.splice(step.value, 1);
        if (cardId) zones.discard.push(cardId);
        session.log.push(`Total War 随机弃掉「${next.cards[cardId!]?.name ?? cardId}」`);
      }
      finishTask(session);
      continue;
    }
    if (task.type === "CLEANUP_INSPECTION_WINDOW") {
      cleanup(next);
      break;
    }

    let candidate: string | undefined;
    for (let index = task.searchIndex; index < session.inspectionWindow.length; index += 1) {
      task.searchIndex = index + 1;
      const inspected = session.inspectionWindow[index]!;
      if (inspected.disposition !== "AVAILABLE") continue;
      const card = next.cards[inspected.cardInstanceId];
      if (card && cardMatches(task.type, card)) {
        candidate = card.id;
        break;
      }
    }
    if (!candidate) {
      session.log.push(`${taskLabel(task.type)}：检查窗口中没有更多候选牌`);
      finishTask(session);
      continue;
    }
    task.associatedCardId = candidate;
    const card = next.cards[candidate]!;
    request(
      session,
      "EFFECTIVE_CHECK",
      `${countryById(session.countryId).name}找到「${card.name}」（${taskLabel(task.type)}）。这张牌能否产生对 Bot 有利的有效结果？`,
      ["EFFECTIVE", "INEFFECTIVE"],
      "EFFECTIVE_CARD",
      candidate,
    );
  }
  return next;
}

function acceptEffectiveCard(state: GameState, cardId: string): GameState {
  const next = clone(state);
  const session = next.bot.session!;
  const zones = next.cardZones[session.countryId];
  const index = zones.inspection.indexOf(cardId);
  if (index < 0) throw new Error("候选牌不在检查窗口");
  zones.inspection.splice(index, 1);
  zones.resolution.push(cardId);
  const inspected = session.inspectionWindow.find((entry) => entry.cardInstanceId === cardId);
  if (inspected) inspected.disposition = "PLAYED";
  session.pendingCardId = cardId;
  session.pendingManualRequest = null;
  const card = next.cards[cardId]!;
  session.log.push(`玩家判定「${card.name}」有效`);

  if (card.type === "status" || card.type === "response") {
    zones.resolution.pop();
    (card.type === "status" ? zones.status : zones.response).push(cardId);
    session.pendingCardId = null;
    session.log.push(`部署「${card.name}」至${card.type === "status" ? "正面 Status" : "背面 Response"}栏`);
    finishTask(session);
    session.phase = "RUNNING";
    return runBotUntilPause(next);
  }
  const task = session.taskQueue[session.currentTaskIndex]!;
  if (task.type === "SEARCH_EFFECTIVE_BUILD") {
    request(
      session,
      "MANUAL_OPERATION",
      `${countryById(session.countryId).name}执行 Build。请选择 Build Army 或 Build Navy。`,
      ["BUILD_ARMY", "BUILD_NAVY", "CANNOT_EXECUTE"],
      "CHOOSE_BUILD",
      cardId,
    );
  } else {
    const operationPrompt =
      task.type === "SEARCH_EFFECTIVE_AIR_FORCE"
        ? `请按优先级部署空军：受威胁的 Home Space → 受威胁的受控 Supply Space → 邻接敌方空军 → 获取 Air Superiority。`
        : `请执行「${card.name}」的合法操作，完成后确认。`;
    request(
      session,
      "MANUAL_OPERATION",
      operationPrompt,
      ["COMPLETED", "CANNOT_EXECUTE"],
      "COMPLETE_CARD",
      cardId,
    );
  }
  return next;
}

export function answerBotRequest(state: GameState, answer: BotAnswer): GameState {
  const session = state.bot.session;
  const current = session?.pendingManualRequest;
  if (!session || !current) throw new Error("当前没有等待回答的 Bot 请求");
  if (!current.answers.includes(answer)) throw new Error("该回答不适用于当前请求");

  if (current.continuation.startsWith("MODE_")) return continueModeDecision(state, current.continuation, answer);
  if (current.continuation === "HOME_REMOVE_OCCUPIER") {
    const next = clone(state);
    const nextSession = next.bot.session!;
    request(
      nextSession,
      "MANUAL_OPERATION",
      `请在${countryById(nextSession.countryId).name} Home Space 放置一支 Bot Army。`,
      ["COMPLETED"],
      "HOME_BUILD_ARMY",
    );
    return next;
  }
  if (current.continuation === "HOME_BUILD_ARMY") {
    const next = clone(state);
    next.bot.session!.pendingManualRequest = null;
    next.bot.session!.phase = "MODE_DECISION";
    next.bot.session!.log.push("玩家完成本土解放的移除与建军操作");
    return startModeDecision(next);
  }
  if (current.continuation === "RESPONSE_EFFECT") {
    const next = clone(state);
    next.bot.session!.pendingManualRequest = null;
    next.bot.session!.phase = next.bot.session!.isComplete ? "COMPLETE" : "RUNNING";
    next.bot.session!.log.push("玩家完成 Response 实体操作");
    return next.bot.session!.isComplete ? next : runBotUntilPause(next);
  }
  if (current.continuation === "EFFECTIVE_CARD") {
    const next = clone(state);
    const nextSession = next.bot.session!;
    nextSession.decisionHistory.push({ prompt: current.prompt, answer });
    nextSession.pendingManualRequest = null;
    nextSession.phase = "RUNNING";
    if (answer === "INEFFECTIVE") {
      const inspected = nextSession.inspectionWindow.find(
        (entry) => entry.cardInstanceId === current.associatedCardId,
      );
      if (inspected) inspected.disposition = "RETURN_TO_DECK";
      nextSession.log.push(`玩家判定「${next.cards[current.associatedCardId!]?.name}」无效；留在检查窗口`);
      return runBotUntilPause(next);
    }
    return acceptEffectiveCard(next, current.associatedCardId!);
  }
  if (current.continuation === "CHOOSE_BUILD") {
    if (answer === "CANNOT_EXECUTE") {
      const next = clone(state);
      next.bot.session!.pendingManualRequest = null;
      next.bot.session!.phase = "RUNNING";
      returnPendingCard(next);
      return runBotUntilPause(next);
    }
    const next = clone(state);
    const nextSession = next.bot.session!;
    request(
      nextSession,
      "MANUAL_OPERATION",
      `请在合法位置放置一支${countryById(nextSession.countryId).name}${answer === "BUILD_ARMY" ? "陆军" : "海军"}。`,
      ["COMPLETED", "CANNOT_EXECUTE"],
      "COMPLETE_CARD",
      current.associatedCardId,
    );
    return next;
  }
  let next = clone(state);
  const nextSession = next.bot.session!;
  nextSession.pendingManualRequest = null;
  nextSession.phase = "RUNNING";
  if (answer === "CANNOT_EXECUTE") returnPendingCard(next);
  else {
    const completedTask = nextSession.taskQueue[nextSession.currentTaskIndex]?.type;
    completeCard(next);
    const eventType =
      completedTask === "SEARCH_EFFECTIVE_BUILD"
        ? "BotBuiltPiece"
        : completedTask === "SEARCH_EFFECTIVE_BATTLE"
          ? "BotCompletedAttack"
          : null;
    if (eventType) next = resolveBotResponseEvent(next, { type: eventType, countryId: nextSession.countryId }).state;
  }
  if (next.bot.session?.pendingManualRequest) return next;
  return runBotUntilPause(next);
}

export function cardZoneMembership(state: GameState, countryId: CountryId): Map<string, string[]> {
  const zones = state.cardZones[countryId];
  const result = new Map<string, string[]>();
  for (const [zone, ids] of Object.entries(zones)) {
    for (const id of ids) result.set(id, [...(result.get(id) ?? []), zone]);
  }
  return result;
}

export function resolveBotResponseEvent(
  state: GameState,
  event: BotDomainEvent,
): { state: GameState; resolution: BotEventResolution } {
  const responseCardId = state.cardZones[event.countryId].response[0] ?? null;
  if (!responseCardId) {
    return {
      state,
      resolution: {
        stateChanged: false,
        responseCardId: null,
        triggered: false,
        preventRemoval: false,
        manualInstruction: null,
      },
    };
  }
  const next = clone(state);
  const die = rollD6(next.bot.rngState);
  next.bot.rngState = die.state;
  const session = next.bot.session;
  session?.randomEvents.push({ kind: "DIE", result: die.value, reason: `Response：${event.type}` });
  session?.log.push(`检查 Response「${next.cards[responseCardId]?.name ?? responseCardId}」：D6=${die.value}`);
  if (die.value <= 3) {
    return {
      state: next,
      resolution: {
        stateChanged: true,
        responseCardId,
        triggered: false,
        preventRemoval: false,
        manualInstruction: null,
      },
    };
  }

  const zones = next.cardZones[event.countryId];
  zones.response.shift();
  zones.discard.push(responseCardId);
  const instructions: Record<BotDomainEvent["type"], string> = {
    BotBuiltPiece: `${countryById(event.countryId).name}的 Response 已触发：请执行一次额外 Build。`,
    BotCompletedAttack: `${countryById(event.countryId).name}的 Response 已触发：请执行一次额外 Attack。`,
    BotPieceWouldBeRemoved: `${countryById(event.countryId).name}的 Response 已触发：请保留刚刚将被移除的 Bot 部队。`,
    EnemyBuiltAdjacentToBot: `${countryById(event.countryId).name}的 Response 已触发：请移除敌方刚刚建立的部队。`,
  };
  const manualInstruction = instructions[event.type];
  session?.log.push(`Response 触发并进入弃牌堆：${manualInstruction}`);
  if (session && !session.pendingManualRequest) {
    request(session, "MANUAL_OPERATION", manualInstruction, ["COMPLETED"], "RESPONSE_EFFECT", responseCardId);
  }
  return {
    state: next,
    resolution: {
      stateChanged: true,
      responseCardId,
      triggered: true,
      preventRemoval: event.type === "BotPieceWouldBeRemoved",
      manualInstruction,
    },
  };
}
