import {
  Outlet,
  Router,
  RootRoute,
  Route,
  redirect,
  useNavigate,
  useRouterState,
} from "@tanstack/react-router";
import { useEffect } from "react";
import { AppShell } from "./components/layout/app-shell";
import { useAuth } from "./features/auth/AuthContext";
import { AssistantPage } from "./pages/AssistantPage";
import { ExpensePage } from "./pages/ExpensePage";
import { JobPage } from "./pages/JobPage";
import { JobStatsPage } from "./pages/JobStatsPage";
import { LoginPage } from "./pages/LoginPage";
import { NotesPage } from "./pages/NotesPage";
import { RegisterPage } from "./pages/RegisterPage";
import { SchedulePage } from "./pages/SchedulePage";
import { SettingsPage } from "./pages/SettingsPage";
import { SharedPage } from "./pages/SharedPage";
import { VocabPage } from "./pages/VocabPage";
import { GoogleCallbackPage } from "./pages/GoogleCallbackPage";

const PUBLIC_PATHS = ["/login", "/register", "/auth/callback"];

function RootLayout() {
  const { status } = useAuth();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  // Trang share công khai (/share/:token) truy cập được khi chưa đăng nhập và
  // KHÔNG bị đá về /notes khi đã đăng nhập (người dùng vẫn cần xem link).
  const isShare = pathname.startsWith("/share/");
  const isPublic = PUBLIC_PATHS.includes(pathname) || isShare;

  useEffect(() => {
    if (status === "loading") return;
    if (status === "authenticated" && isPublic && !isShare) {
      if (pathname === "/auth/callback") return;
      // Sau khi đăng nhập từ trang share riêng tư, quay lại đúng liên kết đó.
      let redirectTo: string | null = null;
      try {
        redirectTo = sessionStorage.getItem("postLoginRedirect");
      } catch {
        redirectTo = null;
      }
      if (redirectTo) {
        try {
          sessionStorage.removeItem("postLoginRedirect");
        } catch {
          // bỏ qua nếu sessionStorage không khả dụng
        }
        window.location.replace(redirectTo);
        return;
      }
      void navigate({ to: "/notes", replace: true });
    } else if (status === "unauthenticated" && !isPublic) {
      void navigate({ to: "/login", replace: true });
    }
  }, [status, isPublic, isShare, pathname, navigate]);

  if (status === "loading") {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Đang tải…
      </div>
    );
  }

  if (isPublic || status === "unauthenticated") {
    return (
      <div className="min-h-full bg-background text-foreground">
        <Outlet />
      </div>
    );
  }

  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}

const rootRoute = new RootRoute({ component: RootLayout });

const indexRoute = new Route({
  getParentRoute: () => rootRoute,
  path: "/",
  beforeLoad: () => {
    throw redirect({ to: "/notes", replace: true });
  },
});

const loginRoute = new Route({
  getParentRoute: () => rootRoute,
  path: "/login",
  component: LoginPage,
});

const registerRoute = new Route({
  getParentRoute: () => rootRoute,
  path: "/register",
  component: RegisterPage,
});

interface NotesSearch {
  note?: string;
}

const notesRoute = new Route({
  getParentRoute: () => rootRoute,
  path: "/notes",
  component: NotesPage,
  validateSearch: (search: Record<string, unknown>): NotesSearch => ({
    note:
      typeof search.note === "string" && search.note ? search.note : undefined,
  }),
});

const vocabRoute = new Route({
  getParentRoute: () => rootRoute,
  path: "/vocab",
  component: VocabPage,
});

const jobRoute = new Route({
  getParentRoute: () => rootRoute,
  path: "/job",
  component: JobPage,
});

const jobStatsRoute = new Route({
  getParentRoute: () => rootRoute,
  path: "/job/stats",
  component: JobStatsPage,
});

const scheduleRoute = new Route({
  getParentRoute: () => rootRoute,
  path: "/schedule",
  component: SchedulePage,
});

const expenseRoute = new Route({
  getParentRoute: () => rootRoute,
  path: "/expense",
  component: ExpensePage,
});

const assistantRoute = new Route({
  getParentRoute: () => rootRoute,
  path: "/assistant",
  component: AssistantPage,
});

const settingsRoute = new Route({
  getParentRoute: () => rootRoute,
  path: "/settings",
  component: SettingsPage,
});

const googleCallbackRoute = new Route({
  getParentRoute: () => rootRoute,
  path: "/auth/callback",
  component: GoogleCallbackPage,
});

const sharedRoute = new Route({
  getParentRoute: () => rootRoute,
  path: "/share/$token",
  component: SharedPage,
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  loginRoute,
  registerRoute,
  notesRoute,
  vocabRoute,
  jobRoute,
  jobStatsRoute,
  scheduleRoute,
  expenseRoute,
  assistantRoute,
  settingsRoute,
  googleCallbackRoute,
  sharedRoute,
]);

export const router = new Router({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
