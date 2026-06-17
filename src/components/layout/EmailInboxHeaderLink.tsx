"use client";

import Link from "next/link";
import { Mail } from "lucide-react";
import { useI18n } from "@/i18n/I18nContext";
import { useEmailInboxBadge } from "@/context/EmailInboxBadgeContext";
import { cn } from "@/lib/utils";

export function EmailInboxHeaderLink() {
  const { t } = useI18n();
  const { unreadCount, visible } = useEmailInboxBadge();

  if (!visible) return null;

  const ariaLabel =
    unreadCount > 0
      ? t("header.emailInboxUnread", { count: unreadCount })
      : t("header.emailInbox");

  return (
    <Link
      href="/app/inbox"
      className={cn(
        "relative flex size-9 items-center justify-center rounded-lg border border-border/60",
        "bg-background/80 text-foreground transition-colors hover:bg-muted/60",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
      )}
      aria-label={ariaLabel}
    >
      <Mail className="size-4" aria-hidden />
      {unreadCount > 0 ? (
        <span className="absolute -right-1 -top-1 flex min-w-[1.1rem] items-center justify-center rounded-full bg-[#e06737] px-1 text-[10px] font-bold text-white">
          {unreadCount > 9 ? "9+" : unreadCount}
        </span>
      ) : null}
    </Link>
  );
}
