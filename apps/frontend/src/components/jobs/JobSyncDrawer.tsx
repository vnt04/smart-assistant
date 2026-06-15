import { useMemo, useState, type ComponentType, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Clock,
  Loader2,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  Repeat,
  Trash2,
  X,
  XCircle,
} from "lucide-react";
import type {
  CreateJobSyncSourceInput,
  JobSyncRun,
  JobSyncRunStatus,
  JobSyncSchedule,
  JobSyncSource,
} from "@assistant/shared";
import { Sheet, SheetContent, SheetTitle } from "../ui/sheet";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { useConfirm } from "../ui/confirm-dialog";
import { api, ApiError } from "../../lib/api";
import { cn } from "../../lib/cn";

const AUTO_REFRESH_MS = 8_000;

/** Khoảng lặp gợi ý (phút) cho lịch kiểu interval. */
const INTERVAL_OPTIONS: { value: number; label: string }[] = [
  { value: 15, label: "15 phút" },
  { value: 30, label: "30 phút" },
  { value: 60, label: "1 giờ" },
  { value: 120, label: "2 giờ" },
  { value: 180, label: "3 giờ" },
  { value: 360, label: "6 giờ" },
  { value: 720, label: "12 giờ" },
  { value: 1440, label: "24 giờ" },
];

/** Preset thành phố (mã VietnamWorks). Chỉ HCM được xác nhận từ API thực tế. */
const CITY_PRESETS: { value: number | null; label: string }[] = [
  { value: null, label: "Toàn quốc" },
  { value: 29, label: "Hồ Chí Minh (29)" },
];

interface DrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function JobSyncDrawer({ open, onOpenChange }: DrawerProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full max-w-[95vw] flex-col gap-0 p-0 sm:w-[680px] lg:w-[820px]"
      >
        {open && <SyncPanel />}
      </SheetContent>
    </Sheet>
  );
}

type View = { mode: "list" } | { mode: "form"; source: JobSyncSource | null };
type Tab = "sources" | "history";
type Notice = { kind: "success" | "error"; text: string } | null;

function SyncPanel() {
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const [view, setView] = useState<View>({ mode: "list" });
  const [tab, setTab] = useState<Tab>("sources");
  const [notice, setNotice] = useState<Notice>(null);

  const overviewQuery = useQuery({
    queryKey: ["job-sync-overview"],
    queryFn: api.getJobSyncOverview,
    refetchInterval: view.mode === "list" ? AUTO_REFRESH_MS : false,
  });

  const invalidate = (): void => {
    void queryClient.invalidateQueries({ queryKey: ["job-sync-overview"] });
  };

  const runMut = useMutation({
    mutationFn: (id: string) => api.runJobSyncSource(id),
    onSuccess: () => {
      setNotice({ kind: "success", text: "Đã bắt đầu đồng bộ — theo dõi ở tab Lịch sử." });
      setTab("history");
      invalidate();
    },
    onError: (e) => setNotice({ kind: "error", text: errMsg(e) }),
  });

  const toggleMut = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      api.updateJobSyncSource(id, { enabled }),
    onSuccess: () => invalidate(),
    onError: (e) => setNotice({ kind: "error", text: errMsg(e) }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.deleteJobSyncSource(id),
    onSuccess: () => {
      setNotice({ kind: "success", text: "Đã xóa nguồn đồng bộ." });
      invalidate();
    },
    onError: (e) => setNotice({ kind: "error", text: errMsg(e) }),
  });

  const onDelete = async (source: JobSyncSource): Promise<void> => {
    const ok = await confirm({
      title: `Xóa nguồn “${source.name}”?`,
      description: "Lịch chạy sẽ dừng. Lịch sử các lần chạy vẫn được giữ lại.",
      confirmText: "Xóa",
      variant: "destructive",
    });
    if (ok) deleteMut.mutate(source.id);
  };

  if (view.mode === "form") {
    return (
      <SourceForm
        source={view.source}
        onClose={() => setView({ mode: "list" })}
        onSaved={(text) => {
          setNotice({ kind: "success", text });
          setView({ mode: "list" });
          invalidate();
        }}
      />
    );
  }

  const overview = overviewQuery.data;
  const sources = overview?.sources ?? [];
  const runs = overview?.recentRuns ?? [];
  const busy = runMut.isPending || toggleMut.isPending || deleteMut.isPending;

  return (
    <>
      <div className="border-b border-border p-5 pr-12">
        <SheetTitle className="text-xl leading-snug">Đồng bộ việc làm</SheetTitle>
        <p className="mt-1 text-sm text-muted-foreground">
          Tự động kéo việc làm từ VietnamWorks theo lịch.
        </p>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setView({ mode: "form", source: null })}
            className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-2.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            <Plus className="h-3.5 w-3.5" /> Thêm nguồn
          </button>
          <button
            type="button"
            onClick={() => void overviewQuery.refetch()}
            disabled={overviewQuery.isFetching}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-input bg-background px-2.5 text-xs font-medium text-foreground transition-colors hover:bg-accent disabled:opacity-50"
          >
            {overviewQuery.isFetching ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            Làm mới
          </button>

          <div className="ml-auto flex items-center gap-1 rounded-md border border-input bg-background p-0.5">
            <TabButton active={tab === "sources"} onClick={() => setTab("sources")}>
              Nguồn {sources.length > 0 && `(${sources.length})`}
            </TabButton>
            <TabButton active={tab === "history"} onClick={() => setTab("history")}>
              Lịch sử
            </TabButton>
          </div>
        </div>
      </div>

      <NoticeBanner notice={notice} onDismiss={() => setNotice(null)} />

      <div className="flex-1 overflow-y-auto scrollbar-thin p-5">
        {overviewQuery.isLoading ? (
          <LoadingRows />
        ) : overviewQuery.isError ? (
          <ErrorPanel
            error={overviewQuery.error}
            onRetry={() => void overviewQuery.refetch()}
          />
        ) : tab === "sources" ? (
          sources.length === 0 ? (
            <EmptySources onCreate={() => setView({ mode: "form", source: null })} />
          ) : (
            <ul className="space-y-2.5">
              {sources.map((source) => (
                <SourceCard
                  key={source.id}
                  source={source}
                  disabled={busy}
                  onRun={() => runMut.mutate(source.id)}
                  onToggle={() =>
                    toggleMut.mutate({ id: source.id, enabled: !source.enabled })
                  }
                  onEdit={() => setView({ mode: "form", source })}
                  onDelete={() => void onDelete(source)}
                />
              ))}
            </ul>
          )
        ) : runs.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
            Chưa có lần chạy nào.
          </p>
        ) : (
          <ul className="space-y-2">
            {runs.map((run) => (
              <RunRow key={run.id} run={run} />
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

/* -------------------- Source card -------------------- */

function SourceCard({
  source,
  disabled,
  onRun,
  onToggle,
  onEdit,
  onDelete,
}: {
  source: JobSyncSource;
  disabled: boolean;
  onRun: () => void;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <li className="rounded-xl border border-border bg-card p-3.5 shadow-soft">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="truncate font-semibold">{source.name}</span>
            {source.lastStatus && <RunStatusBadge status={source.lastStatus} />}
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Repeat className="h-3.5 w-3.5" />
              {scheduleSummary(source.schedule)}
            </span>
            <span className="inline-flex items-center gap-1">
              <CalendarClock className="h-3.5 w-3.5" />
              {source.nextRunAt
                ? `Kế tiếp ${formatTime(source.nextRunAt)}`
                : source.enabled
                  ? "Đang lên lịch…"
                  : "Đã tắt"}
            </span>
          </div>
          <div className="mt-2 flex flex-wrap gap-1">
            {source.queries.slice(0, 6).map((q) => (
              <span
                key={q}
                className="rounded-md bg-muted px-1.5 py-0.5 text-2xs font-medium text-muted-foreground"
              >
                {q}
              </span>
            ))}
            {source.queries.length > 6 && (
              <span className="text-2xs text-muted-foreground/70">
                +{source.queries.length - 6}
              </span>
            )}
          </div>
        </div>

        <button
          type="button"
          onClick={onToggle}
          disabled={disabled}
          aria-pressed={source.enabled}
          aria-label={source.enabled ? "Tắt nguồn" : "Bật nguồn"}
          className={cn(
            "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors disabled:opacity-50",
            source.enabled ? "bg-dot-green" : "bg-muted-foreground/30",
          )}
        >
          <span
            className={cn(
              "inline-block h-4 w-4 transform rounded-full bg-white transition-transform",
              source.enabled ? "translate-x-4" : "translate-x-0.5",
            )}
          />
        </button>
      </div>

      <div className="mt-3 flex items-center gap-1.5 border-t border-border pt-2.5">
        <button
          type="button"
          onClick={onRun}
          disabled={disabled}
          className="inline-flex h-8 items-center gap-1.5 rounded-md bg-dot-orange/10 px-2.5 text-xs font-medium text-dot-orange transition-colors hover:bg-dot-orange/20 disabled:opacity-50"
        >
          <Play className="h-3.5 w-3.5" /> Chạy ngay
        </button>
        <button
          type="button"
          onClick={onEdit}
          disabled={disabled}
          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-input bg-background px-2.5 text-xs font-medium text-foreground transition-colors hover:bg-accent disabled:opacity-50"
        >
          <Pencil className="h-3.5 w-3.5" /> Sửa
        </button>
        <button
          type="button"
          onClick={onDelete}
          disabled={disabled}
          className="ml-auto inline-flex h-8 items-center gap-1.5 rounded-md border border-input bg-background px-2.5 text-xs font-medium text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-50"
        >
          <Trash2 className="h-3.5 w-3.5" /> Xóa
        </button>
      </div>
    </li>
  );
}

/* -------------------- Run row -------------------- */

function RunRow({ run }: { run: JobSyncRun }) {
  return (
    <li className="rounded-xl border border-border bg-card px-3.5 py-3 shadow-soft">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <RunStatusBadge status={run.status} />
          <span className="truncate text-sm font-medium">{run.sourceName}</span>
        </div>
        <span className="shrink-0 text-2xs text-muted-foreground">
          {run.trigger === "manual" ? "Thủ công" : "Theo lịch"}
        </span>
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <Clock className="h-3.5 w-3.5" />
          {formatTime(run.startedAt)}
        </span>
        <span className="tabular-nums">{formatDuration(run.durationMs)}</span>
        <span className="tabular-nums text-dot-green">+{run.jobsCreated} mới</span>
        <span className="tabular-nums">{run.jobsUpdated} cập nhật</span>
        {run.jobsFailed > 0 && (
          <span className="tabular-nums text-destructive">{run.jobsFailed} lỗi</span>
        )}
      </div>
      {run.errorMessage && (
        <p className="mt-1.5 line-clamp-2 rounded-md bg-destructive/5 px-2 py-1 text-2xs text-destructive">
          {run.errorMessage}
        </p>
      )}
    </li>
  );
}

/* -------------------- Form -------------------- */

interface Draft {
  name: string;
  queries: string[];
  cityId: number | null;
  districtIds: number[];
  hitsPerPage: number;
  maxPages: number;
  scheduleKind: "interval" | "daily";
  everyMinutes: number;
  times: string[];
  enabled: boolean;
}

function draftFrom(source: JobSyncSource | null): Draft {
  if (!source) {
    return {
      name: "",
      queries: [],
      cityId: 29,
      districtIds: [],
      hitsPerPage: 100,
      maxPages: 3,
      scheduleKind: "daily",
      everyMinutes: 360,
      times: ["08:00"],
      enabled: true,
    };
  }
  return {
    name: source.name,
    queries: source.queries,
    cityId: source.filters.cityId,
    districtIds: source.filters.districtIds,
    hitsPerPage: source.hitsPerPage,
    maxPages: source.maxPages,
    scheduleKind: source.schedule.kind,
    everyMinutes:
      source.schedule.kind === "interval" ? source.schedule.everyMinutes : 360,
    times: source.schedule.kind === "daily" ? source.schedule.times : ["08:00"],
    enabled: source.enabled,
  };
}

function SourceForm({
  source,
  onClose,
  onSaved,
}: {
  source: JobSyncSource | null;
  onClose: () => void;
  onSaved: (text: string) => void;
}) {
  const [draft, setDraft] = useState<Draft>(() => draftFrom(source));
  const [queryInput, setQueryInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const isEdit = source !== null;

  const set = <K extends keyof Draft>(key: K, value: Draft[K]): void =>
    setDraft((d) => ({ ...d, [key]: value }));

  const addQuery = (): void => {
    const value = queryInput.trim();
    if (!value) return;
    if (!draft.queries.includes(value)) set("queries", [...draft.queries, value]);
    setQueryInput("");
  };

  const mutation = useMutation({
    mutationFn: (payload: CreateJobSyncSourceInput) =>
      isEdit
        ? api.updateJobSyncSource(source.id, payload)
        : api.createJobSyncSource(payload),
    onSuccess: () =>
      onSaved(isEdit ? "Đã cập nhật nguồn đồng bộ." : "Đã tạo nguồn đồng bộ."),
    onError: (e) => setError(errMsg(e)),
  });

  const submit = (): void => {
    setError(null);
    if (!draft.name.trim()) return setError("Vui lòng nhập tên nguồn.");
    if (draft.queries.length === 0)
      return setError("Cần ít nhất một từ khóa tìm kiếm.");
    const schedule: JobSyncSchedule =
      draft.scheduleKind === "interval"
        ? { kind: "interval", everyMinutes: draft.everyMinutes }
        : { kind: "daily", times: draft.times };
    if (schedule.kind === "daily" && schedule.times.length === 0)
      return setError("Cần ít nhất một mốc giờ chạy.");

    mutation.mutate({
      name: draft.name.trim(),
      provider: "vietnamworks",
      queries: draft.queries,
      filters: { cityId: draft.cityId, districtIds: draft.districtIds },
      hitsPerPage: draft.hitsPerPage,
      maxPages: draft.maxPages,
      schedule,
      enabled: draft.enabled,
    });
  };

  return (
    <>
      <div className="flex items-center gap-2 border-b border-border p-5 pr-12">
        <button
          type="button"
          onClick={onClose}
          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          aria-label="Quay lại"
        >
          <X className="h-4 w-4" />
        </button>
        <SheetTitle className="text-lg leading-snug">
          {isEdit ? "Sửa nguồn đồng bộ" : "Thêm nguồn đồng bộ"}
        </SheetTitle>
      </div>

      {error && (
        <div className="mx-5 mt-4 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="flex-1 space-y-5 overflow-y-auto scrollbar-thin p-5">
        <Field label="Tên nguồn">
          <Input
            value={draft.name}
            onChange={(e) => set("name", e.target.value)}
            placeholder="VD: Developer tại HCM"
            maxLength={120}
          />
        </Field>

        <Field label="Từ khóa tìm kiếm" hint="Mỗi lần chạy sẽ quét lần lượt từng từ khóa.">
          <div className="flex gap-2">
            <Input
              value={queryInput}
              onChange={(e) => setQueryInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addQuery();
                }
              }}
              placeholder="VD: developer, react, java…"
              maxLength={100}
            />
            <Button type="button" variant="outline" onClick={addQuery}>
              Thêm
            </Button>
          </div>
          {draft.queries.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {draft.queries.map((q) => (
                <span
                  key={q}
                  className="inline-flex items-center gap-1 rounded-full border border-dot-orange/30 bg-dot-orange/10 py-0.5 pl-2.5 pr-1 text-xs font-medium text-dot-orange"
                >
                  {q}
                  <button
                    type="button"
                    onClick={() =>
                      set(
                        "queries",
                        draft.queries.filter((item) => item !== q),
                      )
                    }
                    aria-label={`Bỏ ${q}`}
                    className="rounded-full p-0.5 hover:bg-dot-orange/20"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Thành phố">
            <select
              value={draft.cityId === null ? "" : String(draft.cityId)}
              onChange={(e) =>
                set("cityId", e.target.value === "" ? null : Number(e.target.value))
              }
              className={selectClass}
            >
              {CITY_PRESETS.map((c) => (
                <option key={c.label} value={c.value === null ? "" : c.value}>
                  {c.label}
                </option>
              ))}
              {draft.cityId !== null &&
                !CITY_PRESETS.some((c) => c.value === draft.cityId) && (
                  <option value={draft.cityId}>Mã {draft.cityId}</option>
                )}
            </select>
          </Field>
          <Field label="Số trang / từ khóa">
            <select
              value={draft.maxPages}
              onChange={(e) => set("maxPages", Number(e.target.value))}
              className={selectClass}
            >
              {[1, 2, 3, 5, 8, 10].map((n) => (
                <option key={n} value={n}>
                  {n} trang
                </option>
              ))}
            </select>
            <p className="mt-1 text-2xs text-muted-foreground">100 việc mỗi trang.</p>
          </Field>
        </div>

        <Field label="Lịch chạy">
          <div className="flex gap-1.5">
            <ScheduleTab
              active={draft.scheduleKind === "interval"}
              onClick={() => set("scheduleKind", "interval")}
            >
              Khoảng lặp
            </ScheduleTab>
            <ScheduleTab
              active={draft.scheduleKind === "daily"}
              onClick={() => set("scheduleKind", "daily")}
            >
              Theo giờ hằng ngày
            </ScheduleTab>
          </div>

          {draft.scheduleKind === "interval" ? (
            <div className="mt-2.5">
              <label className="text-xs text-muted-foreground">Chạy mỗi</label>
              <select
                value={draft.everyMinutes}
                onChange={(e) => set("everyMinutes", Number(e.target.value))}
                className={cn(selectClass, "mt-1")}
              >
                {INTERVAL_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <DailyTimesEditor
              times={draft.times}
              onChange={(times) => set("times", times)}
            />
          )}
        </Field>

        <label className="flex items-center justify-between rounded-xl border border-border bg-card px-3.5 py-3">
          <span className="text-sm font-medium">Bật lịch tự động</span>
          <input
            type="checkbox"
            checked={draft.enabled}
            onChange={(e) => set("enabled", e.target.checked)}
            className="h-4 w-4 accent-dot-green"
          />
        </label>
      </div>

      <div className="flex items-center gap-2 border-t border-border p-4">
        <Button
          type="button"
          onClick={submit}
          disabled={mutation.isPending}
          className="flex-1"
        >
          {mutation.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : isEdit ? (
            "Lưu thay đổi"
          ) : (
            "Tạo nguồn"
          )}
        </Button>
        <Button type="button" variant="outline" onClick={onClose}>
          Hủy
        </Button>
      </div>
    </>
  );
}

function DailyTimesEditor({
  times,
  onChange,
}: {
  times: string[];
  onChange: (times: string[]) => void;
}) {
  return (
    <div className="mt-2.5 space-y-2">
      {times.map((time, index) => (
        <div key={index} className="flex items-center gap-2">
          <input
            type="time"
            value={time}
            onChange={(e) => {
              const next = [...times];
              next[index] = e.target.value;
              onChange(next);
            }}
            className={cn(selectClass, "w-32")}
          />
          {times.length > 1 && (
            <button
              type="button"
              onClick={() => onChange(times.filter((_, i) => i !== index))}
              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-destructive"
              aria-label="Xóa mốc giờ"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      ))}
      {times.length < 12 && (
        <button
          type="button"
          onClick={() => onChange([...times, "18:00"])}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-dot-orange hover:text-dot-orange/80"
        >
          <Plus className="h-3.5 w-3.5" /> Thêm mốc giờ
        </button>
      )}
    </div>
  );
}

/* -------------------- Status + pieces -------------------- */

type Tone = "green" | "red" | "blue" | "amber";

const STATUS_META: Record<
  JobSyncRunStatus,
  { label: string; tone: Tone; icon: ComponentType<{ className?: string }> }
> = {
  success: { label: "Thành công", tone: "green", icon: CheckCircle2 },
  partial: { label: "Một phần", tone: "amber", icon: AlertTriangle },
  error: { label: "Lỗi", tone: "red", icon: XCircle },
  running: { label: "Đang chạy", tone: "blue", icon: Loader2 },
};

const TONE_BADGE: Record<Tone, string> = {
  green: "bg-dot-green/10 text-dot-green",
  red: "bg-destructive/10 text-destructive",
  blue: "bg-dot-blue/10 text-dot-blue",
  amber: "bg-dot-orange/10 text-dot-orange",
};

function RunStatusBadge({ status }: { status: JobSyncRunStatus }) {
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

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded px-2.5 py-1 text-xs font-medium transition-colors",
        active
          ? "bg-dot-orange/10 text-dot-orange"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function ScheduleTab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex-1 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors",
        active
          ? "border-dot-orange/30 bg-dot-orange/10 text-dot-orange"
          : "border-input bg-background text-foreground hover:bg-accent",
      )}
    >
      {children}
    </button>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label className="text-sm font-medium">{label}</label>
      {hint && <p className="mb-1.5 mt-0.5 text-2xs text-muted-foreground">{hint}</p>}
      <div className={hint ? "" : "mt-1.5"}>{children}</div>
    </div>
  );
}

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
        aria-label="Đóng"
        className="opacity-70 hover:opacity-100"
      >
        <XCircle className="h-4 w-4" />
      </button>
    </div>
  );
}

function EmptySources({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="mx-auto flex max-w-sm flex-col items-center gap-3 py-16 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-dot-orange/10 text-dot-orange">
        <Repeat className="h-5 w-5" />
      </div>
      <div>
        <h2 className="text-base font-semibold">Chưa có nguồn đồng bộ</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Tạo một nguồn để tự động kéo việc làm từ VietnamWorks theo lịch.
        </p>
      </div>
      <button
        type="button"
        onClick={onCreate}
        className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
      >
        <Plus className="h-4 w-4" /> Thêm nguồn
      </button>
    </div>
  );
}

function LoadingRows() {
  return (
    <ul className="space-y-2.5">
      {Array.from({ length: 4 }).map((_, i) => (
        <li
          key={i}
          className="h-24 animate-pulse rounded-xl border border-border bg-muted/40"
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
  return (
    <div className="mx-auto flex max-w-sm flex-col items-center gap-3 py-16 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-dot-orange/10 text-dot-orange">
        <AlertTriangle className="h-5 w-5" />
      </div>
      <p className="text-sm text-muted-foreground">{errMsg(error)}</p>
      <button
        type="button"
        onClick={onRetry}
        className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted"
      >
        <RefreshCw className="h-4 w-4" /> Thử lại
      </button>
    </div>
  );
}

/* -------------------- Helpers -------------------- */

const selectClass =
  "h-9 w-full rounded-md border border-input bg-background px-2.5 text-sm text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

function scheduleSummary(schedule: JobSyncSchedule): string {
  if (schedule.kind === "interval") {
    const opt = INTERVAL_OPTIONS.find((o) => o.value === schedule.everyMinutes);
    return `Mỗi ${opt?.label ?? `${schedule.everyMinutes} phút`}`;
  }
  return `Hằng ngày ${schedule.times.join(", ")}`;
}

function formatTime(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDuration(ms: number | null): string {
  if (ms == null) return "—";
  if (ms < 1000) return `${ms}ms`;
  const sec = ms / 1000;
  if (sec < 60) return `${sec.toFixed(1)}s`;
  const m = Math.floor(sec / 60);
  const s = Math.round(sec - m * 60);
  return `${m}m ${s}s`;
}

function errMsg(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return "Đã xảy ra lỗi.";
}
