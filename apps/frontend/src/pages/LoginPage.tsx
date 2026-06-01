import { Link, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { loginInputSchema } from "@assistant/shared";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { useAuth } from "../features/auth/AuthContext";
import { ApiError } from "../lib/api";

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const parsed = loginInputSchema.safeParse({ email, password });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ");
      return;
    }
    setSubmitting(true);
    try {
      await login(parsed.data.email, parsed.data.password);
      await navigate({ to: "/" });
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Đăng nhập thất bại, vui lòng thử lại",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="relative grid min-h-screen place-items-center overflow-hidden bg-muted/40 p-4">
      <BackgroundBlob />
      <div className="relative z-10 w-full max-w-md animate-fade-in">
        <div className="mb-6 flex items-center justify-center gap-2">
          <img
            src="/logo.png"
            alt="Smart Assistant"
            className="h-10 w-10 shrink-0 object-contain"
          />
          <span className="text-lg font-semibold tracking-tight">
            Smart Assistant
          </span>
        </div>

        <div className="rounded-2xl border border-border bg-card p-6 shadow-pop sm:p-8">
          <header className="mb-5">
            <h1 className="text-2xl font-semibold tracking-tight">
              Chào mừng trở lại
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Đăng nhập để tiếp tục với notes, lịch và chi tiêu.
            </p>
          </header>
          <form onSubmit={onSubmit} className="space-y-4" noValidate>
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                placeholder="ban@email.com"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Mật khẩu</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                placeholder="••••••••"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            {error && (
              <p
                role="alert"
                className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
              >
                {error}
              </p>
            )}
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? "Đang xử lý…" : "Đăng nhập"}
            </Button>
          </form>

          <div className="relative my-5">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-border" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="bg-card px-2 text-muted-foreground">hoặc</span>
            </div>
          </div>

          <a
            href="/api/auth/google"
            className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md border border-border bg-background text-sm font-medium transition-colors hover:bg-muted"
          >
            <GoogleMark />
            Đăng nhập với Google
          </a>
        </div>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          Chưa có tài khoản?{" "}
          <Link
            to="/register"
            className="font-medium text-primary hover:underline"
          >
            Đăng ký
          </Link>
        </p>
      </div>
    </main>
  );
}

function BackgroundBlob() {
  return (
    <div className="pointer-events-none absolute inset-0">
      <div className="absolute -left-32 -top-32 h-96 w-96 rounded-full bg-primary/10 blur-3xl" />
      <div className="absolute -bottom-32 -right-32 h-96 w-96 rounded-full bg-[hsl(var(--dot-purple))]/10 blur-3xl" />
    </div>
  );
}

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden>
      <path
        fill="#EA4335"
        d="M12 11v3.6h5.1c-.2 1.3-1.6 3.8-5.1 3.8-3.1 0-5.6-2.5-5.6-5.6S8.9 7.2 12 7.2c1.7 0 2.9.7 3.6 1.4l2.4-2.3C16.5 4.8 14.4 4 12 4 7.6 4 4 7.6 4 12s3.6 8 8 8c4.6 0 7.7-3.2 7.7-7.8 0-.5-.1-.9-.1-1.2H12z"
      />
    </svg>
  );
}
