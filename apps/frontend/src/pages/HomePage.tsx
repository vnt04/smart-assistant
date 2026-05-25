import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { useAuth } from "../features/auth/AuthContext";

export function HomePage() {
  const { user, status } = useAuth();
  const { data: health } = useQuery({
    queryKey: ["health"],
    queryFn: api.health,
    refetchInterval: 15_000,
  });

  return (
    <section className="mx-auto max-w-2xl space-y-6 p-6">
      <h1 className="text-2xl font-bold">Trang chủ</h1>

      {status === "loading" && (
        <p className="text-muted-foreground">Đang tải…</p>
      )}

      {user && (
        <div className="rounded-lg border bg-card p-4">
          <p className="text-sm text-muted-foreground">Đăng nhập với</p>
          <p className="text-lg font-medium">{user.name}</p>
          <p className="text-sm text-muted-foreground">{user.email}</p>
        </div>
      )}

      {health && (
        <div className="rounded-lg border bg-card p-4 text-sm">
          <div className="mb-1 text-muted-foreground">Backend</div>
          <div className="font-mono text-xs">
            {health.status} · uptime {health.uptime}s · v{health.version}
          </div>
        </div>
      )}
    </section>
  );
}
