import type { JobMatchTier } from "@assistant/shared";
import { Sparkles } from "lucide-react";
import { cn } from "../../lib/cn";

interface TierMeta {
  label: string;
  badge: string;
  dot: string;
}

const TIER_META: Record<JobMatchTier, TierMeta> = {
  excellent: {
    label: "Rất phù hợp",
    badge: "bg-dot-green/10 text-dot-green",
    dot: "bg-dot-green",
  },
  good: {
    label: "Phù hợp",
    badge: "bg-dot-blue/10 text-dot-blue",
    dot: "bg-dot-blue",
  },
  fair: {
    label: "Cân nhắc",
    badge: "bg-dot-orange/10 text-dot-orange",
    dot: "bg-dot-orange",
  },
  low: {
    label: "Ít phù hợp",
    badge: "bg-muted text-muted-foreground",
    dot: "bg-muted-foreground",
  },
};

export function tierLabel(tier: JobMatchTier): string {
  return TIER_META[tier].label;
}

export function tierDotClass(tier: JobMatchTier): string {
  return TIER_META[tier].dot;
}

/** Huy hiệu điểm phù hợp (barem cá nhân) hiển thị trên thẻ job & drawer. */
export function MatchBadge({
  score,
  tier,
  className,
}: {
  score: number;
  tier: JobMatchTier;
  className?: string;
}) {
  const meta = TIER_META[tier];
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums",
        meta.badge,
        className,
      )}
      title={`${meta.label} · ${score}%`}
    >
      <Sparkles className="h-3 w-3" />
      {score}%
    </span>
  );
}
