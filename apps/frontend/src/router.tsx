import {
  Link,
  Outlet,
  Router,
  RootRoute,
  Route,
  useNavigate,
} from "@tanstack/react-router";
import { useEffect } from "react";
import { Button } from "./components/ui/button";
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
  const { user, status, logout } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (status === "unauthenticated") {
      const path = window.location.pathname;
      if (!PUBLIC_PATHS.includes(path)) {
        void navigate({ to: "/login" });
      }
    }
  }, [status, navigate]);

  return (
    <div className="flex min-h-full flex-col">
      <header className="border-b">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <Link to="/" className="font-semibold">
            Personal Assistant
          </Link>
          <nav className="flex items-center gap-2 text-sm">
            {user ? (
              <>
                <Link
                  to="/notes"
                  className="rounded px-3 py-1.5 hover:bg-accent"
                >
                  Notes
                </Link>
                <Link
                  to="/schedule"
                  className="rounded px-3 py-1.5 hover:bg-accent"
                >
                  Lịch
                </Link>
                <Link
                  to="/expense"
                  className="rounded px-3 py-1.5 hover:bg-accent"
                >
                  Chi tiêu
                </Link>
                <Link
                  to="/assistant"
                  className="rounded px-3 py-1.5 hover:bg-accent"
                >
                  Trợ lý
                </Link>
                <Link
                  to="/settings"
                  className="rounded px-3 py-1.5 hover:bg-accent"
                >
                  Cài đặt
                </Link>
                <span className="text-muted-foreground">{user.email}</span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    void logout().then(() => navigate({ to: "/login" }));
                  }}
                >
                  Đăng xuất
                </Button>
              </>
            ) : (
              <>
                <Link
                  to="/login"
                  className="rounded px-3 py-1.5 hover:bg-accent"
                >
                  Đăng nhập
                </Link>
                <Link
                  to="/register"
                  className="rounded px-3 py-1.5 hover:bg-accent"
                >
                  Đăng ký
                </Link>
              </>
            )}
          </nav>
        </div>
      </header>
      <main className="flex-1">
        <Outlet />
      </main>
    </div>
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
