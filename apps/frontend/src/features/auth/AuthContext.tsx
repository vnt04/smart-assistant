import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { AuthTokens, UserProfile } from "@assistant/shared";
import { api, ApiError } from "../../lib/api";
import { tokenStorage } from "../../lib/storage";

interface AuthState {
  user: UserProfile | null;
  status: "loading" | "authenticated" | "unauthenticated";
}

interface AuthContextValue extends AuthState {
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    status: "loading",
  });

  const refreshProfile = useCallback(async () => {
    if (!tokenStorage.load()) {
      setState({ user: null, status: "unauthenticated" });
      return;
    }
    try {
      const user = await api.me();
      setState({ user, status: "authenticated" });
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        tokenStorage.clear();
      }
      setState({ user: null, status: "unauthenticated" });
    }
  }, []);

  useEffect(() => {
    void refreshProfile();
  }, [refreshProfile]);

  const applyTokens = useCallback(async (tokens: AuthTokens) => {
    tokenStorage.save(tokens);
    const user = await api.me();
    setState({ user, status: "authenticated" });
  }, []);

  const login = useCallback(
    async (email: string, password: string) => {
      const tokens = await api.login({ email, password });
      await applyTokens(tokens);
    },
    [applyTokens],
  );

  const register = useCallback(
    async (email: string, password: string, name: string) => {
      const tokens = await api.register({ email, password, name });
      await applyTokens(tokens);
    },
    [applyTokens],
  );

  const logout = useCallback(async () => {
    const tokens = tokenStorage.load();
    if (tokens) {
      try {
        await api.logout(tokens.refreshToken);
      } catch {
        /* ignore */
      }
    }
    tokenStorage.clear();
    setState({ user: null, status: "unauthenticated" });
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ ...state, login, register, logout, refreshProfile }),
    [state, login, register, logout, refreshProfile],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
