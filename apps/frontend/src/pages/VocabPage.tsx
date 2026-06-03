import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  MAX_VOCAB_COUNT,
  MAX_VOCAB_TEXT_LENGTH,
  type CreateVocabInput,
  type VocabItem,
} from "@assistant/shared";
import {
  Flame,
  Languages,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "../components/ui/button";
import { useConfirm } from "../components/ui/confirm-dialog";
import { Input } from "../components/ui/input";
import { api } from "../lib/api";
import { cn } from "../lib/cn";

// Từ bị quên từ ngần này lần trở lên sẽ vào khu "Cần ôn tập nhất".
const REVIEW_MIN_COUNT = 2;
// Giới hạn số thẻ nổi bật để khu spotlight luôn gọn gàng.
const REVIEW_MAX_ITEMS = 9;

type Tier = "high" | "mid" | "low";

function tierOf(count: number): Tier {
  if (count >= 5) return "high";
  if (count >= REVIEW_MIN_COUNT) return "mid";
  return "low";
}

const TIER_BADGE: Record<Tier, string> = {
  high: "bg-dot-red/10 text-dot-red",
  mid: "bg-dot-orange/10 text-dot-orange",
  low: "bg-muted text-muted-foreground",
};

const TIER_BAR: Record<Tier, string> = {
  high: "bg-dot-red",
  mid: "bg-dot-orange",
  low: "bg-muted-foreground/40",
};

export function VocabPage() {
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const vocabQuery = useQuery({ queryKey: ["vocab"], queryFn: api.listVocab });

  const createMutation = useMutation({
    mutationFn: api.createVocab,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["vocab"] });
      setShowForm(false);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: api.deleteVocab,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["vocab"] }),
  });

  // Mở/đóng form; reset lỗi cũ của lần thêm trước để không hiện lại.
  function toggleForm(): void {
    createMutation.reset();
    setShowForm((open) => !open);
  }

  async function handleDelete(item: VocabItem): Promise<void> {
    const confirmed = await confirm({
      title: `Xóa “${item.text}”?`,
      description: "Từ này sẽ bị xóa khỏi danh sách ôn tập.",
      confirmText: "Xóa",
      variant: "destructive",
    });
    if (confirmed) deleteMutation.mutate(item.id);
  }

  const items = vocabQuery.data ?? [];

  // API đã sắp theo count, nhưng sắp lại phòng khi thứ tự server đổi.
  const sorted = useMemo(
    () =>
      [...items].sort(
        (a, b) => b.count - a.count || a.text.localeCompare(b.text),
      ),
    [items],
  );

  const reviewWords = useMemo(
    () =>
      sorted
        .filter((item) => item.count >= REVIEW_MIN_COUNT)
        .slice(0, REVIEW_MAX_ITEMS),
    [sorted],
  );
  const maxReviewCount = reviewWords[0]?.count ?? 1;

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return sorted;
    return sorted.filter((item) => item.text.toLowerCase().includes(query));
  }, [sorted, search]);

  return (
    <div className="h-full overflow-y-auto scrollbar-thin">
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 md:px-10 md:py-12">
        <header className="relative animate-fade-in">
          <div className="pointer-events-none absolute -left-10 -top-16 h-40 w-40 rounded-full bg-dot-cyan/10 blur-3xl" />
          <div className="relative flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-dot-cyan/10 text-dot-cyan ring-1 ring-inset ring-dot-cyan/20">
                <Languages className="h-6 w-6" />
              </span>
              <div className="min-w-0">
                <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
                  Words
                </h1>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  Ôn tập những từ bạn hay quên.
                </p>
              </div>
            </div>
            <Button
              type="button"
              size="sm"
              variant={showForm ? "outline" : "default"}
              onClick={toggleForm}
              className="shrink-0"
            >
              {showForm ? (
                <>
                  <X className="h-4 w-4" /> Đóng
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4" /> Thêm từ
                </>
              )}
            </Button>
          </div>

          {showForm && (
            <AddWordForm
              onSubmit={(input) => createMutation.mutate(input)}
              onCancel={() => setShowForm(false)}
              isPending={createMutation.isPending}
              serverError={
                createMutation.isError
                  ? "Không thể thêm từ. Vui lòng thử lại."
                  : null
              }
            />
          )}
        </header>

        <div className="mt-8">
          {vocabQuery.isLoading ? (
            <LoadingState />
          ) : vocabQuery.isError ? (
            <ErrorState onRetry={() => void vocabQuery.refetch()} />
          ) : items.length === 0 ? (
            <EmptyState />
          ) : (
            <div className="space-y-10">
              {reviewWords.length > 0 && (
                <section>
                  <SectionLabel icon={Flame} iconClass="text-dot-orange">
                    Cần ôn tập nhất
                  </SectionLabel>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {reviewWords.map((item, index) => (
                      <ReviewCard
                        key={item.id}
                        rank={index + 1}
                        item={item}
                        max={maxReviewCount}
                        delayMs={index * 45}
                      />
                    ))}
                  </div>
                </section>
              )}

              <section>
                <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <SectionLabel>Tất cả từ ({filtered.length})</SectionLabel>
                  <div className="relative sm:w-72">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Tìm từ…"
                      className="h-9 pl-9"
                      aria-label="Tìm từ"
                    />
                  </div>
                </div>

                {filtered.length === 0 ? (
                  <p className="rounded-2xl border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
                    Không tìm thấy từ nào khớp “{search.trim()}”.
                  </p>
                ) : (
                  <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
                    {filtered.map((item) => (
                      <WordRow
                        key={item.id}
                        item={item}
                        onDelete={handleDelete}
                        isDeleting={
                          deleteMutation.isPending &&
                          deleteMutation.variables === item.id
                        }
                      />
                    ))}
                  </ul>
                )}
              </section>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* -------------------- Pieces -------------------- */

function ReviewCard({
  rank,
  item,
  max,
  delayMs,
}: {
  rank: number;
  item: VocabItem;
  max: number;
  delayMs: number;
}) {
  const tier = tierOf(item.count);
  // Thanh "độ quên" so với từ bị quên nhiều nhất; tối thiểu 8% để luôn thấy.
  const pct = Math.max(8, Math.round((item.count / max) * 100));

  return (
    <article
      className="group relative animate-fade-in overflow-hidden rounded-2xl border border-border bg-card p-4 shadow-soft transition-all duration-200 hover:-translate-y-0.5 hover:shadow-pop"
      style={{ animationDelay: `${delayMs}ms`, animationFillMode: "both" }}
    >
      <span className="pointer-events-none absolute -right-1 -top-3 select-none text-6xl font-black leading-none text-muted-foreground/[0.08]">
        {rank}
      </span>

      <div className="relative flex items-center justify-between gap-2">
        <span className="inline-flex h-6 min-w-[1.5rem] items-center justify-center rounded-full bg-muted px-2 text-xs font-semibold text-muted-foreground">
          #{rank}
        </span>
        <CountBadge count={item.count} />
      </div>

      <div className="relative mt-3">
        <div className="truncate text-lg font-semibold tracking-tight">
          {item.text}
        </div>
        {item.notes && (
          <div className="mt-0.5 truncate text-xs text-muted-foreground">
            {item.notes}
          </div>
        )}
      </div>

      <div className="relative mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className={cn("h-full rounded-full transition-all", TIER_BAR[tier])}
          style={{ width: `${pct}%` }}
        />
      </div>
    </article>
  );
}

function WordRow({
  item,
  onDelete,
  isDeleting,
}: {
  item: VocabItem;
  onDelete: (item: VocabItem) => void;
  isDeleting: boolean;
}) {
  return (
    <li className="group flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/50">
      <span
        className={cn(
          "h-1.5 w-1.5 shrink-0 rounded-full",
          TIER_BAR[tierOf(item.count)],
        )}
        aria-hidden
      />
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium">{item.text}</div>
        {item.notes && (
          <div className="truncate text-xs text-muted-foreground">
            {item.notes}
          </div>
        )}
      </div>
      <CountBadge count={item.count} />
      <button
        type="button"
        onClick={() => onDelete(item)}
        disabled={isDeleting}
        aria-label={`Xóa từ ${item.text}`}
        title="Xóa từ"
        className={cn(
          "shrink-0 rounded-md p-1.5 text-muted-foreground/40 transition-colors",
          "hover:bg-destructive/10 hover:text-destructive",
          "focus-visible:text-destructive focus-visible:outline-none disabled:opacity-50",
          // Trên desktop chỉ hiện khi hover/focus; trên mobile luôn hiện.
          "sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100",
        )}
      >
        {isDeleting ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Trash2 className="h-4 w-4" />
        )}
      </button>
    </li>
  );
}

/** Form nhập từ thủ công: 1 ô từ, 1 ô số lần (tùy chọn). */
function AddWordForm({
  onSubmit,
  onCancel,
  isPending,
  serverError,
}: {
  onSubmit: (input: CreateVocabInput) => void;
  onCancel: () => void;
  isPending: boolean;
  serverError: string | null;
}) {
  const [text, setText] = useState("");
  const [count, setCount] = useState("");
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: FormEvent): void {
    e.preventDefault();
    const cleaned = text.trim().replace(/\s+/g, " ");
    if (!cleaned) {
      setError("Vui lòng nhập từ.");
      return;
    }
    if (cleaned.length > MAX_VOCAB_TEXT_LENGTH) {
      setError(`Từ tối đa ${MAX_VOCAB_TEXT_LENGTH} ký tự.`);
      return;
    }

    let parsedCount: number | undefined;
    const rawCount = count.trim();
    if (rawCount) {
      const n = Number(rawCount);
      if (!Number.isInteger(n) || n < 1 || n > MAX_VOCAB_COUNT) {
        setError(`Số lần phải là số nguyên từ 1 đến ${MAX_VOCAB_COUNT}.`);
        return;
      }
      parsedCount = n;
    }

    setError(null);
    onSubmit({ text: cleaned, count: parsedCount });
  }

  const message = error ?? serverError;

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-6 animate-fade-in rounded-2xl border border-border bg-card p-4 shadow-soft"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="min-w-0 flex-1">
          <label
            htmlFor="vocab-text"
            className="mb-1 block text-xs font-medium text-muted-foreground"
          >
            Từ mới
          </label>
          <Input
            id="vocab-text"
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              if (error) setError(null);
            }}
            placeholder="Nhập từ…"
            maxLength={MAX_VOCAB_TEXT_LENGTH}
            autoFocus
            disabled={isPending}
          />
        </div>
        <div className="sm:w-36">
          <label
            htmlFor="vocab-count"
            className="mb-1 block text-xs font-medium text-muted-foreground"
          >
            Số lần (tùy chọn)
          </label>
          <Input
            id="vocab-count"
            type="number"
            inputMode="numeric"
            min={1}
            max={MAX_VOCAB_COUNT}
            value={count}
            onChange={(e) => {
              setCount(e.target.value);
              if (error) setError(null);
            }}
            placeholder="1"
            disabled={isPending}
          />
        </div>
        <div className="flex gap-2">
          <Button type="submit" disabled={isPending}>
            {isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            Thêm
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            disabled={isPending}
          >
            Hủy
          </Button>
        </div>
      </div>
      {message && <p className="mt-2 text-sm text-destructive">{message}</p>}
    </form>
  );
}

function SectionLabel({
  children,
  icon: Icon,
  iconClass,
}: {
  children: ReactNode;
  icon?: typeof Flame;
  iconClass?: string;
}) {
  return (
    <div className="flex items-center gap-2">
      {Icon && <Icon className={cn("h-4 w-4", iconClass)} />}
      <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {children}
      </h2>
    </div>
  );
}

function CountBadge({ count }: { count: number }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold tabular-nums",
        TIER_BADGE[tierOf(count)],
      )}
      title={`Đã quên ${count} lần`}
    >
      {count}
      <span className="font-normal opacity-70">lần</span>
    </span>
  );
}

function LoadingState() {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 6 }).map((_, index) => (
        <div
          key={index}
          className="h-28 animate-pulse rounded-2xl border border-border bg-muted/40"
        />
      ))}
    </div>
  );
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="mx-auto flex max-w-sm flex-col items-center gap-3 py-16 text-center">
      <p className="text-sm text-muted-foreground">
        Không tải được danh sách vocab.
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
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-dot-cyan/10 text-dot-cyan">
        <Languages className="h-6 w-6" />
      </div>
      <div>
        <h2 className="text-base font-semibold">Chưa có từ nào</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Các từ sẽ xuất hiện ở đây khi extension gửi về. Hãy bắt đầu lưu những
          từ bạn hay quên.
        </p>
      </div>
    </div>
  );
}
