import { Link, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { registerInputSchema } from "@assistant/shared";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { useAuth } from "../features/auth/AuthContext";
import { ApiError } from "../lib/api";

export function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const parsed = registerInputSchema.safeParse({ name, email, password });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ");
      return;
    }
    setSubmitting(true);
    try {
      await register(parsed.data.email, parsed.data.password, parsed.data.name);
      await navigate({ to: "/notes" });
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Đăng ký thất bại, vui lòng thử lại",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="relative grid min-h-screen place-items-center overflow-hidden bg-muted/40 p-4">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-32 -top-32 h-96 w-96 rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute -bottom-32 -right-32 h-96 w-96 rounded-full bg-[hsl(var(--dot-purple))]/10 blur-3xl" />
      </div>
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
              Tạo tài khoản
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Một workspace cho notes, lịch và chi tiêu — miễn phí và riêng tư.
            </p>
          </header>
          <form onSubmit={onSubmit} className="space-y-4" noValidate>
            <div className="space-y-1.5">
              <Label htmlFor="name">Tên hiển thị</Label>
              <Input
                id="name"
                required
                placeholder="Nguyễn Văn A"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
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
                autoComplete="new-password"
                placeholder="Ít nhất 12 ký tự"
                required
                minLength={12}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <p className="text-2xs text-muted-foreground">
                Mật khẩu phải có ít nhất 12 ký tự.
              </p>
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
              {submitting ? "Đang xử lý…" : "Tạo tài khoản"}
            </Button>
          </form>
        </div>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          Đã có tài khoản?{" "}
          <Link
            to="/login"
            className="font-medium text-primary hover:underline"
          >
            Đăng nhập
          </Link>
        </p>
      </div>
    </main>
  );
}
