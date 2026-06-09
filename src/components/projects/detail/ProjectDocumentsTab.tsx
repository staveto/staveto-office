"use client";

import { useRef, useState } from "react";
import { FileText, Loader2, Upload } from "lucide-react";
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
            variant="outline"
            disabled={uploading || !activeWorkspace}
            onClick={() => inputRef.current?.click()}
          >
            {uploading ? (
              <Loader2 className="size-4 animate-spin mr-1" />
            ) : (
              <Upload className="size-4 mr-1" />
            )}
            {t("projects.dashboard.documents.upload")}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {error ? <p className="text-sm text-destructive mb-4">{error}</p> : null}
        {documents.length === 0 ? (
          <div className="py-12 text-center text-muted-foreground">
            <FileText className="size-10 mx-auto mb-3 opacity-40" />
            <p className="text-sm">{t("projects.dashboard.documents.empty")}</p>
          </div>
        ) : (
          <ul className="divide-y divide-border/60">
            {documents.map((doc) => (
              <li key={doc.id} className="flex items-center gap-3 py-3 text-sm">
                <FileText className="size-4 text-muted-foreground shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="font-medium truncate">{doc.fileName}</p>
                  {doc.createdAt ? (
                    <p className="text-xs text-muted-foreground">
                      {new Date(doc.createdAt).toLocaleDateString()}
                    </p>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
