export interface RandomStep {
  value: number;
  state: number;
}

export function normalizeSeed(seed: number): number {
  const normalized = seed >>> 0;
  return normalized || 0x6d2b79f5;
}

export function nextUint32(state: number): RandomStep {
  let value = normalizeSeed(state);
  value ^= value << 13;
  value ^= value >>> 17;
  value ^= value << 5;
  const next = value >>> 0;
  return { value: next, state: next };
}

export function nextInt(state: number, maximumExclusive: number): RandomStep {
  if (!Number.isInteger(maximumExclusive) || maximumExclusive <= 0) {
    throw new Error("随机范围必须是正整数");
  }
  const step = nextUint32(state);
  return { value: step.value % maximumExclusive, state: step.state };
}

export function rollD6(state: number): RandomStep {
  const step = nextInt(state, 6);
  return { value: step.value + 1, state: step.state };
}

export function shuffleWithState<T>(items: readonly T[], initialState: number): { items: T[]; state: number } {
  const shuffled = [...items];
  let state = normalizeSeed(initialState);
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const step = nextInt(state, index + 1);
    state = step.state;
    [shuffled[index], shuffled[step.value]] = [shuffled[step.value]!, shuffled[index]!];
  }
  return { items: shuffled, state };
}
