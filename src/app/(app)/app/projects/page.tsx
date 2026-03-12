"use client";

import { useEffect, useState, useMemo } from "react";
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
import { cn } from "@/lib/utils";
import { FolderKanban, RefreshCw, Search, Plus } from "lucide-react";

function ProjectsTableSkeleton() {
  return (
    <Card>
      <CardContent className="py-6">
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              className="h-12 rounded-lg bg-muted/50 animate-pulse"
            />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export default function ProjectsPage() {
  const { t } = useI18n();
  const { user } = useAuth();
  const { activeWorkspace } = useWorkspace();
  const [projects, setProjects] = useState<ProjectDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [accessDenied, setAccessDenied] = useState(false);
  const [search, setSearch] = useState("");

  const loadProjects = async () => {
    if (!user?.id || !activeWorkspace) {
      setProjects([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    setAccessDenied(false);
    try {
      const list = await listProjectsForWorkspace(activeWorkspace, user.id);
      setProjects(list);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to load projects";
      setError(msg);
      setAccessDenied(
        !(e instanceof FirestoreIndexError) &&
          (msg.toLowerCase().includes("permission") ||
            msg.toLowerCase().includes("access"))
      );
      setProjects([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProjects();
  }, [user?.id, activeWorkspace?.id]);

  const filteredProjects = useMemo(() => {
    if (!search.trim()) return projects;
    const q = search.trim().toLowerCase();
    return projects.filter(
      (p) =>
        p.name?.toLowerCase().includes(q) ||
        p.addressText?.toLowerCase().includes(q) ||
        p.city?.toLowerCase().includes(q)
    );
  }, [projects, search]);

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
        <h2 className="text-xl font-semibold">{t("nav.projects")}</h2>
        <Card className="border-destructive/50">
          <CardContent className="py-8">
            <p className="text-center text-destructive font-medium">
              {t("projects.accessDenied")}
            </p>
            <p className="mt-2 text-center text-sm text-muted-foreground">
              {t("projects.accessDeniedHint")}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-xl font-semibold">{t("nav.projects")}</h2>
        <div className="flex items-center gap-2">
          <div className="relative flex-1 sm:w-64">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              placeholder={t("projects.searchPlaceholder")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8"
            />
          </div>
          <Link
            href="/app/projects/new"
            className={buttonVariants({ variant: "default", size: "sm" })}
          >
            <Plus className="size-4 mr-2" />
            {t("projects.createProject")}
          </Link>
          <Button
            variant="outline"
            size="sm"
            onClick={loadProjects}
            disabled={loading}
          >
            <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />
            {t("common.refresh")}
          </Button>
        </div>
      </div>

      {loading ? (
        <ProjectsTableSkeleton />
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
              <p className="font-medium">{t("projects.empty")}</p>
              <p className="mt-2 text-sm text-muted-foreground max-w-sm">
                {t("projects.emptyHint")}
              </p>
              <Link
                href="/app/projects/new"
                className={cn(buttonVariants({ variant: "outline", size: "sm" }), "mt-4 inline-flex")}
              >
                <Plus className="size-4 mr-2" />
                {t("projects.createProject")}
              </Link>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {filteredProjects.length} {t("projects.count")}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("projects.nameCol")}</TableHead>
                  <TableHead className="hidden md:table-cell">
                    {t("projects.addressCol")}
                  </TableHead>
                  <TableHead className="hidden sm:table-cell">
                    {t("projects.updatedCol")}
                  </TableHead>
                  <TableHead className="w-[80px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredProjects.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>
                      <Link
                        href={`/app/projects/${p.id}`}
                        className="font-medium text-[#1D376A] hover:text-[#e06737] hover:underline"
                      >
                        {p.name || t("projects.noName")}
                      </Link>
                      {p.projectType && (
                        <span className="ml-2 text-xs text-muted-foreground">
                          {p.projectType}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-muted-foreground">
                      {p.addressText || p.city || "-"}
                    </TableCell>
                    <TableCell className="hidden sm:table-cell text-muted-foreground text-sm">
                      {formatDate(p.updatedAt ?? p.createdAt)}
                    </TableCell>
                    <TableCell>
                      <Link
                        href={`/app/projects/${p.id}`}
                        className="text-sm font-medium text-[#e06737] hover:underline"
                      >
                        {t("projects.view")}
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
