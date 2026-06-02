import { useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "../features/auth/AuthContext";
import { tokenStorage } from "../lib/storage";

export function GoogleCallbackPage() {
  const { refreshProfile } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    const hash = window.location.hash.startsWith("#")
      ? window.location.hash.slice(1)
      : "";
    const params = new URLSearchParams(hash);
    const accessToken = params.get("access_token");
    const refreshToken = params.get("refresh_token");
    const expiresIn = Number(params.get("expires_in") ?? "0");
    if (accessToken && refreshToken) {
      tokenStorage.save({ accessToken, refreshToken, expiresIn });
      void refreshProfile().then(() => navigate({ to: "/notes" }));
    } else {
      void navigate({ to: "/login" });
    }
  }, [refreshProfile, navigate]);

  return <p className="p-6 text-muted-foreground">Đang xử lý đăng nhập…</p>;
}
