import { cn } from "@/lib/utils";

/**
 * Operations Home — calm, professional surfaces.
 * White cards, subtle neutral borders, no warm/orange fills.
 * Orange is reserved for primary CTAs and attention states only.
 */
export const opsCardClassName = cn(
  "rounded-xl border border-border bg-card shadow-[0_1px_2px_rgba(16,24,40,0.04)]",
  "dark:border-white/10 dark:bg-[#1e293b] dark:shadow-none"
);

export const opsSectionTitleClassName =
  "text-[13px] font-semibold uppercase tracking-wide text-muted-foreground";

export const opsMutedClassName = "text-sm text-muted-foreground";

export type OpsTone = "neutral" | "success" | "warning" | "danger";

/** Soft status pills (resource / metric indicators). */
export const opsToneBadgeClassName: Record<OpsTone, string> = {
  neutral:
    "bg-slate-100 text-slate-600 ring-1 ring-slate-200/80 dark:bg-slate-500/15 dark:text-slate-300 dark:ring-slate-500/30",
  success:
    "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200/80 dark:bg-emerald-500/15 dark:text-emerald-400 dark:ring-emerald-500/30",
  warning:
    "bg-amber-50 text-amber-800 ring-1 ring-amber-200/80 dark:bg-amber-500/15 dark:text-amber-400 dark:ring-amber-500/30",
  danger:
    "bg-rose-50 text-rose-700 ring-1 ring-rose-200/80 dark:bg-rose-500/15 dark:text-rose-400 dark:ring-rose-500/30",
};

/** Small status dot color. */
export const opsToneDotClassName: Record<OpsTone, string> = {
  neutral: "bg-slate-300 dark:bg-slate-500",
  success: "bg-emerald-500",
  warning: "bg-amber-500",
  danger: "bg-rose-500",
};

/** Solid bar fill (workflow board / progress). */
export const opsToneBarClassName: Record<OpsTone, string> = {
  neutral: "bg-slate-300 dark:bg-slate-600",
  success: "bg-emerald-500",
  warning: "bg-[#e06737]",
  danger: "bg-rose-500",
};

/**
 * Priority dot for next-step items. Red is intentionally avoided — attention
 * items use the amber/orange accent, informational items stay neutral.
 */
export const opsPriorityDotClassName: Record<"high" | "medium" | "normal", string> = {
  high: "bg-[#e06737]",
  medium: "bg-slate-300 dark:bg-slate-600",
  normal: "bg-slate-300 dark:bg-slate-600",
};
