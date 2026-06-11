"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bell, CheckCheck, Loader2, Mail } from "lucide-react";
import { useI18n } from "@/i18n/I18nContext";
import { useAuth } from "@/context/AuthContext";
import {
  subscribeUserNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  getNotificationProjectHref,
  type UserNotification,
} from "@/services/notifications/userNotificationService";
import { listPendingProjectInvites } from "@/services/invites/projectInvitesService";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

function resolveProjectName(n: UserNotification): string | null {
  const name = n.projectName?.trim();
  if (!name || name === "Projekt") return null;
  return name;
}

function notificationMessage(
  n: UserNotification,
  t: (key: string, params?: Record<string, string | number>) => string
): string {
  switch (n.type) {
    case "PROJECT_ASSIGNED": {
      const projectName = resolveProjectName(n);
      return projectName
        ? t("notifications.projectAssigned", { projectName })
        : t("notifications.projectAssignedGeneric");
    }
    case "PROJECT_INVITED": {
      const projectName = resolveProjectName(n);
      return projectName
        ? t("notifications.projectInvited", { projectName })
        : t("notifications.projectInvitedGeneric");
    }
    case "TASK_ASSIGNED":
      return t("notifications.taskAssigned", {
        taskName: n.taskName || t("notifications.generic"),
      });
    case "COMMENT_ADDED":
      return t("notifications.commentAdded", {
        projectName: n.projectName || t("projects.titleJobs"),
      });
    case "REPORT_CREATED":
      return t("notifications.reportCreated", {
        projectName: n.projectName || t("projects.titleJobs"),
      });
    case "ABSENCE_APPROVED":
      return t("notifications.absenceApproved");
    default:
      return t("notifications.generic");
  }
}

export function NotificationsDropdown() {
  const { t } = useI18n();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [markingAll, setMarkingAll] = useState(false);
  const [notifications, setNotifications] = useState<UserNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [pendingInviteCount, setPendingInviteCount] = useState(0);
  const panelRef = useRef<HTMLDivElement>(null);

  const refreshPendingInvites = useCallback(async () => {
    try {
      const invites = await listPendingProjectInvites();
      setPendingInviteCount(invites.length);
    } catch {
      setPendingInviteCount(0);
    }
  }, []);

  useEffect(() => {
    if (!user?.id) {
      setNotifications([]);
      setUnreadCount(0);
      setPendingInviteCount(0);
      setLoading(false);
      return;
    }

    setLoading(true);
    void refreshPendingInvites();
    const unsub = subscribeUserNotifications(user.id, (rows, count) => {
      setNotifications(rows);
      setUnreadCount(count);
      setLoading(false);
    });
    return () => unsub();
  }, [user?.id, refreshPendingInvites]);

  useEffect(() => {
    if (!open || !user?.id) return;
    void refreshPendingInvites();
  }, [open, user?.id, refreshPendingInvites]);

  const badgeCount = unreadCount + pendingInviteCount;

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  if (!user?.id) return null;

  const handleMarkRead = async (notification: UserNotification) => {
    if (!user.id || notification.read) return;
    try {
      await markNotificationRead(user.id, notification.id);
    } catch {
      /* ignore */
    }
  };

  const handleMarkAllRead = async () => {
    if (!user.id || unreadCount === 0) return;
    setMarkingAll(true);
    try {
      await markAllNotificationsRead(user.id);
    } finally {
      setMarkingAll(false);
    }
  };

  return (
    <div className="relative" ref={panelRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "relative flex size-9 items-center justify-center rounded-lg border border-border/60",
          "bg-background/80 text-foreground transition-colors hover:bg-muted/60",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
        )}
        aria-expanded={open}
        aria-haspopup="true"
        aria-label={t("notifications.centerTitle")}
      >
        <Bell className="size-4" aria-hidden />
        {badgeCount > 0 ? (
          <span className="absolute -right-1 -top-1 flex min-w-[1.1rem] items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
            {badgeCount > 9 ? "9+" : badgeCount}
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          className={cn(
            "absolute right-0 top-full z-50 mt-2 w-96 overflow-hidden rounded-xl border border-border/60",
            "bg-popover shadow-lg backdrop-blur-sm"
          )}
          role="menu"
        >
          <div className="flex items-center justify-between gap-2 border-b border-border/50 px-4 py-3">
            <p className="text-sm font-semibold">{t("notifications.centerTitle")}</p>
            {unreadCount > 0 ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 gap-1 px-2 text-xs"
                disabled={markingAll}
                onClick={() => void handleMarkAllRead()}
              >
                {markingAll ? (
                  <Loader2 className="size-3 animate-spin" />
                ) : (
                  <CheckCheck className="size-3" />
                )}
                {t("notifications.markAllRead")}
              </Button>
            ) : null}
          </div>

          <div className="max-h-96 overflow-y-auto p-2">
            {pendingInviteCount > 0 ? (
              <Link
                href="/app/settings#project-invites"
                role="menuitem"
                onClick={() => setOpen(false)}
                className="mb-2 flex items-center gap-2 rounded-lg border border-[#e06737]/30 bg-[#e06737]/5 px-3 py-2.5 text-sm transition-colors hover:bg-[#e06737]/10"
              >
                <Mail className="size-4 shrink-0 text-[#e06737]" aria-hidden />
                <span className="font-medium text-[#1D376A]">
                  {t("profile.projectInvites")} ({pendingInviteCount})
                </span>
              </Link>
            ) : null}
            {loading ? (
              <div className="flex justify-center py-6">
                <Loader2 className="size-5 animate-spin text-muted-foreground" />
              </div>
            ) : notifications.length === 0 ? (
              <p className="px-2 py-4 text-center text-sm text-muted-foreground">
                {t("notifications.empty")}
              </p>
            ) : (
              <ul role="none" className="divide-y divide-border/50">
                {notifications.map((n) => {
                  const projectHref = getNotificationProjectHref(n);
                  const isUnread = !n.read;
                  return (
                    <li key={n.id} className="py-2 first:pt-0 last:pb-0">
                      <div
                        className={cn(
                          "rounded-lg px-3 py-3 text-sm transition-colors",
                          isUnread ? "bg-primary/5" : "hover:bg-muted/60"
                        )}
                      >
                        <p className={cn("text-sm leading-snug", isUnread && "font-medium")}>
                          {notificationMessage(n, t)}
                        </p>
                        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
                          {projectHref && (n.type === "PROJECT_ASSIGNED" || n.type === "PROJECT_INVITED") ? (
                            <Link
                              href={projectHref}
                              role="menuitem"
                              onClick={() => {
                                void handleMarkRead(n);
                                setOpen(false);
                              }}
                              className="inline-flex h-7 items-center rounded-md bg-primary px-2.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
                            >
                              {t("notifications.openProject")}
                            </Link>
                          ) : projectHref ? (
                            <Link
                              href={projectHref}
                              role="menuitem"
                              onClick={() => {
                                void handleMarkRead(n);
                                setOpen(false);
                              }}
                              className="text-xs font-medium text-primary hover:underline"
                            >
                              {t("notifications.openProject")}
                            </Link>
                          ) : null}
                          {isUnread ? (
                            <button
                              type="button"
                              onClick={() => void handleMarkRead(n)}
                              className="text-xs text-muted-foreground hover:text-foreground"
                            >
                              {t("notifications.markRead")}
                            </button>
                          ) : null}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
