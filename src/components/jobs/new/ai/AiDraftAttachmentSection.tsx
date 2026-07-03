"use client";

import { useI18n } from "@/i18n/I18nContext";
import type { AiProjectDraftLocal } from "@/lib/aiProjectDraftLocal";
import { cn } from "@/lib/utils";
import {
  formatAttachmentProcessingSummary,
  type MaterialSourceKind,
} from "@/types/attachmentDraft";

type Props = {
  draft: AiProjectDraftLocal;
};

function MaterialSourceBadge({ source }: { source?: MaterialSourceKind }) {
  const { t } = useI18n();
  if (!source) return null;
  const labelKey =
    source === "attachment"
      ? "projects.new.ai.workspace.materialSource.document"
      : source === "needs_confirmation"
        ? "projects.new.ai.workspace.materialSource.needsConfirmation"
        : "projects.new.ai.workspace.materialSource.inferred";
  return (
    <span className="inline-flex rounded-full bg-[#E2E8F0] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#475569] dark:bg-[#334155] dark:text-[#CBD5E1]">
      {t(labelKey)}
    </span>
  );
}

export function AiDraftAttachmentProcessingCard({ draft }: Props) {
  const { locale } = useI18n();
  const summary = formatAttachmentProcessingSummary(
    draft.attachmentProcessing,
    locale === "de" ? "de" : locale === "en" ? "en" : "sk"
  );
  if (!summary) return null;

  return (
    <div
      className="rounded-lg border border-[#BFDBFE] bg-[#EFF6FF] px-3 py-2.5 text-sm text-[#1E3A5F] dark:border-[#334155] dark:bg-[#1E3B5C] dark:text-[#BFDBFE]"
      data-testid="ai-attachment-processing-card"
    >
      <p className="font-medium">{summary.headline}</p>
      <p className="mt-0.5 text-xs">{summary.found}</p>
    </div>
  );
}

export function AiDraftAttachmentFindingsPanel({ draft }: Props) {
  const { t } = useI18n();
  const findings = draft.attachmentFindings ?? [];

  if (findings.length === 0 && !draft.projectFacts) {
    return (
      <p className="text-sm text-[#64748B]" data-testid="ai-attachment-findings-empty">
        {t("projects.new.ai.workspace.noAttachmentFindings")}
      </p>
    );
  }

  return (
    <div className="space-y-4" data-testid="ai-attachment-findings">
      <AiDraftAttachmentProcessingCard draft={draft} />

      {draft.projectFacts?.rooms?.length ? (
        <section>
          <h3 className="text-xs font-bold uppercase tracking-wide text-[#64748B] mb-2">
            {t("projects.new.ai.workspace.findings.rooms")}
          </h3>
          <ul className="space-y-1 text-sm text-[#334155] dark:text-[#CBD5E1]" role="list">
            {draft.projectFacts.rooms.map((room) => (
              <li key={`${room.name}-${room.areaM2 ?? "na"}`}>
                {room.name}
                {room.areaM2 != null ? ` — ${room.areaM2} m²` : ""}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {findings.map((finding) => (
        <article
          key={finding.fileName}
          className="rounded-xl border border-[#E2E8F0] dark:border-[#334155] overflow-hidden"
        >
          <div className="bg-[#F8FAFC] dark:bg-[#243247] px-3 py-2 border-b border-[#E2E8F0] dark:border-[#334155]">
            <p className="font-semibold text-sm text-[#0F2A4D] dark:text-[#F8FAFC]">
              {finding.fileName}
            </p>
            <p className="text-xs text-[#64748B]">
              {t(`projects.new.ai.workspace.documentType.${finding.documentType}`)} ·{" "}
              {t("projects.new.ai.workspace.findings.confidence")}: {finding.confidence}
            </p>
          </div>
          <div className="px-3 py-3 space-y-3 text-sm">
            {finding.extractedTextSummary ? (
              <p className="text-[#334155] dark:text-[#CBD5E1]">{finding.extractedTextSummary}</p>
            ) : null}

            {finding.roomsAndAreas.length > 0 ? (
              <div>
                <p className="text-xs font-bold text-[#64748B] mb-1">
                  {t("projects.new.ai.workspace.findings.rooms")}
                </p>
                <ul className="space-y-1" role="list">
                  {finding.roomsAndAreas.map((room) => (
                    <li key={`${finding.fileName}-${room.roomName}`}>
                      {room.roomName}
                      {room.areaM2 != null ? ` (${room.areaM2} m²)` : ""}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {finding.dimensions.length > 0 ? (
              <div>
                <p className="text-xs font-bold text-[#64748B] mb-1">
                  {t("projects.new.ai.workspace.findings.dimensions")}
                </p>
                <ul className="space-y-1" role="list">
                  {finding.dimensions.map((d) => (
                    <li key={`${finding.fileName}-${d.label}-${d.value}`}>
                      {d.label}: {d.value}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {finding.detectedScopeOfWork.length > 0 ? (
              <div>
                <p className="text-xs font-bold text-[#64748B] mb-1">
                  {t("projects.new.ai.workspace.findings.scope")}
                </p>
                <ul className="list-disc pl-4 space-y-0.5" role="list">
                  {finding.detectedScopeOfWork.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            {finding.detectedMaterials.length > 0 ? (
              <div>
                <p className="text-xs font-bold text-[#64748B] mb-1">
                  {t("projects.new.ai.workspace.findings.materialHints")}
                </p>
                <ul className="space-y-1" role="list">
                  {finding.detectedMaterials.map((m) => (
                    <li key={`${finding.fileName}-${m.name}`}>
                      <span className="font-medium">{m.name}</span>
                      <span className="text-xs text-[#64748B]"> ({m.confidence})</span>
                      {m.sourceNote ? (
                        <span className="block text-xs text-[#64748B]">{m.sourceNote}</span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {finding.timeOrDurationHints.length > 0 ? (
              <div>
                <p className="text-xs font-bold text-[#64748B] mb-1">
                  {t("projects.new.ai.workspace.findings.timeHints")}
                </p>
                <ul className="space-y-1" role="list">
                  {finding.timeOrDurationHints.map((hint) => (
                    <li key={`${finding.fileName}-${hint.description}`}>
                      {hint.description}
                      {hint.value ? `: ${hint.value}` : ""}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {finding.missingQuestions.length > 0 ? (
              <div>
                <p className="text-xs font-bold text-[#64748B] mb-1">
                  {t("projects.new.ai.workspace.findings.missingQuestions")}
                </p>
                <ul className="list-disc pl-4 space-y-0.5" role="list">
                  {finding.missingQuestions.map((q) => (
                    <li key={q}>{q}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        </article>
      ))}

      {(draft.missingQuestions?.length ?? 0) > 0 ? (
        <section>
          <h3 className="text-xs font-bold uppercase tracking-wide text-[#64748B] mb-2">
            {t("projects.new.ai.workspace.findings.missingQuestions")}
          </h3>
          <ul className="list-disc pl-4 space-y-0.5 text-sm text-[#334155] dark:text-[#CBD5E1]" role="list">
            {draft.missingQuestions!.map((q) => (
              <li key={q}>{q}</li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

export function MaterialSourceBadgeExport({ source }: { source?: MaterialSourceKind }) {
  return <MaterialSourceBadge source={source} />;
}

export function materialSourceBadgeClass() {
  return cn(
    "inline-flex rounded-full bg-[#E2E8F0] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#475569]"
  );
}
