"use client";

import { useParams, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { useI18n } from "@/i18n/I18nContext";
import { useAuth } from "@/context/AuthContext";
import { useWorkspaceProduct } from "@/hooks/useWorkspaceProduct";
import { hasProjectAccess, type ProjectDoc } from "@/lib/projects";
import { isDraftJob } from "@/lib/projectLifecycle";
import { AiProjectSetupWorkspace } from "@/components/projects/setup/AiProjectSetupWorkspace";
import { ProjectDashboard } from "@/components/projects/detail/ProjectDashboard";

function ProjectDetailSkeleton() {
  return (
    <div className="space-y-6">
      <div className="h-8 w-48 rounded bg-muted/50 animate-pulse" />
      <div className="grid gap-3 sm:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-24 rounded-xl bg-muted/50 animate-pulse" />
        ))}
      </div>
      <div className="h-64 rounded-xl bg-muted/50 animate-pulse" />
    </div>
  );
}

export default function ProjectDetailPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const { t } = useI18n();
  const { user } = useAuth();
  const { role } = useWorkspaceProduct();
  const id = params.id as string;
  const setupAi = searchParams.get("setup") === "ai";

  const [project, setProject] = useState<ProjectDoc | null>(null);
  const [loading, setLoading] = useState(true);
  const [accessDenied, setAccessDenied] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!id || !user?.id) return;

    let cancelled = false;

    async function load() {
      setLoading(true);
      setAccessDenied(false);
      try {
        const { allowed, project: p } = await hasProjectAccess(id, user!.id);
        if (cancelled) return;
        if (!allowed || !p) {
          setAccessDenied(true);
          setProject(null);
          setLoading(false);
          return;
        }
        setProject(p);
      } catch {
        if (!cancelled) {
          setAccessDenied(true);
          setProject(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [id, user?.id]);

  useEffect(() => {
    if (!toastMessage) return;
    const timer = setTimeout(() => setToastMessage(null), 4000);
    return () => clearTimeout(timer);
  }, [toastMessage]);

  const handleActionToast = (key: string) => {
    setToastMessage(t(key));
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <Link
          href="/app/projects"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          {t("projects.titleJobs")}
        </Link>
        <ProjectDetailSkeleton />
      </div>
    );
  }

  if (accessDenied || !project) {
    return (
      <div className="space-y-6">
        <Link
          href="/app/projects"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          {t("projects.titleJobs")}
        </Link>
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

  const showAiSetup = setupAi && isDraftJob(project) && !!user?.id;

  if (showAiSetup) {
    return (
      <AiProjectSetupWorkspace
        project={project}
        userId={user.id}
        onProjectUpdated={setProject}
      />
    );
  }

  if (!user?.id) return null;

  return (
    <ProjectDashboard
      project={project}
      userId={user.id}
      role={role}
      onProjectUpdated={setProject}
      toastMessage={toastMessage}
      onActionToast={handleActionToast}
    />
  );
}
