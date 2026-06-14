"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useI18n } from "@/i18n/I18nContext";
import { useWorkspaceProduct } from "@/hooks/useWorkspaceProduct";
import { cn } from "@/lib/utils";
import {
  SETTINGS_BACK_HREF,
  SETTINGS_NAV_ITEMS,
  SettingsBackIcon,
  filterSettingsNavItems,
  isSettingsNavItemActive,
} from "@/lib/settingsNavigation";
import { SidebarBrand } from "@/components/layout/sidebar/SidebarBrand";

type SettingsSidebarProps = {
  onNavigate?: () => void;
  className?: string;
};

export function SettingsSidebar({ onNavigate, className }: SettingsSidebarProps) {
  const pathname = usePathname();
  const { t } = useI18n();
  const { isCompany, isOwner, canManage } = useWorkspaceProduct();

  const items = filterSettingsNavItems(SETTINGS_NAV_ITEMS, {
    isCompany,
    isAdmin: isOwner,
    canManage,
  });

  return (
    <aside
      className={cn(
        "flex h-full w-[280px] shrink-0 flex-col bg-[#132743] text-white",
        className
      )}
      role="navigation"
      aria-label={t("settings.nav.ariaLabel")}
    >
      <div className="flex h-14 shrink-0 items-center border-b border-white/10 px-4">
        <SidebarBrand expanded onNavigate={onNavigate} />
      </div>

      <div className="border-b border-white/10 px-3 py-3">
        <Link
          href={SETTINGS_BACK_HREF}
          onClick={onNavigate}
          className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-white/90 transition-colors hover:bg-white/10 hover:text-white"
        >
          <SettingsBackIcon className="size-4 shrink-0" aria-hidden />
          {t("settings.nav.backToWorkspace")}
        </Link>
      </div>

      <nav className="flex-1 overflow-y-auto px-2 py-3">
        <p className="px-3 pb-2 text-xs font-semibold uppercase tracking-wider text-white/45">
          {t("settings.nav.sectionTitle")}
        </p>
        <ul className="space-y-0.5">
          {items.map((item) => {
            const active = isSettingsNavItemActive(pathname, item.href);
            const Icon = item.icon;
            return (
              <li key={item.id}>
                <Link
                  href={item.href}
                  onClick={onNavigate}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                    active
                      ? "bg-[#e06737] text-white shadow-sm"
                      : "text-white/80 hover:bg-white/10 hover:text-white"
                  )}
                >
                  <Icon className="size-4 shrink-0 opacity-90" aria-hidden />
                  <span className="min-w-0 flex-1 truncate">{t(item.labelKey)}</span>
                  {item.comingSoon ? (
                    <span className="rounded-full bg-white/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide">
                      {t("settings.nav.soon")}
                    </span>
                  ) : null}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </aside>
  );
}
