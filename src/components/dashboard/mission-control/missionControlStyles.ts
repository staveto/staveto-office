import { cn } from "@/lib/utils";

/** Elevated surface — white on light, solid card on dark (not translucent). */
export const missionGlassCardClassName = cn(
  "rounded-xl border border-[#f0c9b7] bg-[#fff7f2] shadow-[0_1px_3px_rgba(224,103,55,0.10)]",
  "dark:border-white/10 dark:bg-[#1e293b] dark:shadow-none"
);

export const missionHeroCardClassName = cn(
  missionGlassCardClassName,
  "ring-1 ring-primary/20 dark:ring-white/10"
);

export const missionSectionTitleClassName =
  "text-[13px] font-semibold uppercase tracking-wide text-[#8a4b2a] dark:text-muted-foreground";

export const missionMutedClassName = "text-sm text-[#6b5a4f] dark:text-muted-foreground";

export const missionStatusToneClassName: Record<string, string> = {
  on_site: "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200/80 dark:bg-emerald-500/15 dark:text-emerald-400 dark:ring-emerald-500/30",
  service: "bg-amber-50 text-amber-800 ring-1 ring-amber-200/80 dark:bg-amber-500/15 dark:text-amber-400 dark:ring-amber-500/30",
  absent: "bg-rose-50 text-rose-800 ring-1 ring-rose-200/80 dark:bg-rose-500/15 dark:text-rose-400 dark:ring-rose-500/30",
  free: "bg-slate-100 text-slate-600 ring-1 ring-slate-200/80 dark:bg-slate-500/15 dark:text-slate-400 dark:ring-slate-500/30",
  unknown: "bg-muted text-muted-foreground",
};
