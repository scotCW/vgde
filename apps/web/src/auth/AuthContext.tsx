import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { ApiError, get, post } from "../api.js";

export interface Me {
  id: string;
  email: string | null;
  displayNameDefault: string;
}

interface AuthResponse {
  id: string;
  email: string | null;
  displayName: string;
}

interface AuthState {
  user: Me | null;
  loading: boolean;
  register: (email: string, password: string, displayName: string) => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  oidcEnabled: boolean;
  passwordLoginEnabled: boolean;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [oidcEnabled, setOidcEnabled] = useState(false);
  // Defaults true so the form isn't hidden for a flash before /auth/config
  // resolves; the server is the actual source of truth either way — it
  // 404s /auth/register and /auth/login itself when this is false.
  const [passwordLoginEnabled, setPasswordLoginEnabled] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const me = await get<Me>("/me");
      setUser(me);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setUser(null);
      } else {
        throw err;
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    void get<{ oidcEnabled: boolean; passwordLoginEnabled: boolean }>("/auth/config").then((c) => {
      setOidcEnabled(c.oidcEnabled);
      setPasswordLoginEnabled(c.passwordLoginEnabled);
    });
  }, [refresh]);

  const register = useCallback(async (email: string, password: string, displayName: string) => {
    const me = await post<AuthResponse>("/auth/register", { email, password, displayName });
    setUser({ id: me.id, email: me.email, displayNameDefault: me.displayName });
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const me = await post<AuthResponse>("/auth/login", { email, password });
    setUser({ id: me.id, email: me.email, displayNameDefault: me.displayName });
  }, []);

  const logout = useCallback(async () => {
    await post("/auth/logout");
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{ user, loading, register, login, logout, oidcEnabled, passwordLoginEnabled }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
