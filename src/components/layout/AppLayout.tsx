"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LayoutDashboard, FileText, CreditCard, LogOut, Globe } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/context/AuthContext";
import { useI18n } from "@/i18n/I18nContext";
import { Button } from "@/components/ui/button";

const navItems = [
  { href: "/", labelKey: "nav.dashboard", icon: LayoutDashboard },
  { href: "/estimates", labelKey: "nav.estimates", icon: FileText },
  { href: "/subscription", labelKey: "nav.subscription", icon: CreditCard },
];

export function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuth();
  const { t, locale, setLocale } = useI18n();

  const handleLogout = async () => {
    await logout();
    router.push("/login");
    router.refresh();
  };

  return (
    <div className="flex min-h-screen bg-background">
      {/* Sidebar - Staveto blue */}
      <aside className="w-56 flex flex-col bg-[#1D376A] text-white">
        <div className="p-4 border-b border-white/15">
          <Link href="/" className="text-lg font-semibold text-white flex items-center gap-2">
            <span className="w-8 h-8 rounded bg-[#e06737] flex items-center justify-center text-xs font-bold">S</span>
            Staveto Office
          </Link>
        </div>
        <nav className="flex-1 p-2 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive =
              pathname === item.href ||
              (item.href !== "/" && pathname.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-[#e06737] text-white"
                    : "text-white/90 hover:bg-white/10"
                )}
              >
                <Icon className="size-4" />
                {t(item.labelKey)}
              </Link>
            );
          })}
        </nav>
        <div className="p-2 border-t border-white/15 space-y-1">
          <div className="flex gap-2 px-3 py-2">
            <button
              type="button"
              onClick={() => setLocale(locale === "sk" ? "en" : "sk")}
              className="flex items-center gap-2 text-sm text-white/80 hover:text-white"
            >
              <Globe className="size-4" />
              {locale === "sk" ? "EN" : "SK"}
            </button>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-white/90 hover:bg-white/10"
          >
            <LogOut className="size-4" />
            {t("nav.logout")}
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-14 border-b border-border flex items-center justify-between px-6 bg-background">
          <span className="text-base font-medium text-muted-foreground">
            {user?.name || user?.email || "Staveto Office"}
          </span>
          {user?.billing && (
            <span
              className={cn(
                "text-xs px-2 py-1 rounded-full font-medium",
                user.billing.isPro
                  ? "bg-green-100 text-green-800"
                  : user.billing.status === "trial"
                  ? "bg-amber-100 text-amber-800"
                  : "bg-red-100 text-red-800"
              )}
            >
              {user.billing.isPro
                ? t("subscription.proActive")
                : user.billing.status === "trial"
                ? t("subscription.trialRemainingDays", {
                    count: user.billing.remainingTrialDays,
                  })
                : t("subscription.statusExpired")}
            </span>
          )}
        </header>

        <main className="flex-1 overflow-auto p-6">{children}</main>
      </div>
    </div>
  );
}
