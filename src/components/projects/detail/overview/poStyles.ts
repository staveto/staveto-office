import { cn } from "@/lib/utils";

/** Shared surfaces for Project Command View — uses CSS variables from globals.css */
export const po = {
  page: "mx-auto w-full max-w-[1280px]",
  sectionGap: "flex flex-col gap-7",
  card: cn(
    "rounded-xl border border-[var(--po-card-border)]/70 bg-[var(--po-card-bg)] text-[var(--po-text-primary)]"
  ),
  /** KPI / status — not interactive */
  infoCard: cn(
    "rounded-xl border border-[var(--po-card-border)]/60 bg-[var(--po-card-bg)] text-[var(--po-text-primary)]"
  ),
  /** Calmer overview section — less visual weight */
  cardCalm: cn(
    "rounded-xl border border-[var(--po-card-border)]/40 bg-[var(--po-card-bg)]/80 text-[var(--po-text-primary)]"
  ),
  /** Dominant urgent / action card */
  urgentCard: cn(
    "rounded-2xl border-2 border-orange-500/50 bg-gradient-to-br from-orange-500/[0.14] via-[var(--po-card-bg)] to-[var(--po-card-bg)] shadow-lg shadow-orange-500/10"
  ),
  /** Navigable summary card */
  clickableCard: cn(
    "rounded-xl border border-[var(--po-card-border)]/70 bg-[var(--po-card-bg)] text-[var(--po-text-primary)]",
    "cursor-pointer transition-all hover:border-[var(--po-text-muted)]/50 hover:bg-[var(--po-card-muted)]/40"
  ),
  cardMuted: cn(
    "rounded-lg border border-[var(--po-card-border)]/50 bg-[var(--po-card-muted)]/60"
  ),
  cardElevated: cn(
    "rounded-xl border border-[var(--po-card-border)] bg-[var(--po-card-bg-elevated)]"
  ),
  sectionTitle: "text-base font-semibold tracking-tight text-[var(--po-text-primary)]",
  sectionTitleLg: "text-lg font-semibold tracking-tight text-[var(--po-text-primary)] sm:text-xl",
  title: "text-[15px] font-semibold text-[var(--po-text-primary)]",
  titleSm: "text-sm font-semibold text-[var(--po-text-primary)]",
  label: "text-xs font-medium text-[var(--po-text-muted)]",
  labelCaps: "text-[11px] font-medium uppercase tracking-wide text-[var(--po-text-muted)]",
  body: "text-sm text-[var(--po-text-secondary)]",
  bodyStrong: "text-sm font-medium text-[var(--po-text-primary)]",
  muted: "text-xs text-[var(--po-text-muted)]",
  link: "text-xs font-medium text-sky-700 hover:text-sky-800 dark:text-sky-400 dark:hover:text-sky-300",
  linkAction:
    "inline-flex items-center gap-1 text-xs font-medium text-sky-700 transition-colors hover:text-sky-800 dark:text-sky-400 dark:hover:text-sky-300",
  btnPrimary:
    "bg-[var(--po-primary)] text-white hover:bg-[var(--po-primary-hover)] min-h-11 text-[15px] font-semibold sm:min-h-10",
  btnPrimaryLg:
    "bg-[var(--po-primary)] text-white hover:bg-[var(--po-primary-hover)] min-h-12 px-6 text-base font-semibold shadow-md shadow-orange-500/20 sm:min-h-11",
  btnOutline:
    "border-[var(--po-card-border)] bg-transparent text-[var(--po-text-secondary)] hover:bg-[var(--po-card-muted)]/80 hover:text-[var(--po-text-primary)] min-h-10 sm:min-h-9",
  btnGhost:
    "text-[var(--po-text-secondary)] hover:bg-[var(--po-card-muted)]/80 hover:text-[var(--po-text-primary)] min-h-10 sm:min-h-9",
  btnDanger:
    "border-red-500/40 bg-red-500/10 text-red-800 hover:bg-red-500/15 dark:text-red-200 min-h-10 sm:min-h-9",
  kpiGrid: "grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5",
  kpiItem:
    "rounded-md border border-transparent bg-[var(--po-card-muted)]/40 px-2.5 py-2 select-none",
  progressTrack: "h-1.5 w-full overflow-hidden rounded-full bg-[var(--po-card-muted)]",
  progressFill: "h-full rounded-full bg-[var(--po-primary)] transition-all",
  divider: "border-[var(--po-card-border)]/60",
};
