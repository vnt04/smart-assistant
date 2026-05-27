import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import type {
  BudgetStatus,
  Category,
  CategoryKind,
  CreateTransactionInput,
  Transaction,
  TransactionKind,
  Wallet,
  WalletType,
} from "@assistant/shared";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { useConfirm } from "../components/ui/confirm-dialog";
import { api, ApiError } from "../lib/api";
import { cn } from "../lib/cn";

type ExpenseTab = "transactions" | "wallets" | "budgets" | "reports";

type TransactionModalState = Transaction | "new" | null;
type WalletModalState = Wallet | "new" | null;
type BudgetModalState = BudgetStatus | "new" | null;

const TABS: { value: ExpenseTab; label: string }[] = [
  { value: "transactions", label: "Giao dịch" },
  { value: "wallets", label: "Ví" },
  { value: "budgets", label: "Ngân sách" },
  { value: "reports", label: "Báo cáo" },
];

const WALLET_TYPES: { value: WalletType; label: string }[] = [
  { value: "cash", label: "Tiền mặt" },
  { value: "bank", label: "Ngân hàng" },
  { value: "e_wallet", label: "Ví điện tử" },
  { value: "credit_card", label: "Thẻ tín dụng" },
];

const TRANSACTION_KINDS: { value: TransactionKind; label: string }[] = [
  { value: "expense", label: "Chi" },
  { value: "income", label: "Thu" },
  { value: "transfer", label: "Chuyển ví" },
];

const KIND_LABEL: Record<TransactionKind, string> = {
  expense: "Chi",
  income: "Thu",
  transfer: "Chuyển ví",
};

const KIND_TONE: Record<TransactionKind, string> = {
  expense: "border-rose-200 bg-rose-50 text-rose-700",
  income: "border-emerald-200 bg-emerald-50 text-emerald-700",
  transfer: "border-sky-200 bg-sky-50 text-sky-700",
};

const KIND_SIGN: Record<TransactionKind, string> = {
  expense: "-",
  income: "+",
  transfer: "↔",
};

const VN_DATE = new Intl.DateTimeFormat("vi-VN", {
  timeZone: "Asia/Ho_Chi_Minh",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

const CURRENCY = new Intl.NumberFormat("vi-VN", {
  style: "currency",
  currency: "VND",
  maximumFractionDigits: 0,
});

function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthRange(month: string): { from: string; to: string } {
  const [year, m] = month.split("-").map(Number);
  const from = new Date(year, m - 1, 1, 0, 0, 0, 0);
  const to = new Date(year, m, 0, 23, 59, 59, 999);
  return { from: from.toISOString(), to: to.toISOString() };
}

function toLocalDateTimeInput(iso?: string): string {
  const d = iso ? new Date(iso) : new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(
    d.getDate(),
  )}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromLocalDateTimeInput(value: string): string {
  return new Date(value).toISOString();
}

function formatMoney(value: number): string {
  return CURRENCY.format(value);
}

function parseMoney(value: string): number {
  return Number(value.replace(/[^0-9]/g, ""));
}

export function ExpensePage() {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const [tab, setTab] = useState<ExpenseTab>("transactions");
  const [month, setMonth] = useState(currentMonth);
  const [transactionModal, setTransactionModal] =
    useState<TransactionModalState>(null);
  const [walletModal, setWalletModal] = useState<WalletModalState>(null);
  const [budgetModal, setBudgetModal] = useState<BudgetModalState>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const range = useMemo(() => monthRange(month), [month]);

  const walletsQuery = useQuery({
    queryKey: ["wallets"],
    queryFn: api.listWallets,
  });
  const categoriesQuery = useQuery({
    queryKey: ["categories"],
    queryFn: api.listCategories,
  });
  const transactionsQuery = useQuery({
    queryKey: ["transactions", range],
    queryFn: () => api.listTransactions({ ...range, limit: 200, page: 1 }),
  });
  const budgetsQuery = useQuery({
    queryKey: ["budgets", month],
    queryFn: () => api.listBudgets(month),
  });
  const categoryReportQuery = useQuery({
    queryKey: ["expense-by-category", range],
    queryFn: () => api.expenseByCategory(range),
  });
  const trendQuery = useQuery({
    queryKey: ["expense-trend", range],
    queryFn: () => api.trend({ ...range, granularity: "day" }),
  });

  const wallets = walletsQuery.data ??[];
  const categories = categoriesQuery.data ??[];
  const transactions = transactionsQuery.data?.items ??[];
  const budgets = budgetsQuery.data ??[];

  const walletById = useMemo(
    () => new Map(wallets.map((wallet) => [wallet.id, wallet])),
    [wallets],
  );
  const categoryById = useMemo(
    () => new Map(categories.map((category) => [category.id, category])),
    [categories],
  );

  const summary = useMemo(() => {
    let expense = 0;
    let income = 0;
    for (const tx of transactions) {
      if (tx.kind === "expense") expense += tx.amount;
      if (tx.kind === "income") income += tx.amount;
    }
    return {
      balance: wallets.reduce((sum, wallet) => sum + wallet.balance, 0),
      income,
      expense,
      net: income - expense,
    };
  }, [transactions, wallets]);

  const invalidateExpense = (): void => {
    void qc.invalidateQueries({ queryKey: ["wallets"] });
    void qc.invalidateQueries({ queryKey: ["transactions"] });
    void qc.invalidateQueries({ queryKey: ["budgets"] });
    void qc.invalidateQueries({ queryKey: ["expense-by-category"] });
    void qc.invalidateQueries({ queryKey: ["expense-trend"] });
  };

  const createTransaction = useMutation({
    mutationFn: api.createTransaction,
    onSuccess: invalidateExpense,
  });
  const updateTransaction = useMutation({
    mutationFn: (args: {
      id: string;
      input: Parameters<typeof api.updateTransaction>[1];
    }) => api.updateTransaction(args.id, args.input),
    onSuccess: invalidateExpense,
  });
  const deleteTransaction = useMutation({
    mutationFn: api.deleteTransaction,
    onSuccess: invalidateExpense,
  });
  const createWallet = useMutation({
    mutationFn: api.createWallet,
    onSuccess: invalidateExpense,
  });
  const updateWallet = useMutation({
    mutationFn: (args: {
      id: string;
      input: Parameters<typeof api.updateWallet>[1];
    }) => api.updateWallet(args.id, args.input),
    onSuccess: invalidateExpense,
  });
  const deleteWallet = useMutation({
    mutationFn: api.deleteWallet,
    onSuccess: invalidateExpense,
  });
  const createBudget = useMutation({
    mutationFn: api.createBudget,
    onSuccess: invalidateExpense,
  });
  const updateBudget = useMutation({
    mutationFn: (args: {
      id: string;
      input: Parameters<typeof api.updateBudget>[1];
    }) => api.updateBudget(args.id, args.input),
    onSuccess: invalidateExpense,
  });
  const deleteBudget = useMutation({
    mutationFn: api.deleteBudget,
    onSuccess: invalidateExpense,
  });

  const downloadCsv = async (): Promise<void> => {
    try {
      const blob = await api.downloadCsv(range);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `chi-tieu-${month}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      setNotice("Đã tải CSV giao dịch tháng này.");
    } catch (err: unknown) {
      setNotice(err instanceof ApiError ? err.message : "Không tải được CSV");
    }
  };

  return (
    <section className="mx-auto max-w-7xl px-4 py-6">
      <div className="overflow-hidden rounded-[2rem] border bg-[#fbf7ef] shadow-sm">
        <div className="relative overflow-hidden bg-[radial-gradient(circle_at_top_left,#f97316_0,#f97316_24%,#111827_25%,#111827_60%,#0f766e_100%)] px-5 py-7 text-white md:px-8">
          <div className="absolute right-6 top-5 hidden h-28 w-28 rotate-12 rounded-[2rem] border border-white/25 md:block" />
          <p className="text-xs font-semibold uppercase tracking-[0.35em] text-orange-100">
            Sổ tiền riêng tư
          </p>
          <div className="mt-3 flex flex-col justify-between gap-4 md:flex-row md:items-end">
            <div>
              <h1 className="text-3xl font-black tracking-tight md:text-5xl">
                Chi tiêu
              </h1>
              <p className="mt-2 max-w-xl text-sm text-orange-50/90">
                Ví, giao dịch, ngân sách và báo cáo VND trong một bảng điều
                khiển.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-white/10 p-2 backdrop-blur">
              <Label htmlFor="expense-month" className="sr-only">
                Tháng
              </Label>
              <Input
                id="expense-month"
                type="month"
                value={month}
                onChange={(e) => setMonth(e.target.value)}
                className="w-40 border-white/20 bg-white text-slate-950"
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => void downloadCsv()}
              >
                Tải CSV
              </Button>
            </div>
          </div>
        </div>

        {notice && (
          <div className="border-b bg-amber-50 px-5 py-2 text-sm text-amber-800">
            {notice}{" "}
            <button
              type="button"
              className="underline"
              onClick={() => setNotice(null)}
            >
              đóng
            </button>
          </div>
        )}

        <div className="grid gap-3 border-b bg-[#fffaf1] p-4 md:grid-cols-4">
          <SummaryCard label="Tổng số dư" value={summary.balance} accent="bg-slate-950" />
          <SummaryCard label="Thu tháng" value={summary.income} accent="bg-emerald-500" />
          <SummaryCard label="Chi tháng" value={summary.expense} accent="bg-rose-500" />
          <SummaryCard label="Chênh lệch" value={summary.net} accent="bg-orange-500" />
        </div>

        <div className="flex gap-2 overflow-x-auto border-b bg-white px-4 py-3">
          {TABS.map((item) => (
            <button
              key={item.value}
              type="button"
              onClick={() => setTab(item.value)}
              className={cn(
                "rounded-full border px-4 py-2 text-sm font-medium transition",
                tab === item.value
                  ? "border-slate-950 bg-slate-950 text-white shadow-[4px_4px_0_#f97316]"
                  : "bg-white hover:border-slate-950",
              )}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="bg-white p-4 md:p-6">
          {tab === "transactions" && (
            <TransactionsTab
              transactions={transactions}
              wallets={wallets}
              categories={categories}
              walletById={walletById}
              categoryById={categoryById}
              isLoading={transactionsQuery.isLoading}
              onCreate={() => setTransactionModal("new")}
              onEdit={setTransactionModal}
              onDelete={async (tx) => {
                const ok = await confirm({
                  title: "Xoá giao dịch này?",
                  description: "Giao dịch sẽ bị xoá vĩnh viễn.",
                  confirmText: "Xoá",
                  variant: "destructive",
                });
                if (ok) deleteTransaction.mutate(tx.id);
              }}
            />
          )}
          {tab === "wallets" && (
            <WalletsTab
              wallets={wallets}
              isLoading={walletsQuery.isLoading}
              onCreate={() => setWalletModal("new")}
              onEdit={setWalletModal}
              onDelete={async (wallet) => {
                const ok = await confirm({
                  title: `Xoá ví "${wallet.name}"?`,
                  description: "Các giao dịch thuộc ví này có thể bị ảnh hưởng.",
                  confirmText: "Xoá",
                  variant: "destructive",
                });
                if (ok) deleteWallet.mutate(wallet.id);
              }}
            />
          )}
          {tab === "budgets" && (
            <BudgetsTab
              budgets={budgets}
              categories={categories}
              categoryById={categoryById}
              isLoading={budgetsQuery.isLoading}
              onCreate={() => setBudgetModal("new")}
              onEdit={setBudgetModal}
              onDelete={async (budget) => {
                const ok = await confirm({
                  title: "Xoá ngân sách này?",
                  description: "Ngân sách sẽ bị xoá vĩnh viễn.",
                  confirmText: "Xoá",
                  variant: "destructive",
                });
                if (ok) deleteBudget.mutate(budget.id);
              }}
            />
          )}
          {tab === "reports" && (
            <ReportsTab
              categoryReport={categoryReportQuery.data}
              trend={trendQuery.data?.buckets ??[]}
            />
          )}
        </div>
      </div>

      {transactionModal && (
        <TransactionModal
          initial={transactionModal === "new" ? null : transactionModal}
          wallets={wallets}
          categories={categories}
          isPending={createTransaction.isPending || updateTransaction.isPending}
          onClose={() => setTransactionModal(null)}
          onSubmit={async (input, id) => {
            if (id) {
              await updateTransaction.mutateAsync({
                id,
                input: {
                  amount: input.amount,
                  categoryId: input.categoryId ?? null,
                  occurredAt: input.occurredAt,
                  note: input.note ?? null,
                },
              });
            } else {
              await createTransaction.mutateAsync(input);
            }
            setTransactionModal(null);
          }}
        />
      )}

      {walletModal && (
        <WalletModal
          initial={walletModal === "new" ? null : walletModal}
          isPending={createWallet.isPending || updateWallet.isPending}
          onClose={() => setWalletModal(null)}
          onSubmit={async (input, id) => {
            if (id) await updateWallet.mutateAsync({ id, input });
            else await createWallet.mutateAsync(input);
            setWalletModal(null);
          }}
        />
      )}

      {budgetModal && (
        <BudgetModal
          initial={budgetModal === "new" ? null : budgetModal}
          month={month}
          categories={categories.filter((c) => c.kind === "expense")}
          isPending={createBudget.isPending || updateBudget.isPending}
          onClose={() => setBudgetModal(null)}
          onSubmit={async (input, id) => {
            if (id) {
              await updateBudget.mutateAsync({
                id,
                input: {
                  amount: input.amount,
                  alertThresholdPct: input.alertThresholdPct,
                },
              });
            } else {
              await createBudget.mutateAsync(input);
            }
            setBudgetModal(null);
          }}
        />
      )}
    </section>
  );
}

function SummaryCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent: string;
}) {
  return (
    <article className="rounded-2xl border bg-white p-4 shadow-sm">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase text-muted-foreground">
        <span className={cn("h-2.5 w-2.5 rounded-full", accent)} />
        {label}
      </div>
      <div className="mt-2 text-xl font-black tracking-tight md:text-2xl">
        {formatMoney(value)}
      </div>
    </article>
  );
}

interface TransactionsTabProps {
  transactions: Transaction[];
  wallets: Wallet[];
  categories: Category[];
  walletById: Map<string, Wallet>;
  categoryById: Map<string, Category>;
  isLoading: boolean;
  onCreate: () => void;
  onEdit: (tx: Transaction) => void;
  onDelete: (tx: Transaction) => void;
}

function TransactionsTab({
  transactions,
  wallets,
  categories,
  walletById,
  categoryById,
  isLoading,
  onCreate,
  onEdit,
  onDelete,
}: TransactionsTabProps) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-xl font-bold">Dòng tiền trong tháng</h2>
          <p className="text-sm text-muted-foreground">
            {wallets.length} ví · {categories.length} danh mục
          </p>
        </div>
        <Button onClick={onCreate}>+ Giao dịch</Button>
      </div>
      <div className="overflow-hidden rounded-2xl border">
        <div className="hidden grid-cols-[110px_90px_1fr_1fr_1fr_110px] gap-3 bg-muted/40 px-4 py-2 text-xs font-semibold uppercase text-muted-foreground md:grid">
          <span>Ngày</span>
          <span>Loại</span>
          <span>Ví</span>
          <span>Danh mục</span>
          <span>Số tiền</span>
          <span />
        </div>
        {isLoading && <p className="p-4 text-sm text-muted-foreground">Đang tải…</p>}
        {!isLoading && transactions.length === 0 && (
          <p className="p-8 text-center text-sm text-muted-foreground">
            Chưa có giao dịch trong tháng này.
          </p>
        )}
        <div className="divide-y">
          {transactions.map((tx) => (
            <article
              key={tx.id}
              className="grid gap-2 px-4 py-3 text-sm md:grid-cols-[110px_90px_1fr_1fr_1fr_110px] md:items-center md:gap-3"
            >
              <time className="font-medium">
                {VN_DATE.format(new Date(tx.occurredAt))}
              </time>
              <span
                className={cn(
                  "w-fit rounded-full border px-2 py-0.5 text-xs",
                  KIND_TONE[tx.kind],
                )}
              >
                {KIND_LABEL[tx.kind]}
              </span>
              <span>{walletById.get(tx.walletId)?.name ?? "Ví đã xoá"}</span>
              <span className="text-muted-foreground">
                {tx.kind === "transfer"
                  ? `→ ${walletById.get(tx.transferToWalletId ?? "")?.name ?? "Ví đích"}`
                  : categoryById.get(tx.categoryId ?? "")?.name ?? "Không danh mục"}
              </span>
              <span
                className={cn(
                  "font-bold",
                  tx.kind === "expense" && "text-rose-600",
                  tx.kind === "income" && "text-emerald-600",
                )}
              >
                {KIND_SIGN[tx.kind]} {formatMoney(tx.amount)}
              </span>
              <div className="flex gap-1 md:justify-end">
                <Button size="sm" variant="outline" onClick={() => onEdit(tx)}>
                  Sửa
                </Button>
                <Button size="sm" variant="ghost" onClick={() => onDelete(tx)}>
                  Xoá
                </Button>
              </div>
              {tx.note && (
                <p className="text-xs text-muted-foreground md:col-span-6">
                  {tx.note}
                </p>
              )}
            </article>
          ))}
        </div>
      </div>
    </div>
  );
}

interface WalletsTabProps {
  wallets: Wallet[];
  isLoading: boolean;
  onCreate: () => void;
  onEdit: (wallet: Wallet) => void;
  onDelete: (wallet: Wallet) => void;
}

function WalletsTab({
  wallets,
  isLoading,
  onCreate,
  onEdit,
  onDelete,
}: WalletsTabProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xl font-bold">Các ví</h2>
        <Button onClick={onCreate}>+ Ví</Button>
      </div>
      {isLoading && <p className="text-sm text-muted-foreground">Đang tải…</p>}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {wallets.map((wallet) => (
          <article
            key={wallet.id}
            className={cn(
              "rounded-3xl border p-5 shadow-sm",
              wallet.archived ? "bg-muted/40 opacity-70" : "bg-white",
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-2xl">{wallet.icon ?? "◉"}</span>
                  <h3 className="font-bold">{wallet.name}</h3>
                </div>
                <p className="mt-1 text-xs uppercase text-muted-foreground">
                  {WALLET_TYPES.find((t) => t.value === wallet.type)?.label}
                  {wallet.archived ? " · đã lưu trữ" : ""}
                </p>
              </div>
              <span
                className="h-7 w-7 rounded-full border"
                style={{ background: wallet.color ?? "#f97316" }}
              />
            </div>
            <div className="mt-6 text-2xl font-black">
              {formatMoney(wallet.balance)}
            </div>
            <div className="mt-4 flex gap-2">
              <Button size="sm" variant="outline" onClick={() => onEdit(wallet)}>
                Sửa
              </Button>
              <Button size="sm" variant="ghost" onClick={() => onDelete(wallet)}>
                Xoá
              </Button>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

interface BudgetsTabProps {
  budgets: BudgetStatus[];
  categories: Category[];
  categoryById: Map<string, Category>;
  isLoading: boolean;
  onCreate: () => void;
  onEdit: (budget: BudgetStatus) => void;
  onDelete: (budget: BudgetStatus) => void;
}

function BudgetsTab({
  budgets,
  categories,
  categoryById,
  isLoading,
  onCreate,
  onEdit,
  onDelete,
}: BudgetsTabProps) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-xl font-bold">Ngân sách danh mục</h2>
          <p className="text-sm text-muted-foreground">
            {categories.filter((c) => c.kind === "expense").length} danh mục chi
            tiêu
          </p>
        </div>
        <Button onClick={onCreate}>+ Ngân sách</Button>
      </div>
      {isLoading && <p className="text-sm text-muted-foreground">Đang tải…</p>}
      <div className="space-y-3">
        {budgets.map((budget) => {
          const category = categoryById.get(budget.categoryId);
          const tone =
            budget.percent >= 100
              ? "bg-rose-500"
              : budget.percent >= budget.alertThresholdPct
                ? "bg-amber-400"
                : "bg-emerald-500";
          return (
            <article key={budget.id} className="rounded-2xl border bg-white p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="font-bold">
                    {category?.name ?? "Danh mục đã xoá"}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    Đã chi {formatMoney(budget.spent)} / {formatMoney(budget.amount)} · còn {formatMoney(Math.max(0, budget.remaining))}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => onEdit(budget)}>
                    Sửa
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => onDelete(budget)}>
                    Xoá
                  </Button>
                </div>
              </div>
              <div className="mt-3 h-3 overflow-hidden rounded-full bg-muted">
                <div
                  className={cn("h-full rounded-full", tone)}
                  style={{ width: `${Math.min(100, budget.percent)}%` }}
                />
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {budget.percent.toFixed(0)}% · cảnh báo ở {budget.alertThresholdPct}%
              </p>
            </article>
          );
        })}
        {!isLoading && budgets.length === 0 && (
          <p className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">
            Chưa đặt ngân sách cho tháng này.
          </p>
        )}
      </div>
    </div>
  );
}

interface ReportsTabProps {
  categoryReport: Awaited<ReturnType<typeof api.expenseByCategory>> | undefined;
  trend: { bucket: string; expense: number; income: number }[];
}

function ReportsTab({ categoryReport, trend }: ReportsTabProps) {
  return (
    <div className="grid gap-4 lg:grid-cols-[0.85fr_1.15fr]">
      <article className="rounded-3xl border bg-[#fffaf1] p-5">
        <h2 className="text-xl font-bold">Chi theo danh mục</h2>
        <DonutChart
          items={categoryReport?.items ??[]}
          total={categoryReport?.total ?? 0}
        />
      </article>
      <article className="rounded-3xl border bg-white p-5">
        <h2 className="text-xl font-bold">Thu / chi theo ngày</h2>
        <TrendChart buckets={trend} />
      </article>
    </div>
  );
}

function DonutChart({
  items,
  total,
}: {
  items: { categoryName: string; color: string | null; total: number }[];
  total: number;
}) {
  if (items.length === 0 || total === 0) {
    return <p className="mt-8 text-sm text-muted-foreground">Chưa có dữ liệu chi tiêu.</p>;
  }
  let offset = 25;
  return (
    <div className="mt-5 grid gap-5 sm:grid-cols-[180px_1fr] sm:items-center">
      <svg viewBox="0 0 42 42" className="h-44 w-44 -rotate-90">
        <circle
          cx="21"
          cy="21"
          r="15.915"
          fill="transparent"
          stroke="#e5e7eb"
          strokeWidth="7"
        />
        {items.map((item, index) => {
          const value = (item.total / total) * 100;
          const dash = `${value} ${100 - value}`;
          const strokeDashoffset = offset;
          offset -= value;
          return (
            <circle
              key={item.categoryName}
              cx="21"
              cy="21"
              r="15.915"
              fill="transparent"
              stroke={item.color ?? ["#f97316", "#0f766e", "#e11d48", "#2563eb"][index % 4]}
              strokeWidth="7"
              strokeDasharray={dash}
              strokeDashoffset={strokeDashoffset}
            />
          );
        })}
      </svg>
      <div className="space-y-2">
        {items.map((item, index) => (
          <div
            key={item.categoryName}
            className="flex items-center justify-between gap-3 text-sm"
          >
            <span className="flex items-center gap-2">
              <span
                className="h-3 w-3 rounded-full"
                style={{
                  background:
                    item.color ??
                    ["#f97316", "#0f766e", "#e11d48", "#2563eb"][index % 4],
                }}
              />
              {item.categoryName}
            </span>
            <span className="font-semibold">{formatMoney(item.total)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function TrendChart({
  buckets,
}: {
  buckets: { bucket: string; expense: number; income: number }[];
}) {
  const max = Math.max(1, ...buckets.flatMap((b) => [b.expense, b.income]));
  if (buckets.length === 0) {
    return <p className="mt-8 text-sm text-muted-foreground">Chưa có dữ liệu xu hướng.</p>;
  }
  return (
    <div className="mt-5 flex h-72 items-end gap-1 overflow-x-auto rounded-2xl border bg-muted/20 p-3">
      {buckets.map((bucket) => (
        <div
          key={bucket.bucket}
          className="flex min-w-[28px] flex-1 flex-col items-center justify-end gap-1"
        >
          <div className="flex h-56 items-end gap-1">
            <div
              className="w-2 rounded-t bg-rose-500"
              style={{ height: `${Math.max(4, (bucket.expense / max) * 220)}px` }}
              title={`Chi: ${formatMoney(bucket.expense)}`}
            />
            <div
              className="w-2 rounded-t bg-emerald-500"
              style={{ height: `${Math.max(4, (bucket.income / max) * 220)}px` }}
              title={`Thu: ${formatMoney(bucket.income)}`}
            />
          </div>
          <span className="text-[10px] text-muted-foreground">
            {bucket.bucket.slice(-2)}
          </span>
        </div>
      ))}
    </div>
  );
}

interface TransactionModalProps {
  initial: Transaction | null;
  wallets: Wallet[];
  categories: Category[];
  isPending: boolean;
  onClose: () => void;
  onSubmit: (input: CreateTransactionInput, id?: string) => Promise<void>;
}

function TransactionModal({
  initial,
  wallets,
  categories,
  isPending,
  onClose,
  onSubmit,
}: TransactionModalProps) {
  const [kind, setKind] = useState<TransactionKind>(initial?.kind ?? "expense");
  const [amount, setAmount] = useState(String(initial?.amount ?? ""));
  const [walletId, setWalletId] = useState(initial?.walletId ?? wallets[0]?.id ?? "");
  const [transferToWalletId, setTransferToWalletId] = useState(
    initial?.transferToWalletId ?? "",
  );
  const [categoryId, setCategoryId] = useState(initial?.categoryId ?? "");
  const [occurredAt, setOccurredAt] = useState(
    toLocalDateTimeInput(initial?.occurredAt),
  );
  const [note, setNote] = useState(initial?.note ?? "");
  const [error, setError] = useState<string | null>(null);

  const filteredCategories = categories.filter(
    (c) => c.kind === (kind as CategoryKind),
  );
  const canEditShape = !initial;

  const submit = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    setError(null);
    try {
      const parsedAmount = parseMoney(amount);
      if (!parsedAmount || !walletId) {
        setError("Chọn ví và nhập số tiền hợp lệ");
        return;
      }
      if (kind === "transfer" && (!transferToWalletId || transferToWalletId === walletId)) {
        setError("Ví đích phải khác ví nguồn");
        return;
      }
      await onSubmit(
        {
          kind,
          amount: parsedAmount,
          walletId,
          transferToWalletId: kind === "transfer" ? transferToWalletId : null,
          categoryId: kind === "transfer" ? null : categoryId || null,
          occurredAt: fromLocalDateTimeInput(occurredAt),
          note: note.trim() ? note.trim() : null,
        },
        initial?.id,
      );
    } catch (err: unknown) {
      setError(err instanceof ApiError ? err.message : "Không lưu được giao dịch");
    }
  };

  return (
    <Modal title={initial ? "Sửa giao dịch" : "Giao dịch mới"} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Loại" id="tx-kind">
            <SelectBox
              id="tx-kind"
              value={kind}
              disabled={!canEditShape}
              onChange={(value) => setKind(value as TransactionKind)}
            >
              {TRANSACTION_KINDS.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </SelectBox>
          </Field>
          <Field label="Số tiền" id="tx-amount">
            <Input
              id="tx-amount"
              required
              inputMode="numeric"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={kind === "transfer" ? "Ví nguồn" : "Ví"} id="tx-wallet">
            <SelectBox
              id="tx-wallet"
              value={walletId}
              disabled={!canEditShape}
              onChange={setWalletId}
            >
              {wallets.map((wallet) => (
                <option key={wallet.id} value={wallet.id}>
                  {wallet.name}
                </option>
              ))}
            </SelectBox>
          </Field>
          {kind === "transfer" ? (
            <Field label="Ví đích" id="tx-to-wallet">
              <SelectBox
                id="tx-to-wallet"
                value={transferToWalletId}
                disabled={!canEditShape}
                onChange={setTransferToWalletId}
              >
                <option value="">Chọn ví đích</option>
                {wallets
                  .filter((wallet) => wallet.id !== walletId)
                  .map((wallet) => (
                    <option key={wallet.id} value={wallet.id}>
                      {wallet.name}
                    </option>
                  ))}
              </SelectBox>
            </Field>
          ) : (
            <Field label="Danh mục" id="tx-category">
              <SelectBox id="tx-category" value={categoryId} onChange={setCategoryId}>
                <option value="">Không danh mục</option>
                {filteredCategories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </SelectBox>
            </Field>
          )}
        </div>
        <Field label="Thời điểm" id="tx-at">
          <Input
            id="tx-at"
            type="datetime-local"
            required
            value={occurredAt}
            onChange={(e) => setOccurredAt(e.target.value)}
          />
        </Field>
        <Field label="Ghi chú" id="tx-note">
          <TextAreaBox
            id="tx-note"
            maxLength={500}
            rows={3}
            value={note}
            onChange={setNote}
          />
        </Field>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <ModalActions
          onClose={onClose}
          isPending={isPending}
          submitLabel={initial ? "Lưu" : "Tạo"}
        />
      </form>
    </Modal>
  );
}

interface WalletModalProps {
  initial: Wallet | null;
  isPending: boolean;
  onClose: () => void;
  onSubmit: (
    input: Parameters<typeof api.createWallet>[0],
    id?: string,
  ) => Promise<void>;
}

function WalletModal({ initial, isPending, onClose, onSubmit }: WalletModalProps) {
  const [name, setName] = useState(initial?.name ?? "");
  const [type, setType] = useState<WalletType>(initial?.type ?? "cash");
  const [balance, setBalance] = useState(String(initial?.balance ?? "0"));
  const [icon, setIcon] = useState(initial?.icon ?? "");
  const [color, setColor] = useState(initial?.color ?? "#f97316");
  const [archived, setArchived] = useState(initial?.archived ?? false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    setError(null);
    try {
      const base = { name: name.trim(), type, icon: icon.trim() || null, color };
      const payload = initial
        ? { ...base, archived }
        : { ...base, balance: parseMoney(balance) };
      await onSubmit(payload, initial?.id);
    } catch (err: unknown) {
      setError(err instanceof ApiError ? err.message : "Không lưu được ví");
    }
  };

  return (
    <Modal title={initial ? "Sửa ví" : "Ví mới"} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <Field label="Tên ví" id="wallet-name">
          <Input
            id="wallet-name"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Loại ví" id="wallet-type">
            <SelectBox
              id="wallet-type"
              value={type}
              onChange={(value) => setType(value as WalletType)}
            >
              {WALLET_TYPES.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </SelectBox>
          </Field>
          <Field label="Số dư ban đầu" id="wallet-balance">
            <Input
              id="wallet-balance"
              disabled={Boolean(initial)}
              inputMode="numeric"
              value={balance}
              onChange={(e) => setBalance(e.target.value)}
            />
          </Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Icon" id="wallet-icon">
            <Input
              id="wallet-icon"
              maxLength={64}
              value={icon}
              onChange={(e) => setIcon(e.target.value)}
              placeholder="💳"
            />
          </Field>
          <Field label="Màu" id="wallet-color">
            <Input
              id="wallet-color"
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
            />
          </Field>
        </div>
        {initial && (
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={archived}
              onChange={(e) => setArchived(e.target.checked)}
            />
            Lưu trữ ví
          </label>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
        <ModalActions
          onClose={onClose}
          isPending={isPending}
          submitLabel={initial ? "Lưu" : "Tạo"}
        />
      </form>
    </Modal>
  );
}

interface BudgetModalProps {
  initial: BudgetStatus | null;
  month: string;
  categories: Category[];
  isPending: boolean;
  onClose: () => void;
  onSubmit: (
    input: Parameters<typeof api.createBudget>[0],
    id?: string,
  ) => Promise<void>;
}

function BudgetModal({
  initial,
  month,
  categories,
  isPending,
  onClose,
  onSubmit,
}: BudgetModalProps) {
  const [categoryId, setCategoryId] = useState(
    initial?.categoryId ?? categories[0]?.id ?? "",
  );
  const [amount, setAmount] = useState(String(initial?.amount ?? ""));
  const [threshold, setThreshold] = useState(
    String(initial?.alertThresholdPct ?? 80),
  );
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    setError(null);
    try {
      const parsedAmount = parseMoney(amount);
      if (!categoryId || !parsedAmount) {
        setError("Chọn danh mục và nhập ngân sách hợp lệ");
        return;
      }
      await onSubmit(
        {
          categoryId,
          month,
          amount: parsedAmount,
          alertThresholdPct: Number(threshold) || 80,
        },
        initial?.id,
      );
    } catch (err: unknown) {
      setError(err instanceof ApiError ? err.message : "Không lưu được ngân sách");
    }
  };

  return (
    <Modal title={initial ? "Sửa ngân sách" : "Ngân sách mới"} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <Field label="Danh mục" id="budget-category">
          <SelectBox
            id="budget-category"
            value={categoryId}
            disabled={Boolean(initial)}
            onChange={setCategoryId}
          >
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </SelectBox>
        </Field>
        <Field label="Số tiền" id="budget-amount">
          <Input
            id="budget-amount"
            required
            inputMode="numeric"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </Field>
        <Field label="Cảnh báo (%)" id="budget-threshold">
          <Input
            id="budget-threshold"
            type="number"
            min={1}
            max={100}
            required
            value={threshold}
            onChange={(e) => setThreshold(e.target.value)}
          />
        </Field>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <ModalActions
          onClose={onClose}
          isPending={isPending}
          submitLabel={initial ? "Lưu" : "Tạo"}
        />
      </form>
    </Modal>
  );
}

function SelectBox({
  id,
  value,
  disabled,
  onChange,
  children,
}: {
  id: string;
  value: string;
  disabled?: boolean;
  onChange: (value: string) => void;
  children: ReactNode;
}) {
  return (
    <select
      id={id}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
    >
      {children}
    </select>
  );
}

function TextAreaBox({
  id,
  value,
  rows,
  maxLength,
  onChange,
}: {
  id: string;
  value: string;
  rows: number;
  maxLength: number;
  onChange: (value: string) => void;
}) {
  return (
    <textarea
      id={id}
      rows={rows}
      maxLength={maxLength}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    />
  );
}

function Field({
  label,
  id,
  children,
}: {
  label: string;
  id: string;
  children: ReactNode;
}) {
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}

function ModalActions({
  onClose,
  isPending,
  submitLabel,
}: {
  onClose: () => void;
  isPending: boolean;
  submitLabel: string;
}) {
  return (
    <div className="flex justify-end gap-2 pt-2">
      <Button type="button" variant="outline" onClick={onClose}>
        Huỷ
      </Button>
      <Button type="submit" disabled={isPending}>
        {isPending ? "Đang lưu…" : submitLabel}
      </Button>
    </div>
  );
}

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-3xl bg-background shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b px-5 py-4">
          <h2 className="text-lg font-bold">{title}</h2>
          <button
            type="button"
            className="rounded-full px-2 py-1 text-muted-foreground hover:bg-accent"
            onClick={onClose}
            aria-label="Đóng"
          >
            ✕
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}
