import { useState, useCallback, useRef } from 'react';

interface HistoryState<T> {
  past: T[];
  present: T;
  future: T[];
}

interface UseHistoryResult<T> {
  state: T;
  set: (newState: T, actionName?: string) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  lastAction: string | null;
}

const MAX_HISTORY = 50;

export function useHistory<T>(initialState: T): UseHistoryResult<T> {
  const [history, setHistory] = useState<HistoryState<T>>({
    past: [],
    present: initialState,
    future: [],
  });

  const lastActionRef = useRef<string | null>(null);

  const set = useCallback((newState: T, actionName?: string) => {
    lastActionRef.current = actionName || null;
    setHistory(prev => ({
      past: [...prev.past.slice(-MAX_HISTORY + 1), prev.present],
      present: newState,
      future: [], // Clear future on new action
    }));
  }, []);

  const undo = useCallback(() => {
    setHistory(prev => {
      if (prev.past.length === 0) return prev;

      const newPast = [...prev.past];
      const newPresent = newPast.pop()!;

      lastActionRef.current = 'undo';

      return {
        past: newPast,
        present: newPresent,
        future: [prev.present, ...prev.future],
      };
    });
  }, []);

  const redo = useCallback(() => {
    setHistory(prev => {
      if (prev.future.length === 0) return prev;

      const newFuture = [...prev.future];
      const newPresent = newFuture.shift()!;

      lastActionRef.current = 'redo';

      return {
        past: [...prev.past, prev.present],
        present: newPresent,
        future: newFuture,
      };
    });
  }, []);

  return {
    state: history.present,
    set,
    undo,
    redo,
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
    lastAction: lastActionRef.current,
  };
}
