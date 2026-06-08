import { cn } from "@/lib/utils";

export const eq = {
  pageWrap: "mx-auto max-w-4xl space-y-6",
  pageTitle: "text-xl font-semibold text-[#0F2A4D] tracking-tight",
  pageLead: "text-sm text-muted-foreground mt-1",
  section: "rounded-xl border border-[#E2E8F0] bg-white p-5 sm:p-6 space-y-4",
  sectionMuted: "rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-5 sm:p-6 space-y-4",
  sectionTitle: "text-sm font-semibold uppercase tracking-wide text-[#64748B]",
  label: "text-sm font-medium text-[#0F2A4D]",
  fieldGrid: "grid gap-4 sm:grid-cols-2",
  actionBar:
    "flex flex-wrap items-center gap-3 border-t border-[#E2E8F0] bg-white pt-5 mt-6",
  errorBanner:
    "rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800",
  photoCard: "rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-5 space-y-4 lg:sticky lg:top-4",
  photoPreview:
    "relative overflow-hidden rounded-lg border border-[#E2E8F0] bg-white aspect-[4/3]",
} as const;

export function eqCategoryPill(selected: boolean) {
  return cn(
    "flex min-h-[44px] w-full items-center justify-center rounded-xl px-3 py-2 text-sm font-medium transition-all",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E06737]/40",
    selected
      ? "border-2 border-[#E06737] bg-[#FFF3EC] text-[#E06737] shadow-sm"
      : "border border-[#E2E8F0] bg-white text-[#475569] hover:border-[#CBD5E1] hover:bg-[#FAFBFC]"
  );
}

export function eqStatusPill(selected: boolean) {
  return eqCategoryPill(selected);
}
