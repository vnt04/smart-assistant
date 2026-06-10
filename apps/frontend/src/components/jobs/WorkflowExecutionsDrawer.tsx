import { useMemo, useState, type ComponentType, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  ArrowLeft,
  Ban,
  CheckCircle2,
  Clock,
  Code,
  Loader2,
  MoreVertical,
  RefreshCw,
  RotateCcw,
  Settings as SettingsIcon,
  Square,
  Tag,
  Trash2,
  XCircle,
} from "lucide-react";
import type {
  N8nExecution,
  N8nExecutionStatus,
} from "@assistant/shared";
import { Sheet, SheetContent, SheetTitle } from "../ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { useConfirm } from "../ui/confirm-dialog";
import { api, ApiError } from "../../lib/api";
import { cn } from "../../lib/cn";

const LIMIT_OPTIONS = [20, 50, 100];
const AUTO_REFRESH_MS = 5_000;
/** Trạng thái còn có thể dừng được. */
const STOPPABLE: ReadonlySet<N8nExecutionStatus> = new Set([
  "running",
  "waiting",
  "new",
]);

interface DrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Drawer "Quản lý Workflow Exc" — rộng bằng job detail. */
export function WorkflowExecutionsDrawer({ open, onOpenChange }: DrawerProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full max-w-[95vw] flex-col gap-0 p-0 sm:w-[680px] lg:w-[820px]"
      >
        {open && <ExecutionsPanel />}
      </SheetContent>
    </Sheet>
  );
}

type Notice = { kind: "success" | "error"; text: string } | null;

function ExecutionsPanel() {
  const queryClient = useQueryClient();
  const confirm = useConfirm();

  const [limit, setLimit] = useState(20);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [statusFilter, setStatusFilter] = useState<N8nExecutionStatus | "all">(
    "all",
  );
  const [actingId, setActingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ["n8n-executions", limit],
    queryFn: () => api.listN8nExecutions(limit),
    refetchInterval: autoRefresh && !selectedId ? AUTO_REFRESH_MS : false,
  });

  const invalidate = (): void => {
    void queryClient.invalidateQueries({ queryKey: ["n8n-executions"] });
    void queryClient.invalidateQueries({ queryKey: ["n8n-execution"] });
  };

  const retryMut = useMutation({
    mutationFn: ({ id, loadWorkflow }: { id: string; loadWorkflow: boolean }) =>
      api.retryN8nExecution(id, loadWorkflow),
    onMutate: ({ id }) => {
      setActingId(id);
      setNotice(null);
    },
    onSuccess: (res) => {
      // n8n chạy retry đồng bộ: workflow lâu → "accepted" (chạy nền), xong nhanh
      // → "completed". Bật tự làm mới để lần chạy mới hiện ra ở danh sách.
      setNotice({
        kind: "success",
        text:
          res.status === "accepted"
            ? "Đã gửi yêu cầu chạy lại. Workflow đang chạy nền — theo dõi tiến trình ở danh sách."
            : res.executionId
              ? `Đã chạy lại xong — lần chạy mới #${res.executionId}.`
              : "Đã chạy lại xong.",
      });
      setAutoRefresh(true);
      invalidate();
    },
    onError: (e: unknown) => setNotice({ kind: "error", text: errMsg(e) }),
    onSettled: () => setActingId(null),
  });

  const stopMut = useMutation({
    mutationFn: (id: string) => api.stopN8nExecution(id),
    onMutate: (id) => {
      setActingId(id);
      setNotice(null);
    },
    onSuccess: () => {
      setNotice({ kind: "success", text: "Đã gửi yêu cầu dừng execution." });
      invalidate();
    },
    onError: (e: unknown) => setNotice({ kind: "error", text: errMsg(e) }),
    onSettled: () => setActingId(null),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.deleteN8nExecution(id),
    onMutate: (id) => {
      setActingId(id);
      setNotice(null);
    },
    onSuccess: () => {
      setNotice({ kind: "success", text: "Đã xóa execution." });
      setSelectedId(null);
      invalidate();
    },
    onError: (e: unknown) => setNotice({ kind: "error", text: errMsg(e) }),
    onSettled: () => setActingId(null),
  });

  const busy = retryMut.isPending || stopMut.isPending || deleteMut.isPending;

  const onRetry = (id: string, loadWorkflow: boolean): void => {
    if (busy) return;
    retryMut.mutate({ id, loadWorkflow });
  };

  const onStop = (id: string): void => {
    if (busy) return;
    stopMut.mutate(id);
  };

  const onDelete = async (exec: { id: string }): Promise<void> => {
    if (busy) return;
    const ok = await confirm({
      title: `Xóa execution #${exec.id}?`,
      description: "Execution này sẽ bị xóa vĩnh viễn khỏi n8n.",
      confirmText: "Xóa",
      variant: "destructive",
    });
    if (ok) deleteMut.mutate(exec.id);
  };

  if (selectedId) {
    return (
      <ExecutionDetailView
        id={selectedId}
        busy={busy}
        notice={notice}
        onDismissNotice={() => setNotice(null)}
        onBack={() => setSelectedId(null)}
        onRetry={onRetry}
        onStop={onStop}
        onDelete={onDelete}
      />
    );
  }

  const all = query.data?.results ?? [];
  const statusCounts = new Map<N8nExecutionStatus, number>();
  for (const e of all) statusCounts.set(e.status, (statusCounts.get(e.status) ?? 0) + 1);
  const filtered =
    statusFilter === "all"
      ? all
      : all.filter((e) => e.status === statusFilter);

  return (
    <>
      <div className="border-b border-border p-5 pr-12">
        <SheetTitle className="text-xl leading-snug">
          Quản lý Workflow Exc
        </SheetTitle>
        <p className="mt-1 text-sm text-muted-foreground">
          Các lần chạy workflow gần đây từ n8n.
        </p>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setAutoRefresh((v) => !v)}
            aria-pressed={autoRefresh}
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium transition-colors",
              autoRefresh
                ? "border-dot-green/30 bg-dot-green/10 text-dot-green"
                : "border-input bg-background text-muted-foreground hover:bg-accent",
            )}
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Tự làm mới
          </button>
          <button
            type="button"
            onClick={() => void query.refetch()}
            disabled={query.isFetching}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-input bg-background px-2.5 text-xs font-medium text-foreground transition-colors hover:bg-accent disabled:opacity-50"
          >
            {query.isFetching ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            Làm mới
          </button>
          <select
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value))}
            aria-label="Số lượng"
            className="h-8 rounded-md border border-input bg-background px-2 text-xs text-foreground transition-colors hover:bg-accent focus-visible:outline-none"
          >
            {LIMIT_OPTIONS.map((n) => (
              <option key={n} value={n}>
                {n} bản ghi
              </option>
            ))}
          </select>
        </div>

        {all.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            <StatusPill
              active={statusFilter === "all"}
              label="Tất cả"
              count={all.length}
              onClick={() => setStatusFilter("all")}
            />
            {[...statusCounts.entries()].map(([status, count]) => (
              <StatusPill
                key={status}
                active={statusFilter === status}
                label={STATUS_META[status].label}
                count={count}
                tone={STATUS_META[status].tone}
                onClick={() => setStatusFilter(status)}
              />
            ))}
          </div>
        )}
      </div>

      <NoticeBanner notice={notice} onDismiss={() => setNotice(null)} />

      <div className="flex-1 overflow-y-auto scrollbar-thin p-5">
        {query.isLoading ? (
          <LoadingRows />
        ) : query.isError ? (
          <ErrorPanel error={query.error} onRetry={() => void query.refetch()} />
        ) : filtered.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
            {all.length === 0
              ? "Chưa có execution nào."
              : "Không có execution nào khớp bộ lọc."}
          </p>
        ) : (
          <ul className="space-y-2">
            {filtered.map((exec) => (
              <ExecutionRow
                key={exec.id}
                exec={exec}
                busy={actingId === exec.id}
                disabled={busy}
                onOpen={() => setSelectedId(exec.id)}
                onRetry={onRetry}
                onStop={onStop}
                onDelete={() => void onDelete(exec)}
              />
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

/* -------------------- Row -------------------- */

interface ExecutionRowProps {
  exec: N8nExecution;
  busy: boolean;
  disabled: boolean;
  onOpen: () => void;
  onRetry: (id: string, loadWorkflow: boolean) => void;
  onStop: (id: string) => void;
  onDelete: () => void;
}

function ExecutionRow({
  exec,
  busy,
  disabled,
  onOpen,
  onRetry,
  onStop,
  onDelete,
}: ExecutionRowProps) {
  return (
    <li className="rounded-xl border border-border bg-card shadow-soft transition-colors hover:border-dot-orange/30">
      <div className="flex items-start justify-between gap-3 px-3.5 py-3">
        <button
          type="button"
          onClick={onOpen}
          className="min-w-0 flex-1 text-left focus-visible:outline-none"
        >
          <div className="flex items-center gap-2">
            <StatusBadge status={exec.status} />
            <span className="truncate text-sm font-medium">
              {exec.workflowName ?? "—"}
            </span>
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span className="font-medium tabular-nums text-foreground/80">
              #{exec.id}
            </span>
            {exec.retryOf && <span>Retry của #{exec.retryOf}</span>}
            {exec.retrySuccessId && (
              <span className="text-dot-green">
                Đã chạy lại OK #{exec.retrySuccessId}
              </span>
            )}
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" />
              {formatStarted(exec.startedAt ?? exec.createdAt)}
            </span>
            <span className="tabular-nums">{formatRunTime(exec)}</span>
          </div>
        </button>

        <div className="flex shrink-0 items-center gap-1">
          {busy && (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          )}
          <RowMenu
            exec={exec}
            disabled={disabled}
            onOpen={onOpen}
            onRetry={onRetry}
            onStop={onStop}
            onDelete={onDelete}
          />
        </div>
      </div>
    </li>
  );
}

function RowMenu({
  exec,
  disabled,
  onOpen,
  onRetry,
  onStop,
  onDelete,
}: {
  exec: N8nExecution;
  disabled: boolean;
  onOpen: () => void;
  onRetry: (id: string, loadWorkflow: boolean) => void;
  onStop: (id: string) => void;
  onDelete: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        disabled={disabled}
        className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none disabled:opacity-50"
        aria-label="Hành động"
      >
        <MoreVertical className="h-4 w-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={onOpen}>
          <Code className="h-4 w-4" />
          Xem chi tiết
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => onRetry(exec.id, false)}>
          <RotateCcw className="h-4 w-4" />
          Retry — workflow hiện tại
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onRetry(exec.id, true)}>
          <RotateCcw className="h-4 w-4" />
          Retry — workflow gốc
        </DropdownMenuItem>
        {STOPPABLE.has(exec.status) && (
          <DropdownMenuItem onSelect={() => onStop(exec.id)}>
            <Square className="h-4 w-4" />
            Dừng
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={onDelete}
          className="text-destructive focus:bg-destructive/10 focus:text-destructive"
        >
          <Trash2 className="h-4 w-4" />
          Xóa
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/* -------------------- Detail -------------------- */

interface DetailProps {
  id: string;
  busy: boolean;
  notice: Notice;
  onDismissNotice: () => void;
  onBack: () => void;
  onRetry: (id: string, loadWorkflow: boolean) => void;
  onStop: (id: string) => void;
  onDelete: (exec: { id: string }) => void;
}

function ExecutionDetailView({
  id,
  busy,
  notice,
  onDismissNotice,
  onBack,
  onRetry,
  onStop,
  onDelete,
}: DetailProps) {
  const [showData, setShowData] = useState(false);
  const [showStack, setShowStack] = useState(false);

  const query = useQuery({
    queryKey: ["n8n-execution", id],
    queryFn: () => api.getN8nExecution(id),
  });
  const exec = query.data ?? null;

  return (
    <>
      <div className="flex items-start gap-2 border-b border-border p-5 pr-12">
        <button
          type="button"
          onClick={onBack}
          className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          aria-label="Quay lại danh sách"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {exec && <StatusBadge status={exec.status} />}
            <SheetTitle className="truncate text-lg leading-snug">
              {exec?.workflowName ?? "Execution"}
            </SheetTitle>
          </div>
          <p className="mt-0.5 text-sm tabular-nums text-muted-foreground">
            #{id}
            {exec?.retryOf ? ` · Retry của #${exec.retryOf}` : ""}
          </p>
        </div>
      </div>

      <NoticeBanner notice={notice} onDismiss={onDismissNotice} />

      <div className="flex-1 overflow-y-auto scrollbar-thin p-5">
        {query.isLoading ? (
          <div className="h-40 animate-pulse rounded-2xl border border-border bg-muted/40" />
        ) : query.isError || !exec ? (
          <ErrorPanel error={query.error} onRetry={() => void query.refetch()} />
        ) : (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <InfoTile label="Trạng thái">
                {STATUS_META[exec.status].label}
              </InfoTile>
              <InfoTile label="Chế độ">{exec.mode ?? "—"}</InfoTile>
              <InfoTile label="Thời gian chạy">{formatRunTime(exec)}</InfoTile>
              <InfoTile label="Bắt đầu">
                {formatStarted(exec.startedAt ?? exec.createdAt)}
              </InfoTile>
              <InfoTile label="Kết thúc">
                {formatStarted(exec.stoppedAt)}
              </InfoTile>
              {exec.retrySuccessId && (
                <InfoTile label="Chạy lại OK">#{exec.retrySuccessId}</InfoTile>
              )}
            </div>

            {exec.error && (
              <section>
                <SectionLabel>Lỗi</SectionLabel>
                <div className="mt-2 rounded-xl border border-destructive/30 bg-destructive/5 p-3">
                  <p className="text-sm font-medium text-destructive">
                    {exec.error.message}
                  </p>
                  {exec.error.nodeName && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      tại node <span className="font-medium">{exec.error.nodeName}</span>
                    </p>
                  )}
                  {exec.error.stack && (
                    <>
                      <button
                        type="button"
                        onClick={() => setShowStack((s) => !s)}
                        className="mt-2 text-xs font-medium text-dot-orange hover:text-dot-orange/80"
                      >
                        {showStack ? "Ẩn stack trace" : "Xem stack trace"}
                      </button>
                      {showStack && (
                        <pre className="mt-2 max-h-64 overflow-auto scrollbar-thin rounded-md bg-muted/60 p-2 text-2xs leading-relaxed text-foreground/80">
                          {exec.error.stack}
                        </pre>
                      )}
                    </>
                  )}
                </div>
              </section>
            )}

            {exec.tags.length > 0 && (
              <section>
                <SectionLabel>Tags</SectionLabel>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {exec.tags.map((t) => (
                    <span
                      key={t.id}
                      className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground"
                    >
                      <Tag className="h-3 w-3" />
                      {t.name}
                    </span>
                  ))}
                </div>
              </section>
            )}

            {exec.dataJson && (
              <section>
                <button
                  type="button"
                  onClick={() => setShowData((s) => !s)}
                  className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground"
                >
                  <Code className="h-3.5 w-3.5" />
                  Dữ liệu thô {showData ? "▲" : "▼"}
                </button>
                {showData && (
                  <pre className="mt-2 max-h-80 overflow-auto scrollbar-thin rounded-md bg-muted/60 p-3 text-2xs leading-relaxed text-foreground/80">
                    {exec.dataJson}
                  </pre>
                )}
              </section>
            )}
          </div>
        )}
      </div>

      {exec && (
        <div className="flex flex-wrap items-center gap-2 border-t border-border p-4">
          <DropdownMenu>
            <DropdownMenuTrigger
              disabled={busy}
              className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
            >
              <RotateCcw className="h-4 w-4" /> Retry
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem onSelect={() => onRetry(exec.id, false)}>
                Workflow hiện tại
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => onRetry(exec.id, true)}>
                Workflow gốc
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {STOPPABLE.has(exec.status) && (
            <button
              type="button"
              onClick={() => onStop(exec.id)}
              disabled={busy}
              className="inline-flex h-9 items-center gap-1.5 rounded-md border border-input bg-background px-3 text-sm font-medium transition-colors hover:bg-accent disabled:opacity-50"
            >
              <Square className="h-4 w-4" /> Dừng
            </button>
          )}

          <button
            type="button"
            onClick={() => onDelete(exec)}
            disabled={busy}
            className="ml-auto inline-flex h-9 items-center gap-1.5 rounded-md border border-input bg-background px-3 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-50"
          >
            <Trash2 className="h-4 w-4" /> Xóa
          </button>
        </div>
      )}
    </>
  );
}

/* -------------------- Status meta -------------------- */

type Tone = "green" | "red" | "blue" | "amber" | "gray";

interface StatusMeta {
  label: string;
  tone: Tone;
  icon: ComponentType<{ className?: string }>;
}

const STATUS_META: Record<N8nExecutionStatus, StatusMeta> = {
  success: { label: "Thành công", tone: "green", icon: CheckCircle2 },
  error: { label: "Lỗi", tone: "red", icon: XCircle },
  crashed: { label: "Crash", tone: "red", icon: AlertTriangle },
  canceled: { label: "Đã hủy", tone: "gray", icon: Ban },
  running: { label: "Đang chạy", tone: "blue", icon: Loader2 },
  waiting: { label: "Đang chờ", tone: "amber", icon: Clock },
  new: { label: "Mới", tone: "gray", icon: Clock },
  unknown: { label: "Không rõ", tone: "gray", icon: AlertTriangle },
};

const TONE_BADGE: Record<Tone, string> = {
  green: "bg-dot-green/10 text-dot-green",
  red: "bg-destructive/10 text-destructive",
  blue: "bg-dot-blue/10 text-dot-blue",
  amber: "bg-dot-orange/10 text-dot-orange",
  gray: "bg-muted text-muted-foreground",
};

function StatusBadge({ status }: { status: N8nExecutionStatus }) {
  const meta = STATUS_META[status];
  const Icon = meta.icon;
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-2xs font-semibold",
        TONE_BADGE[meta.tone],
      )}
    >
      <Icon className={cn("h-3 w-3", status === "running" && "animate-spin")} />
      {meta.label}
    </span>
  );
}

/* -------------------- Pieces -------------------- */

function NoticeBanner({
  notice,
  onDismiss,
}: {
  notice: Notice;
  onDismiss: () => void;
}) {
  if (!notice) return null;
  return (
    <div
      className={cn(
        "mx-5 mt-4 flex items-start gap-2 rounded-md border px-3 py-2 text-sm",
        notice.kind === "success"
          ? "border-dot-green/30 bg-dot-green/10 text-dot-green"
          : "border-destructive/30 bg-destructive/10 text-destructive",
      )}
      role="status"
    >
      <span className="flex-1">{notice.text}</span>
      <button
        type="button"
        onClick={onDismiss}
        className="opacity-70 transition hover:opacity-100"
        aria-label="Đóng thông báo"
      >
        <XCircle className="h-4 w-4" />
      </button>
    </div>
  );
}

function InfoTile({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card px-3 py-2">
      <div className="text-2xs uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="mt-0.5 truncate text-sm font-medium">{children}</div>
    </div>
  );
}

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
      {children}
    </h2>
  );
}

function StatusPill({
  active,
  label,
  count,
  tone,
  onClick,
}: {
  active: boolean;
  label: string;
  count: number;
  tone?: Tone;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium transition-colors",
        active
          ? "border-dot-orange/30 bg-dot-orange/10 text-dot-orange"
          : "border-border bg-background text-muted-foreground hover:bg-accent hover:text-foreground",
      )}
    >
      {tone && !active && (
        <span className={cn("h-1.5 w-1.5 rounded-full", TONE_DOT[tone])} />
      )}
      {label}
      <span className="text-2xs tabular-nums opacity-70">{count}</span>
    </button>
  );
}

const TONE_DOT: Record<Tone, string> = {
  green: "bg-dot-green",
  red: "bg-destructive",
  blue: "bg-dot-blue",
  amber: "bg-dot-orange",
  gray: "bg-muted-foreground/50",
};

function LoadingRows() {
  return (
    <ul className="space-y-2">
      {Array.from({ length: 6 }).map((_, i) => (
        <li
          key={i}
          className="h-16 animate-pulse rounded-xl border border-border bg-muted/40"
        />
      ))}
    </ul>
  );
}

function ErrorPanel({
  error,
  onRetry,
}: {
  error: unknown;
  onRetry: () => void;
}) {
  const code = error instanceof ApiError ? error.code : "";
  const needsConfig =
    code === "n8n_not_configured" || code === "n8n_unauthorized";

  return (
    <div className="mx-auto flex max-w-sm flex-col items-center gap-3 py-16 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-dot-orange/10 text-dot-orange">
        <AlertTriangle className="h-5 w-5" />
      </div>
      <p className="text-sm text-muted-foreground">{errMsg(error)}</p>
      {needsConfig ? (
        <Link
          to="/settings"
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          <SettingsIcon className="h-4 w-4" /> Mở Cài đặt
        </Link>
      ) : (
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted"
        >
          <RefreshCw className="h-4 w-4" /> Thử lại
        </button>
      )}
    </div>
  );
}

/* -------------------- Helpers -------------------- */

function errMsg(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return "Đã xảy ra lỗi.";
}

function formatStarted(value: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function formatRunTime(exec: N8nExecution): string {
  if (exec.runTimeMs == null) {
    return exec.status === "running" || exec.status === "waiting"
      ? "Đang chạy…"
      : "—";
  }
  const ms = exec.runTimeMs;
  if (ms < 1000) return `${ms}ms`;
  const totalSec = ms / 1000;
  if (totalSec < 60) return `${totalSec.toFixed(1)}s`;
  const m = Math.floor(totalSec / 60);
  const s = Math.round(totalSec - m * 60);
  return `${m}m ${s}s`;
}
