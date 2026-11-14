import { useCallback, useEffect, useState } from 'react';

export interface AccountResource<T> {
  readonly data: T;
  readonly status: 'none' | 'offline' | 'loading' | 'ready' | 'error';
  readonly limited: boolean;
  readonly retry: () => void;
}

/** Keep a visit's result by account, with explicit failure and retry instead of silently reporting no records. */
export function useAccountResource<T>(token: string | null, userId: string | null, online: boolean, empty: T,
  load: (token: string, signal: AbortSignal) => Promise<{ data: T; limited: boolean }>): AccountResource<T> {
  const [attempt, setAttempt] = useState(0);
  const [found, setFound] = useState<{ userId: string; attempt: number; data: T; limited: boolean; error: boolean } | null>(null);
  const known = found?.userId === userId && found.attempt === attempt;
  useEffect(() => {
    if (!token || !userId || !online || known) return;
    const controller = new AbortController();
    void load(token, controller.signal).then((result) => {
      if (!controller.signal.aborted) setFound({ userId, attempt, ...result, error: false });
    }).catch(() => {
      if (!controller.signal.aborted) setFound((previous) => ({ userId, attempt,
        data: previous?.userId === userId ? previous.data : empty, limited: previous?.userId === userId && previous.limited, error: true }));
    });
    return () => { controller.abort(); };
  }, [token, userId, online, known, attempt, empty, load]);
  const own = found?.userId === userId ? found : null;
  return { data: own?.data ?? empty, limited: own?.limited ?? false,
    status: !userId ? 'none' : !online ? 'offline' : !token || !known ? 'loading' : own?.error ? 'error' : 'ready',
    retry: useCallback(() => { setAttempt((value) => value + 1); }, []) };
}
