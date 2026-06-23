"use client";

import { useEffect } from "react";
import { Search } from "lucide-react";
import { useI18n } from "@/i18n/I18nContext";
import { cn } from "@/lib/utils";

function isMacPlatform(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Mac|iPhone|iPad|iPod/.test(navigator.platform);
}

export function useSearchShortcut(onOpen: () => void) {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        onOpen();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onOpen]);
}

type GlobalSearchInputProps = {
  onOpen: () => void;
};

export function GlobalSearchInput({ onOpen }: GlobalSearchInputProps) {
  const { t } = useI18n();
  const modKey = isMacPlatform() ? "⌘" : "Ctrl";

  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        "flex h-9 w-full max-w-md items-center gap-2 rounded-lg border border-border/70 bg-muted/40 px-3 text-sm text-muted-foreground",
        "transition-colors hover:bg-muted/70 hover:text-foreground",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
      )}
      aria-label={t("search.open")}
    >
      <Search className="size-4 shrink-0" aria-hidden />
      <span className="hidden flex-1 truncate text-left sm:inline">{t("search.placeholder")}</span>
      <kbd className="ml-auto hidden rounded border border-border bg-background px-1.5 py-0.5 text-[10px] font-medium sm:inline">
        {modKey}+K
      </kbd>
    </button>
  );
}

export function GlobalSearchTriggerMobile({ onOpen }: GlobalSearchInputProps) {
  const { t } = useI18n();

  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex size-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground md:hidden"
      aria-label={t("search.open")}
    >
      <Search className="size-5" />
    </button>
  );
}
