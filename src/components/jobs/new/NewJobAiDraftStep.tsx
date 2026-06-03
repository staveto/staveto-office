"use client";

import { useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useI18n } from "@/i18n/I18nContext";
import { cn } from "@/lib/utils";
import type { ActiveWorkspace } from "@/types/workspace";
import type { WorkType } from "@/lib/workTypes";
import type { ContactMode } from "./newJobWizardTypes";
import type { CustomerDoc, CustomerType } from "@/lib/customers";
import type { ProjectDraftPayload } from "@/types/aiProjectDraft";
import {
  createProjectFromDraft,
  generateProjectDraft,
  localeToDraftLanguage,
  mapCallableError,
  updateProjectDraftWithAI,
} from "@/services/ai/projectDraftService";
import type { UploadedAiDraftFile } from "@/services/ai/aiDraftFiles";
import { nj, njNavPrimary } from "./newJobFormStyles";

export type NewJobAiDraftContext = {
  workType: WorkType;
  contactMode: ContactMode;
  selectedCustomer: CustomerDoc | null;
  newContactName: string;
  newContactEmail: string;
  newContactPhone: string;
  newContactType: CustomerType;
  newContactIco: string;
  newContactTaxId: string;
  newContactAddress: string;
  description: string;
  location: string;
  attachedFiles: UploadedAiDraftFile[];
};

type Props = {
  workspace: ActiveWorkspace;
  userId: string;
  context: NewJobAiDraftContext;
  onProjectCreated: (projectId: string) => void;
};

export function NewJobAiDraftStep({ workspace, userId, context, onProjectCreated }: Props) {
  const { t, locale } = useI18n();
  const [draftId, setDraftId] = useState<string | null>(null);
  const [draft, setDraft] = useState<ProjectDraftPayload | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [generating, setGenerating] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [chatMessage, setChatMessage] = useState("");
  const [error, setError] = useState<string | null>(null);

  const language = localeToDraftLanguage(locale);

  const buildNewContact = () => {
    if (context.contactMode !== "new" || !context.newContactName.trim()) return undefined;
    return {
      type: context.newContactType,
      name: context.newContactName.trim(),
      email: context.newContactEmail.trim() || undefined,
      phone: context.newContactPhone.trim() || undefined,
      address: context.newContactAddress.trim() || undefined,
      ico: context.newContactIco.trim() || undefined,
      dic: context.newContactTaxId.trim() || undefined,
    };
  };

  const handleGenerate = async () => {
    setError(null);
    setGenerating(true);
    try {
      const res = await generateProjectDraft({
        workspace,
        userId,
        jobType: context.workType,
        contactMode: context.contactMode,
        contactId: context.selectedCustomer?.id,
        newContact: buildNewContact(),
        description: context.description,
        location: context.location.trim() || undefined,
        language,
        attachedFileIds: context.attachedFiles.map((f) => f.id),
      });
      setDraftId(res.draftId);
      setDraft(res.draft);
      setWarnings(res.warnings ?? []);
    } catch (e) {
      const kind = mapCallableError(e);
      if (kind === "permission") {
        setError(t("projects.new.ai.errorPermission"));
      } else if (kind === "not_configured") {
        setError(t("projects.new.ai.errorNotConfigured"));
      } else if (kind === "quota") {
        setError(t("projects.new.ai.errorQuota"));
      } else {
        setError(t("projects.new.ai.errorGenerate"));
      }
    } finally {
      setGenerating(false);
    }
  };

  const handleUpdate = async () => {
    if (!draftId || !chatMessage.trim()) return;
    setError(null);
    setUpdating(true);
    try {
      const res = await updateProjectDraftWithAI({
        workspace,
        userId,
        draftId,
        userMessage: chatMessage.trim(),
        language,
      });
      setDraft(res.draft);
      setChatMessage("");
    } catch (e) {
      const kind = mapCallableError(e);
      setError(
        kind === "permission"
          ? t("projects.new.ai.errorPermission")
          : t("projects.new.ai.errorUpdate")
      );
    } finally {
      setUpdating(false);
    }
  };

  const handleConfirm = async () => {
    if (!draftId) return;
    setError(null);
    setConfirming(true);
    try {
      const res = await createProjectFromDraft({
        workspace,
        userId,
        draftId,
      });
      onProjectCreated(res.projectId);
    } catch (e) {
      const kind = mapCallableError(e);
      setError(
        kind === "permission"
          ? t("projects.new.ai.errorPermission")
          : t("projects.new.ai.errorConfirm")
      );
    } finally {
      setConfirming(false);
    }
  };

  if (!draft) {
    return (
      <div className="space-y-4 max-w-2xl">
        <p className={nj.sectionLead}>{t("projects.new.ai.conceptLead")}</p>
        <Button
          type="button"
          className={njNavPrimary()}
          disabled={generating || !context.description.trim()}
          onClick={() => void handleGenerate()}
        >
          {generating ? (
            <Loader2 className="size-4 mr-2 animate-spin" aria-hidden />
          ) : (
            <Sparkles className="size-4 mr-2" aria-hidden />
          )}
          {generating ? t("projects.new.ai.generating") : t("projects.new.ai.generateCta")}
        </Button>
        {error ? (
          <p className={cn("text-sm", nj.error)} role="alert">
            {error}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl">
      {warnings.length > 0 ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {t("projects.new.ai.documentsPartial")}
          <ul className="mt-1 list-disc pl-4">
            {warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <section className="rounded-xl border border-[#E2E8F0] bg-white p-5 space-y-4">
        <h3 className="text-base font-semibold text-[#0F2A4D]">
          {t("projects.new.ai.previewTitle")}
        </h3>
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-[#64748B]">{t("projects.new.preview.type")}</dt>
            <dd className="font-semibold text-[#0F2A4D]">{draft.projectTitle}</dd>
          </div>
          <div>
            <dt className="text-[#64748B]">{t("projects.new.ai.fieldSummary")}</dt>
            <dd className="text-[#334155]">{draft.summary}</dd>
          </div>
          {draft.location ? (
            <div>
              <dt className="text-[#64748B]">{t("projects.new.location")}</dt>
              <dd className="text-[#334155]">{draft.location}</dd>
            </div>
          ) : null}
          {draft.customer.name ? (
            <div>
              <dt className="text-[#64748B]">{t("projects.new.preview.customer")}</dt>
              <dd className="text-[#334155]">{draft.customer.name}</dd>
            </div>
          ) : null}
        </dl>

        {draft.tasks.length > 0 ? (
          <div>
            <h4 className="text-sm font-semibold text-[#0F2A4D] mb-2">
              {t("projects.new.ai.fieldTasks")}
            </h4>
            <ul className="space-y-2">
              {draft.tasks.map((task, i) => (
                <li
                  key={`${task.title}-${i}`}
                  className="rounded-lg bg-[#F6F8FB] px-3 py-2 text-sm text-[#334155]"
                >
                  <span className="font-semibold text-[#0F2A4D]">{task.title}</span>
                  {task.description ? (
                    <p className="mt-0.5 text-[#64748B]">{task.description}</p>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {draft.materials.length > 0 ? (
          <div>
            <h4 className="text-sm font-semibold text-[#0F2A4D] mb-2">
              {t("projects.new.ai.fieldMaterials")}
            </h4>
            <ul className="list-disc pl-5 text-sm text-[#334155] space-y-1">
              {draft.materials.map((m, i) => (
                <li key={`${m.name}-${i}`}>
                  {m.name}
                  {m.quantity != null ? ` — ${m.quantity} ${m.unit ?? ""}` : ""}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {draft.clarificationQuestions.length > 0 ? (
          <DraftList
            title={t("projects.new.ai.fieldQuestions")}
            items={draft.clarificationQuestions}
          />
        ) : null}
        {draft.risks.length > 0 ? (
          <DraftList title={t("projects.new.ai.fieldRisks")} items={draft.risks} />
        ) : null}
        {draft.nextSteps.length > 0 ? (
          <DraftList title={t("projects.new.ai.fieldNextSteps")} items={draft.nextSteps} />
        ) : null}

        {draft.offerPreparation.suggestedLineItems.length > 0 ? (
          <div>
            <h4 className="text-sm font-semibold text-[#0F2A4D] mb-2">
              {t("projects.new.ai.fieldQuoteItems")}
            </h4>
            <ul className="space-y-1 text-sm text-[#334155]">
              {draft.offerPreparation.suggestedLineItems.map((line, i) => (
                <li key={`${line.title}-${i}`}>
                  {line.title}
                  <span className="text-[#64748B]"> ({line.category})</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>

      <section className="rounded-xl border border-[#E2E8F0] bg-[#F6F8FB] p-5 space-y-3">
        <h3 className="text-base font-semibold text-[#0F2A4D]">
          {t("projects.new.ai.chatTitle")}
        </h3>
        <Textarea
          value={chatMessage}
          onChange={(e) => setChatMessage(e.target.value)}
          rows={3}
          placeholder={t("projects.new.ai.chatPlaceholder")}
          className={nj.textarea}
        />
        <Button
          type="button"
          variant="outline"
          disabled={updating || !chatMessage.trim()}
          onClick={() => void handleUpdate()}
        >
          {updating ? (
            <Loader2 className="size-4 mr-2 animate-spin" aria-hidden />
          ) : null}
          {t("projects.new.ai.updateDraft")}
        </Button>
      </section>

      <div className="flex flex-wrap gap-3">
        <Button
          type="button"
          className={njNavPrimary()}
          disabled={confirming}
          onClick={() => void handleConfirm()}
        >
          {confirming ? (
            <Loader2 className="size-4 mr-2 animate-spin" aria-hidden />
          ) : null}
          {t("projects.new.ai.confirmProject")}
        </Button>
        <Button
          type="button"
          variant="ghost"
          disabled={generating}
          onClick={() => void handleGenerate()}
        >
          {t("projects.new.ai.regenerate")}
        </Button>
      </div>

      {error ? (
        <p className={cn("text-sm", nj.error)} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function DraftList({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <h4 className="text-sm font-semibold text-[#0F2A4D] mb-2">{title}</h4>
      <ul className="list-disc pl-5 text-sm text-[#334155] space-y-1">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}
