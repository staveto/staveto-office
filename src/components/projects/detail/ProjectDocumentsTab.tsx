"use client";

import { useMemo, useRef, useState } from "react";
import {
  FileText,
  FileType,
  Image as ImageIcon,
  Loader2,
  Paperclip,
  Upload,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { ProjectDoc } from "@/lib/projects";
import type { ProjectDocumentRecord } from "@/services/projects/projectDocuments";
import { uploadProjectDocument } from "@/services/projects/projectDocuments";
import { useWorkspace } from "@/context/WorkspaceContext";
import { useI18n } from "@/i18n/I18nContext";

type ProjectDocumentsTabProps = {
  project: ProjectDoc;
  documents: ProjectDocumentRecord[];
  userId: string;
  onDocumentsChange: (docs: ProjectDocumentRecord[]) => void;
};

type CategoryKey = "photos" | "documents" | "other";

function categoryOf(doc: ProjectDocumentRecord): CategoryKey {
  const mime = (doc.mimeType ?? "").toLowerCase();
  if (mime.startsWith("image/")) return "photos";
  if (mime === "application/pdf" || mime.includes("word") || mime === "text/plain") {
    return "documents";
  }
  return "other";
}

const CATEGORY_ICON: Record<CategoryKey, typeof FileText> = {
  photos: ImageIcon,
  documents: FileType,
  other: Paperclip,
};

export function ProjectDocumentsTab({
  project,
  documents,
  userId,
  onDocumentsChange,
}: ProjectDocumentsTabProps) {
  const { t } = useI18n();
  const { activeWorkspace } = useWorkspace();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const grouped = useMemo(() => {
    const map: Record<CategoryKey, ProjectDocumentRecord[]> = {
      photos: [],
      documents: [],
      other: [],
    };
    for (const doc of documents) map[categoryOf(doc)].push(doc);
    return map;
  }, [documents]);

  const handleUpload = async (file: File) => {
    if (!activeWorkspace) return;
    setUploading(true);
    setError(null);
    try {
      const record = await uploadProjectDocument(project.id, activeWorkspace, userId, file);
      onDocumentsChange([record, ...documents]);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Upload failed";
      setError(msg === "FILE_TOO_LARGE" ? t("projects.dashboard.documents.tooLarge") : msg);
    } finally {
      setUploading(false);
    }
  };

  const categories: CategoryKey[] = ["documents", "photos", "other"];
  const isEmpty = documents.length === 0;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="text-base text-[#1D376A]">
          {t("projects.dashboard.tab.documents")}
        </CardTitle>
        <div>
          <input
            ref={inputRef}
            type="file"
            className="hidden"
            accept=".pdf,.txt,.docx,image/*"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleUpload(file);
              e.target.value = "";
            }}
          />
          <Button
            size="sm"
            className="bg-[#e06737] hover:bg-[#c9582f]"
            disabled={uploading || !activeWorkspace}
            onClick={() => inputRef.current?.click()}
          >
            {uploading ? (
              <Loader2 className="mr-1 size-4 animate-spin" />
            ) : (
              <Upload className="mr-1 size-4" />
            )}
            {t("projects.dashboard.documents.upload")}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        {isEmpty ? (
          <div className="py-12 text-center text-muted-foreground">
            <FileText className="mx-auto mb-3 size-10 opacity-40" />
            <p className="text-sm">{t("projects.dashboard.documents.empty")}</p>
            <Button
              size="sm"
              variant="outline"
              className="mt-4"
              disabled={uploading || !activeWorkspace}
              onClick={() => inputRef.current?.click()}
            >
              <Upload className="mr-1 size-4" />
              {t("projects.dashboard.documents.upload")}
            </Button>
          </div>
        ) : (
          categories
            .filter((cat) => grouped[cat].length > 0)
            .map((cat) => {
              const Icon = CATEGORY_ICON[cat];
              return (
                <section key={cat} className="space-y-2">
                  <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    <Icon className="size-4" />
                    {t(`projects.documents.category.${cat}`)}
                    <span className="tabular-nums">({grouped[cat].length})</span>
                  </h3>
                  <ul className="grid gap-2 sm:grid-cols-2">
                    {grouped[cat].map((doc) => (
                      <li
                        key={doc.id}
                        className="flex items-center gap-3 rounded-lg border border-border/70 px-3 py-2.5 text-sm transition-colors hover:border-[#1D376A]/30 hover:bg-muted/30"
                      >
                        <Icon className="size-4 shrink-0 text-[#1D376A]/70" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium text-foreground">{doc.fileName}</p>
                          {doc.createdAt ? (
                            <p className="text-xs text-muted-foreground">
                              {new Date(doc.createdAt).toLocaleDateString()}
                            </p>
                          ) : null}
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })
        )}
      </CardContent>
    </Card>
  );
}
