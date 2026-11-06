'use client';

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { ApiError, apiRequest, type RequestOptions } from './api';

export interface Membership {
  employeeId: string;
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  displayName: string;
}

export interface Me {
  id: string;
  email: string;
  fullName: string;
  isPlatformAdmin: boolean;
  memberships: Membership[];
}

interface Session {
  me: Me | null;
  /** true until the stored token has been checked */
  loading: boolean;
  login(email: string, password: string): Promise<Me>;
  logout(): void;
  request<T>(path: string, opts?: RequestOptions): Promise<T>;
}

const SessionContext = createContext<Session | null>(null);

// shortcut: bearer token in sessionStorage (readable by page scripts). Move to an httpOnly cookie when OIDC replaces password login.
function readToken(key: string) {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}
function writeToken(key: string, token: string | null) {
  try {
    if (token) sessionStorage.setItem(key, token);
    else sessionStorage.removeItem(key);
  } catch {
    /* storage unavailable: session lasts for this page only */
  }
}

export function SessionProvider({ storageKey, children }: { storageKey: string; children: ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);

  const logout = useCallback(() => {
    writeToken(storageKey, null);
    setToken(null);
    setMe(null);
  }, [storageKey]);

  useEffect(() => {
    const stored = readToken(storageKey);
    if (!stored) {
      setLoading(false);
      return;
    }
    apiRequest<Me>(stored, '/me')
      .then((m) => {
        setToken(stored);
        setMe(m);
      })
      .catch(() => writeToken(storageKey, null))
      .finally(() => setLoading(false));
  }, [storageKey]);

  const login = useCallback(
    async (email: string, password: string) => {
      const { accessToken } = await apiRequest<{ accessToken: string }>(null, '/auth/login', {
        method: 'POST',
        body: { email, password },
      });
      const m = await apiRequest<Me>(accessToken, '/me');
      writeToken(storageKey, accessToken);
      setToken(accessToken);
      setMe(m);
      return m;
    },
    [storageKey],
  );

  const request = useCallback(
    async <T,>(path: string, opts?: RequestOptions) => {
      try {
        return await apiRequest<T>(token, path, opts);
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) logout(); // expired token
        throw e;
      }
    },
    [token, logout],
  );

  return <SessionContext.Provider value={{ me, loading, login, logout, request }}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const s = useContext(SessionContext);
  if (!s) throw new Error('useSession must be used inside <SessionProvider>');
  return s;
}

/** Load data on mount / when deps change. `reload()` refetches. */
export function useLoad<T>(load: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(true);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let live = true;
    setLoading(true);
    load()
      .then((d) => live && (setData(d), setError(null)))
      .catch((e) => live && setError(e))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, version]);

  return { data, error, loading, reload: () => setVersion((v) => v + 1) };
}
