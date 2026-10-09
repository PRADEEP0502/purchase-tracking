import { createContext, useCallback, useContext, useEffect, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api, setUnauthenticatedHandler } from './lib/api';
import { useMe } from './lib/queries';
import { disablePush } from './lib/push';
import type { Me } from './lib/types';

interface AuthCtx {
  user: Me | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  /** First run only: create the first admin account and sign in. */
  setup: (name: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const me = useMe();

  // Drop all cached data except the session query itself (clearing it would detach the observer).
  const resetCache = useCallback(() => qc.removeQueries({ predicate: (q) => q.queryKey[0] !== 'me' }), [qc]);

  const signedOut = useCallback(() => {
    resetCache();
    qc.setQueryData(['me'], null);
  }, [qc, resetCache]);

  useEffect(() => {
    setUnauthenticatedHandler(signedOut);
  }, [signedOut]);

  const login = async (email: string, password: string) => {
    const { data } = await api.post<Me>('/auth/login', { email, password });
    resetCache();
    qc.setQueryData(['me'], data);
  };

  const setup = async (name: string, email: string, password: string) => {
    const { data } = await api.post<Me>('/auth/setup', { name, email, password });
    resetCache();
    qc.setQueryData(['me'], data);
  };

  const logout = async () => {
    await disablePush();
    try {
      await api.post('/auth/logout');
    } finally {
      signedOut();
    }
  };

  return <Ctx.Provider value={{ user: me.data ?? null, loading: me.isPending, login, setup, logout }}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth outside provider');
  return v;
}
