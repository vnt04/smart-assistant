import type { AuthTokens } from "@assistant/shared";

const ACCESS_KEY = "assistant.accessToken";
const REFRESH_KEY = "assistant.refreshToken";

export const tokenStorage = {
  load(): AuthTokens | null {
    const accessToken = localStorage.getItem(ACCESS_KEY);
    const refreshToken = localStorage.getItem(REFRESH_KEY);
    if (!accessToken || !refreshToken) return null;
    return { accessToken, refreshToken, expiresIn: 0 };
  },
  save(tokens: AuthTokens): void {
    localStorage.setItem(ACCESS_KEY, tokens.accessToken);
    localStorage.setItem(REFRESH_KEY, tokens.refreshToken);
  },
  clear(): void {
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
  },
};
