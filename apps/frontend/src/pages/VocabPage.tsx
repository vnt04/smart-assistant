import { useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import type { VocabItem } from "@assistant/shared";
import { Flame, Languages, RefreshCw, Search } from "lucide-react";
import { Input } from "../components/ui/input";
import { api } from "../lib/api";
import { cn } from "../lib/cn";

// Words seen at least this many times are surfaced in the "needs review" block.
const REVIEW_MIN_COUNT = 2;
// Cap the review block so it stays scannable even with a huge vocabulary.
const REVIEW_MAX_ITEMS = 12;

export function VocabPage() {
  const [search, setSearch] = useState("");
  const vocabQuery = useQuery({
    queryKey: ["vocab"],
    queryFn: api.listVocab,
  });

  const items = vocabQuery.data ?? [];

  // The API already orders by count, but re-sort defensively so the view stays
  // correct regardless of server-side ordering changes.
  const sorted = useMemo(
    () =>
      [...items].sort(
        (a, b) => b.count - a.count || a.text.localeCompare(b.text),
      ),
    [items],
  );

  const stats = useMemo(
    () => ({
      unique: items.length,
      totalOccurrences: items.reduce((sum, item) => sum + item.count, 0),
    }),
    [items],
  );

  const reviewWords = useMemo(
    () =>
      sorted.filter((item) => item.count >= REVIEW_MIN_COUNT).slice(0, REVIEW_MAX_ITEMS),
    [sorted],
  );

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return sorted;
    return sorted.filter((item) => item.text.toLowerCase().includes(query));
  }, [sorted, search]);

  return (
    <div className="h-full overflow-y-auto scrollbar-thin">
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 md:px-10 md:py-10">
        <header className="mb-6">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-dot-cyan/10 text-dot-cyan">
              <Languages className="h-5 w-5" />
            </div>
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              Vocab
            </h1>
          </div>
          <p className="mt-2 max-w-xl text-sm text-muted-foreground">
            Những từ bạn hay quên được extension ghi lại tự động. Ôn tập các từ
            xuất hiện nhiều nhất bên dưới.
          </p>
          {items.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              <StatChip label="Tổng số từ" value={stats.unique} />
              <StatChip label="Tổng lượt quên" value={stats.totalOccurrences} />
            </div>
          )}
        </header>

        {vocabQuery.isLoading ? (
          <LoadingState />
        ) : vocabQuery.isError ? (
          <ErrorState onRetry={() => void vocabQuery.refetch()} />
        ) : items.length === 0 ? (
          <EmptyState />
        ) : (
          <>
            {reviewWords.length > 0 && (
              <section className="mb-8">
                <SectionTitle icon={Flame} iconClass="text-dot-orange">
                  Cần ôn tập nhất
                </SectionTitle>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {reviewWords.map((item, index) => (
                    <article
                      key={item.id}
                      className="flex items-center gap-3 rounded-xl border border-border bg-card p-3"
                    >
                      <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">
                        {index + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium">{item.text}</div>
                        {item.notes && (
                          <div className="truncate text-xs text-muted-foreground">
                            {item.notes}
                          </div>
                        )}
                      </div>
                      <CountBadge count={item.count} />
                    </article>
                  ))}
                </div>
              </section>
            )}

            <section>
              <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <SectionTitle>Tất cả từ ({filtered.length})</SectionTitle>
                <div className="relative sm:w-64">
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
                <p className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
                  Không tìm thấy từ nào khớp “{search.trim()}”.
                </p>
              ) : (
                <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
                  {filtered.map((item) => (
                    <li
                      key={item.id}
                      className="flex items-center gap-3 px-4 py-3"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium">{item.text}</div>
                        {item.notes && (
                          <div className="truncate text-xs text-muted-foreground">
                            {item.notes}
                          </div>
                        )}
                      </div>
                      <CountBadge count={item.count} />
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
}

/* -------------------- Pieces -------------------- */

function StatChip({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2">
      <div className="text-lg font-semibold leading-none">{value}</div>
      <div className="mt-1 text-2xs text-muted-foreground">{label}</div>
    </div>
  );
}

function SectionTitle({
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
  const tier = count >= 5 ? "high" : count >= REVIEW_MIN_COUNT ? "mid" : "low";
  const tierClass = {
    high: "bg-dot-red/10 text-dot-red",
    mid: "bg-dot-orange/10 text-dot-orange",
    low: "bg-muted text-muted-foreground",
  }[tier];
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold tabular-nums",
        tierClass,
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
    <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
      Đang tải…
    </div>
  );
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="m-auto flex max-w-sm flex-col items-center gap-3 py-16 text-center">
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
    <div className="m-auto flex max-w-sm flex-col items-center gap-3 py-16 text-center">
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
