/** Shared, theme-aware styling for settings forms (light + dark). */
export const settingsCardClassName =
  "border border-border bg-card text-card-foreground shadow-sm ring-1 ring-foreground/10";

export const settingsFieldGroupClassName =
  "rounded-lg border border-border bg-muted/50 p-4 dark:bg-muted/30";

export const settingsFieldLabelClassName = "text-sm font-semibold text-foreground";

export const settingsFieldHintClassName = "text-sm leading-relaxed text-muted-foreground";

export const settingsInputClassName =
  "h-10 border-input bg-background text-foreground shadow-sm placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/25";

export const settingsSelectTriggerClassName =
  "h-10 w-full border-input bg-background text-foreground shadow-sm data-placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/25";

export const settingsProfileRowClassName =
  "rounded-lg border border-border bg-muted/50 px-4 py-3 dark:bg-muted/30";

export const settingsProfileLabelClassName =
  "text-xs font-semibold uppercase tracking-wide text-muted-foreground";

export const settingsProfileValueClassName = "mt-1 text-sm font-medium text-foreground";

export const settingsAccentLinkClassName =
  "font-medium text-[#1D376A] hover:underline dark:text-[#7eb8f0]";

export const settingsAccentIconClassName = "text-[#1D376A] dark:text-[#7eb8f0]";

export const settingsHighlightCardClassName =
  "border-[#1D376A]/15 bg-[#1D376A]/[0.03] dark:border-[#4a9fd9]/25 dark:bg-[#1D376A]/15";

export const settingsCompletionCardClassName =
  "border-amber-200 bg-amber-50/80 dark:border-amber-800/50 dark:bg-amber-950/35";

export const settingsCompletionTitleClassName = "text-base text-amber-950 dark:text-amber-100";

export const settingsCompletionDescriptionClassName =
  "text-amber-900/80 dark:text-amber-200/80";

export const settingsCompletionBodyClassName = "text-amber-900/90 dark:text-amber-100/90";

export const settingsComingSoonClassName =
  "rounded-lg border border-dashed border-border bg-muted/40 px-4 py-8 text-center text-sm text-muted-foreground";

/** Shared high-contrast surfaces for dashboard panels and lists. */
export const appSectionHeadingClassName =
  "text-sm font-bold tracking-tight text-foreground";

export const appPanelClassName = settingsCardClassName;

export const appPanelInsetClassName =
  "rounded-xl border border-border bg-card p-4 shadow-sm";

export const appListRowClassName =
  "flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 shadow-sm transition-colors hover:border-primary/35 hover:bg-muted/40";

export const appMutedTextClassName = "text-sm leading-relaxed text-muted-foreground";

export const appSubtleTextClassName = "text-xs leading-relaxed text-muted-foreground";

export const appOutlineActionClassName =
  "border-border bg-background text-foreground shadow-sm hover:border-primary/35 hover:bg-muted/50";
