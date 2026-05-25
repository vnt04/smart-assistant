import type { CategoryKind } from "@assistant/shared";

interface SeedCategory {
  name: string;
  kind: CategoryKind;
  icon: string;
  color: string;
}

export const DEFAULT_CATEGORY_SEED: readonly SeedCategory[] = [
  { name: "Ăn uống", kind: "expense", icon: "utensils", color: "#f97316" },
  { name: "Di chuyển", kind: "expense", icon: "car", color: "#0ea5e9" },
  { name: "Mua sắm", kind: "expense", icon: "shopping-bag", color: "#ec4899" },
  { name: "Hoá đơn", kind: "expense", icon: "receipt", color: "#6366f1" },
  { name: "Giải trí", kind: "expense", icon: "film", color: "#a855f7" },
  { name: "Sức khoẻ", kind: "expense", icon: "heart", color: "#ef4444" },
  { name: "Học tập", kind: "expense", icon: "book", color: "#14b8a6" },
  { name: "Khác", kind: "expense", icon: "more-horizontal", color: "#64748b" },
  { name: "Lương", kind: "income", icon: "briefcase", color: "#22c55e" },
  { name: "Thưởng", kind: "income", icon: "gift", color: "#f59e0b" },
  { name: "Đầu tư", kind: "income", icon: "trending-up", color: "#06b6d4" },
  { name: "Thu khác", kind: "income", icon: "plus-circle", color: "#84cc16" },
];
