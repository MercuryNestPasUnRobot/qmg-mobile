import {
  appendUndoLog,
  createInitialState,
  describeAction,
  isGameState,
  reduceGame,
  SAVE_VERSION,
  type GameAction,
  type GameState,
} from "./game";

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

  if (isGameState(parsed)) return parsed;
  if (parsed && typeof parsed === "object" && isGameState((parsed as Partial<ExportedSave>).state)) {
    return (parsed as ExportedSave).state;
  }
  throw new Error("这不是兼容的 QMG Mobile 存档");
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
      this.state = saved.state;
      this.history = saved.history.filter(
        (entry): entry is HistoryEntry =>
          Boolean(entry) && typeof entry.description === "string" && isGameState(entry.state),
      );
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

  newGame(now = new Date()): void {
    this.state = createInitialState(now);
    this.history = [];
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
}
