import {
  Outlet,
  Router,
  RootRoute,
  Route,
  useNavigate,
  useRouterState,
} from "@tanstack/react-router";
import { useEffect } from "react";
import { AppShell } from "./components/layout/app-shell";
import { useAuth } from "./features/auth/AuthContext";
import { AssistantPage } from "./pages/AssistantPage";
import { ExpensePage } from "./pages/ExpensePage";
import { HomePage } from "./pages/HomePage";
import { LoginPage } from "./pages/LoginPage";
import { NotesPage } from "./pages/NotesPage";
import { RegisterPage } from "./pages/RegisterPage";
import { SchedulePage } from "./pages/SchedulePage";
import { SettingsPage } from "./pages/SettingsPage";
import { VocabPage } from "./pages/VocabPage";
import { GoogleCallbackPage } from "./pages/GoogleCallbackPage";

const PUBLIC_PATHS = ["/login", "/register", "/auth/callback"];

function RootLayout() {
  const { status } = useAuth();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isPublic = PUBLIC_PATHS.includes(pathname);

  useEffect(() => {
    if (status === "loading") return;
    if (
      status === "authenticated" &&
      isPublic &&
      pathname !== "/auth/callback"
    ) {
      void navigate({ to: "/", replace: true });
    } else if (status === "unauthenticated" && !isPublic) {
      void navigate({ to: "/login", replace: true });
    }
  }, [status, isPublic, pathname, navigate]);

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
  component: HomePage,
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

const routeTree = rootRoute.addChildren([
  indexRoute,
  loginRoute,
  registerRoute,
  notesRoute,
  vocabRoute,
  scheduleRoute,
  expenseRoute,
  assistantRoute,
  settingsRoute,
  googleCallbackRoute,
]);

export const router = new Router({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
