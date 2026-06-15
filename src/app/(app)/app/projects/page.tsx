"use client";

import { useEffect, useState, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button, buttonVariants } from "@/components/ui/button";
import { useI18n } from "@/i18n/I18nContext";
import { useAuth } from "@/context/AuthContext";
import { useWorkspace } from "@/context/WorkspaceContext";
import {
  listProjectsForWorkspace,
  FirestoreIndexError,
  type ProjectDoc,
} from "@/lib/projects";
import { isProjectAssignedToUser } from "@/lib/projectOwnership";
import { listAssignedProjectsForWorker } from "@/services/worker/workerDashboardService";
import { shouldShowWorkerDashboard } from "@/lib/workspaceProduct";
import { canManageCrewAssignments } from "@/lib/operationsPermissions";
import {
  matchesProjectFilter,
  isProjectArchived,
  normalizeProjectPhase,
  type ProjectListFilter,
} from "@/lib/projectLifecycle";
import { loadTaskProgressBatch } from "@/lib/projectTaskProgress";
import {
  getListPrimaryAction,
  getHumanWorkflowStatusKey,
  getQuoteStatusKey,
  getWorkflowStatusBadgeClass,
  getProjectListRowClass,
} from "@/lib/projectDashboard";
import { JobSourceBadge } from "@/components/jobs/JobSourceBadge";
import { ProjectActionsMenu } from "@/components/projects/ProjectActionsMenu";
import { Badge } from "@/components/ui/badge";
import { useWorkspaceProduct } from "@/hooks/useWorkspaceProduct";
import { cn } from "@/lib/utils";
import { FolderKanban, RefreshCw, Search, Plus, List, Map as MapIcon } from "lucide-react";
import { ProjectsMapPanel } from "@/components/projects/ProjectsMapPanel";
import { ProjectsWorkspaceContextBanner } from "@/components/projects/ProjectsWorkspaceContextBanner";
import { ProjectMembersQuickAssignDialog } from "@/components/projects/ProjectMembersQuickAssignDialog";
import { useSetupChecklistVisit } from "@/hooks/useSetupChecklistVisit";

const FILTERS: ProjectListFilter[] = [
  "all",
  "concepts",
  "active",
  "waiting",
  "completed",
  "closed",
  "archived",
];

type ProjectsPageFilter = ProjectListFilter | "assigned";

const ALL_FILTERS: ProjectsPageFilter[] = [...FILTERS, "assigned"];

function ProjectsTableSkeleton() {
  return (
    <Card>
      <CardContent className="py-6">
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-12 rounded-lg bg-muted/50 animate-pulse" />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export default function ProjectsPage() {
  const { t } = useI18n();
  useSetupChecklistVisit("first_document");
  const { user, loading: authLoading } = useAuth();
  const { activeWorkspace } = useWorkspace();
  const { role } = useWorkspaceProduct();
  const searchParams = useSearchParams();
  const [projects, setProjects] = useState<ProjectDoc[]>([]);
  const [taskProgress, setTaskProgress] = useState<Record<string, number>>({});
  const [progressLoading, setProgressLoading] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [accessDenied, setAccessDenied] = useState(false);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<ProjectsPageFilter>("all");
  const [view, setView] = useState<"list" | "map">("list");
  const [membersDialogProject, setMembersDialogProject] = useState<ProjectDoc | null>(null);

  const isFieldWorker =
    activeWorkspace != null &&
    activeWorkspace.type === "company" &&
    shouldShowWorkerDashboard(activeWorkspace.role);

  useEffect(() => {
    const param = searchParams.get("filter");
    if (param === "assigned") {
      setFilter("assigned");
      return;
    }
    if (param && FILTERS.includes(param as ProjectListFilter)) {
      setFilter(param as ProjectListFilter);
    } else if (isFieldWorker && !param) {
      setFilter("assigned");
    }
  }, [searchParams, isFieldWorker]);

  const fetchProjects = () => {
    if (!user?.id || !activeWorkspace) return Promise.resolve([] as ProjectDoc[]);
    return isFieldWorker
      ? listAssignedProjectsForWorker(activeWorkspace, user.id)
      : listProjectsForWorkspace(activeWorkspace, user.id);
  };

  useEffect(() => {
    if (authLoading || !user?.id || !activeWorkspace) {
      if (!authLoading && !user?.id) {
        setProjects([]);
        setLoading(false);
      }
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);
    setAccessDenied(false);

    void fetchProjects()
      .then((list) => {
        if (!cancelled) {
          setProjects(list);
          setTaskProgress({});
        }
      })
      .catch((e) => {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : "Failed to load projects";
        setError(msg);
        setAccessDenied(
          !(e instanceof FirestoreIndexError) &&
            (msg.toLowerCase().includes("permission") ||
              msg.toLowerCase().includes("access"))
        );
        setProjects([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [authLoading, user?.id, activeWorkspace?.id, activeWorkspace?.type, isFieldWorker]);

  useEffect(() => {
    if (projects.length === 0) return;
    const deliveryIds = projects
      .filter((p) => normalizeProjectPhase(p) === "delivery" && !isProjectArchived(p))
      .map((p) => p.id);
    if (deliveryIds.length === 0) return;

    let cancelled = false;
    setProgressLoading(true);
    void loadTaskProgressBatch(deliveryIds)
      .then((map) => {
        if (cancelled) return;
        const percentMap: Record<string, number> = {};
        map.forEach((v, id) => {
          percentMap[id] = v.percent;
        });
        setTaskProgress(percentMap);
      })
      .finally(() => {
        if (!cancelled) setProgressLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [projects]);

  useEffect(() => {
    if (!toastMessage) return;
    const timer = setTimeout(() => setToastMessage(null), 4000);
    return () => clearTimeout(timer);
  }, [toastMessage]);

  const loadProjects = () => {
    if (!user?.id || !activeWorkspace) return;
    setLoading(true);
    setError(null);
    setAccessDenied(false);
    void fetchProjects()
      .then(setProjects)
      .catch((e) => {
        const msg = e instanceof Error ? e.message : "Failed to load projects";
        setError(msg);
        setAccessDenied(
          !(e instanceof FirestoreIndexError) &&
            (msg.toLowerCase().includes("permission") ||
              msg.toLowerCase().includes("access"))
        );
        setProjects([]);
      })
      .finally(() => setLoading(false));
  };

  const filteredProjects = useMemo(() => {
    let list = projects;
    if (filter === "assigned") {
      list = projects.filter((p) => isProjectAssignedToUser(p, user?.id ?? ""));
    } else {
      list = projects.filter((p) =>
        matchesProjectFilter(p, filter, {
          taskProgressPercent: taskProgress[p.id] ?? null,
        })
      );
    }
    if (!search.trim()) return list;
    const q = search.trim().toLowerCase();
    return list.filter(
      (p) =>
        p.name?.toLowerCase().includes(q) ||
        p.customerName?.toLowerCase().includes(q) ||
        p.addressText?.toLowerCase().includes(q) ||
        p.city?.toLowerCase().includes(q)
    );
  }, [projects, search, filter, user?.id, taskProgress]);

  const archivedForAllView = useMemo(() => {
    if (filter !== "all" || isFieldWorker) return [];
    return projects.filter((p) => isProjectArchived(p));
  }, [projects, filter, isFieldWorker]);

  const handleProjectUpdated = (updated: ProjectDoc) => {
    setProjects((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
  };

  const handleActionToast = (key: string) => {
    setToastMessage(t(key));
    loadProjects();
  };

  const formatDate = (s?: string): string => {
    if (!s) return "";
    try {
      return new Date(s).toLocaleDateString(undefined, {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });
    } catch {
      return "";
    }
  };

  if (accessDenied) {
    return (
      <div className="space-y-6">
        <h2 className="text-xl font-semibold">{t("projects.titleJobs")}</h2>
        <Card className="border-destructive/50">
          <CardContent className="space-y-4 py-8">
            <p className="text-center text-destructive font-medium">
              {t("projects.accessDenied")}
            </p>
            <p className="text-center text-sm text-muted-foreground">
              {error ?? t("projects.accessDeniedHint")}
            </p>
            <div className="flex justify-center">
              <Button type="button" variant="outline" onClick={loadProjects}>
                {t("common.refresh")}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {toastMessage ? (
        <div className="rounded-lg border border-[#1D376A]/20 bg-[#1D376A]/5 px-4 py-2 text-sm text-[#1D376A]">
          {toastMessage}
        </div>
      ) : null}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-2">
          <h2 className="text-xl font-semibold">
            {isFieldWorker ? t("workerDashboard.myJobs.title") : t("projects.titleJobs")}
          </h2>
          {!isFieldWorker ? <ProjectsWorkspaceContextBanner /> : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[12rem] sm:w-64">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              placeholder={t("projects.searchPlaceholder")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8"
            />
          </div>
          {!isFieldWorker ? (
            <Link
              href="/app/projects/new"
              className={buttonVariants({ variant: "default", size: "sm" })}
            >
              <Plus className="size-4 mr-2" />
              {t("projects.createJob")}
            </Link>
          ) : null}
          <Button variant="outline" size="sm" onClick={loadProjects} disabled={loading}>
            <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />
            {t("common.refresh")}
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2" role="tablist" aria-label={t("projects.titleJobs")}>
          {(isFieldWorker ? (["assigned", "active"] as ProjectsPageFilter[]) : ALL_FILTERS).map(
            (f) => (
            <Button
              key={f}
              type="button"
              size="sm"
              variant={filter === f ? "secondary" : "outline"}
              role="tab"
              aria-selected={filter === f}
              onClick={() => setFilter(f)}
              className={cn(
                filter === f &&
                  f === "concepts" &&
                  "border-[#e06737]/40 bg-[#e06737]/12 text-[#9a3d1a] font-semibold dark:text-orange-100",
                filter === f &&
                  f === "active" &&
                  "border-emerald-600/35 bg-emerald-500/15 text-emerald-900 font-semibold dark:text-emerald-100",
                filter === f &&
                  f !== "concepts" &&
                  f !== "active" &&
                  "border-[#1D376A]/30 bg-[#1D376A]/8 text-[#1D376A]"
              )}
            >
              {t(f === "assigned" ? "projects.filter.assigned" : `projects.filter.${f}`)}
            </Button>
          )
          )}
        </div>

        <div
          className="inline-flex rounded-lg border border-border p-0.5"
          role="tablist"
          aria-label={t("projects.viewMode")}
        >
          <Button
            type="button"
            size="sm"
            variant={view === "list" ? "secondary" : "ghost"}
            role="tab"
            aria-selected={view === "list"}
            onClick={() => setView("list")}
            className={cn(view === "list" && "bg-background shadow-sm")}
          >
            <List className="size-4 mr-1.5" aria-hidden />
            {t("projects.viewList")}
          </Button>
          <Button
            type="button"
            size="sm"
            variant={view === "map" ? "secondary" : "ghost"}
            role="tab"
            aria-selected={view === "map"}
            onClick={() => setView("map")}
            className={cn(view === "map" && "bg-background shadow-sm")}
          >
            <MapIcon className="size-4 mr-1.5" aria-hidden />
            {t("projects.viewMap")}
          </Button>
        </div>
      </div>

      {loading ? (
        view === "map" ? (
          <ProjectsMapPanel projects={[]} t={t} />
        ) : (
          <ProjectsTableSkeleton />
        )
      ) : error ? (
        <Card>
          <CardContent className="py-6">
            <p className="text-destructive">{error}</p>
          </CardContent>
        </Card>
      ) : filteredProjects.length === 0 ? (
        <Card>
          <CardContent className="py-12">
            <div className="flex flex-col items-center justify-center text-center">
              <FolderKanban className="size-12 text-muted-foreground mb-4" />
              <p className="font-medium">
                {isFieldWorker ? t("workerDashboard.myJobs.empty") : t("projects.empty")}
              </p>
              <p className="mt-2 text-sm text-muted-foreground max-w-sm">
                {isFieldWorker
                  ? t("workerDashboard.today.emptyHint")
                  : t("projects.emptyHint")}
              </p>
              {activeWorkspace?.type === "company" && projects.length === 0 && !isFieldWorker ? (
                <p className="mt-3 text-xs text-muted-foreground max-w-md">
                  {t("projects.dataLoadHint")}
                </p>
              ) : null}
              {!isFieldWorker ? (
                <Link
                  href="/app/projects/new"
                  className={cn(buttonVariants({ variant: "outline", size: "sm" }), "mt-4 inline-flex")}
                >
                  <Plus className="size-4 mr-2" />
                  {t("projects.createJob")}
                </Link>
              ) : null}
            </div>
          </CardContent>
        </Card>
      ) : view === "map" ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("projects.map.title")}</CardTitle>
          </CardHeader>
          <CardContent>
            <ProjectsMapPanel projects={filteredProjects} t={t} />
          </CardContent>
        </Card>
      ) : (
        <>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {filteredProjects.length} {t("projects.count")}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("projects.nameCol")}</TableHead>
                  <TableHead className="hidden md:table-cell">
                    {t("projects.customerCol")}
                  </TableHead>
                  <TableHead className="hidden lg:table-cell">
                    {t("projects.addressCol")}
                  </TableHead>
                  <TableHead>{t("projects.statusCol")}</TableHead>
                  <TableHead className="hidden md:table-cell">
                    {t("projects.dashboard.list.quoteCol")}
                  </TableHead>
                  <TableHead className="hidden sm:table-cell">
                    {t("projects.updatedCol")}
                  </TableHead>
                  <TableHead className="w-[120px]">{t("projects.dashboard.list.actionCol")}</TableHead>
                  <TableHead className="w-[40px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredProjects.map((p) => {
                  const archived = isProjectArchived(p);
                  const statusKey = getHumanWorkflowStatusKey(p);
                  const quoteKey = getQuoteStatusKey(p);
                  const primaryAction = getListPrimaryAction(p);
                  return (
                  <TableRow
                    key={p.id}
                    className={cn(getProjectListRowClass(p))}
                  >
                    <TableCell>
                      <div className="space-y-1.5">
                        <Link
                          href={`/app/projects/${p.id}`}
                          className="font-medium text-[#1D376A] hover:text-[#e06737] hover:underline"
                        >
                          {p.name || t("projects.noName")}
                        </Link>
                        {archived ? (
                          <Badge variant="secondary" className="text-xs">
                            {t("projects.archivedBadge")}
                          </Badge>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-muted-foreground text-sm">
                      {p.customerCompanyName || p.customerName || "—"}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell text-muted-foreground text-sm">
                      {p.addressText || p.city || "—"}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-xs",
                            getWorkflowStatusBadgeClass(statusKey)
                          )}
                        >
                          {t(`projects.workflow.status.${statusKey}`)}
                        </Badge>
                        <JobSourceBadge project={p} />
                      </div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-sm">
                      {quoteKey !== "none" ? (
                        <Link
                          href={`/app/projects/${p.id}?tab=quote`}
                          className="text-[#1D376A] hover:underline"
                        >
                          {t(`projects.dashboard.quoteStatus.${quoteKey}`)}
                        </Link>
                      ) : (
                        <span className="text-muted-foreground">
                          {t(`projects.dashboard.quoteStatus.${quoteKey}`)}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="hidden sm:table-cell text-muted-foreground text-sm">
                      {formatDate(p.updatedAt ?? p.createdAt)}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2 whitespace-nowrap">
                        <Link
                          href={primaryAction.href}
                          className="text-sm font-medium text-[#e06737] hover:underline"
                        >
                          {t(primaryAction.labelKey)}
                        </Link>
                        {canManageCrewAssignments(role) ? (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-7 px-2 text-xs"
                            onClick={() => setMembersDialogProject(p)}
                          >
                            {t("projects.membersQuick.addButton")}
                          </Button>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell>
                      {!isFieldWorker && user?.id ? (
                        <ProjectActionsMenu
                          project={p}
                          userId={user.id}
                          role={role}
                          variant="list"
                          onProjectUpdated={handleProjectUpdated}
                          onActionComplete={handleActionToast}
                          onRefresh={loadProjects}
                        />
                      ) : null}
                    </TableCell>
                  </TableRow>
                );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {archivedForAllView.length > 0 ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("projects.archivedSection")}</CardTitle>
            </CardHeader>
            <CardContent className="p-0 overflow-x-auto">
              <Table>
                <TableBody>
                  {archivedForAllView.map((p) => (
                    <TableRow key={`archived-${p.id}`} className="opacity-60">
                      <TableCell>
                        <Link
                          href={`/app/projects/${p.id}`}
                          className="font-medium text-[#1D376A] hover:text-[#e06737] hover:underline"
                        >
                          {p.name || t("projects.noName")}
                        </Link>
                        <Badge variant="secondary" className="ml-2 text-xs">
                          {t("projects.archivedBadge")}
                        </Badge>
                      </TableCell>
                      <TableCell className="w-[56px]">
                        {user?.id ? (
                          <ProjectActionsMenu
                            project={p}
                            userId={user.id}
                            role={role}
                            variant="list"
                            onProjectUpdated={handleProjectUpdated}
                            onActionComplete={handleActionToast}
                            onRefresh={loadProjects}
                          />
                        ) : null}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        ) : null}
        </>
      )}
      <ProjectMembersQuickAssignDialog
        open={!!membersDialogProject}
        project={membersDialogProject}
        onOpenChange={(open) => {
          if (!open) setMembersDialogProject(null);
        }}
        onSaved={() => {
          setToastMessage(t("projects.membersQuick.savedToast"));
          loadProjects();
        }}
        t={t}
      />
    </div>
  );
}
