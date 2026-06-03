"use client";

import { MapPin } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useI18n } from "@/i18n/I18nContext";
import type { ActiveWorkspace } from "@/types/workspace";
import type { UploadedAiDraftFile } from "@/services/ai/aiDraftFiles";
import { AiDraftFileUpload } from "../AiDraftFileUpload";
import { nj } from "../newJobFormStyles";

type Props = {
  workspace: ActiveWorkspace;
  userId: string;
  onEnsureProject: () => Promise<string>;
  uploadedFiles: UploadedAiDraftFile[];
  onUploadedFilesChange: (files: UploadedAiDraftFile[]) => void;
  projectName: string;
  projectBrief: string;
  extraContext: string;
  location: string;
  onProjectNameChange: (v: string) => void;
  onProjectBriefChange: (v: string) => void;
  onExtraContextChange: (v: string) => void;
  onLocationChange: (v: string) => void;
  nameError?: string;
  briefError?: string;
};

function RequiredMark() {
  return (
    <span className="text-[#E95F2A] font-bold" aria-hidden>
      *
    </span>
  );
}

export function AiDraftBriefStep({
  workspace,
  userId,
  onEnsureProject,
  uploadedFiles,
  onUploadedFilesChange,
  projectName,
  projectBrief,
  extraContext,
  location,
  onProjectNameChange,
  onProjectBriefChange,
  onExtraContextChange,
  onLocationChange,
  nameError,
  briefError,
}: Props) {
  const { t } = useI18n();

  return (
    <div className="space-y-6 max-w-2xl">
      <div
        className="rounded-xl border border-[#CBD5E1] bg-[#F6F8FB] px-4 py-3 text-sm text-[#475569] leading-relaxed"
        role="status"
      >
        {t("projects.new.ai.safetyNotice")}
      </div>

      <div className="space-y-2">
        <Label htmlFor="ai-project-name" className={nj.label}>
          {t("projects.new.ai.projectName")} <RequiredMark />
        </Label>
        <Input
          id="ai-project-name"
          value={projectName}
          onChange={(e) => onProjectNameChange(e.target.value)}
          className={nj.input}
          aria-invalid={!!nameError}
        />
        {nameError ? (
          <p className="text-sm text-destructive" role="alert">
            {nameError}
          </p>
        ) : null}
      </div>

      <div className="space-y-2">
        <Label htmlFor="ai-project-brief" className={nj.label}>
          {t("projects.new.ai.projectBrief")} <RequiredMark />
        </Label>
        <Textarea
          id="ai-project-brief"
          value={projectBrief}
          onChange={(e) => onProjectBriefChange(e.target.value)}
          rows={6}
          placeholder={t("projects.new.ai.projectBriefPlaceholder")}
          className={nj.textareaAi}
          aria-invalid={!!briefError}
        />
        {briefError ? (
          <p className="text-sm text-destructive" role="alert">
            {briefError}
          </p>
        ) : null}
      </div>

      <div className="space-y-2">
        <Label htmlFor="ai-extra-context" className={nj.label}>
          {t("projects.new.ai.extraContext")}
        </Label>
        <Textarea
          id="ai-extra-context"
          value={extraContext}
          onChange={(e) => onExtraContextChange(e.target.value)}
          rows={3}
          placeholder={t("projects.new.ai.extraContextPlaceholder")}
          className={nj.input}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="ai-location" className={nj.label}>
          {t("projects.new.location")}
        </Label>
        <div className="relative">
          <MapPin
            className="absolute left-4 top-1/2 -translate-y-1/2 size-5 text-[#64748B]"
            aria-hidden
          />
          <Input
            id="ai-location"
            value={location}
            onChange={(e) => onLocationChange(e.target.value)}
            placeholder={t("projects.new.locationPlaceholder")}
            className={nj.inputWithIcon}
          />
        </div>
      </div>

      <div className="space-y-3 rounded-xl border border-dashed border-[#CBD5E1] bg-white px-4 py-4">
        <div>
          <p className="font-semibold text-[#334155]">{t("projects.new.ai.attachmentsTitle")}</p>
          <p className="mt-1 text-sm text-[#64748B] leading-relaxed">
            {t("projects.new.ai.attachmentsHint")}
          </p>
        </div>
        <AiDraftFileUpload
          workspace={workspace}
          userId={userId}
          onEnsureProject={onEnsureProject}
          files={uploadedFiles}
          onFilesChange={onUploadedFilesChange}
        />
      </div>

      <p className={nj.helper}>{t("projects.new.ai.briefFooter")}</p>
    </div>
  );
}
