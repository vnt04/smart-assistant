import { useMemo, useState, type ComponentType, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  Briefcase,
  Building2,
  CalendarClock,
  CalendarX2,
  Code2,
  Layers,
  Loader2,
  MapPin,
  RefreshCw,
  Sparkles,
  Target,
  TrendingUp,
  Wallet,
} from "lucide-react";
import {
  DEFAULT_JOB_MATCH_PROFILE,
  scoreJob,
  type Job,
  type JobMatchProfile,
  type JobMatchResult,
  type JobMatchTier,
} from "@assistant/shared";
import { MatchBadge } from "../components/jobs/MatchBadge";
import { CompanyLogo } from "../components/jobs/CompanyLogo";
import { api } from "../lib/api";
import { cn } from "../lib/cn";

const DAY_MS = 24 * 60 * 60 * 1000;
const TREND_DAYS = 30;

export function JobStatsPage() {
  const [now] = useState(() => Date.now());

  const jobsQuery = useQuery({
    queryKey: ["jobs", [] as string[]],
    queryFn: () => api.listJobs([]),
  });
  const profileQuery = useQuery({
    queryKey: ["job-match-profile"],
    queryFn: api.getJobMatchProfile,
  });

  const jobs = useMemo(() => jobsQuery.data ?? [], [jobsQuery.data]);
  const profile = profileQuery.data ?? DEFAULT_JOB_MATCH_PROFILE;
  const matchEnabled = profile.enabled;

  const scored = useMemo(() => {
    const map = new Map<string, JobMatchResult>();
    if (matchEnabled) {
      for (const job of jobs) map.set(job.id, scoreJob(job, profile, now));
    }
    return map;
  }, [jobs, profile, matchEnabled, now]);

  const stats = useMemo(
    () => computeStats(jobs, scored, matchEnabled, now),
    [jobs, scored, matchEnabled, now],
  );

  return (
    <div className="h-full overflow-y-auto scrollbar-thin">
      <div className="mx-auto max-w-6xl space-y-5 p-4 sm:p-6">
        <Header
          total={jobs.length}
          loading={jobsQuery.isFetching}
          onRefresh={() => void jobsQuery.refetch()}
        />

        {jobsQuery.isLoading ? (
          <LoadingState />
        ) : jobsQuery.isError ? (
          <ErrorState onRetry={() => void jobsQuery.refetch()} />
        ) : jobs.length === 0 ? (
          <EmptyState />
        ) : (
          <StatsContent stats={stats} matchEnabled={matchEnabled} />
        )}
      </div>
    </div>
  );
}

/* -------------------- Header -------------------- */

function Header({
  total,
  loading,
  onRefresh,
}: {
  total: number;
  loading: boolean;
  onRefresh: () => void;
}) {
  return (
    <header className="flex flex-wrap items-center gap-3">
      <Link
        to="/job"
        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-input text-foreground transition-colors hover:bg-accent"
        aria-label="Quay lại danh sách"
        title="Quay lại"
      >
        <ArrowLeft className="h-4 w-4" />
      </Link>
      <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-dot-orange/10 text-dot-orange">
        <TrendingUp className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">
        <h1 className="text-2xl font-bold leading-tight">Thống kê tuyển dụng</h1>
        <p className="text-sm text-muted-foreground">
          Phân tích trên toàn bộ{" "}
          <span className="font-medium text-foreground/80">{total}</span> công
          việc đã thu thập.
        </p>
      </div>
      <button
        type="button"
        onClick={onRefresh}
        disabled={loading}
        className="inline-flex h-9 items-center gap-1.5 rounded-md border border-input bg-background px-3 text-sm font-medium transition-colors hover:bg-accent disabled:opacity-50"
      >
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <RefreshCw className="h-4 w-4" />
        )}
        Làm mới
      </button>
    </header>
  );
}

/* -------------------- Nội dung -------------------- */

function StatsContent({
  stats,
  matchEnabled,
}: {
  stats: Stats;
  matchEnabled: boolean;
}) {
  return (
    <div className="space-y-5">
      {/* KPI */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <StatCard
          icon={Briefcase}
          tone="orange"
          value={fmtInt(stats.total)}
          label="Tổng công việc"
        />
        <StatCard
          icon={CalendarClock}
          tone="green"
          value={fmtInt(stats.new7)}
          label="Mới trong 7 ngày"
          sub={`${fmtInt(stats.new30)} trong 30 ngày`}
        />
        <StatCard
          icon={Building2}
          tone="blue"
          value={fmtInt(stats.companies)}
          label="Công ty tuyển dụng"
        />
        <StatCard
          icon={MapPin}
          tone="cyan"
          value={fmtInt(stats.locations)}
          label="Địa điểm"
        />
        <StatCard
          icon={Wallet}
          tone="purple"
          value={stats.medianSalary > 0 ? fmtVndShort(stats.medianSalary) : "—"}
          label="Lương trung vị"
          sub={`${stats.disclosedPct}% có công khai lương`}
        />
        <StatCard
          icon={Code2}
          tone="pink"
          value={fmtInt(stats.techCount)}
          label="Công nghệ khác nhau"
        />
        <StatCard
          icon={Sparkles}
          tone="orange"
          value={matchEnabled && stats.matchAvg > 0 ? `${stats.matchAvg}%` : "—"}
          label={matchEnabled ? "Độ phù hợp TB" : "Barem đang tắt"}
          sub={
            matchEnabled
              ? `${fmtInt(stats.matchExcellent)} rất phù hợp (≥80%)`
              : undefined
          }
        />
        <StatCard
          icon={CalendarX2}
          tone="red"
          value={fmtInt(stats.closingSoon)}
          label="Hết hạn ≤ 7 ngày"
        />
      </div>

      {/* Lương + xu hướng */}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <SalaryCard stats={stats} />
        <TrendCard trend={stats.trend} peak={stats.trendPeak} />
      </div>

      {/* Phân bổ */}
      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard icon={Layers} tone="blue" title="Theo cấp bậc">
          <BarList items={stats.byLevel} max={stats.byLevelMax} tone="blue" />
        </ChartCard>
        <ChartCard icon={Briefcase} tone="green" title="Theo hình thức">
          <BarList items={stats.byType} max={stats.byTypeMax} tone="green" />
        </ChartCard>
        <ChartCard icon={Target} tone="cyan" title="Theo nguồn">
          <BarList
            items={stats.bySource}
            max={stats.bySourceMax}
            tone="cyan"
            renderLabel={sourceLabel}
          />
        </ChartCard>
        <ChartCard icon={MapPin} tone="purple" title="Top địa điểm">
          <BarList
            items={stats.byLocation}
            max={stats.byLocationMax}
            tone="purple"
          />
        </ChartCard>
      </div>

      {/* Lương phân bổ + top công ty */}
      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard icon={Wallet} tone="orange" title="Phân bổ mức lương">
          <BarList
            items={stats.salaryBuckets}
            max={stats.salaryBucketsMax}
            tone="orange"
          />
        </ChartCard>
        <ChartCard icon={Building2} tone="blue" title="Top công ty tuyển nhiều">
          <BarList
            items={stats.topCompanies}
            max={stats.topCompaniesMax}
            tone="blue"
          />
        </ChartCard>
      </div>

      {/* Công nghệ */}
      <ChartCard
        icon={Code2}
        tone="pink"
        title="Công nghệ được yêu cầu nhiều nhất"
      >
        <BarList items={stats.topTechs} max={stats.topTechsMax} tone="pink" />
      </ChartCard>

      {/* Độ phù hợp */}
      {matchEnabled ? (
        <MatchSection stats={stats} />
      ) : (
        <MatchDisabledHint />
      )}

      {/* Deadline */}
      {stats.deadlines.length > 0 && (
        <ChartCard icon={CalendarX2} tone="red" title="Sắp hết hạn nộp">
          <ul className="divide-y divide-border/60">
            {stats.deadlines.map(({ job, daysLeft }) => (
              <li
                key={job.id}
                className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0"
              >
                <CompanyLogo src={job.companyLogo} name={job.company} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{job.title}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {job.company || "—"}
                  </p>
                </div>
                <span
                  className={cn(
                    "shrink-0 rounded-full px-2 py-0.5 text-2xs font-semibold tabular-nums",
                    daysLeft <= 2
                      ? "bg-destructive/10 text-destructive"
                      : "bg-dot-orange/10 text-dot-orange",
                  )}
                >
                  {daysLeft === 0 ? "Hôm nay" : `Còn ${daysLeft} ngày`}
                </span>
              </li>
            ))}
          </ul>
        </ChartCard>
      )}
    </div>
  );
}

/* -------------------- Lương -------------------- */

function SalaryCard({ stats }: { stats: Stats }) {
  const rows: Array<{ label: string; value: string }> = [
    { label: "Trung vị", value: fmtVndShort(stats.medianSalary) },
    { label: "Trung bình", value: fmtVndShort(stats.avgSalary) },
    { label: "Cao nhất", value: fmtVndShort(stats.maxSalary) },
    { label: "Thấp nhất", value: fmtVndShort(stats.minSalary) },
  ];
  return (
    <ChartCard icon={Wallet} tone="purple" title="Tổng quan lương">
      <div className="grid grid-cols-2 gap-3">
        {rows.map((r) => (
          <div
            key={r.label}
            className="rounded-xl border border-border bg-background px-3 py-2.5"
          >
            <div className="text-2xs uppercase tracking-wider text-muted-foreground">
              {r.label}
            </div>
            <div className="mt-0.5 text-lg font-bold leading-tight tabular-nums">
              {r.value}
            </div>
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        {fmtInt(stats.withSalaryCount)}/{fmtInt(stats.total)} tin công khai lương
        ({stats.disclosedPct}%). Đơn vị: VND/tháng, lấy mức trần làm đại diện.
      </p>
    </ChartCard>
  );
}

/* -------------------- Xu hướng -------------------- */

function TrendCard({
  trend,
  peak,
}: {
  trend: TrendPoint[];
  peak: number;
}) {
  return (
    <ChartCard
      icon={TrendingUp}
      tone="green"
      title="Xu hướng đăng tin"
      subtitle={`${TREND_DAYS} ngày gần nhất`}
    >
      <div className="flex h-36 items-end gap-[3px]">
        {trend.map((p) => {
          const pct = peak > 0 ? (p.count / peak) * 100 : 0;
          return (
            <div
              key={p.key}
              className="group relative flex h-full flex-1 items-end"
              title={`${p.label}: ${p.count} tin`}
            >
              <div
                className={cn(
                  "w-full rounded-t-sm transition-colors",
                  p.count > 0
                    ? "bg-dot-green/60 group-hover:bg-dot-green"
                    : "bg-muted",
                )}
                style={{ height: p.count > 0 ? `${Math.max(pct, 4)}%` : "2px" }}
              />
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex justify-between text-2xs text-muted-foreground">
        <span>{trend[0]?.label}</span>
        <span>{trend[Math.floor(trend.length / 2)]?.label}</span>
        <span>{trend[trend.length - 1]?.label}</span>
      </div>
    </ChartCard>
  );
}

/* -------------------- Độ phù hợp -------------------- */

const TIER_META: Record<JobMatchTier, { label: string; tone: Tone }> = {
  excellent: { label: "Rất phù hợp", tone: "green" },
  good: { label: "Phù hợp", tone: "blue" },
  fair: { label: "Tạm ổn", tone: "orange" },
  low: { label: "Thấp", tone: "red" },
};

function MatchSection({ stats }: { stats: Stats }) {
  const tierItems: CountItem[] = (
    ["excellent", "good", "fair", "low"] as JobMatchTier[]
  ).map((t) => ({ value: t, count: stats.tiers[t] }));
  const tierMax = Math.max(...tierItems.map((i) => i.count), 1);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <ChartCard icon={Sparkles} tone="orange" title="Phân bổ độ phù hợp">
        <ul className="space-y-2.5">
          {tierItems.map((it) => {
            const meta = TIER_META[it.value as JobMatchTier];
            return (
              <li key={it.value} className="min-w-0">
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="flex items-center gap-1.5 text-foreground/80">
                    <span
                      className={cn(
                        "h-2 w-2 rounded-full",
                        TONE_DOT[meta.tone],
                      )}
                    />
                    {meta.label}
                  </span>
                  <span className="shrink-0 tabular-nums text-muted-foreground">
                    {it.count}
                  </span>
                </div>
                <Bar pct={(it.count / tierMax) * 100} tone={meta.tone} />
              </li>
            );
          })}
        </ul>
      </ChartCard>

      <ChartCard icon={Target} tone="green" title="Top phù hợp nhất">
        {stats.topMatches.length === 0 ? (
          <EmptyHint>Chưa có job nào được chấm điểm.</EmptyHint>
        ) : (
          <ul className="divide-y divide-border/60">
            {stats.topMatches.map(({ job, result }) => (
              <li
                key={job.id}
                className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0"
              >
                <CompanyLogo src={job.companyLogo} name={job.company} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{job.title}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {job.company || "—"}
                  </p>
                </div>
                <MatchBadge score={result.score} tier={result.tier} />
              </li>
            ))}
          </ul>
        )}
      </ChartCard>
    </div>
  );
}

function MatchDisabledHint() {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-dashed border-border bg-card px-4 py-4 shadow-soft">
      <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-dot-orange/10 text-dot-orange">
        <Sparkles className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">Chưa bật barem chấm điểm</p>
        <p className="text-xs text-muted-foreground">
          Bật "Barem" ở danh sách công việc để xem phân tích độ phù hợp theo mong
          muốn của bạn.
        </p>
      </div>
      <Link
        to="/job"
        className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
      >
        <Target className="h-4 w-4" /> Mở Barem
      </Link>
    </div>
  );
}

/* -------------------- Pieces dùng chung -------------------- */

type Tone =
  | "orange"
  | "green"
  | "blue"
  | "purple"
  | "cyan"
  | "pink"
  | "red";

const TONE_CHIP: Record<Tone, string> = {
  orange: "bg-dot-orange/10 text-dot-orange",
  green: "bg-dot-green/10 text-dot-green",
  blue: "bg-dot-blue/10 text-dot-blue",
  purple: "bg-dot-purple/10 text-dot-purple",
  cyan: "bg-dot-cyan/10 text-dot-cyan",
  pink: "bg-dot-pink/10 text-dot-pink",
  red: "bg-destructive/10 text-destructive",
};

const TONE_BAR: Record<Tone, string> = {
  orange: "bg-dot-orange/60",
  green: "bg-dot-green/60",
  blue: "bg-dot-blue/60",
  purple: "bg-dot-purple/60",
  cyan: "bg-dot-cyan/60",
  pink: "bg-dot-pink/60",
  red: "bg-destructive/60",
};

const TONE_DOT: Record<Tone, string> = {
  orange: "bg-dot-orange",
  green: "bg-dot-green",
  blue: "bg-dot-blue",
  purple: "bg-dot-purple",
  cyan: "bg-dot-cyan",
  pink: "bg-dot-pink",
  red: "bg-destructive",
};

function StatCard({
  icon: Icon,
  tone,
  value,
  label,
  sub,
}: {
  icon: ComponentType<{ className?: string }>;
  tone: Tone;
  value: string;
  label: string;
  sub?: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-3.5 shadow-soft">
      <div className="flex items-center gap-2.5">
        <span
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl",
            TONE_CHIP[tone],
          )}
        >
          <Icon className="h-4 w-4" />
        </span>
        <div className="text-2xl font-bold leading-none tabular-nums">
          {value}
        </div>
      </div>
      <div className="mt-2.5 text-sm font-medium leading-tight">{label}</div>
      {sub && (
        <div className="mt-0.5 truncate text-2xs text-muted-foreground">
          {sub}
        </div>
      )}
    </div>
  );
}

function ChartCard({
  icon: Icon,
  tone,
  title,
  subtitle,
  children,
}: {
  icon: ComponentType<{ className?: string }>;
  tone: Tone;
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-border bg-card p-4 shadow-soft sm:p-5">
      <header className="mb-3.5 flex items-center gap-2.5">
        <span
          className={cn(
            "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
            TONE_CHIP[tone],
          )}
        >
          <Icon className="h-[18px] w-[18px]" />
        </span>
        <div className="min-w-0">
          <h2 className="text-sm font-semibold leading-tight">{title}</h2>
          {subtitle && (
            <p className="text-2xs text-muted-foreground">{subtitle}</p>
          )}
        </div>
      </header>
      {children}
    </section>
  );
}

function BarList({
  items,
  max,
  tone,
  renderLabel,
}: {
  items: CountItem[];
  max: number;
  tone: Tone;
  renderLabel?: (value: string) => string;
}) {
  if (items.length === 0) return <EmptyHint>Chưa có dữ liệu.</EmptyHint>;
  return (
    <ul className="space-y-2.5">
      {items.map((it) => (
        <li key={it.value} className="min-w-0">
          <div className="flex items-center justify-between gap-2 text-xs">
            <span className="truncate text-foreground/80">
              {renderLabel ? renderLabel(it.value) : it.value}
            </span>
            <span className="shrink-0 tabular-nums text-muted-foreground">
              {it.count}
            </span>
          </div>
          <Bar pct={(it.count / max) * 100} tone={tone} />
        </li>
      ))}
    </ul>
  );
}

function Bar({ pct, tone }: { pct: number; tone: Tone }) {
  return (
    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
      <div
        className={cn("h-full rounded-full", TONE_BAR[tone])}
        style={{ width: `${Math.max(pct, 2)}%` }}
      />
    </div>
  );
}

function EmptyHint({ children }: { children: ReactNode }) {
  return <p className="text-xs text-muted-foreground">{children}</p>;
}

function LoadingState() {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="h-24 animate-pulse rounded-2xl border border-border bg-muted/40"
          />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="h-48 animate-pulse rounded-2xl border border-border bg-muted/40"
          />
        ))}
      </div>
    </div>
  );
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border py-16 text-center">
      <p className="text-sm text-muted-foreground">
        Không tải được dữ liệu thống kê.
      </p>
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

function EmptyState() {
  return (
    <div className="rounded-2xl border border-dashed border-border py-16 text-center">
      <p className="text-sm text-muted-foreground">
        Chưa có công việc nào để thống kê.
      </p>
    </div>
  );
}

/* -------------------- Tính toán -------------------- */

interface CountItem {
  value: string;
  count: number;
}

interface TrendPoint {
  key: string;
  label: string;
  count: number;
}

interface Stats {
  total: number;
  new7: number;
  new30: number;
  companies: number;
  locations: number;
  techCount: number;
  closingSoon: number;

  withSalaryCount: number;
  disclosedPct: number;
  medianSalary: number;
  avgSalary: number;
  minSalary: number;
  maxSalary: number;

  matchAvg: number;
  matchExcellent: number;
  tiers: Record<JobMatchTier, number>;
  topMatches: Array<{ job: Job; result: JobMatchResult }>;

  byLevel: CountItem[];
  byLevelMax: number;
  byType: CountItem[];
  byTypeMax: number;
  bySource: CountItem[];
  bySourceMax: number;
  byLocation: CountItem[];
  byLocationMax: number;
  topCompanies: CountItem[];
  topCompaniesMax: number;
  topTechs: CountItem[];
  topTechsMax: number;
  salaryBuckets: CountItem[];
  salaryBucketsMax: number;

  trend: TrendPoint[];
  trendPeak: number;

  deadlines: Array<{ job: Job; daysLeft: number }>;
}

function computeStats(
  jobs: Job[],
  scored: Map<string, JobMatchResult>,
  matchEnabled: boolean,
  now: number,
): Stats {
  const reps = jobs
    .map(repSalary)
    .filter((n): n is number => n != null && n > 0)
    .sort((a, b) => a - b);
  const medianSalary = reps.length ? reps[Math.floor((reps.length - 1) / 2)] : 0;
  const avgSalary = reps.length
    ? Math.round(reps.reduce((s, n) => s + n, 0) / reps.length)
    : 0;

  let matchAvg = 0;
  let matchExcellent = 0;
  const tiers: Record<JobMatchTier, number> = {
    excellent: 0,
    good: 0,
    fair: 0,
    low: 0,
  };
  let topMatches: Array<{ job: Job; result: JobMatchResult }> = [];
  if (matchEnabled && jobs.length > 0) {
    let sum = 0;
    for (const job of jobs) {
      const r = scored.get(job.id);
      if (!r) continue;
      sum += r.score;
      tiers[r.tier] += 1;
      if (r.score >= 80) matchExcellent += 1;
    }
    matchAvg = Math.round(sum / jobs.length);
    topMatches = jobs
      .map((job) => ({ job, result: scored.get(job.id) }))
      .filter(
        (x): x is { job: Job; result: JobMatchResult } => x.result != null,
      )
      .sort((a, b) => b.result.score - a.result.score)
      .slice(0, 5);
  }

  const trend = buildTrend(jobs, now, TREND_DAYS);

  const byLevel = countBy(jobs, (j) => j.level).slice(0, 6);
  const byType = countBy(jobs, (j) => j.employmentType).slice(0, 6);
  const bySource = countBy(jobs, (j) => j.source).slice(0, 6);
  const byLocation = countBy(jobs, (j) => normalizeLocation(j.location)).slice(
    0,
    8,
  );
  const topCompanies = countBy(jobs, (j) => j.company || null).slice(0, 8);
  const allTechs = countTechs(jobs);
  const topTechs = allTechs.slice(0, 12);
  const salaryBuckets = buildSalaryBuckets(jobs);

  return {
    total: jobs.length,
    new7: jobs.filter((j) => withinDays(j, 7, now)).length,
    new30: jobs.filter((j) => withinDays(j, 30, now)).length,
    companies: distinctCount(jobs, (j) => j.company || null),
    locations: distinctCount(jobs, (j) => normalizeLocation(j.location)),
    techCount: allTechs.length,
    closingSoon: jobs.filter((j) => {
      const d = deadlineDaysLeft(j, now);
      return d != null && d <= 7;
    }).length,

    withSalaryCount: reps.length,
    disclosedPct: jobs.length
      ? Math.round((reps.length / jobs.length) * 100)
      : 0,
    medianSalary,
    avgSalary,
    minSalary: reps[0] ?? 0,
    maxSalary: reps[reps.length - 1] ?? 0,

    matchAvg,
    matchExcellent,
    tiers,
    topMatches,

    byLevel,
    byLevelMax: maxCount(byLevel),
    byType,
    byTypeMax: maxCount(byType),
    bySource,
    bySourceMax: maxCount(bySource),
    byLocation,
    byLocationMax: maxCount(byLocation),
    topCompanies,
    topCompaniesMax: maxCount(topCompanies),
    topTechs,
    topTechsMax: maxCount(topTechs),
    salaryBuckets,
    salaryBucketsMax: maxCount(salaryBuckets),

    trend,
    trendPeak: Math.max(...trend.map((p) => p.count), 1),

    deadlines: upcomingDeadlines(jobs, now, 14, 6),
  };
}

/** Lương đại diện (VND): ưu tiên trần, rồi sàn; thỏa thuận → null. */
function repSalary(job: Job): number | null {
  return job.salaryMax ?? job.salaryMin ?? null;
}

function jobTimeMs(job: Job): number {
  const t = new Date(job.postedAt ?? job.crawlAt).getTime();
  return Number.isNaN(t) ? 0 : t;
}

function withinDays(job: Job, days: number, now: number): boolean {
  const t = jobTimeMs(job);
  if (!t) return false;
  return now - t <= days * DAY_MS;
}

/** Số ngày còn lại tới hạn nộp; quá hạn hoặc không rõ → null. */
function deadlineDaysLeft(job: Job, now: number): number | null {
  if (!job.deadline) return null;
  const t = new Date(job.deadline).getTime();
  if (Number.isNaN(t) || t < now) return null;
  return Math.ceil((t - now) / DAY_MS);
}

function upcomingDeadlines(
  jobs: Job[],
  now: number,
  withinDays: number,
  limit: number,
): Array<{ job: Job; daysLeft: number }> {
  return jobs
    .map((job) => ({ job, daysLeft: deadlineDaysLeft(job, now) }))
    .filter(
      (x): x is { job: Job; daysLeft: number } =>
        x.daysLeft != null && x.daysLeft <= withinDays,
    )
    .sort((a, b) => a.daysLeft - b.daysLeft)
    .slice(0, limit);
}

function countBy(
  jobs: Job[],
  pick: (job: Job) => string | null,
): CountItem[] {
  const map = new Map<string, number>();
  for (const job of jobs) {
    const value = pick(job);
    if (!value) continue;
    map.set(value, (map.get(value) ?? 0) + 1);
  }
  return [...map.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
}

function countTechs(jobs: Job[]): CountItem[] {
  const map = new Map<string, number>();
  for (const job of jobs) {
    for (const raw of job.techStack) {
      const value = raw.trim();
      if (!value) continue;
      map.set(value, (map.get(value) ?? 0) + 1);
    }
  }
  return [...map.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
}

function distinctCount(jobs: Job[], pick: (job: Job) => string | null): number {
  const set = new Set<string>();
  for (const job of jobs) {
    const value = pick(job);
    if (value) set.add(value);
  }
  return set.size;
}

const SALARY_BUCKETS: Array<{ label: string; max: number }> = [
  { label: "Dưới 15tr", max: 15_000_000 },
  { label: "15 – 30tr", max: 30_000_000 },
  { label: "30 – 50tr", max: 50_000_000 },
  { label: "Trên 50tr", max: Infinity },
];

function buildSalaryBuckets(jobs: Job[]): CountItem[] {
  const counts = SALARY_BUCKETS.map(() => 0);
  let negotiable = 0;
  for (const job of jobs) {
    const rep = repSalary(job);
    if (rep == null || rep <= 0) {
      negotiable += 1;
      continue;
    }
    const idx = SALARY_BUCKETS.findIndex((b) => rep < b.max);
    counts[idx === -1 ? SALARY_BUCKETS.length - 1 : idx] += 1;
  }
  const items: CountItem[] = SALARY_BUCKETS.map((b, i) => ({
    value: b.label,
    count: counts[i],
  }));
  items.push({ value: "Thỏa thuận", count: negotiable });
  return items.filter((it) => it.count > 0);
}

function buildTrend(jobs: Job[], now: number, days: number): TrendPoint[] {
  const counts = new Map<string, number>();
  for (const job of jobs) {
    const t = jobTimeMs(job);
    if (!t) continue;
    const key = dayKey(new Date(t));
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const today = new Date(now);
  const points: TrendPoint[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today.getTime() - i * DAY_MS);
    points.push({
      key: dayKey(d),
      label: `${d.getDate()}/${d.getMonth() + 1}`,
      count: counts.get(dayKey(d)) ?? 0,
    });
  }
  return points;
}

/** Khóa theo ngày-tháng-năm địa phương (tránh lệch múi giờ khi gom nhóm). */
function dayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

/** Gộp địa điểm về thành phố chính (lấy phần trước dấu phẩy đầu tiên). */
function normalizeLocation(location: string): string | null {
  const trimmed = location.trim();
  if (!trimmed) return null;
  const main = trimmed.split(/[,/]/)[0]?.trim();
  return main || trimmed;
}

function maxCount(items: CountItem[]): number {
  return Math.max(...items.map((i) => i.count), 1);
}

/* -------------------- Định dạng -------------------- */

function fmtInt(n: number): string {
  return new Intl.NumberFormat("vi-VN").format(n);
}

function fmtVndShort(n: number): string {
  if (n <= 0) return "—";
  if (n >= 1_000_000) {
    const m = n / 1_000_000;
    return `${Number.isInteger(m) ? m : m.toFixed(1)}tr`;
  }
  return new Intl.NumberFormat("vi-VN").format(n);
}

const SOURCE_LABELS: Record<string, string> = {
  linkedin: "LinkedIn",
  topcv: "TopCV",
  vietnamworks: "VietnamWorks",
  itviec: "ITviec",
};

function sourceLabel(source: string): string {
  return SOURCE_LABELS[source.toLowerCase()] ?? source;
}
