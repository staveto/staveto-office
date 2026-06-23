"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Search } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useGlobalSearch } from "@/hooks/useGlobalSearch";
import { useI18n } from "@/i18n/I18nContext";
import { cn } from "@/lib/utils";
import type { SearchIndexItem } from "@/types/search";
import { SearchCategoryGroupBlock } from "./SearchCategoryGroup";
import { SearchResultItem } from "./SearchResultItem";

type SearchCommandPaletteProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function SearchCommandPalette({ open, onOpenChange }: SearchCommandPaletteProps) {
  const { t } = useI18n();
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);

  const { groups, flatResults, loading, error, aiFallbackAvailable, quickActions, hasQuery, isEmpty } =
    useGlobalSearch(query, open);

  const navigateTo = useCallback(
    (item: SearchIndexItem) => {
      onOpenChange(false);
      setQuery("");
      router.push(item.route);
    },
    [onOpenChange, router]
  );

  useEffect(() => {
    if (open) {
      const id = window.requestAnimationFrame(() => inputRef.current?.focus());
      return () => window.cancelAnimationFrame(id);
    }
    setQuery("");
    setSelectedIndex(0);
    return undefined;
  }, [open]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query, flatResults.length]);

  useEffect(() => {
    if (!open) return;
    const el = document.querySelector<HTMLElement>(`[data-search-index="${selectedIndex}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex, open]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      const max = flatResults.length > 0 ? flatResults.length - 1 : quickActions.length - 1;
      setSelectedIndex((i) => Math.min(i + 1, Math.max(0, max)));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      if (flatResults.length > 0 && flatResults[selectedIndex]) {
        navigateTo(flatResults[selectedIndex]);
      } else if (isEmpty && quickActions[selectedIndex]) {
        navigateTo(quickActions[selectedIndex]);
      }
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      onOpenChange(false);
    }
  };

  let indexOffset = 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="gap-0 overflow-hidden p-0 sm:max-w-xl"
        onKeyDown={handleKeyDown}
      >
        <DialogTitle className="sr-only">{t("search.title")}</DialogTitle>

        <div className="flex items-center gap-3 border-b border-border px-4 py-3">
          <Search className="size-5 shrink-0 text-muted-foreground" aria-hidden />
          <input
            ref={inputRef}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("search.placeholder")}
            className="flex-1 bg-transparent text-base text-foreground placeholder:text-muted-foreground focus:outline-none"
            aria-label={t("search.placeholder")}
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
          />
          {loading ? <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" /> : null}
          <kbd className="hidden rounded-md border border-border bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground sm:inline">
            Esc
          </kbd>
        </div>

        <div className="max-h-[min(60vh,420px)] overflow-y-auto pb-2">
          {!hasQuery ? (
            <p className="px-4 py-6 text-sm text-muted-foreground">{t("search.hint")}</p>
          ) : null}

          {error ? (
            <p className="px-4 py-4 text-sm text-destructive" role="alert">
              {t("search.error")}
            </p>
          ) : null}

          {hasQuery && !loading && !error && flatResults.length > 0 ? (
            <div>
              {groups.map((group) => {
                const block = (
                  <SearchCategoryGroupBlock
                    key={group.type}
                    group={group}
                    selectedIndex={selectedIndex}
                    indexOffset={indexOffset}
                    onSelect={navigateTo}
                    onHover={setSelectedIndex}
                  />
                );
                indexOffset += group.items.length;
                return block;
              })}
            </div>
          ) : null}

          {isEmpty ? (
            <div className="px-4 py-4">
              <p className="text-sm text-muted-foreground">{t("search.noResults")}</p>
              {quickActions.length > 0 ? (
                <div className="mt-3">
                  <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {t("search.quickActions")}
                  </p>
                  <ul className="space-y-0.5">
                    {quickActions.map((item, i) => (
                      <li key={item.id}>
                        <SearchResultItem
                          item={item}
                          typeLabel={t("search.category.action")}
                          selected={selectedIndex === i}
                          index={i}
                          onSelect={navigateTo}
                          onHover={setSelectedIndex}
                        />
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {aiFallbackAvailable ? (
                <p
                  className={cn(
                    "mt-4 rounded-lg border border-dashed border-border px-3 py-2 text-xs text-muted-foreground"
                  )}
                >
                  {/* TODO: Connect Staveto AI assistant as fallback when no results match. */}
                  {t("search.aiFallbackHint")}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="flex items-center justify-between border-t border-border bg-muted/30 px-4 py-2 text-[11px] text-muted-foreground">
          <span>{t("search.footerNavigate")}</span>
          <span>{t("search.footerClose")}</span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
