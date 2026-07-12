"use client";

import { useState } from "react";
import { Loader2, Sparkles, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useI18n } from "@/i18n/I18nContext";
import type { Locale } from "@/i18n/translations";
import type { ActiveWorkspace } from "@/types/workspace";
import type { UploadedAiDraftFile } from "@/services/ai/aiDraftFiles";
import {
  extractImproveBriefError,
  improveProjectBrief,
  isImproveBriefEnabled,
  type ImproveBriefResult,
} from "@/services/ai/improveBriefService";
import { AiDraftFileUpload } from "../AiDraftFileUpload";
import { JobSiteLocationField } from "@/components/location/JobSiteLocationField";
import { cn } from "@/lib/utils";
import { nj } from "../newJobFormStyles";

type Props = {
  workspace: ActiveWorkspace;
  userId: string;
  uploadSessionId: string;
  useOfficeUploadFallback?: boolean;
  uploadedFiles: UploadedAiDraftFile[];
  onUploadedFilesChange: (files: UploadedAiDraftFile[]) => void;
  projectName: string;
  projectBrief: string;
  extraContext: string;
  location: string;
  jobType?: string;
  locale: Locale;
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
  uploadSessionId,
  useOfficeUploadFallback,
  uploadedFiles,
  onUploadedFilesChange,
  projectName,
  projectBrief,
  extraContext,
  location,
  jobType,
  locale,
  onProjectNameChange,
  onProjectBriefChange,
  onExtraContextChange,
  onLocationChange,
  nameError,
  briefError,
}: Props) {
  const { t } = useI18n();
  const [improving, setImproving] = useState(false);
  const [improveError, setImproveError] = useState<string | null>(null);
  const [improveResult, setImproveResult] = useState<ImproveBriefResult | null>(null);
  const [briefBeforeImprove, setBriefBeforeImprove] = useState<string | null>(null);

  const canImprove = isImproveBriefEnabled() && projectBrief.trim().length >= 10;

  const handleImprove = async () => {
    if (!canImprove || improving) return;
    setImproving(true);
    setImproveError(null);
    try {
      const previous = projectBrief;
      const res = await improveProjectBrief({
        brief: projectBrief,
        projectName,
        jobType,
        extraContext,
        location,
        attachmentNames: uploadedFiles.map((f) => f.fileName),
        locale,
      });
      if (res.improvedBrief && res.improvedBrief.trim() !== previous.trim()) {
        setBriefBeforeImprove(previous);
        onProjectBriefChange(res.improvedBrief);
      }
      setImproveResult(res);
    } catch (err) {
      setImproveError(
        extractImproveBriefError(err) || t("projects.new.ai.improve.error")
      );
    } finally {
      setImproving(false);
    }
  };

  const handleUndoImprove = () => {
    if (briefBeforeImprove == null) return;
    onProjectBriefChange(briefBeforeImprove);
    setBriefBeforeImprove(null);
    setImproveResult(null);
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div className={nj.infoBox} role="status">
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
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Label htmlFor="ai-project-brief" className={nj.label}>
            {t("projects.new.ai.projectBrief")} <RequiredMark />
          </Label>
          {isImproveBriefEnabled() ? (
            <div className="flex items-center gap-2">
              {briefBeforeImprove != null ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleUndoImprove}
                  disabled={improving}
                >
                  <Undo2 className="mr-1.5 size-3.5" />
                  {t("projects.new.ai.improve.undo")}
                </Button>
              ) : null}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void handleImprove()}
                disabled={!canImprove || improving}
                title={
                  canImprove ? undefined : t("projects.new.ai.improve.needMore")
                }
              >
                {improving ? (
                  <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                ) : (
                  <Sparkles className="mr-1.5 size-3.5 text-[#E95F2A]" />
                )}
                {improving
                  ? t("projects.new.ai.improve.busy")
                  : t("projects.new.ai.improve.cta")}
              </Button>
            </div>
          ) : null}
        </div>
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
        {improveError ? (
          <p className="text-sm text-destructive" role="alert">
            {improveError}
          </p>
        ) : null}
        {improveResult &&
        (improveResult.addedDetails.length > 0 ||
          improveResult.openQuestions.length > 0) ? (
          <div className="mt-2 space-y-2 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] px-3 py-2 text-sm dark:border-[#334155] dark:bg-[#1E293B]">
            {improveResult.addedDetails.length > 0 ? (
              <div>
                <p className="text-xs font-semibold uppercase text-[#64748B]">
                  {t("projects.new.ai.improve.clarified")}
                </p>
                <ul className="mt-1 list-disc pl-5 text-[#475569] dark:text-[#CBD5E1]">
                  {improveResult.addedDetails.map((d, i) => (
                    <li key={i}>{d}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            {improveResult.openQuestions.length > 0 ? (
              <div>
                <p className="text-xs font-semibold uppercase text-[#B45309] dark:text-[#FCD34D]">
                  {t("projects.new.ai.improve.openQuestions")}
                </p>
                <ul className="mt-1 list-disc pl-5 text-[#475569] dark:text-[#CBD5E1]">
                  {improveResult.openQuestions.map((q, i) => (
                    <li key={i}>{q}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
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

      <JobSiteLocationField
        id="ai-location"
        value={location}
        onChange={onLocationChange}
      />

      <div className={cn("space-y-3", nj.dashedPanel)}>
        <div>
          <p className="font-semibold text-[#334155] dark:text-[#E2E8F0]">
            {t("projects.new.ai.attachmentsTitle")}
          </p>
          <p className="mt-1 text-sm text-[#64748B] leading-relaxed">
            {t("projects.new.ai.attachmentsHint")}
          </p>
        </div>
        <AiDraftFileUpload
          userId={userId}
          sessionId={uploadSessionId}
          workspace={workspace}
          useOfficeUploadFallback={useOfficeUploadFallback}
          files={uploadedFiles}
          onFilesChange={onUploadedFilesChange}
        />
      </div>

      <p className={nj.helper}>{t("projects.new.ai.briefFooter")}</p>
    </div>
  );
}
