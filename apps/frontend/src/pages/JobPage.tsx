import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type ReactNode,
} from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  DEFAULT_JOB_MATCH_PROFILE,
  scoreJob,
  type Job,
  type JobMatchProfile,
  type JobMatchResult,
  type TechFacet,
} from "@assistant/shared";
import {
  BarChart3,
  Briefcase,
  Calendar,
  CalendarClock,
  ChevronDown,
  Clock,
  DownloadCloud,
  ExternalLink,
  Loader2,
  MapPin,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Sparkles,
  Target,
  Trash2,
  Users,
  Wallet,
  Workflow,
  X,
} from "lucide-react";
import { Button } from "../components/ui/button";
import { useConfirm } from "../components/ui/confirm-dialog";
import { Input } from "../components/ui/input";
import { Sheet, SheetContent, SheetTitle } from "../components/ui/sheet";
import { MatchBadge } from "../components/jobs/MatchBadge";
import { MatchProfileEditor } from "../components/jobs/MatchProfileEditor";
import { WorkflowExecutionsDrawer } from "../components/jobs/WorkflowExecutionsDrawer";
import { JobSyncDrawer } from "../components/jobs/JobSyncDrawer";
import { CompanyLogo } from "../components/jobs/CompanyLogo";
import { api } from "../lib/api";
import { cn } from "../lib/cn";

type SortKey = "match" | "crawl" | "posted" | "salary";

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
  { value: "match", label: "Phù hợp với tôi" },
  { value: "crawl", label: "Mới crawl" },
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

/** Ngưỡng điểm nhanh ở rail (lọc theo barem cá nhân). */
const MIN_SCORE_PILLS: { value: number; label: string }[] = [
  { value: 80, label: "≥ 80%" },
  { value: 60, label: "≥ 60%" },
  { value: 40, label: "≥ 40%" },
];

export function JobPage() {
  const queryClient = useQueryClient();
  const confirm = useConfirm();

  // `now` cố định trong suốt phiên xem để bộ lọc "ngày đăng", độ mới và thống kê
  // ổn định, không nhảy số khi component re-render.
  const [now] = useState(() => Date.now());

  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortKey>("crawl");
  const sortTouched = useRef(false);
  const [levels, setLevels] = useState<string[]>([]);
  const [types, setTypes] = useState<string[]>([]);
  const [sources, setSources] = useState<string[]>([]);
  const [locations, setLocations] = useState<string[]>([]);
  const [salary, setSalary] = useState("");
  const [posted, setPosted] = useState("");
  const [selectedTech, setSelectedTech] = useState<string[]>([]);
  const [selected, setSelected] = useState<Job | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [workflowOpen, setWorkflowOpen] = useState(false);
  const [syncOpen, setSyncOpen] = useState(false);

  const jobsQuery = useQuery({
    queryKey: ["jobs", selectedTech],
    queryFn: () => api.listJobs(selectedTech),
  });
  const facetsQuery = useQuery({
    queryKey: ["job-tech-facets"],
    queryFn: api.listTechFacets,
  });
  const matchQuery = useQuery({
    queryKey: ["job-match-profile"],
    queryFn: api.getJobMatchProfile,
  });
  // Số workflow lỗi (error + crashed) trên TOÀN BỘ — badge ở nút Workflow Exc để
  // không phải mở drawer mới biết có lỗi. Cùng queryKey với drawer nên chia sẻ cache.
  // n8n chưa cấu hình → query lỗi (retry:false) → không hiện badge.
  const n8nStatsQuery = useQuery({
    queryKey: ["n8n-execution-stats"],
    queryFn: () => api.getN8nExecutionStats(),
    refetchInterval: 60_000,
    staleTime: 30_000,
    retry: false,
  });
  const failedWorkflows = n8nStatsQuery.data?.failed ?? 0;

  // Tổng quan đồng bộ việc làm (cron nội bộ) — badge số run lỗi ở nút "Đồng bộ".
  // Cùng queryKey với drawer nên chia sẻ cache.
  const jobSyncOverviewQuery = useQuery({
    queryKey: ["job-sync-overview"],
    queryFn: () => api.getJobSyncOverview(),
    refetchInterval: 60_000,
    staleTime: 30_000,
    retry: false,
  });
  const failedSyncs = jobSyncOverviewQuery.data?.failedRuns ?? 0;

  // Barem chỉnh sửa cục bộ (live preview); seed một lần từ server khi tải xong.
  const [profileDraft, setProfileDraft] = useState<JobMatchProfile | null>(null);
  useEffect(() => {
    if (matchQuery.data && profileDraft === null) setProfileDraft(matchQuery.data);
  }, [matchQuery.data, profileDraft]);

  const savedProfile = matchQuery.data ?? null;
  const profile = profileDraft ?? savedProfile ?? DEFAULT_JOB_MATCH_PROFILE;
  const matchEnabled = profile.enabled;
  const isDirty =
    JSON.stringify(profile) !==
    JSON.stringify(savedProfile ?? DEFAULT_JOB_MATCH_PROFILE);

  const saveMutation = useMutation({
    mutationFn: api.updateJobMatchProfile,
    onSuccess: (saved) => {
      setProfileDraft(saved);
      queryClient.setQueryData(["job-match-profile"], saved);
    },
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

  // Đổi barem → nếu vừa bật matching và user chưa tự đổi sort, ưu tiên sort theo điểm.
  function handleProfileChange(next: JobMatchProfile): void {
    if (next.enabled && !profile.enabled && !sortTouched.current) setSort("match");
    setProfileDraft(next);
  }

  const scoredById = useMemo(() => {
    const map = new Map<string, JobMatchResult>();
    if (matchEnabled) {
      for (const job of jobs) map.set(job.id, scoreJob(job, profile, now));
    }
    return map;
  }, [jobs, profile, matchEnabled, now]);

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

  const setMinScore = (value: number | null) =>
    handleProfileChange({ ...profile, minScore: value });

  function clearAll(): void {
    setLevels([]);
    setTypes([]);
    setSources([]);
    setLocations([]);
    setSalary("");
    setPosted("");
    setSelectedTech([]);
    if (profile.minScore != null) setMinScore(null);
  }

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    const result = jobs.filter((job) => {
      if (matchEnabled && scoredById.get(job.id)?.hidden) return false;
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
      if (!query) return true;
      return (
        job.title.toLowerCase().includes(query) ||
        job.company.toLowerCase().includes(query) ||
        job.location.toLowerCase().includes(query) ||
        job.techStack.some((t) => t.toLowerCase().includes(query))
      );
    });

    if (sort === "match" && matchEnabled) {
      return [...result].sort(
        (a, b) =>
          (scoredById.get(b.id)?.score ?? -1) -
          (scoredById.get(a.id)?.score ?? -1),
      );
    }
    return sortJobs(result, sort);
  }, [
    jobs,
    search,
    levels,
    types,
    sources,
    locations,
    salary,
    posted,
    sort,
    now,
    matchEnabled,
    scoredById,
  ]);

  const stats = useMemo(
    () => computeStats(filtered, now, scoredById, matchEnabled),
    [filtered, now, scoredById, matchEnabled],
  );

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
      chips.push({ key: `lo:${v}`, label: v, onRemove: () => toggleLocation(v) }),
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
    if (matchEnabled && profile.minScore != null)
      chips.push({
        key: "ms",
        label: `Điểm ≥ ${profile.minScore}%`,
        onRemove: () => setMinScore(null),
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
  }, [
    levels,
    types,
    sources,
    locations,
    salary,
    posted,
    matchEnabled,
    profile.minScore,
    selectedTech,
    techNameOf,
  ]);

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
  const sortOptions = matchEnabled
    ? SORT_OPTIONS
    : SORT_OPTIONS.filter((o) => o.value !== "match");
  const sortValue = matchEnabled ? sort : sort === "match" ? "crawl" : sort;

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

        {/* Thanh công cụ: tìm kiếm + sắp xếp + barem + thống kê */}
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
              value={sortValue}
              onChange={(v) => {
                sortTouched.current = true;
                setSort(v as SortKey);
              }}
              ariaLabel="Sắp xếp"
              options={sortOptions.map((o) => o.value)}
              renderLabel={(v) =>
                SORT_OPTIONS.find((o) => o.value === v)?.label ?? v
              }
            />
            <ToolbarToggle
              icon={Target}
              active={matchEnabled}
              onClick={() => setEditorOpen(true)}
              label={matchEnabled ? "Barem · bật" : "Barem"}
            />
            <Link
              to="/job/stats"
              className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md border border-input bg-background px-3 text-sm font-medium text-foreground transition-colors hover:bg-accent"
            >
              <BarChart3 className="h-4 w-4" /> Thống kê
            </Link>
            <ToolbarToggle
              icon={DownloadCloud}
              active={syncOpen}
              onClick={() => setSyncOpen(true)}
              label="Đồng bộ"
              badge={failedSyncs}
            />
            <ToolbarToggle
              icon={Workflow}
              active={workflowOpen}
              onClick={() => setWorkflowOpen(true)}
              label="Workflow Exc"
              badge={failedWorkflows}
            />
          </div>
        </div>

        <div className="mt-6 grid gap-5 lg:grid-cols-[256px_minmax(0,1fr)] xl:grid-cols-[280px_minmax(0,1fr)] lg:gap-6">
          <aside className="lg:sticky lg:top-6 lg:self-start lg:max-h-[calc(100vh-3rem)] lg:overflow-y-auto scrollbar-thin">
            <FilterRail
              activeCount={activeChips.length}
              onClearAll={clearAll}
              matchEnabled={matchEnabled}
              onOpenEditor={() => setEditorOpen(true)}
              minScore={profile.minScore}
              onMinScoreChange={setMinScore}
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
              facets={facets}
              selectedTech={selectedTech}
              onToggleTech={toggleTech}
            />
          </aside>

          <main className="min-w-0">
            {hasJobs && (
              <StatsBar stats={stats} filtered={hasFilter || search.length > 0} />
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
                        match={matchEnabled ? scoredById.get(job.id) ?? null : null}
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
              match={
                matchEnabled ? scoredById.get(selected.id) ?? null : null
              }
              onDelete={() => handleDelete(selected)}
              isDeleting={deleteMutation.isPending}
            />
          )}
        </SheetContent>
      </Sheet>

      <WorkflowExecutionsDrawer
        open={workflowOpen}
        onOpenChange={setWorkflowOpen}
      />

      <JobSyncDrawer open={syncOpen} onOpenChange={setSyncOpen} />

      <MatchProfileEditor
        open={editorOpen}
        onOpenChange={setEditorOpen}
        profile={profile}
        onChange={handleProfileChange}
        onSave={() => saveMutation.mutate(profile)}
        onReset={() => handleProfileChange(DEFAULT_JOB_MATCH_PROFILE)}
        isSaving={saveMutation.isPending}
        isDirty={isDirty}
        facets={facets}
        levelOptions={levelOptions.map((o) => o.value)}
        typeOptions={typeOptions.map((o) => o.value)}
        locationOptions={locationOptions.map((o) => o.value)}
      />
    </div>
  );
}

/* -------------------- Filter rail -------------------- */

interface FilterRailProps {
  activeCount: number;
  onClearAll: () => void;
  matchEnabled: boolean;
  onOpenEditor: () => void;
  minScore: number | null;
  onMinScoreChange: (value: number | null) => void;
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
        <FilterSection title="Phù hợp với tôi">
          <button
            type="button"
            onClick={props.onOpenEditor}
            className={cn(
              "flex w-full items-center justify-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors",
              props.matchEnabled
                ? "border-dot-orange/30 bg-dot-orange/10 text-dot-orange"
                : "border-input bg-background text-foreground hover:bg-accent",
            )}
          >
            <Target className="h-3.5 w-3.5" /> Thiết lập barem
          </button>
          {props.matchEnabled ? (
            <div className="mt-2.5">
              <p className="mb-1.5 text-2xs font-medium text-muted-foreground">
                Chỉ hiện job đạt điểm
              </p>
              <div className="flex flex-wrap gap-1.5">
                {MIN_SCORE_PILLS.map((p) => (
                  <FilterPill
                    key={p.value}
                    active={props.minScore === p.value}
                    label={p.label}
                    onClick={() =>
                      props.onMinScoreChange(
                        props.minScore === p.value ? null : p.value,
                      )
                    }
                  />
                ))}
              </div>
            </div>
          ) : (
            <p className="mt-2 text-2xs text-muted-foreground">
              Chưa bật — mở thiết lập để cá nhân hóa thứ tự job.
            </p>
          )}
        </FilterSection>

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
  matchEnabled: boolean;
  matchAvg: number;
  matchTop: number;
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
        value={
          stats.matchEnabled && stats.matchAvg > 0 ? `${stats.matchAvg}%` : "—"
        }
        label={
          stats.matchEnabled
            ? stats.matchTop > 0
              ? `Phù hợp TB · ${stats.matchTop} rất phù hợp`
              : "Phù hợp trung bình"
            : "Chưa bật barem"
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

/* -------------------- Card -------------------- */

function JobCard({
  job,
  match,
  delayMs,
  onOpen,
}: {
  job: Job;
  match: JobMatchResult | null;
  delayMs: number;
  onOpen: () => void;
}) {
  const matchedTechs = useMemo(
    () => new Set(match?.matchedTechs ?? []),
    [match],
  );

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
        {match && <MatchBadge score={match.score} tier={match.tier} />}
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
          {job.techStack.slice(0, 5).map((tech, i) => {
            const matched = matchedTechs.has(job.techSlugs[i]);
            return (
              <span
                key={tech}
                className={cn(
                  "rounded-md px-1.5 py-0.5 text-2xs font-medium",
                  matched
                    ? "bg-dot-green/15 text-dot-green"
                    : "bg-muted text-muted-foreground",
                )}
              >
                {tech}
              </span>
            );
          })}
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
  match,
  onDelete,
  isDeleting,
}: {
  job: Job;
  match: JobMatchResult | null;
  onDelete: () => void;
  isDeleting: boolean;
}) {
  const postedAt = formatDate(job.postedAt);
  const deadline = formatDate(job.deadline);
  const matchedTechs = new Set(match?.matchedTechs ?? []);

  return (
    <>
      <div className="border-b border-border p-5 pr-12">
        <div className="flex items-center gap-2">
          <SourcePill source={job.source} />
          {job.level && <Pill>{job.level}</Pill>}
          {job.employmentType && <Pill>{job.employmentType}</Pill>}
          {match && (
            <MatchBadge score={match.score} tier={match.tier} className="ml-auto" />
          )}
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

        {match && match.breakdown.length > 0 && (
          <Section title="Vì sao phù hợp">
            <ul className="space-y-1.5">
              {match.breakdown.map((item) => (
                <li
                  key={item.key}
                  className="flex items-center justify-between gap-3 text-sm"
                >
                  <span className="min-w-0 truncate text-muted-foreground">
                    <span className="text-foreground/80">{item.label}</span>
                    {" · "}
                    {item.detail}
                  </span>
                  <span
                    className={cn(
                      "shrink-0 font-semibold tabular-nums",
                      item.points < 0 ? "text-destructive" : "text-dot-green",
                    )}
                  >
                    {item.points >= 0 ? `+${item.points}` : item.points}
                  </span>
                </li>
              ))}
            </ul>
          </Section>
        )}

        {job.techStack.length > 0 && (
          <Section title="Công nghệ">
            <div className="flex flex-wrap gap-1.5">
              {job.techStack.map((tech, i) => {
                const matched = matchedTechs.has(job.techSlugs[i]);
                return (
                  <span
                    key={tech}
                    className={cn(
                      "rounded-md px-2 py-1 text-xs font-medium",
                      matched
                        ? "bg-dot-green/15 text-dot-green"
                        : "bg-muted text-foreground/80",
                    )}
                  >
                    {tech}
                  </span>
                );
              })}
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

function ToolbarToggle({
  icon: Icon,
  active,
  onClick,
  label,
  badge,
}: {
  icon: ComponentType<{ className?: string }>;
  active: boolean;
  onClick: () => void;
  label: string;
  /** Số đếm cảnh báo (vd workflow lỗi); chỉ hiện chip đỏ khi > 0. */
  badge?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md border px-3 text-sm font-medium transition-colors",
        active
          ? "border-dot-orange/30 bg-dot-orange/10 text-dot-orange"
          : "border-input bg-background text-foreground hover:bg-accent",
      )}
    >
      <Icon className="h-4 w-4" /> {label}
      {badge != null && badge > 0 && (
        <span
          className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1.5 text-2xs font-semibold tabular-nums text-destructive-foreground"
          aria-label={`${badge} workflow lỗi`}
        >
          {badge > 99 ? "99+" : badge}
        </span>
      )}
    </button>
  );
}

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

function computeStats(
  jobs: Job[],
  now: number,
  scored: Map<string, JobMatchResult>,
  matchEnabled: boolean,
): Stats {
  const withSalary = jobs.filter((j) => salaryBucketOf(j) !== "thoa-thuan");
  const reps = withSalary
    .map(repSalary)
    .filter((n) => n > 0)
    .sort((a, b) => a - b);
  const medianSalary = reps.length
    ? reps[Math.floor((reps.length - 1) / 2)]
    : 0;

  let matchAvg = 0;
  let matchTop = 0;
  if (matchEnabled && jobs.length > 0) {
    const scores = jobs.map((j) => scored.get(j.id)?.score ?? 0);
    matchAvg = Math.round(scores.reduce((s, n) => s + n, 0) / scores.length);
    matchTop = scores.filter((s) => s >= 80).length;
  }

  return {
    total: jobs.length,
    new7: jobs.filter((j) => withinDays(j, 7, now)).length,
    withSalaryCount: withSalary.length,
    medianSalary,
    matchEnabled,
    matchAvg,
    matchTop,
    byLevel: countBy(jobs, (j) => j.level).slice(0, 6),
    bySource: countBy(jobs, (j) => j.source).slice(0, 6),
    topCompanies: countBy(jobs, (j) => j.company || null).slice(0, 6),
  };
}

function sortJobs(jobs: Job[], key: SortKey): Job[] {
  const sorted = [...jobs];
  if (key === "posted") {
    sorted.sort((a, b) => dateValue(b.postedAt) - dateValue(a.postedAt));
  } else if (key === "salary") {
    sorted.sort((a, b) => repSalary(b) - repSalary(a));
  } else {
    // "crawl" và fallback khi "match" nhưng barem tắt.
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
