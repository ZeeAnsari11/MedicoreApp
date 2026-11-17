import { useCallback, useRef, useState } from 'react';

/**
 * Runs an async action at most once at a time. A ref (not state) blocks a second tap in the same frame, before a
 * re-render could disable the button; the backend has no idempotency keys, so a double tap would double-post.
 */
export function useSubmitGuard() {
  const running = useRef(false);
  const [busy, setBusy] = useState(false);
  const run = useCallback(async <T,>(action: () => Promise<T>): Promise<T | undefined> => {
    if (running.current) return undefined;
    running.current = true;
    setBusy(true);
    try {
      return await action();
    } finally {
      running.current = false;
      setBusy(false);
    }
  }, []);
  return { run, busy };
}
