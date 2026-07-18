"use client";

/**
 * Plan Takeoff Workbench page — /app/projects/[id]/takeoff?doc={documentId}
 *
 * Opens a project PDF drawing in the interactive takeoff workspace.
 * Without ?doc it offers the project's PDF documents to choose from.
 */

import { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, FileText } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/I18nContext";
import { useAuth } from "@/context/AuthContext";
import { hasProjectAccess, type ProjectDoc } from "@/lib/projects";
import {
  listProjectDocuments,
  type ProjectDocumentRecord,
} from "@/services/projects/projectDocuments";
import {
  resolveProjectDocumentUrl,
  getProjectDocumentPreviewKind,
} from "@/lib/projectDocumentPreview";
import { PlanTakeoffWorkbench } from "@/components/takeoff/PlanTakeoffWorkbench";
import { visualTakeoffResumeHref } from "@/lib/takeoff/visualTakeoffResume";
import { decodeBboxParam, parseTakeoffMode } from "@/lib/takeoff/takeoffMode";

function isPdfDocument(doc: ProjectDocumentRecord): boolean {
  if (getProjectDocumentPreviewKind(doc.mimeType) === "pdf") return true;
  return (doc.fileName ?? "").toLowerCase().endsWith(".pdf");
}

export default function ProjectTakeoffPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { t } = useI18n();
  const { user } = useAuth();
  const projectId = params.id as string;
  const docId = searchParams.get("doc") ?? searchParams.get("drawingId");
  const returnToParam = searchParams.get("returnTo");
  const modeParam = searchParams.get("mode");
  const quoteId = searchParams.get("quoteId");
  const documentIdParam = searchParams.get("documentId");
  const pageParam = Number(searchParams.get("page") ?? "");
  const initialPage =
    Number.isFinite(pageParam) && pageParam >= 1 ? Math.floor(pageParam) : undefined;
  const initialBbox = decodeBboxParam(searchParams.get("bbox"));
  const returnTo =
    returnToParam === "new-project-proposal" ||
    returnToParam === "quote-review" ||
    returnToParam === "documents"
      ? returnToParam
      : "documents";
  // Legacy "quote-precheck" is kept; new modes: quote|project|document|readonly.
  const mode =
    modeParam === "quote-precheck"
      ? ("quote-precheck" as const)
      : parseTakeoffMode(modeParam) ?? ("default" as const);

  const [project, setProject] = useState<ProjectDoc | null>(null);
  const [documents, setDocuments] = useState<ProjectDocumentRecord[]>([]);
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [urlBusy, setUrlBusy] = useState(false);
  const [urlFailed, setUrlFailed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [accessDenied, setAccessDenied] = useState(false);

  const pdfDocuments = useMemo(() => documents.filter(isPdfDocument), [documents]);
  const activeDoc = useMemo(
    () => pdfDocuments.find((d) => d.id === docId) ?? null,
    [pdfDocuments, docId]
  );

  const backHref =
    mode === "quote-precheck"
      ? visualTakeoffResumeHref(projectId)
      : `/app/projects/${projectId}?tab=documents`;

  const userId = user?.id;
  useEffect(() => {
    if (!projectId || !userId) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const { allowed, project: p } = await hasProjectAccess(projectId, userId);
        if (cancelled) return;
        if (!allowed || !p) {
          setAccessDenied(true);
          return;
        }
        setProject(p);
        const docs = await listProjectDocuments(projectId);
        if (!cancelled) setDocuments(docs);
      } catch {
        if (!cancelled) setAccessDenied(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId, userId]);

  // Resolve the download URL of the selected drawing.
  useEffect(() => {
    if (!activeDoc) {
      setFileUrl(null);
      setUrlFailed(false);
      setUrlBusy(false);
      return;
    }
    let cancelled = false;
    setUrlBusy(true);
    setUrlFailed(false);
    setFileUrl(null);
    resolveProjectDocumentUrl(activeDoc)
      .then((url) => {
        if (cancelled) return;
        if (!url) {
          setUrlFailed(true);
          return;
        }
        setFileUrl(url);
      })
      .catch(() => {
        if (!cancelled) setUrlFailed(true);
      })
      .finally(() => {
        if (!cancelled) setUrlBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activeDoc]);

  if (loading || !userId) {
    return (
      <div className="space-y-4" role="status" aria-live="polite">
        <div className="h-8 w-56 animate-pulse rounded bg-muted/50" />
        <div className="flex h-[420px] items-center justify-center rounded-xl border border-border bg-card">
          <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
        </div>
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
            <p className="text-center font-medium text-destructive">
              {t("projects.accessDenied")}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Link
          href={backHref}
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          {project.name}
        </Link>
        <h1 className="text-xl font-bold text-foreground">{t("takeoff.pageTitle")}</h1>
        {mode === "quote-precheck" ? (
          <span className="rounded-full bg-amber-500/15 px-2.5 py-0.5 text-xs font-medium text-amber-800 dark:text-amber-300">
            {t("takeoff.precheck.badge")}
          </span>
        ) : null}
        {activeDoc ? (
          <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
            {activeDoc.fileName}
          </span>
        ) : null}
      </div>

      {!activeDoc ? (
        <Card>
          <CardContent className="space-y-4 py-6">
            <p className="text-sm text-muted-foreground">
              {pdfDocuments.length === 0
                ? t("takeoff.pickDrawing.empty")
                : t("takeoff.pickDrawing.lead")}
            </p>
            {pdfDocuments.length === 0 ? (
              <Button asChild variant="outline">
                <Link href={`/app/projects/${projectId}?tab=documents`}>
                  {t("takeoff.pickDrawing.goToDocuments")}
                </Link>
              </Button>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                {pdfDocuments.map((d) => (
                  <button
                    key={d.id}
                    type="button"
                    className="flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-3 text-left transition-colors hover:border-primary hover:bg-muted/40"
                    onClick={() => {
                      const q = new URLSearchParams();
                      q.set("doc", d.id);
                      if (mode === "quote-precheck") q.set("mode", "quote-precheck");
                      if (returnTo !== "documents") q.set("returnTo", returnTo);
                      router.replace(`/app/projects/${projectId}/takeoff?${q.toString()}`);
                    }}
                  >
                    <FileText className="size-5 shrink-0 text-primary" />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-foreground">
                        {d.fileName}
                      </span>
                      <span className="block text-xs text-muted-foreground">PDF</span>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      ) : urlBusy && !fileUrl ? (
        <div
          className="flex h-[420px] items-center justify-center rounded-xl border border-border bg-card"
          role="status"
        >
          <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
        </div>
      ) : urlFailed && !fileUrl ? (
        <Card className="border-amber-500/40">
          <CardContent className="space-y-3 py-8 text-center">
            <p className="text-sm text-foreground">{t("takeoff.viewer.loadError")}</p>
            <Button asChild variant="outline" size="sm">
              <Link href={backHref}>{t("takeoff.precheck.backToReview")}</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <PlanTakeoffWorkbench
          projectId={projectId}
          drawingId={activeDoc.id}
          fileName={activeDoc.fileName}
          fileUrl={fileUrl}
          mode={mode}
          quoteId={quoteId}
          documentId={documentIdParam ?? activeDoc.id}
          initialPage={initialPage}
          initialBbox={initialBbox}
          returnTo={returnTo}
          showFinishButton={mode === "quote-precheck"}
          onFinished={(dest) => router.push(dest)}
        />
      )}
    </div>
  );
}
