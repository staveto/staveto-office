"use client";

import { useCallback, useState } from "react";
import { Loader2, RefreshCw, AlertTriangle, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SettingsSectionCard } from "@/components/settings/SettingsSectionCard";
import { useAuth } from "@/context/AuthContext";
import { useWorkspace } from "@/context/WorkspaceContext";
import { useI18n } from "@/i18n/I18nContext";
import {
  runWorkspaceDiagnostics,
  type WorkspaceDiagnosticOrgRow,
  type WorkspaceDiagnosticsReport,
} from "@/lib/workspace/workspaceDiagnostics";

function OrgTable({ rows, title }: { rows: WorkspaceDiagnosticOrgRow[]; title: string }) {
  if (rows.length === 0) return null;
  return (
    <div className="space-y-2">
      <p className="font-medium">{title}</p>
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="min-w-full text-left text-xs">
          <thead className="bg-muted/50">
            <tr>
              {[
                "orgId",
                "name",
                "legalName",
                "owner",
                "created",
                "source",
                "country",
                "members",
                "projects",
                "profile",
                "dup",
                "action",
              ].map((col) => (
                <th key={col} className="px-2 py-2 font-medium">
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.orgId} className="border-t border-border align-top">
                <td className="px-2 py-2 font-mono" title={row.orgId}>
                  {row.orgId}
                </td>
                <td className="px-2 py-2">{row.name}</td>
                <td className="px-2 py-2">{row.legalName ?? "—"}</td>
                <td className="px-2 py-2 font-mono">{row.ownerUid ?? "—"}</td>
                <td className="px-2 py-2 whitespace-nowrap">
                  {row.createdAt?.slice(0, 10) ?? "—"}
                </td>
                <td className="px-2 py-2">{row.source ?? "—"}</td>
                <td className="px-2 py-2">{row.country ?? "—"}</td>
                <td className="px-2 py-2">{row.membersCount ?? "—"}</td>
                <td className="px-2 py-2">{row.projectsCount}</td>
                <td className="px-2 py-2">{row.profileFieldCount}</td>
                <td className="px-2 py-2">{row.duplicateCandidate ? "yes" : "—"}</td>
                <td className="px-2 py-2 max-w-[14rem]">{row.recommendedAction}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function WorkspaceDiagnosticsPanel() {
  const { t } = useI18n();
  const { user, profile } = useAuth();
  const { activeWorkspace } = useWorkspace();
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<WorkspaceDiagnosticsReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const run = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    setError(null);
    try {
      const activeCompanyId =
        activeWorkspace?.type === "company"
          ? activeWorkspace.orgId ?? activeWorkspace.id
          : null;
      const result = await runWorkspaceDiagnostics({
        userId: user.id,
        userEmail: user.email,
        orgIdHints: [
          profile?.activeBusinessOrgId,
          profile?.lastActiveWorkspaceId,
          profile?.onboarding?.activeWorkspaceId,
        ].filter((id): id is string => !!id && id !== "personal"),
        activeWorkspaceId: activeCompanyId,
        lastActiveWorkspaceId: profile?.lastActiveWorkspaceId,
        activeBusinessOrgId: profile?.activeBusinessOrgId,
      });
      setReport(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [
    activeWorkspace,
    profile?.activeBusinessOrgId,
    profile?.lastActiveWorkspaceId,
    profile?.onboarding?.activeWorkspaceId,
    user?.email,
    user?.id,
  ]);

  const copyReport = useCallback(async () => {
    if (!report) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(report, null, 2));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [report]);

  const riskClass =
    report?.migrationRiskLevel === "high"
      ? "text-destructive"
      : report?.migrationRiskLevel === "medium"
        ? "text-amber-600 dark:text-amber-400"
        : "text-emerald-600 dark:text-emerald-400";

  return (
    <SettingsSectionCard>
      <CardHeader>
        <CardTitle>{t("workspaceDiagnostics.title")}</CardTitle>
        <CardDescription>{t("workspaceDiagnostics.description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" size="sm" variant="outline" onClick={() => void run()} disabled={loading}>
            {loading ? (
              <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />
            ) : (
              <RefreshCw className="mr-2 size-4" aria-hidden />
            )}
            {t("workspaceDiagnostics.run")}
          </Button>
          {report ? (
            <Button type="button" size="sm" variant="secondary" onClick={() => void copyReport()}>
              {copied ? (
                <Check className="mr-2 size-4" aria-hidden />
              ) : (
                <Copy className="mr-2 size-4" aria-hidden />
              )}
              {copied ? t("workspaceDiagnostics.copied") : t("workspaceDiagnostics.copyJson")}
            </Button>
          ) : null}
          <p className="text-xs text-muted-foreground">{t("workspaceDiagnostics.readOnlyNote")}</p>
        </div>

        {error ? (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}

        {report ? (
          <div className="space-y-4 text-sm">
            <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-1">
              <p>
                <span className="font-medium">{t("workspaceDiagnostics.migrationRisk")}: </span>
                <span className={riskClass}>{report.migrationRiskLevel}</span>
              </p>
              {report.activeWorkspaceId ? (
                <p>
                  <span className="font-medium">{t("workspaceDiagnostics.activeOrg")}: </span>
                  <code className="text-xs">{report.activeWorkspaceId}</code>
                </p>
              ) : null}
              {report.canonicalOrganizationId ? (
                <p>
                  <span className="font-medium">{t("workspaceDiagnostics.canonicalOrg")}: </span>
                  <code className="text-xs">{report.canonicalOrganizationId}</code>
                  {report.canonicalOrganizationReason ? (
                    <span className="text-muted-foreground"> — {report.canonicalOrganizationReason}</span>
                  ) : null}
                </p>
              ) : null}
              {report.switcherDuplicateExplanation ? (
                <p className="text-muted-foreground">{report.switcherDuplicateExplanation}</p>
              ) : null}
              {report.switcherSuppressionNote ? (
                <p className="text-muted-foreground">{report.switcherSuppressionNote}</p>
              ) : null}
              {report.duplicateOrganizationWarning ? (
                <p className="flex items-start gap-2 text-amber-700 dark:text-amber-300">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
                  {report.duplicateOrganizationWarning}
                </p>
              ) : null}
              <p className="text-muted-foreground">{t("workspaceDiagnostics.noAutoDelete")}</p>
            </div>

            {report.duplicateGroups.length > 0 ? (
              <div className="space-y-3">
                <p className="font-medium">{t("workspaceDiagnostics.duplicateGroupsTitle")}</p>
                {report.duplicateGroups.map((group) => (
                  <div
                    key={group.groupKey}
                    className="rounded-lg border border-amber-200 bg-amber-50/50 p-3 dark:border-amber-900 dark:bg-amber-950/20"
                  >
                    <p className="font-medium">{group.displayLabel}</p>
                    <p className="text-xs text-muted-foreground">
                      {t("workspaceDiagnostics.canonicalOrg")}:{" "}
                      <code>{group.canonicalOrgId}</code> — {group.canonicalReason}
                    </p>
                    <p className="text-xs">
                      {t("workspaceDiagnostics.groupRisk")}: {group.riskLevel}
                    </p>
                    <ul className="mt-2 list-disc space-y-1 pl-5 text-xs">
                      {group.orgs.map((org) => (
                        <li key={org.orgId}>
                          <code>{org.orgId}</code> — {org.projectsCount} projects,{" "}
                          {org.membersCount ?? "?"} members, source {org.source ?? "—"},{" "}
                          {org.appearsEmpty ? "appears empty" : "has data"},{" "}
                          score {org.canonicalScore}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            ) : null}

            {report.hiddenFromSwitcher.length > 0 ? (
              <div className="space-y-3">
                <p className="font-medium">{t("workspaceDiagnostics.hiddenFromSwitcherTitle")}</p>
                <p className="text-xs text-muted-foreground">
                  {t("workspaceDiagnostics.hiddenFromSwitcherNote")}
                </p>
                {report.hiddenFromSwitcher.map((row) => (
                  <div
                    key={row.orgId}
                    className="rounded-lg border border-amber-200 bg-amber-50/50 p-3 dark:border-amber-900 dark:bg-amber-950/20 space-y-1 text-xs"
                  >
                    <p className="font-medium">{row.displayLabel}</p>
                    <p>
                      <span className="font-medium">{t("workspaceDiagnostics.canonicalOrg")}: </span>
                      <code>{row.canonicalOrgId}</code>
                    </p>
                    <p>
                      <span className="font-medium">
                        {t("workspaceDiagnostics.hiddenDuplicateOrg")}:{" "}
                      </span>
                      <code>{row.orgId}</code>
                    </p>
                    <p>
                      {row.projectsCount} {t("workspaceDiagnostics.projectsShort")},{" "}
                      {row.membersCount ?? "?"} members, {row.profileFieldCount} profile fields
                    </p>
                    {row.likelySource ? (
                      <p className="text-muted-foreground">
                        {t("workspaceDiagnostics.likelyDuplicateSource")}:{" "}
                        <code>{row.likelySource}</code>
                      </p>
                    ) : null}
                    <p className="text-muted-foreground">{row.hideReason}</p>
                    <p>
                      {t("workspaceDiagnostics.recommendedAction")}:{" "}
                      <code>{row.recommendedAction}</code>
                    </p>
                    <p className="flex items-start gap-2 text-amber-700 dark:text-amber-300">
                      <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
                      {t("workspaceDiagnostics.noAutoDelete")}
                    </p>
                  </div>
                ))}
              </div>
            ) : null}

            {report.visibleSwitcherOrganizations.length > 0 ? (
              <div className="space-y-2">
                <p className="font-medium">{t("workspaceDiagnostics.visibleSwitcherTitle")}</p>
                <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">
                  {report.visibleSwitcherOrganizations.map((row) => (
                    <li key={row.orgId}>
                      <code>{row.orgId}</code> — {row.name} ({row.projectsCount}{" "}
                      {t("workspaceDiagnostics.projectsShort")}, {row.membersCount ?? "?"} members)
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <div className="grid gap-2 sm:grid-cols-2">
              <p>
                {t("workspaceDiagnostics.soloProjects")}: {report.soloProjectsCount}
              </p>
              <p>
                {t("workspaceDiagnostics.companyProjects")}: {report.companyProjectsCount}
              </p>
            </div>

            {report.notes.length > 0 ? (
              <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
                {report.notes.map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
            ) : null}

            <OrgTable rows={report.ownedOrganizations} title={t("workspaceDiagnostics.ownedOrgs")} />
            <OrgTable rows={report.memberOrganizations} title={t("workspaceDiagnostics.memberOrgs")} />
            <OrgTable rows={report.organizations} title={t("workspaceDiagnostics.allOrgs")} />

            {report.manualCleanupPlan.length > 0 ? (
              <div>
                <p className="mb-2 font-medium">{t("workspaceDiagnostics.manualCleanupTitle")}</p>
                <ol className="list-decimal space-y-1 pl-5 text-muted-foreground">
                  {report.manualCleanupPlan.map((step) => (
                    <li key={step}>{step}</li>
                  ))}
                </ol>
              </div>
            ) : null}

            {report.crossListProjects.length > 0 ? (
              <div>
                <p className="mb-2 font-medium">{t("workspaceDiagnostics.crossListTitle")}</p>
                <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
                  {report.crossListProjects.map((p) => (
                    <li key={p.projectId}>
                      {p.name} ({p.projectId}) — orgs: {p.inCompanyOrgIds.join(", ")}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : null}
      </CardContent>
    </SettingsSectionCard>
  );
}
