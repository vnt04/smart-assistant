import { useEffect, useState, type ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  CalendarDays,
  ChevronsLeft,
  ChevronsRight,
  Languages,
  LogOut,
  Menu,
  Moon,
  Settings,
  Sparkles,
  Sun,
  Wallet,
  StickyNote,
} from "lucide-react";
import { cn } from "../../lib/cn";
import { useAuth } from "../../features/auth/AuthContext";
import { useTheme } from "../theme/theme-provider";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "../ui/sheet";

type DotColor =
  | "yellow"
  | "blue"
  | "green"
  | "purple"
  | "red"
  | "orange"
  | "cyan"
  | "pink";

interface NavItem {
  to: string;
  label: string;
  icon: typeof StickyNote;
  dot: DotColor;
}

const NAV_ITEMS: NavItem[] = [
  { to: "/notes", label: "Notes", icon: StickyNote, dot: "yellow" },
  { to: "/vocab", label: "Vocab", icon: Languages, dot: "cyan" },
  { to: "/schedule", label: "Lịch", icon: CalendarDays, dot: "blue" },
  { to: "/expense", label: "Chi tiêu", icon: Wallet, dot: "green" },
  { to: "/assistant", label: "Trợ lý", icon: Sparkles, dot: "purple" },
];

const DOT_BG: Record<DotColor, string> = {
  yellow: "bg-dot-yellow",
  blue: "bg-dot-blue",
  green: "bg-dot-green",
  purple: "bg-dot-purple",
  red: "bg-dot-red",
  orange: "bg-dot-orange",
  cyan: "bg-dot-cyan",
  pink: "bg-dot-pink",
};

interface AppShellProps {
  children: ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem("assistant.sidebar.collapsed") === "1";
  });
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(
      "assistant.sidebar.collapsed",
      collapsed ? "1" : "0",
    );
  }, [collapsed]);

  const path = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => setMobileOpen(false), [path]);

  return (
    <div className="flex h-full min-h-0 bg-background text-foreground">
      <aside
        className={cn(
          "hidden md:flex flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-[width] duration-200",
          collapsed ? "w-[68px]" : "w-[232px]",
        )}
      >
        <SidebarBrand collapsed={collapsed} />
        <SidebarNav collapsed={collapsed} pathname={path} />
        <SidebarFooter
          collapsed={collapsed}
          onToggleCollapse={() => setCollapsed((c) => !c)}
        />
      </aside>

      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent
          side="left"
          className="w-[260px] bg-sidebar p-0 text-sidebar-foreground"
        >
          <SheetHeader className="px-3 pt-4 pb-2">
            <SheetTitle className="text-base">Personal Assistant</SheetTitle>
          </SheetHeader>
          <SidebarNav collapsed={false} pathname={path} />
          <SidebarFooter collapsed={false} />
        </SheetContent>
      </Sheet>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-2 border-b border-border bg-background px-3 py-2 md:hidden">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="inline-flex h-9 w-9 items-center justify-center rounded-md hover:bg-muted"
            aria-label="Mở menu"
          >
            <Menu className="h-5 w-5" />
          </button>
          <Link to="/" className="text-sm font-semibold">
            Personal Assistant
          </Link>
        </header>
        <main className="min-h-0 flex-1 overflow-hidden">{children}</main>
      </div>
    </div>
  );
}

function SidebarBrand({ collapsed }: { collapsed: boolean }) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 border-b border-sidebar-border px-3 py-3.5",
        collapsed && "justify-center px-2",
      )}
    >
      <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
        <span className="text-sm font-bold">P</span>
      </div>
      {!collapsed && (
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold">Personal</div>
          <div className="truncate text-xs text-sidebar-muted">Assistant</div>
        </div>
      )}
    </div>
  );
}

function SidebarNav({
  collapsed,
  pathname,
}: {
  collapsed: boolean;
  pathname: string;
}) {
  return (
    <nav className="flex-1 overflow-y-auto scrollbar-thin px-2 py-3">
      {!collapsed && (
        <div className="px-2 pb-1.5 text-2xs font-semibold uppercase tracking-wider text-sidebar-muted">
          Workspace
        </div>
      )}
      <ul className="flex flex-col gap-0.5">
        {NAV_ITEMS.map((item) => (
          <li key={item.to}>
            <SidebarLink
              item={item}
              collapsed={collapsed}
              active={pathname.startsWith(item.to)}
            />
          </li>
        ))}
      </ul>
    </nav>
  );
}

function SidebarLink({
  item,
  collapsed,
  active,
}: {
  item: NavItem;
  collapsed: boolean;
  active: boolean;
}) {
  const Icon = item.icon;
  return (
    <Link
      to={item.to}
      className={cn(
        "group relative flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium transition-colors",
        active
          ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-soft"
          : "text-sidebar-foreground hover:bg-sidebar-accent/60",
        collapsed && "justify-center px-0",
      )}
      title={collapsed ? item.label : undefined}
    >
      <span
        className={cn(
          "inline-flex h-7 w-7 items-center justify-center rounded-md",
          active
            ? "bg-background text-foreground"
            : "text-sidebar-foreground/80 group-hover:text-sidebar-foreground",
        )}
      >
        <Icon className="h-4 w-4" />
      </span>
      {!collapsed && <span className="truncate">{item.label}</span>}
      {!collapsed && (
        <span
          className={cn(
            "ml-auto h-1.5 w-1.5 rounded-full",
            DOT_BG[item.dot],
            !active && "opacity-50",
          )}
        />
      )}
    </Link>
  );
}

function SidebarFooter({
  collapsed,
  onToggleCollapse,
}: {
  collapsed: boolean;
  onToggleCollapse?: () => void;
}) {
  const { resolved, toggle } = useTheme();
  const { user, logout } = useAuth();

  return (
    <div className="border-t border-sidebar-border p-2">
      <div className={cn("flex items-center gap-1", collapsed && "flex-col")}>
        <button
          type="button"
          onClick={toggle}
          className="inline-flex h-9 flex-1 items-center justify-center gap-2 rounded-md text-sm text-sidebar-foreground hover:bg-sidebar-accent"
          title={resolved === "dark" ? "Chuyển sang sáng" : "Chuyển sang tối"}
        >
          {resolved === "dark" ? (
            <Sun className="h-4 w-4" />
          ) : (
            <Moon className="h-4 w-4" />
          )}
          {!collapsed && (
            <span>{resolved === "dark" ? "Sáng" : "Tối"}</span>
          )}
        </button>
        <Link
          to="/settings"
          className="inline-flex h-9 w-9 items-center justify-center rounded-md text-sidebar-foreground hover:bg-sidebar-accent"
          title="Cài đặt"
        >
          <Settings className="h-4 w-4" />
        </Link>
        {onToggleCollapse && (
          <button
            type="button"
            onClick={onToggleCollapse}
            className="inline-flex h-9 w-9 items-center justify-center rounded-md text-sidebar-foreground hover:bg-sidebar-accent"
            title={collapsed ? "Mở rộng" : "Thu gọn"}
          >
            {collapsed ? (
              <ChevronsRight className="h-4 w-4" />
            ) : (
              <ChevronsLeft className="h-4 w-4" />
            )}
          </button>
        )}
      </div>

      {user && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className={cn(
                "mt-1.5 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-sidebar-accent",
                collapsed && "justify-center px-0",
              )}
            >
              <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                {(user.name?.[0] ?? user.email[0] ?? "?").toUpperCase()}
              </span>
              {!collapsed && (
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-medium">
                    {user.name ?? user.email.split("@")[0]}
                  </span>
                  <span className="block truncate text-2xs text-sidebar-muted">
                    {user.email}
                  </span>
                </span>
              )}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="right" align="end" className="w-56">
            <DropdownMenuLabel>Tài khoản</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link to="/settings">
                <Settings className="h-4 w-4" /> Cài đặt
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={() => {
                void logout();
              }}
              className="text-destructive focus:text-destructive"
            >
              <LogOut className="h-4 w-4" /> Đăng xuất
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}
