import { useEffect, useState, type ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  ChevronsLeft,
  ChevronsRight,
  LogOut,
  Menu,
  Moon,
  Search,
  Settings,
  Sun,
} from "lucide-react";
import { cn } from "../../lib/cn";
import { useAuth } from "../../features/auth/AuthContext";
import { useTheme } from "../theme/theme-provider";
import { Input } from "../ui/input";
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
  iconSrc: string;
  iconClassName?: string;
  dot: DotColor;
}

// Các tab đang hiển thị trong sidebar.
// Tạm thời ẩn: "/schedule" (Lịch), "/expense" (Chi tiêu), "/assistant" (Trợ lý).
// Các route vẫn còn trong router.tsx — thêm lại vào đây để hiện lại khi cần.
const NAV_ITEMS: NavItem[] = [
  { to: "/notes", label: "Notes", iconSrc: "/nav-note.png", dot: "yellow" },
  { to: "/vocab", label: "Words", iconSrc: "/nav-vocab.png", dot: "cyan" },
  {
    to: "/job",
    label: "Jobs",
    iconSrc: "/nav-job.png",
    iconClassName: "h-8 w-8",
    dot: "orange",
  },
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
        <SidebarFooter collapsed={collapsed} />
      </aside>

      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent
          side="left"
          className="w-[260px] bg-sidebar p-0 text-sidebar-foreground"
        >
          <SheetHeader className="px-3 pt-4 pb-2">
            <SheetTitle className="text-base">Smart Assistant</SheetTitle>
          </SheetHeader>
          <SidebarNav collapsed={false} pathname={path} />
          <SidebarFooter collapsed={false} />
        </SheetContent>
      </Sheet>

      <div className="flex min-w-0 flex-1 flex-col">
        <TopHeader
          collapsed={collapsed}
          onToggleCollapse={() => setCollapsed((c) => !c)}
          onOpenMobileMenu={() => setMobileOpen(true)}
        />
        <main className="min-h-0 flex-1 overflow-hidden">{children}</main>
      </div>
    </div>
  );
}

function TopHeader({
  collapsed,
  onToggleCollapse,
  onOpenMobileMenu,
}: {
  collapsed: boolean;
  onToggleCollapse: () => void;
  onOpenMobileMenu: () => void;
}) {
  const { resolved, toggle } = useTheme();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const onSettings = path.startsWith("/settings");

  return (
    <header className="flex items-center gap-2 border-b border-border bg-background px-3 py-2.5 sm:px-4">
      {/* Mobile: mở sidebar dạng sheet */}
      <button
        type="button"
        onClick={onOpenMobileMenu}
        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md hover:bg-muted md:hidden"
        aria-label="Mở menu"
      >
        <Menu className="h-5 w-5" />
      </button>

      {/* Desktop: thu gọn / mở rộng sidebar */}
      <button
        type="button"
        onClick={onToggleCollapse}
        className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-md text-foreground hover:bg-muted md:inline-flex"
        title={collapsed ? "Mở rộng" : "Thu gọn"}
        aria-label={collapsed ? "Mở rộng" : "Thu gọn"}
      >
        {collapsed ? (
          <ChevronsRight className="h-5 w-5" />
        ) : (
          <ChevronsLeft className="h-5 w-5" />
        )}
      </button>

      <div className="relative w-full max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          placeholder="Tìm kiếm…"
          aria-label="Tìm kiếm"
          className="h-9 pl-9"
        />
      </div>

      <div className="ml-auto flex items-center gap-1">
        <button
          type="button"
          onClick={toggle}
          className="inline-flex h-9 w-9 items-center justify-center rounded-md text-foreground hover:bg-muted"
          title={resolved === "dark" ? "Chuyển sang sáng" : "Chuyển sang tối"}
          aria-label="Đổi giao diện"
        >
          {resolved === "dark" ? (
            <Sun className="h-4 w-4" />
          ) : (
            <Moon className="h-4 w-4" />
          )}
        </button>
        <Link
          to="/settings"
          className={cn(
            "inline-flex h-9 w-9 items-center justify-center rounded-md transition-colors",
            onSettings
              ? "bg-accent text-accent-foreground"
              : "text-foreground hover:bg-muted",
          )}
          title="Cài đặt"
          aria-label="Cài đặt"
          aria-current={onSettings ? "page" : undefined}
        >
          <Settings className="h-4 w-4" />
        </Link>
        <ProfileMenu variant="header" />
      </div>
    </header>
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
      <img
        src="/logo.png"
        alt="Smart Assistant"
        className="h-7 w-7 shrink-0 object-contain"
      />
      {!collapsed && (
        <div className="min-w-0">
          <div className="truncate text-base font-semibold">Smart Assistant</div>
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
          active && "bg-background",
        )}
      >
        <img
          src={item.iconSrc}
          alt=""
          aria-hidden
          className={cn("object-contain", item.iconClassName ?? "h-6 w-6")}
        />
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

function SidebarFooter({ collapsed }: { collapsed: boolean }) {
  return (
    <div className="border-t border-sidebar-border p-2">
      <ProfileMenu variant="sidebar" collapsed={collapsed} />
    </div>
  );
}

// Menu tài khoản dùng chung: avatar gọn ở header (góc trên phải) và
// avatar + tên/email ở chân sidebar (góc dưới). Cùng một nội dung dropdown.
function ProfileMenu({
  variant,
  collapsed = false,
}: {
  variant: "header" | "sidebar";
  collapsed?: boolean;
}) {
  const { user, logout } = useAuth();
  if (!user) return null;

  const initial = (user.name?.[0] ?? user.email[0] ?? "?").toUpperCase();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {variant === "header" ? (
          <button
            type="button"
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90"
            aria-label="Tài khoản"
          >
            {initial}
          </button>
        ) : (
          <button
            type="button"
            className={cn(
              "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-sidebar-accent",
              collapsed && "justify-center px-0",
            )}
          >
            <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
              {initial}
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
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side={variant === "header" ? "bottom" : "right"}
        align="end"
        className="w-56"
      >
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
  );
}
