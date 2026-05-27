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
import { GoogleCallbackPage } from "./pages/GoogleCallbackPage";

const PUBLIC_PATHS = ["/login", "/register", "/auth/callback"];

function RootLayout() {
  const { status } = useAuth();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    if (status === "unauthenticated" && !PUBLIC_PATHS.includes(pathname)) {
      void navigate({ to: "/login" });
    }
  }, [status, pathname, navigate]);

  const isPublic = PUBLIC_PATHS.includes(pathname);

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

const notesRoute = new Route({
  getParentRoute: () => rootRoute,
  path: "/notes",
  component: NotesPage,
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
