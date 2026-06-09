import { useMemo, useState, type ReactNode } from "react";
import {
  MATCH_CRITERION_LABELS,
  jobMatchWeightKeys,
  type JobMatchProfile,
  type JobMatchWeightKey,
  type TechFacet,
} from "@assistant/shared";
import { Loader2, RotateCcw, Search, X } from "lucide-react";
import { Button } from "../ui/button";
import { Sheet, SheetContent, SheetTitle } from "../ui/sheet";
import { cn } from "../../lib/cn";

interface MatchProfileEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  profile: JobMatchProfile;
  onChange: (next: JobMatchProfile) => void;
  onSave: () => void;
  onReset: () => void;
  isSaving: boolean;
  isDirty: boolean;
  facets: TechFacet[];
  levelOptions: string[];
  typeOptions: string[];
  locationOptions: string[];
}

const MIN_SCORE_OPTIONS: { value: number | null; label: string }[] = [
  { value: null, label: "Hiện tất cả" },
  { value: 40, label: "≥ 40%" },
  { value: 60, label: "≥ 60%" },
  { value: 80, label: "≥ 80%" },
];

export function MatchProfileEditor({
  open,
  onOpenChange,
  profile,
  onChange,
  onSave,
  onReset,
  isSaving,
  isDirty,
  facets,
  levelOptions,
  typeOptions,
  locationOptions,
}: MatchProfileEditorProps) {
  const set = (patch: Partial<JobMatchProfile>) =>
    onChange({ ...profile, ...patch });
  const setWeight = (key: JobMatchWeightKey, value: number) =>
    onChange({ ...profile, weights: { ...profile.weights, [key]: value } });

  const techOptions = useMemo(
    () => facets.map((f) => ({ value: f.slug, label: f.name, count: f.count })),
    [facets],
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full max-w-[95vw] flex-col gap-0 p-0 sm:w-[560px]"
      >
        <div className="flex items-center justify-between border-b border-border p-5 pr-12">
          <div className="min-w-0">
            <SheetTitle className="text-lg leading-snug">
              Barem chấm điểm
            </SheetTitle>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Cá nhân hóa & ưu tiên job phù hợp lên đầu.
            </p>
          </div>
          <Toggle
            checked={profile.enabled}
            onChange={(v) => set({ enabled: v })}
            label="Bật"
          />
        </div>

        <div
          className={cn(
            "flex-1 space-y-1 overflow-y-auto scrollbar-thin",
            !profile.enabled && "pointer-events-none opacity-50",
          )}
        >
          <Section
            title="Trọng số tiêu chí"
            hint="0 = bỏ qua, 10 = quan trọng nhất."
          >
            <div className="space-y-2.5">
              {jobMatchWeightKeys.map((key) => (
                <WeightSlider
                  key={key}
                  label={MATCH_CRITERION_LABELS[key]}
                  value={profile.weights[key]}
                  onChange={(v) => setWeight(key, v)}
                />
              ))}
            </div>
          </Section>

          <Section
            title="Kỹ năng mong muốn"
            hint="Job có càng nhiều kỹ năng này càng được điểm cao."
          >
            <TechPicker
              options={techOptions}
              selected={profile.preferredTechs}
              onChange={(v) => set({ preferredTechs: v })}
              placeholder="Tìm công nghệ…"
            />
          </Section>

          <Section title="Kỹ năng né tránh" hint="Job chứa kỹ năng này bị trừ điểm.">
            <TechPicker
              options={techOptions}
              selected={profile.avoidTechs}
              onChange={(v) => set({ avoidTechs: v })}
              placeholder="Tìm công nghệ…"
            />
          </Section>

          <Section title="Mức lương kỳ vọng (VND/tháng)">
            <div className="grid grid-cols-2 gap-2.5">
              <SalaryField
                label="Mong muốn"
                value={profile.desiredSalary}
                onChange={(v) => set({ desiredSalary: v })}
              />
              <SalaryField
                label="Sàn tối thiểu"
                value={profile.minSalary}
                onChange={(v) => set({ minSalary: v })}
              />
            </div>
            <CheckRow
              checked={profile.hideBelowMinSalary}
              onChange={(v) => set({ hideBelowMinSalary: v })}
              label="Ẩn job dưới mức sàn"
            />
          </Section>

          {levelOptions.length > 0 && (
            <Section title="Cấp bậc ưu tiên">
              <ChipGroup
                options={levelOptions.map((v) => ({ value: v, label: v }))}
                selected={profile.preferredLevels}
                onChange={(v) => set({ preferredLevels: v })}
              />
            </Section>
          )}

          {typeOptions.length > 0 && (
            <Section title="Hình thức ưu tiên">
              <ChipGroup
                options={typeOptions.map((v) => ({ value: v, label: v }))}
                selected={profile.preferredEmploymentTypes}
                onChange={(v) => set({ preferredEmploymentTypes: v })}
              />
            </Section>
          )}

          {locationOptions.length > 0 && (
            <Section title="Địa điểm ưu tiên">
              <ChipGroup
                options={locationOptions.map((v) => ({ value: v, label: v }))}
                selected={profile.preferredLocations}
                onChange={(v) => set({ preferredLocations: v })}
              />
            </Section>
          )}

          <Section title="Từ khóa nên có" hint="Xuất hiện trong tin tuyển → cộng điểm.">
            <TagInput
              values={profile.positiveKeywords}
              onChange={(v) => set({ positiveKeywords: v })}
              placeholder="VD: remote, AI… (Enter để thêm)"
            />
          </Section>

          <Section title="Từ khóa nên tránh" hint="Xuất hiện → trừ điểm.">
            <TagInput
              values={profile.negativeKeywords}
              onChange={(v) => set({ negativeKeywords: v })}
              placeholder="VD: tester, outsource…"
            />
          </Section>

          <Section
            title="Độ mới"
            hint={`Sau ${profile.freshnessHalfLifeDays} ngày, điểm độ mới còn một nửa.`}
          >
            <WeightSlider
              label="Chu kỳ bán rã (ngày)"
              value={profile.freshnessHalfLifeDays}
              min={1}
              max={60}
              onChange={(v) => set({ freshnessHalfLifeDays: v })}
            />
          </Section>

          <Section title="Lọc theo điểm" hint="Chỉ hiển thị job đạt ngưỡng điểm.">
            <div className="flex flex-wrap gap-1.5">
              {MIN_SCORE_OPTIONS.map((o) => (
                <Chip
                  key={String(o.value)}
                  active={profile.minScore === o.value}
                  label={o.label}
                  onClick={() => set({ minScore: o.value })}
                />
              ))}
            </div>
          </Section>
        </div>

        <div className="flex items-center gap-2 border-t border-border p-4">
          <Button
            type="button"
            variant="outline"
            onClick={onReset}
            className="gap-1.5"
          >
            <RotateCcw className="h-4 w-4" /> Mặc định
          </Button>
          <Button
            type="button"
            onClick={onSave}
            disabled={isSaving || !isDirty}
            className="flex-1 gap-1.5"
          >
            {isSaving && <Loader2 className="h-4 w-4 animate-spin" />}
            {isDirty ? "Lưu barem" : "Đã lưu"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

/* -------------------- Controls -------------------- */

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <section className="border-t border-border px-5 py-4 first:border-t-0">
      <h3 className="text-sm font-semibold">{title}</h3>
      {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
      <div className="mt-2.5">{children}</div>
    </section>
  );
}

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors",
        checked ? "bg-dot-orange" : "bg-muted",
      )}
    >
      <span
        className={cn(
          "inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform",
          checked ? "translate-x-5" : "translate-x-0.5",
        )}
      />
    </button>
  );
}

function WeightSlider({
  label,
  value,
  onChange,
  min = 0,
  max = 10,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
}) {
  return (
    <label className="flex items-center gap-3">
      <span className="w-28 shrink-0 truncate text-sm text-foreground/80">
        {label}
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-muted accent-dot-orange"
      />
      <span className="w-6 shrink-0 text-right text-sm font-semibold tabular-nums text-muted-foreground">
        {value}
      </span>
    </label>
  );
}

function CheckRow({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
}) {
  return (
    <label className="mt-2.5 flex cursor-pointer items-center gap-2 text-sm text-foreground/80">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 rounded border-input accent-dot-orange"
      />
      {label}
    </label>
  );
}

const NUMBER_INPUT_CLASS =
  "h-9 w-full rounded-md border border-input bg-background px-2.5 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring";

/** Nhập lương theo đơn vị triệu cho dễ; lưu trữ về VND. */
function SalaryField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
}) {
  const trieu = value == null ? "" : String(Math.round(value / 1_000_000));
  return (
    <label className="block">
      <span className="text-xs text-muted-foreground">{label} (triệu)</span>
      <input
        type="number"
        inputMode="numeric"
        min={0}
        value={trieu}
        onChange={(e) => {
          const raw = e.target.value.trim();
          if (raw === "") return onChange(null);
          const n = Number(raw);
          onChange(Number.isFinite(n) && n >= 0 ? Math.round(n * 1_000_000) : null);
        }}
        placeholder="—"
        className={cn(NUMBER_INPUT_CLASS, "mt-1")}
      />
    </label>
  );
}

interface ChipOption {
  value: string;
  label: string;
  count?: number;
}

function Chip({
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

function ChipGroup({
  options,
  selected,
  onChange,
}: {
  options: ChipOption[];
  selected: string[];
  onChange: (values: string[]) => void;
}) {
  const sel = new Set(selected);
  const toggle = (value: string) =>
    onChange(
      sel.has(value) ? selected.filter((v) => v !== value) : [...selected, value],
    );
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <Chip
          key={o.value}
          active={sel.has(o.value)}
          label={o.label}
          count={o.count}
          onClick={() => toggle(o.value)}
        />
      ))}
    </div>
  );
}

/** Số công nghệ tối đa hiển thị khi không tìm kiếm. */
const TECH_VISIBLE_LIMIT = 24;

function TechPicker({
  options,
  selected,
  onChange,
  placeholder,
}: {
  options: ChipOption[];
  selected: string[];
  onChange: (values: string[]) => void;
  placeholder: string;
}) {
  const [query, setQuery] = useState("");
  const sel = useMemo(() => new Set(selected), [selected]);
  const toggle = (value: string) =>
    onChange(
      sel.has(value) ? selected.filter((v) => v !== value) : [...selected, value],
    );

  const trimmed = query.trim().toLowerCase();
  const visible = useMemo(() => {
    const matched = trimmed
      ? options.filter(
          (o) =>
            o.label.toLowerCase().includes(trimmed) ||
            o.value.toLowerCase().includes(trimmed),
        )
      : options;
    const ordered = [...matched].sort(
      (a, b) => Number(sel.has(b.value)) - Number(sel.has(a.value)),
    );
    return trimmed ? ordered : ordered.slice(0, TECH_VISIBLE_LIMIT);
  }, [options, trimmed, sel]);

  return (
    <div>
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={placeholder}
          aria-label={placeholder}
          className="h-8 w-full rounded-md border border-input bg-background pl-8 pr-2 text-xs outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>
      <div className="mt-2.5 flex flex-wrap gap-1.5">
        {visible.length === 0 ? (
          <p className="py-1 text-xs text-muted-foreground">Không tìm thấy.</p>
        ) : (
          visible.map((o) => (
            <Chip
              key={o.value}
              active={sel.has(o.value)}
              label={o.label}
              count={o.count}
              onClick={() => toggle(o.value)}
            />
          ))
        )}
      </div>
    </div>
  );
}

function TagInput({
  values,
  onChange,
  placeholder,
}: {
  values: string[];
  onChange: (values: string[]) => void;
  placeholder: string;
}) {
  const [draft, setDraft] = useState("");

  const add = () => {
    const v = draft.trim();
    if (v && !values.some((x) => x.toLowerCase() === v.toLowerCase())) {
      onChange([...values, v]);
    }
    setDraft("");
  };
  const remove = (value: string) =>
    onChange(values.filter((v) => v !== value));

  return (
    <div>
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            add();
          }
        }}
        onBlur={add}
        placeholder={placeholder}
        aria-label={placeholder}
        className="h-8 w-full rounded-md border border-input bg-background px-2.5 text-xs outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring"
      />
      {values.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {values.map((v) => (
            <span
              key={v}
              className="inline-flex items-center gap-1 rounded-full border border-dot-orange/30 bg-dot-orange/10 py-0.5 pl-2.5 pr-1 text-xs font-medium text-dot-orange"
            >
              <span className="max-w-[160px] truncate">{v}</span>
              <button
                type="button"
                onClick={() => remove(v)}
                aria-label={`Bỏ ${v}`}
                className="rounded-full p-0.5 transition-colors hover:bg-dot-orange/20"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
