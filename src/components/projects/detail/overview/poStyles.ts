import { cn } from "@/lib/utils";

/** Shared surfaces for Project Command View — uses CSS variables from globals.css */
export const po = {
  page: "mx-auto w-full max-w-[1280px]",
  card: cn(
    "rounded-xl border border-[var(--po-card-border)] bg-[var(--po-card-bg)] text-[var(--po-text-primary)] shadow-sm"
  ),
  cardMuted: cn(
    "rounded-lg border border-[var(--po-card-border)] bg-[var(--po-card-muted)]"
  ),
  cardElevated: cn(
    "rounded-xl border border-[var(--po-card-border)] bg-[var(--po-card-bg-elevated)] shadow-sm"
  ),
  title: "text-base font-semibold text-[var(--po-text-primary)]",
  titleSm: "text-sm font-semibold text-[var(--po-text-primary)]",
  label: "text-[11px] font-medium uppercase tracking-wide text-[var(--po-text-muted)]",
  body: "text-sm text-[var(--po-text-secondary)]",
  bodyStrong: "text-sm font-medium text-[var(--po-text-primary)]",
  muted: "text-xs text-[var(--po-text-muted)]",
  link: "text-xs font-medium text-[var(--po-primary)] hover:text-[var(--po-primary-hover)]",
  btnPrimary:
    "bg-[var(--po-primary)] text-white hover:bg-[var(--po-primary-hover)] min-h-11 sm:min-h-9",
  btnOutline:
    "border-[var(--po-card-border)] bg-transparent text-[var(--po-text-primary)] hover:bg-[var(--po-card-muted)] min-h-11 sm:min-h-9",
  progressTrack: "h-1.5 w-full overflow-hidden rounded-full bg-[var(--po-card-muted)]",
  progressFill: "h-full rounded-full bg-[var(--po-primary)] transition-all",
  divider: "border-[var(--po-card-border)]",
};
