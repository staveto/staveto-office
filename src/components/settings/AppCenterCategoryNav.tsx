"use client";

import { useI18n } from "@/i18n/I18nContext";
import { cn } from "@/lib/utils";
import {
  APP_CENTER_CATEGORIES,
  type AppCenterCategory,
} from "@/lib/appCenterCatalog";

const CATEGORY_LABEL_KEYS: Record<AppCenterCategory, string> = {
  all: "appCenter.categories.all",
  core: "appCenter.categories.core",
  communication: "appCenter.categories.communication",
  accounting: "appCenter.categories.accounting",
  maps: "appCenter.categories.maps",
  storage: "appCenter.categories.storage",
  ai: "appCenter.categories.ai",
  workforce: "appCenter.categories.workforce",
  finance: "appCenter.categories.finance",
};

type Props = {
  active: AppCenterCategory;
  onChange: (category: AppCenterCategory) => void;
  counts?: Partial<Record<AppCenterCategory, number>>;
  layout?: "sidebar" | "tabs";
  className?: string;
};

export function AppCenterCategoryNav({
  active,
  onChange,
  counts,
  layout = "sidebar",
  className,
}: Props) {
  const { t } = useI18n();

  const items = APP_CENTER_CATEGORIES.map((cat) => ({
    id: cat,
    label: t(CATEGORY_LABEL_KEYS[cat]),
    count: counts?.[cat],
  }));

  if (layout === "tabs") {
    return (
      <div
        className={cn(
          "flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
          className
        )}
        role="tablist"
        aria-label={t("appCenter.categories.label")}
      >
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={active === item.id}
            onClick={() => onChange(item.id)}
            className={cn(
              "shrink-0 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
              active === item.id
                ? "border-[#1D376A] bg-[#1D376A] text-white"
                : "border-[#b8c5d4] bg-white text-[#152238] hover:border-[#1D376A]/40"
            )}
          >
            {item.label}
            {typeof item.count === "number" ? (
              <span className="ml-1.5 text-xs opacity-75">({item.count})</span>
            ) : null}
          </button>
        ))}
      </div>
    );
  }

  return (
    <nav className={cn("space-y-0.5", className)} aria-label={t("appCenter.categories.label")}>
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => onChange(item.id)}
          aria-current={active === item.id ? "true" : undefined}
          className={cn(
            "flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors",
            active === item.id
              ? "bg-[#1D376A] text-white"
              : "text-[#152238] hover:bg-[#eef2f6]"
          )}
        >
          <span>{item.label}</span>
          {typeof item.count === "number" ? (
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-xs tabular-nums",
                active === item.id ? "bg-white/20" : "bg-[#eef2f6] text-[#5a6577]"
              )}
            >
              {item.count}
            </span>
          ) : null}
        </button>
      ))}
    </nav>
  );
}
