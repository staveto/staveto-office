"use client";

import { Languages } from "lucide-react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n/I18nContext";
import { LOCALE_NATIVE_LABELS, type Locale } from "@/i18n/config";
import { SidebarExpandButton } from "./SidebarExpandButton";

type SidebarFooterProps = {
  collapsed: boolean;
  /** Desktop only — hide on mobile drawer where the panel is already full width. */
  showLayoutToggle?: boolean;
};

export function SidebarFooter({ collapsed, showLayoutToggle = true }: SidebarFooterProps) {
  const { t, locale, setLocale, locales } = useI18n();

  return (
    <div
      className={cn(
        "relative z-20 shrink-0 border-t border-white/10 bg-[#132743]",
        collapsed ? "px-2 py-3" : "px-3 py-3"
      )}
    >
      <div className={cn("space-y-2", collapsed && "flex flex-col items-center")}>
        <div className={cn("w-full", collapsed ? "space-y-1.5" : "space-y-2")}>
          {!collapsed ? (
            <p className="flex items-center gap-1.5 px-0.5 text-[10px] font-semibold uppercase tracking-wide text-white/50">
              <Languages className="size-3 shrink-0" aria-hidden />
              {t("sidebar.item.more.language")}
            </p>
          ) : (
            <Languages
              className="mx-auto size-4 text-white/45"
              aria-hidden
            />
          )}
          <div
            className={cn(
              "flex gap-1",
              collapsed ? "flex-col w-full" : "flex-row flex-wrap"
            )}
            role="group"
            aria-label={t("settings.language.label")}
          >
            {locales.map((loc) => {
              const selected = locale === loc;
              return (
                <button
                  key={loc}
                  type="button"
                  onClick={() => setLocale(loc as Locale)}
                  className={cn(
                    "rounded-md font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e06737]/70",
                    collapsed
                      ? "w-full px-1 py-1.5 text-[11px] tracking-wide"
                      : "flex-1 min-w-0 px-2 py-2 text-xs",
                    selected
                      ? "bg-[#e06737] text-white"
                      : "bg-white/8 text-white/80 hover:bg-white/12 hover:text-white"
                  )}
                  aria-pressed={selected}
                  title={LOCALE_NATIVE_LABELS[loc]}
                >
                  {collapsed ? loc.toUpperCase() : LOCALE_NATIVE_LABELS[loc]}
                </button>
              );
            })}
          </div>
        </div>

        {showLayoutToggle ? <SidebarExpandButton collapsed={collapsed} /> : null}
      </div>
    </div>
  );
}
