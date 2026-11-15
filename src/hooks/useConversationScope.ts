import { useEffect, useMemo, useRef } from "react";

/** Reject late async results after a card/account change, reset, or unmount. */
export function useConversationScope(key: string) {
  const state = useRef({ key, version: 0, active: true });
  if (state.current.key !== key) {
    state.current.key = key;
    state.current.version += 1;
  }
  useEffect(() => {
    const current = state.current;
    current.active = true;
    return () => {
      current.active = false;
      current.version += 1;
    };
  }, []);
  return useMemo(() => ({
    capture: () => state.current.version,
    isCurrent: (version: number) => state.current.active && version === state.current.version,
    invalidate: () => { state.current.version += 1; },
  }), []);
}
