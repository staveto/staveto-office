"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Search,
  Building2,
  User,
  ChevronDown,
  ChevronUp,
  MapPin,
  Check,
  UserPlus,
  Users,
  UserRound,
  AlertTriangle,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useI18n } from "@/i18n/I18nContext";
import { useAuth } from "@/context/AuthContext";
import { useWorkspace } from "@/context/WorkspaceContext";
import { createDraftJob } from "@/services/projects";
import { createCustomer, listCustomersForWorkspace } from "@/lib/customers";
import type { CustomerDoc, CustomerType } from "@/lib/customers";
import {
  aiPlanToLocalDraft,
  localDraftToAiProjectPlan,
  removeDraftPhase,
  removeDraftTask,
  toggleMaterialSelection,
  updateDraftPhase,
  updateDraftTask,
  type AiProjectDraftLocal,
} from "@/lib/aiProjectDraftLocal";
import {
  confirmWizardAiProject,
  generateWizardAiPlan,
  isWizardAiGenerationEnabled,
  getWizardAiErrorDetail,
  mapWizardAiError,
} from "@/services/ai/aiWizardGenerationService";
import type { UploadedAiDraftFile } from "@/services/ai/aiDraftFiles";
import { getNewJobArchetypeAiContextHint } from "@/lib/aiProjectContext";
import {
  WORK_TYPES,
  WORK_TYPE_ICONS,
  contactRecommendedForWorkType,
  customerFieldsOptional,
  mapArchetypeToFirestoreFields,
  workTypeHintKey,
  workTypeLabelKey,
  type WorkType,
} from "@/lib/workTypes";
import {
  doc,
  getFirestoreInstance,
  serverTimestamp,
  updateDoc,
} from "@/lib/firebase";
import { getProjectWorkspaceWriteFields } from "@/services/workspace/workspaceService";
import { cn } from "@/lib/utils";
import {
  nj,
  njJobTypeCard,
  njIconCircle,
  njJobTypeCheck,
  njLargeChoice,
  njNavPrimary,
  njNavSecondary,
  njChoicePill,
} from "./newJobFormStyles";
import { NewJobStepper, type NewJobStepId } from "./NewJobStepper";
import { NewJobPreviewPanel } from "./NewJobPreviewPanel";
import { ProjectCreateOwnershipBanner } from "@/components/projects/ProjectCreateOwnershipBanner";
import { AiCreationMethodStep } from "./ai/AiCreationMethodStep";
import { AiDraftBriefStep } from "./ai/AiDraftBriefStep";
import { AiDraftReviewPanel, type AiDraftReviewMode } from "./ai/AiDraftReviewPanel";
import {
  buildWizardPath,
  getNextStep,
  getPrevStep,
  type ContactMode,
  type CreationMethod,
  type WizardStep,
} from "./newJobWizardTypes";

function RequiredMark() {
  return (
    <span className={nj.required} aria-hidden="true">
      *
    </span>
  );
}

export function NewJobForm() {
  const router = useRouter();
  const { t, locale } = useI18n();
  const { user } = useAuth();
  const { activeWorkspace } = useWorkspace();

  const [step, setStep] = useState<WizardStep>("type");
  const [workType, setWorkType] = useState<WorkType | null>(null);

  const [contactMode, setContactMode] = useState<ContactMode | null>(null);
  const [customers, setCustomers] = useState<CustomerDoc[]>([]);
  const [customersLoading, setCustomersLoading] = useState(true);
  const [contactSearch, setContactSearch] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerDoc | null>(null);
  const [contactListOpen, setContactListOpen] = useState(false);

  const [newContactName, setNewContactName] = useState("");
  const [newContactEmail, setNewContactEmail] = useState("");
  const [newContactPhone, setNewContactPhone] = useState("");
  const [newContactType, setNewContactType] = useState<CustomerType>("person");
  const [newContactIco, setNewContactIco] = useState("");
  const [newContactTaxId, setNewContactTaxId] = useState("");
  const [newContactAddress, setNewContactAddress] = useState("");
  const [extendedContactOpen, setExtendedContactOpen] = useState(false);

  const [creationMethod, setCreationMethod] = useState<CreationMethod | null>(null);
  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [shortDescription, setShortDescription] = useState("");

  const [aiProjectName, setAiProjectName] = useState("");
  const [aiBrief, setAiBrief] = useState("");
  const [aiExtraContext, setAiExtraContext] = useState("");
  const [aiDraftProjectId, setAiDraftProjectId] = useState<string | null>(null);
  const [aiDraftProjectCreating, setAiDraftProjectCreating] = useState(false);
  const [aiUploadedFiles, setAiUploadedFiles] = useState<UploadedAiDraftFile[]>([]);
  const [aiDraft, setAiDraft] = useState<AiProjectDraftLocal | null>(null);
  const [aiDraftSource, setAiDraftSource] = useState<"mobile" | "office" | null>(null);
  const [aiOfficeDraftId, setAiOfficeDraftId] = useState<string | null>(null);
  const [aiGenerateWarnings, setAiGenerateWarnings] = useState<string[]>([]);
  const [aiReviewMode, setAiReviewMode] = useState<AiDraftReviewMode>("placeholder");
  const [aiGenerateError, setAiGenerateError] = useState<string | null>(null);
  const [aiConfirming, setAiConfirming] = useState(false);

  const [loading, setLoading] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);

  const wizardPath = useMemo(() => buildWizardPath(creationMethod), [creationMethod]);
  const stepIndex = wizardPath.indexOf(step);

  useEffect(() => {
    if (!user?.id || !activeWorkspace) return;
    let cancelled = false;
    setCustomersLoading(true);
    void listCustomersForWorkspace(activeWorkspace, user.id)
      .then((list) => {
        if (!cancelled) setCustomers(list);
      })
      .finally(() => {
        if (!cancelled) setCustomersLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user?.id, activeWorkspace]);

  const filteredContacts = useMemo(() => {
    const q = contactSearch.trim().toLowerCase();
    if (!q) return customers.slice(0, 12);
    return customers.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.email?.toLowerCase().includes(q) ||
        c.phone?.toLowerCase().includes(q)
    );
  }, [customers, contactSearch]);

  const stepDoneContact =
    contactMode === "none" ||
    (contactMode === "existing" && !!selectedCustomer) ||
    (contactMode === "new" && !!newContactName.trim());

  const stepDoneMethod = creationMethod === "manual" || creationMethod === "ai";

  const showContactWarning =
    !!workType &&
    contactRecommendedForWorkType(workType) &&
    contactMode === "none";

  const previewContact = useMemo(() => {
    if (contactMode === "none") return t("projects.new.contact.none");
    if (contactMode === "existing" && selectedCustomer) return selectedCustomer.name;
    if (contactMode === "new" && newContactName.trim()) return newContactName.trim();
    if (contactMode === "new") return t("projects.new.preview.customerNew");
    return t("projects.new.preview.customerNotSelected");
  }, [contactMode, selectedCustomer, newContactName, t]);

  const previewType = workType
    ? t(workTypeLabelKey(workType))
    : t("projects.new.preview.typeNotSelected");

  const previewMethodLabel = useMemo(() => {
    if (!creationMethod) return "—";
    if (creationMethod === "manual") return t("projects.new.preview.methodManual");
    return t("projects.new.preview.methodAi");
  }, [creationMethod, t]);

  const submitLabel = t("projects.new.submit");

  const stepperSteps = useMemo(() => {
    const path = buildWizardPath(creationMethod);
    const idx = path.indexOf(step);
    return path.map((id) => {
      const stepDone =
        id === "contact"
          ? stepDoneContact
          : id === "method"
            ? stepDoneMethod
            : id === "type"
              ? !!workType
              : true;
      return {
        id: id as NewJobStepId,
        label: t(`projects.new.stepper.${id}`),
        done: stepDone && idx > path.indexOf(id),
      };
    });
  }, [t, creationMethod, step, stepDoneContact, stepDoneMethod, workType]);

  const clearFieldError = (key: string) => {
    if (fieldErrors[key]) {
      setFieldErrors((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
  };

  const resolveCustomerFields = async (): Promise<{
    customerId?: string;
    customerName?: string;
    customerEmail?: string;
    customerPhone?: string;
  }> => {
    if (!user?.id || !activeWorkspace) return {};
    if (contactMode === "existing" && selectedCustomer) {
      return {
        customerId: selectedCustomer.id,
        customerName: selectedCustomer.name,
        customerEmail: selectedCustomer.email,
        customerPhone: selectedCustomer.phone,
      };
    }
    if (contactMode === "new" && newContactName.trim()) {
      const customerId = await createCustomer(activeWorkspace, user.id, {
        name: newContactName.trim(),
        email: newContactEmail.trim() || undefined,
        phone: newContactPhone.trim() || undefined,
        type: newContactType,
        ico: newContactIco.trim() || undefined,
        taxId: newContactTaxId.trim() || undefined,
        address: newContactAddress.trim() || undefined,
      });
      return {
        customerId,
        customerName: newContactName.trim(),
        customerEmail: newContactEmail.trim() || undefined,
        customerPhone: newContactPhone.trim() || undefined,
      };
    }
    return {};
  };

  const validateStep = (s: WizardStep): boolean => {
    const err: Record<string, string> = {};
    if (s === "type" && !workType) err.workType = t("projects.new.validation.workType");
    if (s === "contact") {
      if (!contactMode) err.contact = t("projects.new.validation.customer");
      else if (contactMode === "existing" && !selectedCustomer) {
        err.contact = t("projects.new.validation.customer");
      } else if (contactMode === "new" && !newContactName.trim()) {
        err.customerName = t("projects.new.validation.customerName");
      }
    }
    if (s === "method" && !creationMethod) {
      err.method = t("projects.new.validation.method");
    }
    if (s === "manual-details" && !name.trim()) {
      err.name = t("projects.new.validation.name");
    }
    if (s === "ai-brief") {
      if (!aiProjectName.trim()) err.aiProjectName = t("projects.new.validation.aiProjectName");
      if (!aiBrief.trim()) err.aiBrief = t("projects.new.validation.aiBrief");
    }
    setFieldErrors(err);
    return Object.keys(err).length === 0;
  };

  const buildAiGenerateInput = () => {
    if (!user?.id || !activeWorkspace || !workType) {
      throw new Error("Missing workspace context");
    }
    const mapped = mapArchetypeToFirestoreFields(workType);
    return {
      workspace: activeWorkspace,
      userId: user.id,
      locale,
      workType,
      contactMode: contactMode ?? "none",
      selectedCustomer,
      newContactName,
      newContactEmail,
      newContactPhone,
      newContactType,
      newContactIco,
      newContactTaxId,
      newContactAddress,
      projectTitle: aiProjectName.trim(),
      projectBrief: aiBrief.trim(),
      extraContext: aiExtraContext.trim() || undefined,
      location: location.trim() || undefined,
      archetypeHint: getNewJobArchetypeAiContextHint(workType),
      mappedWorkType: mapped.workType,
      jobWorkflowKind: mapped.jobWorkflowKind,
      attachedFileIds: aiUploadedFiles.map((f) => f.id),
      documentStoragePaths: aiUploadedFiles.map((f) => f.storagePath),
    };
  };

  const syncAiDraftProjectFields = useCallback(
    async (projectId: string) => {
      const db = getFirestoreInstance();
      if (!db) return;
      const patch: Record<string, unknown> = { updatedAt: serverTimestamp() };
      if (aiProjectName.trim()) patch.name = aiProjectName.trim();
      if (aiBrief.trim()) patch.customerRequest = aiBrief.trim();
      if (location.trim()) patch.addressText = location.trim();
      await updateDoc(doc(db, "projects", projectId), patch);
    },
    [aiProjectName, aiBrief, location]
  );

  const ensureAiDraftProject = useCallback(async (): Promise<string> => {
    if (!user?.id || !activeWorkspace || !workType) {
      throw new Error("Missing workspace context");
    }
    if (aiDraftProjectId) {
      await syncAiDraftProjectFields(aiDraftProjectId);
      return aiDraftProjectId;
    }
    setAiDraftProjectCreating(true);
    try {
      const customer = await resolveCustomerFields();
      const jobName = aiProjectName.trim() || t("projects.new.ai.defaultDraftName");
      const projectId = await createDraftJob(activeWorkspace, user.id, {
        workType,
        name: jobName,
        customerId: customer.customerId,
        customerRequest: aiBrief.trim() || undefined,
        customerName: customer.customerName,
        customerEmail: customer.customerEmail,
        customerPhone: customer.customerPhone,
        addressText: location.trim() || undefined,
        source: "web",
      });
      setAiDraftProjectId(projectId);
      return projectId;
    } finally {
      setAiDraftProjectCreating(false);
    }
  }, [
    user?.id,
    activeWorkspace,
    workType,
    aiDraftProjectId,
    syncAiDraftProjectFields,
    aiProjectName,
    aiBrief,
    location,
    t,
  ]);

  const mapAiGenerateErrorMessage = (err: unknown): string => {
    if (process.env.NODE_ENV === "development") {
      console.error("[staveto ai generate]", err);
    }
    if (err instanceof Error && err.message === "AI_GENERATION_DISABLED") {
      return t("projects.new.ai.errorNotConfigured");
    }
    if (err instanceof Error && err.message.startsWith("DRAFT_PROJECT:")) {
      return err.message.replace(/^DRAFT_PROJECT:\s*/, "");
    }
    const kind = mapWizardAiError(err);
    const detail = getWizardAiErrorDetail(err);
    if (kind === "unauthenticated" || kind === "permission") {
      return detail ? `${t("projects.new.ai.errorPermission")} ${detail}` : t("projects.new.ai.errorPermission");
    }
    if (kind === "not_configured") {
      return detail || t("projects.new.ai.errorNotConfigured");
    }
    if (kind === "not_deployed") {
      return detail || t("projects.new.ai.errorFunctionsNotDeployed");
    }
    if (kind === "quota") {
      return t("projects.new.ai.errorQuota");
    }
    if (detail) return detail;
    return t("projects.new.ai.errorGenerate");
  };

  const runAiGenerate = async () => {
    if (!isWizardAiGenerationEnabled()) {
      throw new Error("AI_GENERATION_DISABLED");
    }
    const result = await generateWizardAiPlan(buildAiGenerateInput());
    setAiDraftSource(result.source);
    setAiOfficeDraftId(result.officeDraftId ?? null);
    setAiGenerateWarnings(result.warnings ?? []);
    setAiDraft(aiPlanToLocalDraft(result.plan, undefined));
    setAiReviewMode("draft");
  };

  const runAiGenerateWithProject = async () => {
    try {
      await ensureAiDraftProject();
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : t("projects.new.validation.name");
      throw new Error(`DRAFT_PROJECT: ${msg}`);
    }
    await runAiGenerate();
  };

  const goNext = async () => {
    if (!validateStep(step)) return;
    const next = getNextStep(step, creationMethod);
    if (!next) return;

    if (step === "ai-brief" && next === "ai-review") {
      setStep(next);
      setAiGenerateError(null);
      if (!isWizardAiGenerationEnabled()) {
        setAiDraft(null);
        setAiReviewMode("placeholder");
        return;
      }
      setAiReviewMode("generating");
      try {
        await runAiGenerateWithProject();
      } catch (err) {
        setAiDraft(null);
        setAiDraftSource(null);
        setAiOfficeDraftId(null);
        setAiReviewMode("placeholder");
        setAiGenerateError(mapAiGenerateErrorMessage(err));
      }
      return;
    }

    setStep(next);
  };

  const goBack = () => {
    const prev = getPrevStep(step, creationMethod);
    if (prev) setStep(prev);
  };

  const handleContinueManual = () => {
    if (aiProjectName.trim()) setName(aiProjectName.trim());
    if (aiBrief.trim() && !shortDescription.trim()) setShortDescription(aiBrief.trim());
    setCreationMethod("manual");
    setAiDraft(null);
    setAiReviewMode("placeholder");
    setAiGenerateError(null);
    setStep("manual-details");
  };

  const handleRetryGenerate = async () => {
    if (!validateStep("ai-brief")) {
      setStep("ai-brief");
      return;
    }
    setAiGenerateError(null);
    setAiReviewMode("generating");
    try {
      await runAiGenerateWithProject();
    } catch (err) {
      setAiDraft(null);
      setAiDraftSource(null);
      setAiOfficeDraftId(null);
      setAiReviewMode("placeholder");
      setAiGenerateError(mapAiGenerateErrorMessage(err));
    }
  };

  const handleAiConfirm = async () => {
    if (!user?.id || !activeWorkspace || !workType || !aiDraft || !aiDraftSource) return;

    setAiConfirming(true);
    setSubmitError(null);
    try {
      const customer = await resolveCustomerFields();
      const plan = localDraftToAiProjectPlan(aiDraft);
      const projectId = await confirmWizardAiProject({
        source: aiDraftSource,
        officeDraftId: aiOfficeDraftId ?? undefined,
        existingProjectId: aiDraftProjectId ?? undefined,
        workspace: activeWorkspace,
        userId: user.id,
        plan,
        originalBrief: aiBrief.trim() || undefined,
        addressText: location.trim() || undefined,
        attachedFileIds: aiUploadedFiles.map((f) => f.id),
      });

      const db = getFirestoreInstance();
      if (db) {
        await updateDoc(doc(db, "projects", projectId), {
          ...getProjectWorkspaceWriteFields(activeWorkspace, user.id),
          ...(customer.customerId ? { customerId: customer.customerId } : {}),
          ...(customer.customerName ? { customerName: customer.customerName } : {}),
          ...(customer.customerEmail ? { customerEmail: customer.customerEmail } : {}),
          ...(customer.customerPhone ? { customerPhone: customer.customerPhone } : {}),
          updatedAt: serverTimestamp(),
        });
      }

      router.push(`/app/projects/${projectId}?setup=ai`);
    } catch (err) {
      setSubmitError(
        err instanceof Error ? err.message : t("projects.new.ai.errorConfirm")
      );
    } finally {
      setAiConfirming(false);
    }
  };

  const handleCreate = async () => {
    if (creationMethod !== "manual") return;
    if (!user?.id || !activeWorkspace || !workType) return;
    if (!validateStep("manual-details")) {
      setStep("manual-details");
      return;
    }
    if (!validateStep("contact")) {
      setStep("contact");
      return;
    }

    setSubmitError(null);
    setLoading(true);
    try {
      const customer = await resolveCustomerFields();
      const jobName = name.trim();
      if (!jobName) {
        setFieldErrors({ name: t("projects.new.validation.name") });
        setStep("manual-details");
        return;
      }

      const projectId = aiDraftProjectId
        ? aiDraftProjectId
        : await createDraftJob(activeWorkspace, user.id, {
            workType,
            name: jobName,
            customerId: customer.customerId,
            customerRequest: shortDescription.trim() || undefined,
            customerName: customer.customerName,
            customerEmail: customer.customerEmail,
            customerPhone: customer.customerPhone,
            addressText: location.trim() || undefined,
            source: "manual",
          });

      if (aiDraftProjectId) {
        const db = getFirestoreInstance();
        if (db) {
          await updateDoc(doc(db, "projects", aiDraftProjectId), {
            name: jobName,
            customerId: customer.customerId ?? null,
            customerRequest: shortDescription.trim() || null,
            customerName: customer.customerName ?? null,
            customerEmail: customer.customerEmail ?? null,
            customerPhone: customer.customerPhone ?? null,
            addressText: location.trim() || null,
            source: "manual",
            updatedAt: serverTimestamp(),
          });
        }
      }

      router.push(`/app/projects/${projectId}`);
    } catch (err) {
      setSubmitError(
        err instanceof Error ? err.message : t("projects.new.submitError")
      );
    } finally {
      setLoading(false);
    }
  };

  const onSelectCreationMethod = (method: CreationMethod) => {
    setCreationMethod(method);
    clearFieldError("method");
    if (method === "ai" && !aiProjectName.trim() && name.trim()) {
      setAiProjectName(name.trim());
    }
  };

  const showFooterContinue =
    step !== "ai-review" && step !== "concept" && !(step === "method" && !creationMethod);
  const showFooterSubmit = step === "concept" && creationMethod === "manual";

  const onSelectWorkType = (type: WorkType) => {
    setWorkType(type);
    clearFieldError("workType");
    if (customerFieldsOptional(type)) {
      if (contactMode === null) setContactMode("none");
    } else if (contactMode === "none" && contactRecommendedForWorkType(type)) {
      setContactMode(null);
    }
  };

  return (
    <div className="space-y-10 sm:space-y-12">
      <header className="space-y-6 sm:space-y-8">
        <div className="space-y-3 max-w-3xl">
          <h1 className={nj.title}>{t("projects.new.title")}</h1>
          <p className={nj.subtitle}>{t("projects.new.subtitleV2")}</p>
          <ProjectCreateOwnershipBanner />
        </div>
        <NewJobStepper steps={stepperSteps} activeId={step} />
      </header>

      <div className="grid gap-8 xl:gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(320px,380px)] lg:items-start">
        <div className={nj.mainCard}>
          <div className={cn(nj.mainCardInner, "min-h-[320px] flex flex-col")}>
            {step === "type" ? (
              <section className={cn(nj.sectionGap, "flex-1")}>
                <h2 className={nj.sectionHeading}>{t("projects.new.step1Title")}</h2>
                <div
                  className="grid gap-5 sm:grid-cols-2"
                  role="radiogroup"
                  aria-invalid={!!fieldErrors.workType}
                >
                  {WORK_TYPES.map((type) => {
                    const selected = workType === type;
                    const Icon = WORK_TYPE_ICONS[type];
                    return (
                      <button
                        key={type}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        onClick={() => onSelectWorkType(type)}
                        className={njJobTypeCard(selected)}
                      >
                        {selected ? (
                          <span className={njJobTypeCheck()} aria-hidden>
                            <Check className="size-4" strokeWidth={3} />
                          </span>
                        ) : null}
                        <div className={njIconCircle(selected)}>
                          <Icon className="size-7" aria-hidden />
                        </div>
                        <span className="block text-[17px] sm:text-lg font-bold text-[#0F2A4D] leading-snug pr-6">
                          {t(workTypeLabelKey(type))}
                        </span>
                        <span className="block text-[14px] sm:text-[15px] text-[#64748B] leading-relaxed">
                          {t(workTypeHintKey(type))}
                        </span>
                      </button>
                    );
                  })}
                </div>
                {fieldErrors.workType ? (
                  <p className={cn("text-sm", nj.error)} role="alert">
                    {fieldErrors.workType}
                  </p>
                ) : null}
              </section>
            ) : null}

            {step === "contact" ? (
              <section className={cn(nj.sectionGap, "flex-1")}>
                <div>
                  <h2 className={nj.sectionHeading}>{t("projects.new.step2Title")}</h2>
                  <p className={nj.sectionLead}>{t("projects.new.step2Lead")}</p>
                </div>

                <div className="space-y-3" role="radiogroup" aria-label={t("projects.new.step2Title")}>
                  {(
                    [
                      {
                        mode: "existing" as const,
                        icon: Users,
                        title: t("projects.new.contact.existing"),
                        desc: t("projects.new.contact.existingDesc"),
                      },
                      {
                        mode: "new" as const,
                        icon: UserPlus,
                        title: t("projects.new.contact.new"),
                        desc: t("projects.new.contact.newDesc"),
                      },
                      {
                        mode: "none" as const,
                        icon: UserRound,
                        title: t("projects.new.contact.none"),
                        desc: t("projects.new.contact.noneDesc"),
                      },
                    ] as const
                  ).map(({ mode, icon: Icon, title, desc }) => {
                    const selected = contactMode === mode;
                    return (
                      <button
                        key={mode}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        onClick={() => {
                          setContactMode(mode);
                          clearFieldError("contact");
                          clearFieldError("customerName");
                        }}
                        className={njLargeChoice(selected)}
                      >
                        <div
                          className={cn(
                            "flex size-12 shrink-0 items-center justify-center rounded-xl border-2",
                            selected
                              ? "bg-[#E95F2A] border-[#E95F2A] text-white"
                              : "bg-[#EEF2F7] border-[#CBD5E1] text-[#475569]"
                          )}
                        >
                          <Icon className="size-6" aria-hidden />
                        </div>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-2">
                            <span className="block text-base font-bold text-[#0F2A4D]">{title}</span>
                            {selected ? (
                              <span
                                className="flex size-6 items-center justify-center rounded-full bg-[#E95F2A] text-white shrink-0"
                                aria-hidden
                              >
                                <Check className="size-3.5" strokeWidth={3} />
                              </span>
                            ) : null}
                          </span>
                          <span className="block text-sm text-[#64748B] mt-1">{desc}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>

                {showContactWarning ? (
                  <div
                    className="flex gap-3 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-950"
                    role="status"
                  >
                    <AlertTriangle className="size-5 shrink-0 text-amber-600" aria-hidden />
                    {t("projects.new.contact.warning")}
                  </div>
                ) : null}

                {contactMode === "existing" ? (
                  <div className="space-y-4 pt-2">
                    {selectedCustomer ? (
                      <div className="flex items-start gap-4 rounded-xl bg-[#FFF1E8] px-5 py-4 ring-2 ring-[#E95F2A]">
                        <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-[#E95F2A] text-white">
                          {selectedCustomer.type === "company" ? (
                            <Building2 className="size-5" aria-hidden />
                          ) : (
                            <User className="size-5" aria-hidden />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="font-bold text-lg text-[#0F2A4D] truncate">
                            {selectedCustomer.name}
                          </p>
                          {(selectedCustomer.email || selectedCustomer.phone) && (
                            <p className={cn("text-sm mt-0.5", nj.bodyMuted)}>
                              {[selectedCustomer.email, selectedCustomer.phone]
                                .filter(Boolean)
                                .join(" · ")}
                            </p>
                          )}
                        </div>
                        <button
                          type="button"
                          className="text-sm font-bold text-[#E95F2A] hover:underline shrink-0 px-2 min-h-11"
                          onClick={() => {
                            setSelectedCustomer(null);
                            setContactSearch("");
                          }}
                        >
                          {t("projects.new.changeCustomer")}
                        </button>
                      </div>
                    ) : customersLoading ? (
                      <p className={nj.bodyMuted}>{t("common.loading")}</p>
                    ) : customers.length === 0 ? (
                      <p className={nj.bodyMuted}>{t("projects.new.customersEmpty")}</p>
                    ) : (
                      <div className={cn(nj.formGroup, "max-w-2xl")}>
                        <Label htmlFor="contact-search" className={nj.label}>
                          {t("projects.new.contact.existing")}
                        </Label>
                        <div className="relative">
                        <Search
                          className="absolute left-4 top-1/2 -translate-y-1/2 size-5 text-[#64748B] pointer-events-none"
                          aria-hidden
                        />
                        <Input
                          id="contact-search"
                          value={contactSearch}
                          onChange={(e) => {
                            setContactSearch(e.target.value);
                            setContactListOpen(true);
                          }}
                          onFocus={() => setContactListOpen(true)}
                          placeholder={t("projects.new.contactSearchPlaceholder")}
                          className={nj.inputWithIcon}
                          aria-invalid={!!fieldErrors.contact}
                        />
                        {contactListOpen && (
                          <ul
                            className={nj.searchDropdown}
                            role="listbox"
                          >
                            {filteredContacts.length === 0 ? (
                              <li className={cn("px-4 py-4 text-center text-sm", nj.bodyMuted)}>
                                {t("projects.new.customerSearchEmpty")}
                              </li>
                            ) : (
                              filteredContacts.map((c) => (
                                <li key={c.id}>
                                  <button
                                    type="button"
                                    className={cn(
                                      "w-full px-4 py-3.5 text-left min-h-[52px] hover:bg-[#F6F8FB]",
                                      nj.body
                                    )}
                                    onClick={() => {
                                      setSelectedCustomer(c);
                                      setContactSearch(c.name);
                                      setContactListOpen(false);
                                      clearFieldError("contact");
                                    }}
                                  >
                                    <span className="font-semibold text-[#0F2A4D]">{c.name}</span>
                                  </button>
                                </li>
                              ))
                            )}
                          </ul>
                        )}
                        </div>
                      </div>
                    )}
                    {fieldErrors.contact ? (
                      <p className={cn(nj.error)} role="alert">
                        {fieldErrors.contact}
                      </p>
                    ) : null}
                  </div>
                ) : null}

                {contactMode === "new" ? (
                  <div className={cn(nj.formGroup, nj.fieldStack, "max-w-2xl pt-2")}>
                    <div>
                      <Label htmlFor="newContactName" className={nj.label}>
                        {t("projects.new.newCustomerName")}
                        <RequiredMark />
                      </Label>
                      <Input
                        id="newContactName"
                        value={newContactName}
                        onChange={(e) => {
                          setNewContactName(e.target.value);
                          clearFieldError("customerName");
                        }}
                        className={nj.input}
                        aria-invalid={!!fieldErrors.customerName}
                      />
                      {fieldErrors.customerName ? (
                        <p className={nj.error} role="alert">
                          {fieldErrors.customerName}
                        </p>
                      ) : null}
                    </div>
                    <div className="grid gap-5 sm:grid-cols-2">
                      <div>
                        <Label htmlFor="newContactEmail" className={nj.label}>
                          {t("projects.new.customerEmail")}
                        </Label>
                        <Input
                          id="newContactEmail"
                          type="email"
                          value={newContactEmail}
                          onChange={(e) => setNewContactEmail(e.target.value)}
                          className={nj.input}
                        />
                      </div>
                      <div>
                        <Label htmlFor="newContactPhone" className={nj.label}>
                          {t("projects.new.customerPhone")}
                        </Label>
                        <Input
                          id="newContactPhone"
                          type="tel"
                          value={newContactPhone}
                          onChange={(e) => setNewContactPhone(e.target.value)}
                          className={nj.input}
                        />
                      </div>
                    </div>
                    <div className="space-y-3">
                      <span className={nj.label}>{t("projects.new.customerTypeLabel")}</span>
                      <div className="flex flex-wrap gap-3">
                        <button
                          type="button"
                          onClick={() => setNewContactType("person")}
                          className={njChoicePill(newContactType === "person")}
                        >
                          {newContactType === "person" ? (
                            <Check className="size-4 text-[#E95F2A]" aria-hidden />
                          ) : null}
                          {t("projects.new.customerType.person")}
                        </button>
                        <button
                          type="button"
                          onClick={() => setNewContactType("company")}
                          className={njChoicePill(newContactType === "company")}
                        >
                          {newContactType === "company" ? (
                            <Check className="size-4 text-[#E95F2A]" aria-hidden />
                          ) : null}
                          {t("projects.new.customerType.company")}
                        </button>
                      </div>
                    </div>
                    <button
                      type="button"
                      className={nj.optionalToggle}
                      onClick={() => setExtendedContactOpen((o) => !o)}
                      aria-expanded={extendedContactOpen}
                    >
                      {extendedContactOpen ? (
                        <ChevronUp className="size-4" aria-hidden />
                      ) : (
                        <ChevronDown className="size-4" aria-hidden />
                      )}
                      {t("projects.new.extendedCustomerFields")}
                    </button>
                    {extendedContactOpen ? (
                      <div className="grid gap-5 sm:grid-cols-2">
                        <div className="space-y-2">
                          <Label htmlFor="ico" className={nj.label}>
                            {t("projects.new.customerIco")}
                          </Label>
                          <Input
                            id="ico"
                            value={newContactIco}
                            onChange={(e) => setNewContactIco(e.target.value)}
                            className={nj.input}
                          />
                        </div>
                        <div>
                          <Label htmlFor="taxId" className={nj.label}>
                            {t("projects.new.customerTaxId")}
                          </Label>
                          <Input
                            id="taxId"
                            value={newContactTaxId}
                            onChange={(e) => setNewContactTaxId(e.target.value)}
                            className={nj.input}
                          />
                        </div>
                        <div className="sm:col-span-2">
                          <Label htmlFor="custAddress" className={nj.label}>
                            {t("projects.new.customerAddress")}
                          </Label>
                          <Input
                            id="custAddress"
                            value={newContactAddress}
                            onChange={(e) => setNewContactAddress(e.target.value)}
                            className={nj.input}
                          />
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {contactMode === "none" ? (
                  <p className="rounded-xl bg-[#F6F8FB] px-5 py-4 text-[15px] text-[#475569] leading-relaxed">
                    {t("projects.new.contact.noneInfo")}
                  </p>
                ) : null}
              </section>
            ) : null}

            {step === "method" ? (
              <section className={cn(nj.sectionGap, "flex-1")}>
                <h2 className={nj.sectionHeading}>{t("projects.new.step3Title")}</h2>
                <AiCreationMethodStep
                  value={creationMethod}
                  onChange={onSelectCreationMethod}
                  error={fieldErrors.method}
                />
              </section>
            ) : null}

            {step === "manual-details" ? (
              <section className={cn(nj.sectionGap, "flex-1")}>
                <h2 className={nj.sectionHeading}>{t("projects.new.step.manualDetailsTitle")}</h2>
                <p className={nj.sectionLead}>{t("projects.new.method.manualPrimaryDesc")}</p>
                <div className={cn(nj.formGroup, nj.fieldStack, "max-w-2xl")}>
                  <div>
                    <Label htmlFor="name" className={nj.label}>
                      {t("projects.new.jobName")}
                      <RequiredMark />
                    </Label>
                    <Input
                      id="name"
                      value={name}
                      onChange={(e) => {
                        setName(e.target.value);
                        clearFieldError("name");
                      }}
                      className={nj.input}
                      aria-invalid={!!fieldErrors.name}
                    />
                    {fieldErrors.name ? (
                      <p className={nj.error} role="alert">
                        {fieldErrors.name}
                      </p>
                    ) : null}
                  </div>
                  <div>
                    <Label htmlFor="location" className={nj.label}>
                      {t("projects.new.location")}
                    </Label>
                    <div className="relative">
                      <MapPin
                        className="absolute left-4 top-1/2 -translate-y-1/2 size-5 text-[#64748B]"
                        aria-hidden
                      />
                      <Input
                        id="location"
                        value={location}
                        onChange={(e) => setLocation(e.target.value)}
                        placeholder={t("projects.new.locationPlaceholder")}
                        className={nj.inputWithIcon}
                      />
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="shortDesc" className={nj.label}>
                      {t("projects.new.shortDescription")}
                    </Label>
                    <Textarea
                      id="shortDesc"
                      value={shortDescription}
                      onChange={(e) => setShortDescription(e.target.value)}
                      placeholder={t("projects.new.shortDescriptionPlaceholder")}
                      rows={3}
                      className={nj.textarea}
                    />
                  </div>
                </div>
              </section>
            ) : null}

            {step === "ai-brief" && user && activeWorkspace ? (
              <section className={cn(nj.sectionGap, "flex-1")}>
                <h2 className={nj.sectionHeading}>{t("projects.new.step.aiBriefTitle")}</h2>
                <p className={nj.sectionLead}>{t("projects.new.method.aiPrimaryDesc")}</p>
                <AiDraftBriefStep
                  workspace={activeWorkspace}
                  userId={user.id}
                  onEnsureProject={ensureAiDraftProject}
                  uploadedFiles={aiUploadedFiles}
                  onUploadedFilesChange={setAiUploadedFiles}
                  projectName={aiProjectName}
                  projectBrief={aiBrief}
                  extraContext={aiExtraContext}
                  location={location}
                  onProjectNameChange={(v) => {
                    setAiProjectName(v);
                    clearFieldError("aiProjectName");
                  }}
                  onProjectBriefChange={(v) => {
                    setAiBrief(v);
                    clearFieldError("aiBrief");
                  }}
                  onExtraContextChange={setAiExtraContext}
                  onLocationChange={setLocation}
                  nameError={fieldErrors.aiProjectName}
                  briefError={fieldErrors.aiBrief}
                />
              </section>
            ) : null}

            {step === "ai-review" ? (
              <section className={cn(nj.sectionGap, "flex-1")}>
                <h2 className={nj.sectionHeading}>{t("projects.new.step.aiReviewTitle")}</h2>
                <AiDraftReviewPanel
                  mode={aiReviewMode}
                  draft={aiDraft}
                  generateError={aiGenerateError}
                  confirming={aiConfirming}
                  onPhaseChange={(phaseId, patch) =>
                    setAiDraft((prev) =>
                      prev ? updateDraftPhase(prev, phaseId, patch) : prev
                    )
                  }
                  onPhaseRemove={(phaseId) =>
                    setAiDraft((prev) => (prev ? removeDraftPhase(prev, phaseId) : prev))
                  }
                  onTaskChange={(phaseId, taskId, patch) =>
                    setAiDraft((prev) =>
                      prev ? updateDraftTask(prev, phaseId, taskId, patch) : prev
                    )
                  }
                  onTaskRemove={(phaseId, taskId) =>
                    setAiDraft((prev) =>
                      prev ? removeDraftTask(prev, phaseId, taskId) : prev
                    )
                  }
                  onMaterialToggle={(materialId, selected) =>
                    setAiDraft((prev) =>
                      prev ? toggleMaterialSelection(prev, materialId, selected) : prev
                    )
                  }
                  onContinueManual={handleContinueManual}
                  onConfirm={
                    aiReviewMode === "draft" && aiDraftSource
                      ? () => void handleAiConfirm()
                      : undefined
                  }
                  generateWarnings={aiGenerateWarnings}
                  onRetryGenerate={
                    isWizardAiGenerationEnabled() ? () => void handleRetryGenerate() : undefined
                  }
                  showCallablePendingNote={aiReviewMode === "placeholder"}
                />
              </section>
            ) : null}

            {step === "concept" ? (
              <section className={cn(nj.sectionGap, "flex-1")}>
                <h2 className={nj.sectionHeading}>{t("projects.new.step4Title")}</h2>
                <p className={nj.sectionLead}>{t("projects.new.step4Lead")}</p>
                <dl className="rounded-xl bg-[#F6F8FB] px-5 py-4 space-y-3 text-[15px] lg:hidden">
                  <div className="flex justify-between gap-4">
                    <dt className="text-[#64748B]">{t("projects.new.preview.type")}</dt>
                    <dd className="font-semibold text-[#0F2A4D]">{previewType}</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-[#64748B]">{t("projects.new.preview.customer")}</dt>
                    <dd className="font-semibold text-[#0F2A4D] text-right truncate max-w-[55%]">
                      {previewContact}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-[#64748B]">{t("projects.new.preview.method")}</dt>
                    <dd className="font-semibold text-[#0F2A4D]">{previewMethodLabel}</dd>
                  </div>
                </dl>
              </section>
            ) : null}

            <div className="flex flex-wrap items-center justify-end gap-3 pt-10 mt-auto">
              {stepIndex > 0 ? (
                <Button type="button" variant="ghost" className={njNavSecondary()} onClick={goBack}>
                  {t("projects.new.back")}
                </Button>
              ) : (
                <span className="flex-1 sm:flex-none" />
              )}
              {showFooterContinue ? (
                <Button
                  type="button"
                  className={njNavPrimary()}
                  disabled={loading || aiReviewMode === "generating"}
                  onClick={() => void goNext()}
                >
                  {loading || aiReviewMode === "generating"
                    ? t("common.loading")
                    : t("projects.new.continue")}
                </Button>
              ) : null}
              {showFooterSubmit ? (
                <Button
                  type="button"
                  className={njNavPrimary()}
                  disabled={loading}
                  onClick={() => void handleCreate()}
                >
                  {loading ? t("common.loading") : submitLabel}
                </Button>
              ) : null}
            </div>
          </div>
        </div>

        <aside className="lg:sticky lg:top-8 hidden lg:block">
          <NewJobPreviewPanel
            workTypeLabel={previewType}
            contactLabel={previewContact}
            activeStep={step}
            submitLabel={submitLabel}
            loading={loading}
            submitError={submitError}
            onSubmit={() => void handleCreate()}
            showSubmit={showFooterSubmit}
          />
        </aside>
      </div>

      {showFooterSubmit ? (
        <div className="lg:hidden">
          <NewJobPreviewPanel
            workTypeLabel={previewType}
            contactLabel={previewContact}
            activeStep={step}
            submitLabel={submitLabel}
            loading={loading}
            submitError={submitError}
            onSubmit={() => void handleCreate()}
            showSubmit
          />
        </div>
      ) : null}
    </div>
  );
}
