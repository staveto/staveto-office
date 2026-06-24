"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Mail, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useI18n } from "@/i18n/I18nContext";
import { SettingsSectionCard } from "./SettingsSectionCard";
import { settingsAccentIconClassName } from "./settingsStyles";
import {
  acceptProjectInvite,
  declineProjectInvite,
  listPendingProjectInvites,
  type PendingProjectInvite,
} from "@/services/invites/projectInvitesService";

function sharedItemsSummary(
  shared: Record<string, boolean> | undefined,
  t: (key: string) => string
): string {
  if (!shared) return "";
  const parts: string[] = [];
  if (shared.tasks) parts.push(t("projectInvites.sharedTasks"));
  if (shared.phases) parts.push(t("projectInvites.sharedPhases"));
  if (shared.expenses) parts.push(t("projectInvites.sharedExpenses"));
  return parts.join(", ");
}

export function ProjectInvitesPanel() {
  const { t } = useI18n();
  const router = useRouter();
  const [invites, setInvites] = useState<PendingProjectInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyProjectId, setBusyProjectId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await listPendingProjectInvites();
      setInvites(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setInvites([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleAccept = async (invite: PendingProjectInvite) => {
    setBusyProjectId(invite.projectId);
    setError(null);
    try {
      const result = await acceptProjectInvite(invite.projectId);
      if (result.ok) {
        setInvites((prev) => prev.filter((i) => i.projectId !== invite.projectId));
        const projectId = result.projectId ?? invite.projectId;
        if (projectId && !result.already) {
          router.push(`/app/projects/${projectId}`);
        }
      } else {
        setError(t("projectInvites.notFound"));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyProjectId(null);
    }
  };

  const handleDecline = async (invite: PendingProjectInvite) => {
    setBusyProjectId(invite.projectId);
    setError(null);
    try {
      await declineProjectInvite(invite.projectId);
      setInvites((prev) => prev.filter((i) => i.projectId !== invite.projectId));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyProjectId(null);
    }
  };

  return (
    <SettingsSectionCard id="project-invites">
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Mail className={cn("size-4", settingsAccentIconClassName)} />
              {t("profile.projectInvites")}
              {invites.length > 0 ? (
                <span className="rounded-full bg-[#e06737] px-2 py-0.5 text-xs font-semibold text-white">
                  {invites.length}
                </span>
              ) : null}
            </CardTitle>
            <CardDescription>{t("projectInvites.profileHint")}</CardDescription>
          </div>
          <Button variant="ghost" size="sm" onClick={() => void load()} disabled={loading}>
            {t("common.refresh")}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : invites.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("projectInvites.emptySubtitle")}</p>
        ) : (
          <ul className="space-y-3">
            {invites.map((invite) => {
              const busy = busyProjectId === invite.projectId;
              const summary = sharedItemsSummary(invite.sharedItems, t);
              return (
                <li
                  key={`${invite.projectId}-${invite.memberId}`}
                  className="rounded-lg border border-border bg-background p-4"
                >
                  <p className={cn("font-medium", settingsAccentIconClassName)}>{invite.projectName}</p>
                  {summary ? (
                    <p className="mt-1 text-xs text-muted-foreground">{summary}</p>
                  ) : null}
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      className="bg-[#e06737] hover:bg-[#c9582f]"
                      disabled={busy}
                      onClick={() => void handleAccept(invite)}
                    >
                      {busy ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <>
                          <Check className="mr-1 size-4" />
                          {t("projectInvites.accept")}
                        </>
                      )}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() => void handleDecline(invite)}
                    >
                      <X className="mr-1 size-4" />
                      {t("projectInvites.decline")}
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </CardContent>
    </SettingsSectionCard>
  );
}
