import { cn } from "@/lib/utils";

export const eq = {
  pageWrap: "mx-auto max-w-4xl space-y-6",
  pageTitle: "text-xl font-semibold tracking-tight text-foreground",
  pageLead: "mt-1 text-sm text-muted-foreground",
  section:
    "space-y-4 rounded-xl border border-border bg-card p-5 text-card-foreground sm:p-6",
  sectionMuted:
    "space-y-4 rounded-xl border border-border bg-muted/45 p-5 text-card-foreground sm:p-6 dark:bg-muted/25",
  sectionTitle: "text-sm font-semibold uppercase tracking-wide text-muted-foreground",
  label: "text-sm font-medium text-foreground",
  fieldGrid: "grid gap-4 sm:grid-cols-2",
  actionBar:
    "mt-6 flex flex-wrap items-center gap-3 border-t border-border bg-card pt-5 text-card-foreground",
  errorBanner:
    "rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive",
  photoCard:
    "space-y-4 rounded-xl border border-border bg-muted/45 p-5 text-card-foreground lg:sticky lg:top-4 dark:bg-muted/25",
  photoPreview:
    "relative aspect-[4/3] overflow-hidden rounded-lg border border-border bg-background",
  detailRow:
    "grid gap-1 border-b border-border/80 py-2 last:border-0 sm:grid-cols-[140px_1fr] sm:gap-4",
  detailValue: "text-sm text-foreground",
  detailSectionTitle: "text-base font-semibold text-foreground",
  servicePlanCta:
    "flex items-center gap-2 rounded-xl border-2 border-dashed border-[#E06737] bg-[#FFF3EC]/50 p-4 font-semibold text-[#E06737] transition-colors hover:bg-[#FFF3EC] dark:border-[#E06737]/70 dark:bg-[#E06737]/10 dark:text-[#F0A080] dark:hover:bg-[#E06737]/20",
  serviceRuleLink:
    "flex items-center justify-between gap-3 rounded-lg border border-border bg-muted/45 p-3 transition-colors hover:border-[#E06737]/40 dark:bg-muted/25",
  serviceRuleTitle: "font-medium text-foreground",
  listDivider: "border-b border-border/80",
} as const;

export function eqCategoryPill(selected: boolean) {
  return cn(
    "flex min-h-[44px] w-full items-center justify-center rounded-xl px-3 py-2 text-sm font-medium transition-all",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E06737]/40",
    selected
      ? "border-2 border-[#E06737] bg-[#FFF3EC] text-[#E06737] shadow-sm dark:border-[#E06737] dark:bg-[#E06737]/15 dark:text-[#F0A080]"
      : "border border-border bg-background text-muted-foreground hover:border-primary/35 hover:bg-muted/50 dark:bg-[#243247] dark:text-[#CBD5E1] dark:hover:border-[#475569] dark:hover:bg-[#2C3D55]"
  );
}

export function eqStatusPill(selected: boolean) {
  return eqCategoryPill(selected);
}
