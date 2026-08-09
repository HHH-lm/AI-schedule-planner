export interface HistoryState<T> {
  past: T[];
  present: T;
  future: T[];
  limit: number;
}

export function createHistoryState<T>(
  present: T,
  limit = 50
): HistoryState<T> {
  return { past: [], present, future: [], limit };
}

export function commitHistoryState<T>(
  state: HistoryState<T>,
  next: T
): HistoryState<T> {
  if (Object.is(state.present, next)) return state;
  return {
    ...state,
    past: [...state.past, state.present].slice(-state.limit),
    present: next,
    future: [],
  };
}

export function undoHistoryState<T>(
  state: HistoryState<T>
): HistoryState<T> {
  const previous = state.past[state.past.length - 1];
  if (previous === undefined) return state;
  return {
    ...state,
    past: state.past.slice(0, -1),
    present: previous,
    future: [state.present, ...state.future].slice(0, state.limit),
  };
}

export function redoHistoryState<T>(
  state: HistoryState<T>
): HistoryState<T> {
  const next = state.future[0];
  if (next === undefined) return state;
  return {
    ...state,
    past: [...state.past, state.present].slice(-state.limit),
    present: next,
    future: state.future.slice(1),
  };
}

export function canUndo<T>(state: HistoryState<T>): boolean {
  return state.past.length > 0;
}

export function canRedo<T>(state: HistoryState<T>): boolean {
  return state.future.length > 0;
}
