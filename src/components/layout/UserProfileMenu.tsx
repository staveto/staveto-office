"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { ChevronDown, LogOut, Settings, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/context/AuthContext";
import { useI18n } from "@/i18n/I18nContext";
import { getUserInitials } from "@/lib/userDisplay";

type UserProfileMenuProps = {
  variant?: "header" | "drawer";
  onNavigate?: () => void;
};

export function UserProfileMenu({
  variant = "header",
  onNavigate,
}: UserProfileMenuProps) {
  const { user, logout } = useAuth();
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const initials = getUserInitials(user?.name, user?.email);
  const displayName = user?.name?.trim() || user?.email || "";
  const isDrawer = variant === "drawer";

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleLogout = async () => {
    setOpen(false);
    onNavigate?.();
    await logout();
    if (typeof window !== "undefined") {
      window.location.href = "/login";
    }
  };

  const close = () => {
    setOpen(false);
    onNavigate?.();
  };

  if (isDrawer) {
    return (
      <div className="border-t border-white/10 px-3 py-3">
        <div className="flex items-center gap-3 px-1 pb-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[#e06737] text-sm font-semibold text-white">
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-white">{displayName}</p>
            <p className="text-[11px] text-white/50">
              {t("header.context.userProfileLabel")}
            </p>
          </div>
        </div>
        <div className="space-y-0.5">
          <Link
            href="/app/settings"
            onClick={close}
            className="flex items-center gap-2 rounded-md px-2 py-2 text-sm text-white/85 hover:bg-white/10"
          >
            <User className="size-4 shrink-0" aria-hidden />
            {t("header.context.userProfileMenu")}
          </Link>
          <Link
            href="/app/settings"
            onClick={close}
            className="flex items-center gap-2 rounded-md px-2 py-2 text-sm text-white/85 hover:bg-white/10"
          >
            <Settings className="size-4 shrink-0" aria-hidden />
            {t("nav.settings")}
          </Link>
          <button
            type="button"
            onClick={handleLogout}
            className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm text-white/85 hover:bg-white/10"
          >
            <LogOut className="size-4 shrink-0" aria-hidden />
            {t("nav.logout")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-lg px-1.5 py-1 hover:bg-black/5"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t("header.userMenu")}
      >
        <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[#1D376A] text-sm font-medium text-white">
          {initials}
        </div>
        <div className="hidden min-w-0 text-left sm:block">
          <div className="max-w-[120px] truncate text-sm font-medium text-foreground md:max-w-[160px]">
            {displayName.split(" ")[0] ?? displayName}
          </div>
          <div className="text-[11px] text-muted-foreground">
            {t("header.context.userProfileLabel")}
          </div>
        </div>
        <ChevronDown
          className={cn(
            "hidden size-4 shrink-0 text-muted-foreground sm:block",
            open && "rotate-180"
          )}
          aria-hidden
        />
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute right-0 top-full z-50 mt-1 min-w-[200px] rounded-lg border border-border bg-background py-1 shadow-lg"
        >
          <div className="border-b border-border px-3 py-2">
            <p className="truncate text-sm font-medium">{displayName}</p>
            <p className="text-xs text-muted-foreground">
              {t("header.context.userProfileMenu")}
            </p>
          </div>
          <Link
            href="/app/settings"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted"
            role="menuitem"
          >
            <User className="size-4 shrink-0" aria-hidden />
            {t("header.context.userProfileMenu")}
          </Link>
          <Link
            href="/app/settings"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted"
            role="menuitem"
          >
            <Settings className="size-4 shrink-0" aria-hidden />
            {t("nav.settings")}
          </Link>
          <button
            type="button"
            onClick={handleLogout}
            className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-muted"
            role="menuitem"
          >
            <LogOut className="size-4 shrink-0" aria-hidden />
            {t("nav.logout")}
          </button>
        </div>
      ) : null}
    </div>
  );
}
