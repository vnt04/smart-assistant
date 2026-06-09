import { useMemo, useState, type ComponentType, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Job, TechFacet } from "@assistant/shared";
import {
  BarChart3,
  Briefcase,
  Building2,
  Calendar,
  CalendarClock,
  ChevronDown,
  Clock,
  ExternalLink,
  Loader2,
  MapPin,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  Users,
  Wallet,
  X,
} from "lucide-react";
import { Button } from "../components/ui/button";
import { useConfirm } from "../components/ui/confirm-dialog";
import { Input } from "../components/ui/input";
import { Sheet, SheetContent, SheetTitle } from "../components/ui/sheet";
import { api } from "../lib/api";
import { cn } from "../lib/cn";

type SortKey = "crawl" | "fit" | "posted" | "salary";
type FitTier = "high" | "mid" | "low";

interface CountOption {
  value: string;
  count: number;
}

interface SearchOption {
  value: string;
  label: string;
  count: number;
}

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "crawl", label: "Mới crawl" },
  { value: "fit", label: "Độ phù hợp" },
  { value: "posted", label: "Mới đăng" },
  { value: "salary", label: "Lương cao" },
];

const SALARY_BUCKETS: { value: string; label: string }[] = [
  { value: "thoa-thuan", label: "Thỏa thuận" },
  { value: "0-15", label: "Dưới 15 triệu" },
  { value: "15-30", label: "15 – 30 triệu" },
  { value: "30-50", label: "30 – 50 triệu" },
  { value: "50+", label: "Trên 50 triệu" },
];

const POSTED_OPTIONS: { value: string; label: string }[] = [
  { value: "1", label: "24 giờ qua" },
  { value: "7", label: "7 ngày qua" },
  { value: "30", label: "30 ngày qua" },
];

const FIT_OPTIONS: { value: number; label: string }[] = [
  { value: 70, label: "Rất phù hợp (≥70%)" },
  { value: 40, label: "Khá phù hợp (≥40%)" },
];

export function JobPage() {
  const queryClient = useQueryClient();
  const confirm = useConfirm();

  // `now` cố định trong suốt phiên xem để bộ lọc "ngày đăng" và thống kê ổn định.
  const [now] = useState(() => Date.now());

  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortKey>("crawl");
  const [levels, setLevels] = useState<string[]>([]);
  const [types, setTypes] = useState<string[]>([]);
  const [sources, setSources] = useState<string[]>([]);
  const [locations, setLocations] = useState<string[]>([]);
  const [salary, setSalary] = useState("");
  const [posted, setPosted] = useState("");
  const [fitMin, setFitMin] = useState(0);
  const [selectedTech, setSelectedTech] = useState<string[]>([]);
  const [showStats, setShowStats] = useState(false);
  const [selected, setSelected] = useState<Job | null>(null);

  const jobsQuery = useQuery({
    queryKey: ["jobs", selectedTech],
    queryFn: () => api.listJobs(selectedTech),
  });
  const facetsQuery = useQuery({
    queryKey: ["job-tech-facets"],
    queryFn: api.listTechFacets,
  });

  const deleteMutation = useMutation({
    mutationFn: api.deleteJob,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["jobs"] });
      void queryClient.invalidateQueries({ queryKey: ["job-tech-facets"] });
      setSelected(null);
    },
  });

  const jobs = useMemo(() => jobsQuery.data ?? [], [jobsQuery.data]);
  const facets = facetsQuery.data ?? [];

  const levelOptions = useMemo(() => countBy(jobs, (j) => j.level), [jobs]);
  const typeOptions = useMemo(
    () => countBy(jobs, (j) => j.employmentType),
    [jobs],
  );
  const sourceOptions = useMemo(() => countBy(jobs, (j) => j.source), [jobs]);
  const locationOptions = useMemo(
    () => countBy(jobs, (j) => j.location || null),
    [jobs],
  );

  const toggleLevel = (v: string) => toggleIn(setLevels, v);
  const toggleType = (v: string) => toggleIn(setTypes, v);
  const toggleSource = (v: string) => toggleIn(setSources, v);
  const toggleLocation = (v: string) => toggleIn(setLocations, v);
  const toggleTech = (v: string) => toggleIn(setSelectedTech, v);

  function clearAll(): void {
    setLevels([]);
    setTypes([]);
    setSources([]);
    setLocations([]);
    setSalary("");
    setPosted("");
    setFitMin(0);
    setSelectedTech([]);
  }

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    const result = jobs.filter((job) => {
      if (levels.length && (!job.level || !levels.includes(job.level)))
        return false;
      if (
        types.length &&
        (!job.employmentType || !types.includes(job.employmentType))
      )
        return false;
      if (sources.length && !sources.includes(job.source)) return false;
      if (locations.length && (!job.location || !locations.includes(job.location)))
        return false;
      if (salary && salaryBucketOf(job) !== salary) return false;
      if (posted && !withinDays(job, Number(posted), now)) return false;
      if (fitMin && (job.fitScore ?? 0) < fitMin) return false;
      if (!query) return true;
      return (
        job.title.toLowerCase().includes(query) ||
        job.company.toLowerCase().includes(query) ||
        job.location.toLowerCase().includes(query) ||
        job.techStack.some((t) => t.toLowerCase().includes(query))
      );
    });
    return sortJobs(result, sort);
  }, [jobs, search, levels, types, sources, locations, salary, posted, fitMin, sort, now]);

  const stats = useMemo(() => computeStats(filtered, now), [filtered, now]);

  const techNameOf = useMemo(() => {
    const map = new Map(facets.map((f) => [f.slug, f.name]));
    return (slug: string) => map.get(slug) ?? slug;
  }, [facets]);

  const activeChips = useMemo<ActiveChip[]>(() => {
    const chips: ActiveChip[] = [];
    levels.forEach((v) =>
      chips.push({ key: `lv:${v}`, label: v, onRemove: () => toggleLevel(v) }),
    );
    types.forEach((v) =>
      chips.push({ key: `ty:${v}`, label: v, onRemove: () => toggleType(v) }),
    );
    sources.forEach((v) =>
      chips.push({
        key: `sr:${v}`,
        label: sourceLabel(v),
        onRemove: () => toggleSource(v),
      }),
    );
    locations.forEach((v) =>
      chips.push({
        key: `lo:${v}`,
        label: v,
        onRemove: () => toggleLocation(v),
      }),
    );
    if (salary)
      chips.push({
        key: "sal",
        label: SALARY_BUCKETS.find((b) => b.value === salary)?.label ?? salary,
        onRemove: () => setSalary(""),
      });
    if (posted)
      chips.push({
        key: "po",
        label: POSTED_OPTIONS.find((p) => p.value === posted)?.label ?? posted,
        onRemove: () => setPosted(""),
      });
    if (fitMin)
      chips.push({
        key: "fit",
        label: FIT_OPTIONS.find((f) => f.value === fitMin)?.label ?? `≥${fitMin}%`,
        onRemove: () => setFitMin(0),
      });
    selectedTech.forEach((slug) =>
      chips.push({
        key: `te:${slug}`,
        label: techNameOf(slug),
        onRemove: () => toggleTech(slug),
      }),
    );
    return chips;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [levels, types, sources, locations, salary, posted, fitMin, selectedTech, techNameOf]);

  const hasFilter = activeChips.length > 0;

  async function handleDelete(job: Job): Promise<void> {
    const confirmed = await confirm({
      title: `Xóa “${job.title}”?`,
      description: "Công việc này sẽ bị xóa khỏi danh sách.",
      confirmText: "Xóa",
      variant: "destructive",
    });
    if (confirmed) deleteMutation.mutate(job.id);
  }

  const hasJobs = jobs.length > 0;

  return (
    <div className="h-full overflow-y-auto scrollbar-thin">
      <div className="mx-auto max-w-[1500px] px-4 py-8 sm:px-6 md:px-8 md:py-10">
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

        {/* Thanh công cụ: tìm kiếm + sắp xếp + thống kê */}
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
          <div className="flex items-center gap-2">
            <FilterSelect
              value={sort}
              onChange={(v) => setSort(v as SortKey)}
              ariaLabel="Sắp xếp"
              options={SORT_OPTIONS.map((o) => o.value)}
              renderLabel={(v) =>
                SORT_OPTIONS.find((o) => o.value === v)?.label ?? v
              }
            />
            <button
              type="button"
              onClick={() => setShowStats((s) => !s)}
              aria-pressed={showStats}
              className={cn(
                "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md border px-3 text-sm font-medium transition-colors",
                showStats
                  ? "border-dot-orange/30 bg-dot-orange/10 text-dot-orange"
                  : "border-input bg-background text-foreground hover:bg-accent",
              )}
            >
              <BarChart3 className="h-4 w-4" /> Thống kê
            </button>
          </div>
        </div>

        <div className="mt-6 grid gap-5 lg:grid-cols-[256px_minmax(0,1fr)] xl:grid-cols-[280px_minmax(0,1fr)] lg:gap-6">
          <aside className="lg:sticky lg:top-6 lg:self-start lg:max-h-[calc(100vh-3rem)] lg:overflow-y-auto scrollbar-thin">
            <FilterRail
              activeCount={activeChips.length}
              onClearAll={clearAll}
              levelOptions={levelOptions}
              levels={levels}
              onToggleLevel={toggleLevel}
              typeOptions={typeOptions}
              types={types}
              onToggleType={toggleType}
              sourceOptions={sourceOptions}
              sources={sources}
              onToggleSource={toggleSource}
              locationOptions={locationOptions}
              locations={locations}
              onToggleLocation={toggleLocation}
              salary={salary}
              onSalaryChange={setSalary}
              posted={posted}
              onPostedChange={setPosted}
              fitMin={fitMin}
              onFitChange={setFitMin}
              facets={facets}
              selectedTech={selectedTech}
              onToggleTech={toggleTech}
            />
          </aside>

          <main className="min-w-0">
            {hasJobs && (
              <>
                <StatsBar stats={stats} filtered={hasFilter || search.length > 0} />
                {showStats && <StatsPanel stats={stats} />}
              </>
            )}

            {activeChips.length > 0 && (
              <ActiveFilters chips={activeChips} onClearAll={clearAll} />
            )}

            <div className="mt-4">
              {jobsQuery.isLoading ? (
                <LoadingState />
              ) : jobsQuery.isError ? (
                <ErrorState onRetry={() => void jobsQuery.refetch()} />
              ) : !hasJobs ? (
                selectedTech.length > 0 ? (
                  <EmptyFilter />
                ) : (
                  <EmptyState />
                )
              ) : filtered.length === 0 ? (
                <p className="rounded-2xl border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
                  Không có công việc nào khớp bộ lọc.
                </p>
              ) : (
                <>
                  <SectionLabel>{filtered.length} công việc</SectionLabel>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {filtered.map((job, index) => (
                      <JobCard
                        key={job.id}
                        job={job}
                        delayMs={Math.min(index * 30, 240)}
                        onOpen={() => setSelected(job)}
                      />
                    ))}
                  </div>
                </>
              )}
            </div>
          </main>
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
          className="flex w-full max-w-[95vw] flex-col gap-0 p-0 sm:w-[680px] lg:w-[820px]"
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

/* -------------------- Filter rail -------------------- */

interface FilterRailProps {
  activeCount: number;
  onClearAll: () => void;
  levelOptions: CountOption[];
  levels: string[];
  onToggleLevel: (value: string) => void;
  typeOptions: CountOption[];
  types: string[];
  onToggleType: (value: string) => void;
  sourceOptions: CountOption[];
  sources: string[];
  onToggleSource: (value: string) => void;
  locationOptions: CountOption[];
  locations: string[];
  onToggleLocation: (value: string) => void;
  salary: string;
  onSalaryChange: (value: string) => void;
  posted: string;
  onPostedChange: (value: string) => void;
  fitMin: number;
  onFitChange: (value: number) => void;
  facets: TechFacet[];
  selectedTech: string[];
  onToggleTech: (value: string) => void;
}

function FilterRail(props: FilterRailProps) {
  const [open, setOpen] = useState(false);
  const { activeCount, onClearAll } = props;

  return (
    <div className="rounded-2xl border border-border bg-card shadow-soft">
      <div className="flex items-center justify-between gap-2 px-3.5 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <SlidersHorizontal className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="text-sm font-semibold">Bộ lọc</span>
          {activeCount > 0 && (
            <span className="rounded-full bg-dot-orange/10 px-1.5 py-0.5 text-2xs font-semibold tabular-nums text-dot-orange">
              {activeCount}
            </span>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {activeCount > 0 && (
            <button
              type="button"
              onClick={onClearAll}
              className="rounded-md px-1.5 py-1 text-2xs font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              Xóa tất cả
            </button>
          )}
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            aria-label="Mở/đóng bộ lọc"
            className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground lg:hidden"
          >
            <ChevronDown
              className={cn("h-4 w-4 transition-transform", open && "rotate-180")}
            />
          </button>
        </div>
      </div>

      <div className={cn(open ? "block" : "hidden", "lg:block")}>
        {props.levelOptions.length > 0 && (
          <FilterSection title="Cấp bậc">
            <PillGroup
              options={props.levelOptions}
              selected={props.levels}
              onToggle={props.onToggleLevel}
            />
          </FilterSection>
        )}

        <FilterSection title="Mức lương">
          <ChoiceGroup
            options={SALARY_BUCKETS}
            value={props.salary}
            onChange={props.onSalaryChange}
          />
        </FilterSection>

        {props.typeOptions.length > 0 && (
          <FilterSection title="Hình thức làm việc">
            <PillGroup
              options={props.typeOptions}
              selected={props.types}
              onToggle={props.onToggleType}
            />
          </FilterSection>
        )}

        <FilterSection title="Ngày đăng">
          <ChoiceGroup
            options={POSTED_OPTIONS}
            value={props.posted}
            onChange={props.onPostedChange}
          />
        </FilterSection>

        <FilterSection title="Độ phù hợp">
          <div className="flex flex-wrap gap-1.5">
            {FIT_OPTIONS.map((o) => (
              <FilterPill
                key={o.value}
                active={props.fitMin === o.value}
                label={o.label}
                onClick={() =>
                  props.onFitChange(props.fitMin === o.value ? 0 : o.value)
                }
              />
            ))}
          </div>
        </FilterSection>

        {props.sourceOptions.length > 1 && (
          <FilterSection title="Nguồn">
            <PillGroup
              options={props.sourceOptions}
              selected={props.sources}
              onToggle={props.onToggleSource}
              renderLabel={sourceLabel}
            />
          </FilterSection>
        )}

        {props.locationOptions.length > 0 && (
          <FilterSection title="Địa điểm">
            <SearchablePills
              options={props.locationOptions.map((o) => ({
                value: o.value,
                label: o.value,
                count: o.count,
              }))}
              selected={props.locations}
              onToggle={props.onToggleLocation}
              placeholder="Lọc địa điểm…"
            />
          </FilterSection>
        )}

        {props.facets.length > 0 && (
          <FilterSection title="Công nghệ">
            <SearchablePills
              options={props.facets.map((f) => ({
                value: f.slug,
                label: f.name,
                count: f.count,
              }))}
              selected={props.selectedTech}
              onToggle={props.onToggleTech}
              placeholder="Lọc công nghệ…"
            />
          </FilterSection>
        )}
      </div>
    </div>
  );
}

function FilterSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="border-t border-border px-3.5 py-3">
      <h3 className="mb-2 text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </h3>
      {children}
    </div>
  );
}

function PillGroup({
  options,
  selected,
  onToggle,
  renderLabel,
}: {
  options: CountOption[];
  selected: string[];
  onToggle: (value: string) => void;
  renderLabel?: (value: string) => string;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <FilterPill
          key={o.value}
          active={selected.includes(o.value)}
          label={renderLabel ? renderLabel(o.value) : o.value}
          count={o.count}
          onClick={() => onToggle(o.value)}
        />
      ))}
    </div>
  );
}

function ChoiceGroup({
  options,
  value,
  onChange,
}: {
  options: { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <FilterPill
          key={o.value}
          active={value === o.value}
          label={o.label}
          onClick={() => onChange(value === o.value ? "" : o.value)}
        />
      ))}
    </div>
  );
}

function FilterPill({
  active,
  label,
  count,
  onClick,
}: {
  active: boolean;
  label: string;
  count?: number;
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
      <span className="max-w-[150px] truncate">{label}</span>
      {count != null && (
        <span
          className={cn(
            "text-2xs tabular-nums",
            active ? "text-dot-orange/70" : "text-muted-foreground/60",
          )}
        >
          {count}
        </span>
      )}
    </button>
  );
}

/** Số chip hiển thị khi danh sách tìm-kiếm-được ở trạng thái gọn. */
const SEARCH_COLLAPSED_COUNT = 18;

function SearchablePills({
  options,
  selected,
  onToggle,
  placeholder,
}: {
  options: SearchOption[];
  selected: string[];
  onToggle: (value: string) => void;
  placeholder: string;
}) {
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState(false);
  const selectedSet = useMemo(() => new Set(selected), [selected]);

  const trimmed = query.trim().toLowerCase();
  const ordered = useMemo(() => {
    const matched = trimmed
      ? options.filter(
          (o) =>
            o.label.toLowerCase().includes(trimmed) ||
            o.value.toLowerCase().includes(trimmed),
        )
      : options;
    return [...matched].sort(
      (a, b) =>
        Number(selectedSet.has(b.value)) - Number(selectedSet.has(a.value)),
    );
  }, [options, trimmed, selectedSet]);

  const showToggle = !trimmed && ordered.length > SEARCH_COLLAPSED_COUNT;
  const visible =
    expanded || trimmed ? ordered : ordered.slice(0, SEARCH_COLLAPSED_COUNT);

  return (
    <div>
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={placeholder}
          aria-label={placeholder}
          className="h-8 w-full rounded-md border border-input bg-background pl-8 pr-2 text-xs outline-none transition-colors placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>

      <div className="mt-2.5 flex flex-wrap gap-1.5">
        {visible.length === 0 ? (
          <p className="py-1 text-xs text-muted-foreground">Không tìm thấy.</p>
        ) : (
          visible.map((o) => (
            <FilterPill
              key={o.value}
              active={selectedSet.has(o.value)}
              label={o.label}
              count={o.count}
              onClick={() => onToggle(o.value)}
            />
          ))
        )}
      </div>

      {showToggle && (
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="mt-2 text-xs font-medium text-dot-orange transition-colors hover:text-dot-orange/80"
        >
          {expanded ? "Thu gọn" : `Xem tất cả ${ordered.length}`}
        </button>
      )}
    </div>
  );
}

/* -------------------- Active filters -------------------- */

interface ActiveChip {
  key: string;
  label: string;
  onRemove: () => void;
}

function ActiveFilters({
  chips,
  onClearAll,
}: {
  chips: ActiveChip[];
  onClearAll: () => void;
}) {
  return (
    <div className="mt-4 flex flex-wrap items-center gap-1.5">
      <span className="text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
        Đang lọc
      </span>
      {chips.map((c) => (
        <span
          key={c.key}
          className="inline-flex items-center gap-1 rounded-full border border-dot-orange/30 bg-dot-orange/10 py-1 pl-2.5 pr-1 text-xs font-medium text-dot-orange"
        >
          <span className="max-w-[180px] truncate">{c.label}</span>
          <button
            type="button"
            onClick={c.onRemove}
            aria-label={`Bỏ lọc ${c.label}`}
            className="rounded-full p-0.5 transition-colors hover:bg-dot-orange/20"
          >
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
      <button
        type="button"
        onClick={onClearAll}
        className="ml-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        Xóa tất cả
      </button>
    </div>
  );
}

/* -------------------- Stats -------------------- */

interface Stats {
  total: number;
  new7: number;
  withSalaryCount: number;
  medianSalary: number;
  avgFit: number;
  highFit: number;
  byLevel: CountOption[];
  bySource: CountOption[];
  topCompanies: CountOption[];
}

type Tone = "orange" | "green" | "blue" | "purple";

const TONE_CLASS: Record<Tone, string> = {
  orange: "bg-dot-orange/10 text-dot-orange",
  green: "bg-dot-green/10 text-dot-green",
  blue: "bg-dot-blue/10 text-dot-blue",
  purple: "bg-dot-purple/10 text-dot-purple",
};

function StatsBar({ stats, filtered }: { stats: Stats; filtered: boolean }) {
  return (
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
      <MetricCard
        icon={Briefcase}
        tone="orange"
        value={String(stats.total)}
        label={filtered ? "Khớp bộ lọc" : "Tổng công việc"}
      />
      <MetricCard
        icon={CalendarClock}
        tone="green"
        value={String(stats.new7)}
        label="Mới 7 ngày"
      />
      <MetricCard
        icon={Wallet}
        tone="blue"
        value={String(stats.withSalaryCount)}
        label={
          stats.medianSalary > 0
            ? `Có lương · TV ${formatSalaryShort(stats.medianSalary)}`
            : "Có lương"
        }
      />
      <MetricCard
        icon={Sparkles}
        tone="purple"
        value={stats.avgFit > 0 ? `${stats.avgFit}%` : "—"}
        label={
          stats.highFit > 0 ? `Phù hợp TB · ${stats.highFit} ≥70%` : "Phù hợp TB"
        }
      />
    </div>
  );
}

function MetricCard({
  icon: Icon,
  tone,
  value,
  label,
}: {
  icon: ComponentType<{ className?: string }>;
  tone: Tone;
  value: string;
  label: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-border bg-card px-3.5 py-3 shadow-soft">
      <span
        className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl",
          TONE_CLASS[tone],
        )}
      >
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0">
        <div className="text-lg font-bold leading-tight tabular-nums">
          {value}
        </div>
        <div className="truncate text-2xs text-muted-foreground">{label}</div>
      </div>
    </div>
  );
}

function StatsPanel({ stats }: { stats: Stats }) {
  return (
    <div className="mt-3 grid gap-5 rounded-2xl border border-border bg-card p-4 shadow-soft sm:grid-cols-2 lg:grid-cols-3">
      <DistList title="Theo cấp bậc" items={stats.byLevel} />
      <DistList title="Theo nguồn" items={stats.bySource} renderLabel={sourceLabel} />
      <DistList title="Top công ty" items={stats.topCompanies} />
    </div>
  );
}

function DistList({
  title,
  items,
  renderLabel,
}: {
  title: string;
  items: CountOption[];
  renderLabel?: (value: string) => string;
}) {
  if (items.length === 0) {
    return (
      <div className="min-w-0">
        <SectionLabel>{title}</SectionLabel>
        <p className="mt-2 text-xs text-muted-foreground">Chưa có dữ liệu.</p>
      </div>
    );
  }
  const max = Math.max(...items.map((i) => i.count), 1);
  return (
    <div className="min-w-0">
      <SectionLabel>{title}</SectionLabel>
      <ul className="mt-2.5 space-y-2">
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
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-dot-orange/60"
                style={{ width: `${(it.count / max) * 100}%` }}
              />
            </div>
          </li>
        ))}
      </ul>
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
            <CompanyLogo src={job.companyLogo} name={job.company} size="sm" />
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
        <SheetTitle className="mt-2 text-xl leading-snug">{job.title}</SheetTitle>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <CompanyLogo src={job.companyLogo} name={job.company} size="lg" />
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
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
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

function CompanyLogo({
  src,
  name,
  size = "sm",
}: {
  src: string;
  name: string;
  size?: "sm" | "lg";
}) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return (
      <Building2
        className={cn(size === "lg" ? "h-4 w-4" : "h-3.5 w-3.5", "shrink-0")}
      />
    );
  }
  return (
    <img
      src={src}
      alt={name ? `Logo ${name}` : "Logo công ty"}
      loading="lazy"
      onError={() => setFailed(true)}
      className={cn(
        size === "lg" ? "h-6 w-6" : "h-5 w-5",
        "shrink-0 rounded-sm border border-border/50 bg-white object-contain",
      )}
    />
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
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 6 }).map((_, index) => (
        <div
          key={index}
          className="h-40 animate-pulse rounded-2xl border border-border bg-muted/40"
        />
      ))}
    </div>
  );
}

function EmptyFilter() {
  return (
    <p className="rounded-2xl border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
      Không có công việc nào dùng công nghệ đã chọn.
    </p>
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

function toggleIn(
  setter: (updater: (prev: string[]) => string[]) => void,
  value: string,
): void {
  setter((prev) =>
    prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value],
  );
}

function countBy(
  jobs: Job[],
  pick: (job: Job) => string | null,
): CountOption[] {
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

/** Lương đại diện của job (VND): ưu tiên trần, rồi sàn; không có → -1. */
function repSalary(job: Job): number {
  return job.salaryMax ?? job.salaryMin ?? -1;
}

function salaryBucketOf(job: Job): string {
  if (job.salaryMin == null && job.salaryMax == null) return "thoa-thuan";
  const rep = repSalary(job);
  if (rep < 15_000_000) return "0-15";
  if (rep < 30_000_000) return "15-30";
  if (rep < 50_000_000) return "30-50";
  return "50+";
}

/** Mốc thời gian của job: ưu tiên ngày đăng, thiếu thì dùng thời điểm crawl. */
function jobTime(job: Job): number {
  const value = job.postedAt ?? job.crawlAt;
  const t = new Date(value).getTime();
  return Number.isNaN(t) ? 0 : t;
}

function withinDays(job: Job, days: number, now: number): boolean {
  const t = jobTime(job);
  if (!t) return false;
  return now - t <= days * 24 * 60 * 60 * 1000;
}

function computeStats(jobs: Job[], now: number): Stats {
  const withSalary = jobs.filter((j) => salaryBucketOf(j) !== "thoa-thuan");
  const reps = withSalary
    .map(repSalary)
    .filter((n) => n > 0)
    .sort((a, b) => a - b);
  const medianSalary = reps.length
    ? reps[Math.floor((reps.length - 1) / 2)]
    : 0;

  const fitJobs = jobs.filter(
    (j) => typeof j.fitScore === "number" && j.fitScore > 0,
  );
  const avgFit = fitJobs.length
    ? Math.round(
        fitJobs.reduce((sum, j) => sum + (j.fitScore ?? 0), 0) / fitJobs.length,
      )
    : 0;

  return {
    total: jobs.length,
    new7: jobs.filter((j) => withinDays(j, 7, now)).length,
    withSalaryCount: withSalary.length,
    medianSalary,
    avgFit,
    highFit: jobs.filter((j) => (j.fitScore ?? 0) >= 70).length,
    byLevel: countBy(jobs, (j) => j.level).slice(0, 6),
    bySource: countBy(jobs, (j) => j.source).slice(0, 6),
    topCompanies: countBy(jobs, (j) => j.company || null).slice(0, 6),
  };
}

function fitTier(score: number): FitTier {
  if (score >= 70) return "high";
  if (score >= 40) return "mid";
  return "low";
}

function sortJobs(jobs: Job[], key: SortKey): Job[] {
  const sorted = [...jobs];
  if (key === "fit") {
    sorted.sort((a, b) => (b.fitScore ?? -1) - (a.fitScore ?? -1));
  } else if (key === "posted") {
    sorted.sort((a, b) => dateValue(b.postedAt) - dateValue(a.postedAt));
  } else if (key === "salary") {
    sorted.sort((a, b) => repSalary(b) - repSalary(a));
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

/** Lương rút gọn cho thống kê: 25.000.000 → "25tr". */
function formatSalaryShort(n: number): string {
  if (n <= 0) return "—";
  if (n >= 1_000_000) {
    const m = n / 1_000_000;
    return `${Number.isInteger(m) ? m : m.toFixed(1)}tr`;
  }
  return new Intl.NumberFormat("vi-VN").format(n);
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
