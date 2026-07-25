import type { CountryId } from "../prototype-data";

export type ControllerType = "HUMAN" | "BOT";
export type BotTurnMode = "EXPANSION" | "AGGRESSIVE" | "DEFENSIVE";
export type BotTurnPhase = "MODE_DECISION" | "RUNNING" | "WAITING_FOR_PLAYER" | "COMPLETE";
export type BotCardZone =
  | "DRAW_DECK"
  | "INSPECTION_BUFFER"
  | "RESOLUTION"
  | "DISCARD_PILE"
  | "FACE_UP_STATUS"
  | "FACE_DOWN_RESPONSE"
  | "REMOVED_FROM_GAME";
export type InspectionDisposition = "AVAILABLE" | "PLAYED" | "DISCARDED_BY_RULE" | "RETURN_TO_DECK";
export type BotTaskType =
  | "SEARCH_EFFECTIVE_BUILD"
  | "SEARCH_EFFECTIVE_BATTLE"
  | "SEARCH_EFFECTIVE_ECONOMIC_ATTACK"
  | "SEARCH_EFFECTIVE_EVENT"
  | "SEARCH_EFFECTIVE_STATUS_OR_RESPONSE"
  | "SEARCH_EFFECTIVE_AIR_FORCE"
  | "PLAY_ALL_EFFECTIVE_BOLSTER"
  | "DISCARD_TOP_CARD"
  | "TOTAL_WAR_DISCARD"
  | "CLEANUP_INSPECTION_WINDOW";
export type BotTaskStatus = "PENDING" | "ACTIVE" | "COMPLETE";
export type ManualRequestType = "BOARD_QUESTION" | "EFFECTIVE_CHECK" | "MANUAL_OPERATION";
export type TotalWarDiscardMode = "TOP_CARD" | "RANDOM_FROM_DECK";

export interface BotTask {
  id: number;
  type: BotTaskType;
  sourceMode: BotTurnMode;
  status: BotTaskStatus;
  searchIndex: number;
  associatedCardId?: string;
}

export interface InspectedCard {
  cardInstanceId: string;
  originalIndex: number;
  disposition: InspectionDisposition;
}

export interface ManualRequest {
  id: number;
  type: ManualRequestType;
  prompt: string;
  answers: string[];
  associatedCardId?: string;
  continuation: string;
}

export interface BotDecisionRecord {
  prompt: string;
  answer: string;
}

export interface BotRandomEvent {
  kind: "DIE" | "SHUFFLE" | "RANDOM_CARD";
  result: number | string;
  reason: string;
}

export interface BotTurnSession {
  countryId: CountryId;
  roundNumber: number;
  turnMode: BotTurnMode | null;
  phase: BotTurnPhase;
  taskQueue: BotTask[];
  currentTaskIndex: number;
  inspectionWindow: InspectedCard[];
  pendingCardId: string | null;
  pendingManualRequest: ManualRequest | null;
  decisionStep: number;
  decisionHistory: BotDecisionRecord[];
  randomEvents: BotRandomEvent[];
  log: string[];
  nextTaskId: number;
  nextRequestId: number;
  isComplete: boolean;
}

export interface BotConfig {
  totalWarEnabled: boolean;
  totalWarDiscardMode: TotalWarDiscardMode;
}

export interface BotStrengthSettings {
  inspectionWindowSize: number;
  discardRecycleCount: number;
}

export interface BotRuntimeState {
  controllers: Record<CountryId, ControllerType>;
  countrySettings: Record<CountryId, BotStrengthSettings>;
  config: BotConfig;
  rngState: number;
  session: BotTurnSession | null;
}

export type BotAnswer =
  | "YES"
  | "NO"
  | "EFFECTIVE"
  | "INEFFECTIVE"
  | "COMPLETED"
  | "CANNOT_EXECUTE"
  | "BUILD_ARMY"
  | "BUILD_NAVY";

export type BotDomainEventType =
  | "BotBuiltPiece"
  | "BotCompletedAttack"
  | "BotPieceWouldBeRemoved"
  | "EnemyBuiltAdjacentToBot";

export interface BotDomainEvent {
  type: BotDomainEventType;
  countryId: CountryId;
}

export interface BotEventResolution {
  stateChanged: boolean;
  responseCardId: string | null;
  triggered: boolean;
  preventRemoval: boolean;
  manualInstruction: string | null;
}
