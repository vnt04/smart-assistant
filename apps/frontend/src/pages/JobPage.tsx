import { useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Job } from "@assistant/shared";
import {
  Briefcase,
  Building2,
  Calendar,
  Clock,
  ExternalLink,
  Loader2,
  MapPin,
  RefreshCw,
  Search,
  Sparkles,
  Trash2,
  Users,
} from "lucide-react";
import { Button } from "../components/ui/button";
import { useConfirm } from "../components/ui/confirm-dialog";
import { Input } from "../components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetTitle,
} from "../components/ui/sheet";
import { api } from "../lib/api";
import { cn } from "../lib/cn";

type SortKey = "crawl" | "fit" | "posted";
type FitTier = "high" | "mid" | "low";

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "crawl", label: "Mới crawl" },
  { value: "fit", label: "Độ phù hợp" },
  { value: "posted", label: "Mới đăng" },
];

export function JobPage() {
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const jobsQuery = useQuery({ queryKey: ["jobs"], queryFn: api.listJobs });

  const [search, setSearch] = useState("");
  const [level, setLevel] = useState("");
  const [source, setSource] = useState("");
  const [sort, setSort] = useState<SortKey>("crawl");
  const [selected, setSelected] = useState<Job | null>(null);

  const deleteMutation = useMutation({
    mutationFn: api.deleteJob,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["jobs"] });
      setSelected(null);
    },
  });

  const jobs = jobsQuery.data ?? [];

  const levels = useMemo(() => uniqueValues(jobs.map((j) => j.level)), [jobs]);
  const sources = useMemo(() => uniqueValues(jobs.map((j) => j.source)), [jobs]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    const result = jobs.filter((job) => {
      if (level && job.level !== level) return false;
      if (source && job.source !== source) return false;
      if (!query) return true;
      return (
        job.title.toLowerCase().includes(query) ||
        job.company.toLowerCase().includes(query) ||
        job.location.toLowerCase().includes(query) ||
        job.techStack.some((t) => t.toLowerCase().includes(query))
      );
    });
    return sortJobs(result, sort);
  }, [jobs, search, level, source, sort]);

  async function handleDelete(job: Job): Promise<void> {
    const confirmed = await confirm({
      title: `Xóa “${job.title}”?`,
      description: "Công việc này sẽ bị xóa khỏi danh sách.",
      confirmText: "Xóa",
      variant: "destructive",
    });
    if (confirmed) deleteMutation.mutate(job.id);
  }

  return (
    <div className="h-full overflow-y-auto scrollbar-thin">
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 md:px-10 md:py-12">
        <header className="relative animate-fade-in">
          <div className="pointer-events-none absolute -left-10 -top-16 h-40 w-40 rounded-full bg-dot-orange/10 blur-3xl" />
          <div className="relative flex min-w-0 items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-dot-orange/10 text-dot-orange ring-1 ring-inset ring-dot-orange/20">
              <Briefcase className="h-6 w-6" />
            </span>
            <div className="min-w-0">
              <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
                Jobs
              </h1>
              <p className="mt-0.5 text-sm text-muted-foreground">
                Cơ hội nghề nghiệp được thu thập tự động.
              </p>
            </div>
          </div>
        </header>

        {/* Thanh công cụ: tìm kiếm + lọc + sắp xếp */}
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Tìm theo chức danh, công ty, kỹ năng…"
              className="h-9 pl-9"
              aria-label="Tìm việc"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <FilterSelect
              value={level}
              onChange={setLevel}
              ariaLabel="Lọc theo cấp bậc"
              allLabel="Mọi cấp bậc"
              options={levels}
            />
            {sources.length > 1 && (
              <FilterSelect
                value={source}
                onChange={setSource}
                ariaLabel="Lọc theo nguồn"
                allLabel="Mọi nguồn"
                options={sources}
                renderLabel={sourceLabel}
              />
            )}
            <FilterSelect
              value={sort}
              onChange={(v) => setSort(v as SortKey)}
              ariaLabel="Sắp xếp"
              options={SORT_OPTIONS.map((o) => o.value)}
              renderLabel={(v) =>
                SORT_OPTIONS.find((o) => o.value === v)?.label ?? v
              }
            />
          </div>
        </div>

        <div className="mt-6">
          {jobsQuery.isLoading ? (
            <LoadingState />
          ) : jobsQuery.isError ? (
            <ErrorState onRetry={() => void jobsQuery.refetch()} />
          ) : jobs.length === 0 ? (
            <EmptyState />
          ) : filtered.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
              Không có công việc nào khớp bộ lọc.
            </p>
          ) : (
            <>
              <SectionLabel>{filtered.length} công việc</SectionLabel>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {filtered.map((job, index) => (
                  <JobCard
                    key={job.id}
                    job={job}
                    delayMs={Math.min(index * 35, 280)}
                    onOpen={() => setSelected(job)}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      <Sheet
        open={selected !== null}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
      >
        <SheetContent
          side="right"
          className="flex w-full max-w-[92vw] flex-col gap-0 p-0 sm:w-[560px]"
        >
          {selected && (
            <JobDetail
              job={selected}
              onDelete={() => handleDelete(selected)}
              isDeleting={deleteMutation.isPending}
            />
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

/* -------------------- Card -------------------- */

function JobCard({
  job,
  delayMs,
  onOpen,
}: {
  job: Job;
  delayMs: number;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      style={{ animationDelay: `${delayMs}ms`, animationFillMode: "both" }}
      className="group flex animate-fade-in flex-col gap-3 rounded-2xl border border-border bg-card p-4 text-left shadow-soft transition-all duration-200 hover:-translate-y-0.5 hover:shadow-pop focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-dot-orange/40"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="truncate font-semibold leading-snug">{job.title}</h3>
          <div className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
            <Building2 className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{job.company || "—"}</span>
          </div>
        </div>
        {typeof job.fitScore === "number" && job.fitScore > 0 && (
          <FitBadge score={job.fitScore} />
        )}
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        {job.location && (
          <span className="inline-flex items-center gap-1">
            <MapPin className="h-3.5 w-3.5" />
            <span className="truncate">{job.location}</span>
          </span>
        )}
        {job.employmentType && (
          <span className="inline-flex items-center gap-1">
            <Clock className="h-3.5 w-3.5" />
            {job.employmentType}
          </span>
        )}
      </div>

      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-sm font-medium text-foreground/90">
          {formatSalary(job.salaryMin, job.salaryMax, job.salaryCurrency)}
        </span>
        <div className="flex shrink-0 items-center gap-1.5">
          {job.level && <Pill>{job.level}</Pill>}
          <SourcePill source={job.source} />
        </div>
      </div>

      {job.techStack.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {job.techStack.slice(0, 5).map((tech) => (
            <span
              key={tech}
              className="rounded-md bg-muted px-1.5 py-0.5 text-2xs font-medium text-muted-foreground"
            >
              {tech}
            </span>
          ))}
          {job.techStack.length > 5 && (
            <span className="rounded-md px-1.5 py-0.5 text-2xs text-muted-foreground/70">
              +{job.techStack.length - 5}
            </span>
          )}
        </div>
      )}
    </button>
  );
}

/* -------------------- Detail Sheet -------------------- */

function JobDetail({
  job,
  onDelete,
  isDeleting,
}: {
  job: Job;
  onDelete: () => void;
  isDeleting: boolean;
}) {
  const postedAt = formatDate(job.postedAt);
  const deadline = formatDate(job.deadline);

  return (
    <>
      <div className="border-b border-border p-5 pr-12">
        <div className="flex items-center gap-2">
          <SourcePill source={job.source} />
          {job.level && <Pill>{job.level}</Pill>}
          {job.employmentType && <Pill>{job.employmentType}</Pill>}
        </div>
        <SheetTitle className="mt-2 text-xl leading-snug">
          {job.title}
        </SheetTitle>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Building2 className="h-4 w-4" />
            {job.company || "—"}
          </span>
          {job.location && (
            <span className="inline-flex items-center gap-1">
              <MapPin className="h-4 w-4" />
              {job.location}
            </span>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin p-5">
        <div className="grid grid-cols-2 gap-3">
          <InfoTile label="Mức lương">
            {formatSalary(job.salaryMin, job.salaryMax, job.salaryCurrency)}
          </InfoTile>
          {typeof job.fitScore === "number" && job.fitScore > 0 && (
            <InfoTile label="Độ phù hợp">
              <span className="inline-flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5 text-dot-orange" />
                {job.fitScore}%
              </span>
            </InfoTile>
          )}
          {postedAt && (
            <InfoTile label="Ngày đăng">
              <span className="inline-flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5" />
                {postedAt}
              </span>
            </InfoTile>
          )}
          {deadline && (
            <InfoTile label="Hạn nộp">
              <span className="inline-flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5" />
                {deadline}
              </span>
            </InfoTile>
          )}
          {job.applicants && (
            <InfoTile label="Ứng viên">
              <span className="inline-flex items-center gap-1.5">
                <Users className="h-3.5 w-3.5" />
                {job.applicants}
              </span>
            </InfoTile>
          )}
        </div>

        {job.fitReason && (
          <Section title="Vì sao phù hợp">
            <p className="whitespace-pre-line text-sm text-muted-foreground">
              {job.fitReason}
            </p>
          </Section>
        )}

        {job.techStack.length > 0 && (
          <Section title="Công nghệ">
            <div className="flex flex-wrap gap-1.5">
              {job.techStack.map((tech) => (
                <span
                  key={tech}
                  className="rounded-md bg-muted px-2 py-1 text-xs font-medium text-foreground/80"
                >
                  {tech}
                </span>
              ))}
            </div>
          </Section>
        )}

        <BulletSection title="Yêu cầu" items={job.requirements} />
        <BulletSection title="Trách nhiệm" items={job.responsibilities} />
        <BulletSection title="Phúc lợi" items={job.benefits} />

        {job.description && (
          <Section title="Mô tả">
            <p className="whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
              {job.description}
            </p>
          </Section>
        )}
      </div>

      <div className="flex items-center gap-2 border-t border-border p-4">
        {job.jobUrl && (
          <a
            href={job.jobUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-md bg-primary px-4 font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none"
          >
            <ExternalLink className="h-4 w-4" /> Xem & ứng tuyển
          </a>
        )}
        <Button
          type="button"
          variant="outline"
          onClick={onDelete}
          disabled={isDeleting}
          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
          aria-label="Xóa công việc"
        >
          {isDeleting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Trash2 className="h-4 w-4" />
          )}
        </Button>
      </div>
    </>
  );
}

/* -------------------- Pieces -------------------- */

function FilterSelect({
  value,
  onChange,
  options,
  ariaLabel,
  allLabel,
  renderLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  options: string[];
  ariaLabel: string;
  allLabel?: string;
  renderLabel?: (value: string) => string;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={ariaLabel}
      className="h-9 rounded-md border border-input bg-background px-2.5 text-sm text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {allLabel && <option value="">{allLabel}</option>}
      {options.map((opt) => (
        <option key={opt} value={opt}>
          {renderLabel ? renderLabel(opt) : opt}
        </option>
      ))}
    </select>
  );
}

function FitBadge({ score }: { score: number }) {
  const tier = fitTier(score);
  const cls: Record<FitTier, string> = {
    high: "bg-dot-green/10 text-dot-green",
    mid: "bg-dot-orange/10 text-dot-orange",
    low: "bg-muted text-muted-foreground",
  };
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums",
        cls[tier],
      )}
      title={`Độ phù hợp ${score}%`}
    >
      <Sparkles className="h-3 w-3" />
      {score}%
    </span>
  );
}

function Pill({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-2xs font-medium text-muted-foreground">
      {children}
    </span>
  );
}

function SourcePill({ source }: { source: string }) {
  return (
    <span className="inline-flex items-center rounded-full bg-dot-orange/10 px-2 py-0.5 text-2xs font-semibold text-dot-orange">
      {sourceLabel(source)}
    </span>
  );
}

function InfoTile({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card px-3 py-2">
      <div className="text-2xs uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="mt-0.5 text-sm font-medium">{children}</div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-5">
      <SectionLabel>{title}</SectionLabel>
      <div className="mt-2">{children}</div>
    </section>
  );
}

function BulletSection({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <Section title={title}>
      <ul className="space-y-1.5">
        {items.map((item, index) => (
          <li
            key={index}
            className="flex gap-2 text-sm leading-relaxed text-muted-foreground"
          >
            <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-dot-orange/60" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </Section>
  );
}

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
      {children}
    </h2>
  );
}

function LoadingState() {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {Array.from({ length: 6 }).map((_, index) => (
        <div
          key={index}
          className="h-40 animate-pulse rounded-2xl border border-border bg-muted/40"
        />
      ))}
    </div>
  );
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="mx-auto flex max-w-sm flex-col items-center gap-3 py-16 text-center">
      <p className="text-sm text-muted-foreground">
        Không tải được danh sách công việc.
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
    <div className="mx-auto flex max-w-sm flex-col items-center gap-3 py-16 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-dot-orange/10 text-dot-orange">
        <Briefcase className="h-6 w-6" />
      </div>
      <div>
        <h2 className="text-base font-semibold">Chưa có công việc nào</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Công việc sẽ xuất hiện ở đây khi crawler (n8n) gửi dữ liệu về.
        </p>
      </div>
    </div>
  );
}

/* -------------------- Helpers -------------------- */

function fitTier(score: number): FitTier {
  if (score >= 70) return "high";
  if (score >= 40) return "mid";
  return "low";
}

function uniqueValues(values: (string | null)[]): string[] {
  return [...new Set(values.filter((v): v is string => Boolean(v)))].sort();
}

function sortJobs(jobs: Job[], key: SortKey): Job[] {
  const sorted = [...jobs];
  if (key === "fit") {
    sorted.sort((a, b) => (b.fitScore ?? -1) - (a.fitScore ?? -1));
  } else if (key === "posted") {
    sorted.sort((a, b) => dateValue(b.postedAt) - dateValue(a.postedAt));
  } else {
    sorted.sort((a, b) => dateValue(b.crawlAt) - dateValue(a.crawlAt));
  }
  return sorted;
}

function dateValue(value: string | null): number {
  if (!value) return 0;
  const t = new Date(value).getTime();
  return Number.isNaN(t) ? 0 : t;
}

function formatSalary(
  min: number | null,
  max: number | null,
  currency: string | null,
): string {
  if (min == null && max == null) return "Thỏa thuận";
  const fmt = (n: number) => new Intl.NumberFormat("vi-VN").format(n);
  const suffix = !currency || currency === "VND" ? "₫" : currency;
  if (min != null && max != null) return `${fmt(min)} – ${fmt(max)} ${suffix}`;
  if (min != null) return `Từ ${fmt(min)} ${suffix}`;
  return `Đến ${fmt(max as number)} ${suffix}`;
}

function formatDate(value: string | null): string | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("vi-VN");
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
