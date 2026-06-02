"use client";

import { useRef, useState } from "react";
import { Paperclip, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/I18nContext";
import { cn } from "@/lib/utils";
import {
  createAiUploadSessionId,
  uploadAiDraftFile,
  type UploadedAiDraftFile,
} from "@/services/ai/aiDraftFiles";
import type { ActiveWorkspace } from "@/types/workspace";
import { nj } from "./newJobFormStyles";

type Props = {
  workspace: ActiveWorkspace;
  userId: string;
  sessionId: string;
  onSessionId: (id: string) => void;
  files: UploadedAiDraftFile[];
  onFilesChange: (files: UploadedAiDraftFile[]) => void;
  disabled?: boolean;
};

export function AiDraftFileUpload({
  workspace,
  userId,
  sessionId,
  onSessionId,
  files,
  onFilesChange,
  disabled,
}: Props) {
  const { t } = useI18n();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFiles = async (list: FileList | null) => {
    if (!list?.length || disabled) return;
    setError(null);
    setUploading(true);
    const sid = sessionId || createAiUploadSessionId();
    if (!sessionId) onSessionId(sid);

    const added: UploadedAiDraftFile[] = [];
    try {
      for (const file of Array.from(list)) {
        const uploaded = await uploadAiDraftFile(workspace, userId, sid, file);
        added.push(uploaded);
      }
      onFilesChange([...files, ...added]);
    } catch (e) {
      const code = e instanceof Error ? e.message : "";
      if (code === "FILE_TOO_LARGE") {
        setError(t("projects.new.ai.filesTooLarge"));
      } else if (code === "FILE_TYPE_UNSUPPORTED") {
        setError(t("projects.new.ai.filesUnsupported"));
      } else {
        setError(t("projects.new.ai.filesUploadError"));
      }
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div className="space-y-2">
      <input
        ref={inputRef}
        type="file"
        multiple
        accept=".txt,.pdf,.docx,image/*"
        className="sr-only"
        onChange={(e) => void handleFiles(e.target.files)}
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={disabled || uploading}
        className="border-[#CBD5E1] bg-white text-[#334155] hover:bg-[#F6F8FB]"
        onClick={() => inputRef.current?.click()}
      >
        {uploading ? (
          <Loader2 className="size-4 mr-2 animate-spin" aria-hidden />
        ) : (
          <Paperclip className="size-4 mr-2" aria-hidden />
        )}
        {t("projects.new.ai.attachFiles")}
      </Button>
      {error ? (
        <p className={cn("text-sm", nj.error)} role="alert">
          {error}
        </p>
      ) : null}
      {files.length > 0 ? (
        <ul className="space-y-1.5">
          {files.map((f) => (
            <li
              key={f.id}
              className="flex items-center justify-between gap-2 rounded-lg border border-[#E2E8F0] bg-white px-3 py-2 text-sm text-[#334155]"
            >
              <span className="truncate">{f.fileName}</span>
              <button
                type="button"
                className="shrink-0 text-[#64748B] hover:text-[#0F2A4D]"
                aria-label={t("common.delete")}
                onClick={() => onFilesChange(files.filter((x) => x.id !== f.id))}
              >
                <X className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
