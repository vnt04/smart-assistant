import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  ArrowRight,
  CalendarDays,
  CircleCheck,
  Languages,
  Sparkles,
  StickyNote,
  Wallet,
} from "lucide-react";
import { api } from "../lib/api";
import { useAuth } from "../features/auth/AuthContext";
import { cn } from "../lib/cn";

interface QuickLink {
  to: string;
  label: string;
  description: string;
  icon: typeof StickyNote;
  accent: string;
}

const LINKS: QuickLink[] = [
  {
    to: "/notes",
    label: "Notes",
    description: "Ghi chú, ý tưởng, danh sách công việc",
    icon: StickyNote,
    accent: "bg-dot-yellow/10 text-dot-yellow",
  },
  {
    to: "/vocab",
    label: "Words",
    description: "Từ vựng hay quên, ôn tập theo tần suất",
    icon: Languages,
    accent: "bg-dot-cyan/10 text-dot-cyan",
  },
  {
    to: "/schedule",
    label: "Lịch",
    description: "Sự kiện, nhắc nhở, kế hoạch ngày",
    icon: CalendarDays,
    accent: "bg-dot-blue/10 text-dot-blue",
  },
  {
    to: "/expense",
    label: "Chi tiêu",
    description: "Ví, ngân sách, báo cáo",
    icon: Wallet,
    accent: "bg-dot-green/10 text-dot-green",
  },
  {
    to: "/assistant",
    label: "Trợ lý",
    description: "AI hỗ trợ và tự động hóa",
    icon: Sparkles,
    accent: "bg-dot-purple/10 text-dot-purple",
  },
];

export function HomePage() {
  const { user, status } = useAuth();
  const healthQuery = useQuery({
    queryKey: ["health"],
    queryFn: api.health,
    refetchInterval: 15_000,
  });

  const hour = new Date().getHours();
  const greeting =
    hour < 12
      ? "Chào buổi sáng"
      : hour < 18
        ? "Chào buổi chiều"
        : "Chào buổi tối";

  return (
    <div className="h-full overflow-y-auto scrollbar-thin">
      <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 md:px-10 md:py-14">
        <header className="mb-10">
          <p className="text-sm text-muted-foreground">{greeting}</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight sm:text-4xl">
            {status === "loading"
              ? "…"
              : user
                ? user.name?.trim() || user.email.split("@")[0]
                : "Chào mừng"}
          </h1>
          <p className="mt-2 max-w-xl text-sm text-muted-foreground">
            Hôm nay bạn muốn làm gì? Bắt đầu nhanh từ một trong các workspace
            bên dưới.
          </p>
        </header>

        <section className="grid gap-3 sm:grid-cols-2">
          {LINKS.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              className="group flex items-start gap-3 rounded-xl border border-border bg-card p-4 transition-all hover:border-foreground/20 hover:shadow-soft"
            >
              <div
                className={cn(
                  "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg",
                  link.accent,
                )}
              >
                <link.icon className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <h2 className="text-base font-semibold">{link.label}</h2>
                  <ArrowRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 transition-all group-hover:translate-x-0.5 group-hover:opacity-100" />
                </div>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  {link.description}
                </p>
              </div>
            </Link>
          ))}
        </section>

        <section className="mt-10 grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
              Hệ thống
            </div>
            {healthQuery.data ? (
              <div className="mt-2 flex items-center gap-2">
                <CircleCheck className="h-4 w-4 text-dot-green" />
                <div className="text-sm">
                  <span className="font-medium">Backend hoạt động</span>{" "}
                  <span className="text-muted-foreground">
                    · {Math.round(healthQuery.data.uptime)}s · v
                    {healthQuery.data.version}
                  </span>
                </div>
              </div>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">
                Đang kiểm tra…
              </p>
            )}
          </div>
          {user && (
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
                Tài khoản
              </div>
              <p className="mt-2 truncate text-sm font-medium">{user.name}</p>
              <p className="truncate text-xs text-muted-foreground">
                {user.email}
              </p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
