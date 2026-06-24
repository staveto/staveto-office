"use client";

import { useEffect, useMemo, useState } from "react";
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
import { createDraftJob, copyProjectConcept } from "@/services/projects";
import { listProjectsForWorkspace, type ProjectDoc } from "@/lib/projects";
import { filterCopySourceProjects } from "@/lib/copyProjectSources";
import { createCustomer, listCustomersForWorkspace } from "@/lib/customers";
import type { CustomerDoc, CustomerType } from "@/lib/customers";
import {
  buildCreateCustomerInput,
  getCustomerContactPersonName,
  getCustomerDisplayName,
  projectCustomerFieldsFromDoc,
  projectCustomerFieldsFromNewInput,
  resolveCustomerType,
} from "@/lib/customerFields";
import {
  aiPlanToLocalDraft,
  draftPhaseToAiPhase,
  localDraftToAiProjectPlan,
  removeDraftPhase,
  removeDraftTask,
  replaceDraftPhase,
  replaceDraftTask,
  toggleMaterialSelection,
  updateDraftPhase,
  updateDraftProjectTitle,
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
import { createAiUploadSessionId, type UploadedAiDraftFile } from "@/services/ai/aiDraftFiles";
import { enrichProjectAfterAiConfirm } from "@/services/ai/aiProjectPostConfirmService";
import { refineGeneratedProjectNode } from "@/services/ai/mobileAiProjectService";
import { extractCallableErrorMessage } from "@/services/ai/projectDraftService";
import { buildAiProjectBriefForGenerate } from "@/lib/aiProjectGeneratePayload";
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
import { CopySourceStep } from "./copy/CopySourceStep";
import { CopyOptionsStep, type CopyOptionsState } from "./copy/CopyOptionsStep";
import { AiDraftBriefStep } from "./ai/AiDraftBriefStep";
import { AiDraftReviewPanel, type AiDraftReviewMode } from "./ai/AiDraftReviewPanel";
import type { AiRefineNodeTarget } from "./ai/aiDraftReviewTypes";
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
  const [customersLoadError, setCustomersLoadError] = useState<string | null>(null);
  const [contactSearch, setContactSearch] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerDoc | null>(null);
  const [contactListOpen, setContactListOpen] = useState(false);

  const [newContactName, setNewContactName] = useState("");
  const [newContactPersonName, setNewContactPersonName] = useState("");
  const [newContactEmail, setNewContactEmail] = useState("");
  const [newContactPhone, setNewContactPhone] = useState("");
  const [newContactType, setNewContactType] = useState<CustomerType>("person");
  const [newContactIco, setNewContactIco] = useState("");
  const [newContactTaxId, setNewContactTaxId] = useState("");
  const [newContactAddress, setNewContactAddress] = useState("");
  const [extendedContactOpen, setExtendedContactOpen] = useState(false);

  const [creationMethod, setCreationMethod] = useState<CreationMethod | null>(null);
  const [existingProjects, setExistingProjects] = useState<ProjectDoc[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(false);
  const [copySourceProjectId, setCopySourceProjectId] = useState<string | null>(null);
  const [copyOptions, setCopyOptions] = useState<CopyOptionsState>({
    copyTasks: true,
    copyQuoteItems: true,
    copyNotes: false,
    copyDocuments: false,
  });
  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [shortDescription, setShortDescription] = useState("");

  const [aiProjectName, setAiProjectName] = useState("");
  const [aiBrief, setAiBrief] = useState("");
  const [aiExtraContext, setAiExtraContext] = useState("");
  const [aiUploadSessionId] = useState(() => createAiUploadSessionId());
  const [aiUploadedFiles, setAiUploadedFiles] = useState<UploadedAiDraftFile[]>([]);
  const [aiDraft, setAiDraft] = useState<AiProjectDraftLocal | null>(null);
  const [aiDraftSource, setAiDraftSource] = useState<"mobile" | "office" | null>(null);
  const [aiOfficeDraftId, setAiOfficeDraftId] = useState<string | null>(null);
  const [aiGenerateWarnings, setAiGenerateWarnings] = useState<string[]>([]);
  const [aiReviewMode, setAiReviewMode] = useState<AiDraftReviewMode>("placeholder");
  const [aiGenerateError, setAiGenerateError] = useState<string | null>(null);
  const [aiConfirming, setAiConfirming] = useState(false);
  const [aiRegenerating, setAiRegenerating] = useState(false);
  const [aiRefiningKey, setAiRefiningKey] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);

  const wizardPath = useMemo(() => buildWizardPath(creationMethod), [creationMethod]);
  const stepIndex = wizardPath.indexOf(step);

  useEffect(() => {
    if (!user?.id || !activeWorkspace) return;
    let cancelled = false;
    setCustomersLoading(true);
    setCustomersLoadError(null);
    void listCustomersForWorkspace(activeWorkspace, user.id)
      .then((list) => {
        if (!cancelled) setCustomers(list);
      })
      .catch(() => {
        if (!cancelled) {
          setCustomers([]);
          setCustomersLoadError(t("projects.new.contact.loadError"));
        }
      })
      .finally(() => {
        if (!cancelled) setCustomersLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user?.id, activeWorkspace, t]);

  useEffect(() => {
    if (!user?.id || !activeWorkspace) return;
    let cancelled = false;
    setProjectsLoading(true);
    void listProjectsForWorkspace(activeWorkspace, user.id)
      .then((list) => {
        if (!cancelled) setExistingProjects(list);
      })
      .catch(() => {
        if (!cancelled) setExistingProjects([]);
      })
      .finally(() => {
        if (!cancelled) setProjectsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user?.id, activeWorkspace]);

  const copySourceProjects = useMemo(
    () => filterCopySourceProjects(existingProjects),
    [existingProjects]
  );
  const copyAvailable = copySourceProjects.length > 0;
  const copySourceProject = useMemo(
    () => copySourceProjects.find((p) => p.id === copySourceProjectId) ?? null,
    [copySourceProjects, copySourceProjectId]
  );

  const filteredContacts = useMemo(() => {
    const q = contactSearch.trim().toLowerCase();
    if (!q) return customers.slice(0, 12);
    return customers.filter((c) => {
      const blob = [
        c.name,
        c.companyName,
        c.contactPersonName,
        c.email,
        c.phone,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return blob.includes(q);
    });
  }, [customers, contactSearch]);

  const stepDoneContact =
    contactMode === "none" ||
    (contactMode === "existing" && !!selectedCustomer) ||
    (contactMode === "new" &&
      newContactType === "person" &&
      !!newContactName.trim()) ||
    (contactMode === "new" &&
      newContactType === "company" &&
      !!newContactName.trim() &&
      !!newContactPersonName.trim());

  const stepDoneMethod =
    creationMethod === "manual" || creationMethod === "ai" || creationMethod === "copy";

  const showContactWarning =
    !!workType &&
    contactRecommendedForWorkType(workType) &&
    contactMode === "none";

  const previewContact = useMemo(() => {
    if (contactMode === "none") return t("projects.new.contact.none");
    if (contactMode === "existing" && selectedCustomer) {
      return getCustomerDisplayName(selectedCustomer) || selectedCustomer.name;
    }
    if (contactMode === "new" && newContactType === "company" && newContactName.trim()) {
      return newContactName.trim();
    }
    if (contactMode === "new" && newContactName.trim()) return newContactName.trim();
    if (contactMode === "new") return t("projects.new.preview.customerNew");
    return t("projects.new.preview.customerNotSelected");
  }, [contactMode, selectedCustomer, newContactName, newContactType, t]);

  const previewContactPerson = useMemo(() => {
    if (contactMode === "existing" && selectedCustomer) {
      if (resolveCustomerType(selectedCustomer) !== "company") return null;
      return getCustomerContactPersonName(selectedCustomer) ?? null;
    }
    if (contactMode === "new" && newContactType === "company") {
      return newContactPersonName.trim() || null;
    }
    return null;
  }, [contactMode, selectedCustomer, newContactType, newContactPersonName]);

  const previewType = workType
    ? t(workTypeLabelKey(workType))
    : t("projects.new.preview.typeNotSelected");

  const previewMethodLabel = useMemo(() => {
    if (!creationMethod) return "—";
    if (creationMethod === "manual") return t("projects.new.preview.methodManual");
    if (creationMethod === "copy") return t("projects.new.preview.methodCopy");
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
              : id === "copy-source"
                ? !!copySourceProjectId
                : id === "copy-details" || id === "manual-details"
                  ? !!name.trim()
                  : true;
      return {
        id: id as NewJobStepId,
        label: t(`projects.new.stepper.${id}`),
        done: stepDone && idx > path.indexOf(id),
      };
    });
  }, [t, creationMethod, step, stepDoneContact, stepDoneMethod, workType, copySourceProjectId, name]);

  const clearFieldError = (key: string) => {
    if (fieldErrors[key]) {
      setFieldErrors((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
  };

  const resolveCustomerFields = async () => {
    if (!user?.id || !activeWorkspace) return {};
    if (contactMode === "existing" && selectedCustomer) {
      return projectCustomerFieldsFromDoc(selectedCustomer);
    }
    if (contactMode === "new") {
      const createInput = buildCreateCustomerInput({
        type: newContactType,
        personName: newContactType === "person" ? newContactName : undefined,
        companyName: newContactType === "company" ? newContactName : undefined,
        contactPersonName:
          newContactType === "company" ? newContactPersonName : undefined,
        email: newContactEmail,
        phone: newContactPhone,
        ico: newContactIco,
        vatId: newContactTaxId,
        address: newContactAddress,
      });
      if (!createInput.name.trim()) return {};
      const customerId = await createCustomer(activeWorkspace, user.id, createInput);
      return projectCustomerFieldsFromNewInput(customerId, createInput);
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
      } else if (contactMode === "new" && newContactType === "person" && !newContactName.trim()) {
        err.customerName = t("projects.new.validation.customerPersonName");
      } else if (
        contactMode === "new" &&
        newContactType === "company" &&
        !newContactName.trim()
      ) {
        err.customerCompanyName = t("projects.new.validation.customerCompanyName");
      } else if (
        contactMode === "new" &&
        newContactType === "company" &&
        !newContactPersonName.trim()
      ) {
        err.customerContactPerson = t("projects.new.validation.customerContactPerson");
      }
    }
    if (s === "method" && !creationMethod) {
      err.method = t("projects.new.validation.method");
    }
    if (s === "manual-details" && !name.trim()) {
      err.name = t("projects.new.validation.name");
    }
    if (s === "copy-source" && !copySourceProjectId) {
      err.copyProject = t("projects.new.validation.copyProject");
    }
    if (s === "copy-details" && !name.trim()) {
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
      jobWorkflowKind: mapped.jobWorkflowKind,
      attachedFileIds: aiUploadedFiles.map((f) => f.id),
      documentStoragePaths: aiUploadedFiles.map((f) => f.storagePath),
      uploadedFiles: aiUploadedFiles,
    };
  };

  const mapAiGenerateErrorMessage = (err: unknown): string => {
    if (process.env.NODE_ENV === "development") {
      console.warn("[staveto ai generate]", extractCallableErrorMessage(err) || err);
    }
    if (err instanceof Error && err.message === "AI_GENERATION_DISABLED") {
      return t("projects.new.ai.errorNotConfigured");
    }
    if (err instanceof Error && err.message.startsWith("DRAFT_PROJECT:")) {
      return err.message.replace(/^DRAFT_PROJECT:\s*/, "");
    }
    const kind = mapWizardAiError(err);
    const detail = getWizardAiErrorDetail(err);
    const detailLower = detail?.toLowerCase() ?? "";
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
    if (
      kind === "overloaded" ||
      detailLower.includes("503") ||
      detailLower.includes("high demand") ||
      detailLower.includes("service unavailable") ||
      detailLower.includes("googlegenerativeai")
    ) {
      return t("projects.new.ai.errorOverloaded");
    }
    if (kind === "timeout" || detailLower.includes("deadline-exceeded")) {
      return t("projects.new.ai.errorTimeout");
    }
    if (
      detailLower.includes("invalid ai response") ||
      detailLower.includes("ai returned empty") ||
      detailLower.includes("ai returned invalid") ||
      detailLower.includes("ai generation failed") ||
      detailLower.includes("try again or create manually")
    ) {
      return t("projects.new.ai.errorGenerate");
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
        await runAiGenerate();
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
      await runAiGenerate();
    } catch (err) {
      setAiDraft(null);
      setAiDraftSource(null);
      setAiOfficeDraftId(null);
      setAiReviewMode("placeholder");
      setAiGenerateError(mapAiGenerateErrorMessage(err));
    }
  };

  const handleRegenerateAiDraft = async () => {
    if (!validateStep("ai-brief")) {
      setStep("ai-brief");
      return;
    }
    setAiGenerateError(null);
    setAiRegenerating(true);
    try {
      await runAiGenerate();
    } catch (err) {
      setAiGenerateError(mapAiGenerateErrorMessage(err));
    } finally {
      setAiRegenerating(false);
    }
  };

  const handleRefineNode = async (aiRefineTarget: AiRefineNodeTarget, changeRequest: string) => {
    if (!aiDraft || !aiRefineTarget) return;
    const brief = buildAiProjectBriefForGenerate(aiProjectName, aiBrief);
    if (!brief) throw new Error(t("projects.new.validation.aiBrief"));

    const summaryLine = aiDraft.summary?.trim().slice(0, 400);
    const extra = aiExtraContext.trim() || undefined;

    if (aiRefineTarget.kind === "phase") {
      const phase = aiDraft.phases.find((p) => p.id === aiRefineTarget.phaseId);
      if (!phase) throw new Error(t("projects.new.ai.refine.error"));
      setAiRefiningKey(aiRefineTarget.phaseId);
      try {
        const res = await refineGeneratedProjectNode({
          projectBrief: brief,
          draftSummary: summaryLine,
          nodeKind: "phase",
          phaseIndex: aiRefineTarget.phaseIndex,
          currentPhase: draftPhaseToAiPhase(phase),
          userChangeRequest: changeRequest,
          extraContext: extra,
        });
        if (res.kind !== "phase") throw new Error(t("projects.new.ai.refine.error"));
        setAiDraft((prev) =>
          prev ? replaceDraftPhase(prev, aiRefineTarget.phaseId, res.phase) : prev
        );
      } finally {
        setAiRefiningKey(null);
      }
      return;
    }

    const phase = aiDraft.phases.find((p) => p.id === aiRefineTarget.phaseId);
    const task = phase?.tasks.find((x) => x.id === aiRefineTarget.taskId);
    if (!phase || !task) throw new Error(t("projects.new.ai.refine.error"));

    const refineKey = `${aiRefineTarget.phaseId}:${aiRefineTarget.taskId}`;
    setAiRefiningKey(refineKey);
    try {
      const res = await refineGeneratedProjectNode({
        projectBrief: brief,
        draftSummary: summaryLine,
        nodeKind: "task",
        phaseIndex: aiRefineTarget.phaseIndex,
        taskIndex: aiRefineTarget.taskIndex,
        currentTask: {
          title: task.title,
          description: task.description,
          taskType: task.taskType,
          priority: task.priority,
        },
        userChangeRequest: changeRequest,
        extraContext: extra,
      });
      if (res.kind !== "task") throw new Error(t("projects.new.ai.refine.error"));
      setAiDraft((prev) =>
        prev ? replaceDraftTask(prev, aiRefineTarget.phaseId, aiRefineTarget.taskId, res.task) : prev
      );
    } finally {
      setAiRefiningKey(null);
    }
  };

  const handleAiConfirm = async () => {
    if (!user?.id || !activeWorkspace || !workType || !aiDraft || !aiDraftSource) return;

    setAiConfirming(true);
    setSubmitError(null);
    try {
      const plan = localDraftToAiProjectPlan(aiDraft);
      const projectId = await confirmWizardAiProject({
        source: aiDraftSource,
        officeDraftId: aiOfficeDraftId ?? undefined,
        workspace: activeWorkspace,
        userId: user.id,
        plan,
        originalBrief: aiBrief.trim() || undefined,
        addressText: location.trim() || undefined,
      });

      const enrichPayload = {
        projectId,
        workspace: activeWorkspace,
        userId: user.id,
        workType,
        addressText: location.trim() || undefined,
        materialSuggestions: plan.materialSuggestions,
        uploadedFiles: aiUploadedFiles,
      };

      const customer = await resolveCustomerFields();
      await enrichProjectAfterAiConfirm({
        ...enrichPayload,
        aiDraftId: aiOfficeDraftId ?? undefined,
        customerId: customer.customerId,
        customerName: customer.customerName,
        customerCompanyName: customer.customerCompanyName,
        customerContactPersonName: customer.customerContactPersonName,
        customerEmail: customer.customerEmail,
        customerPhone: customer.customerPhone,
      });

      router.push(`/app/projects/${projectId}?setup=ai`);
    } catch (err) {
      setSubmitError(
        err instanceof Error ? err.message : t("projects.new.ai.errorConfirm")
      );
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

      const projectId = await createDraftJob(activeWorkspace, user.id, {
        workType,
        name: jobName,
        customerId: customer.customerId,
        customerRequest: shortDescription.trim() || undefined,
        customerName: customer.customerName,
        customerCompanyName: customer.customerCompanyName,
        customerContactPersonName: customer.customerContactPersonName,
        customerEmail: customer.customerEmail,
        customerPhone: customer.customerPhone,
        addressText: location.trim() || undefined,
        source: "web",
      });

      router.push(`/app/projects/${projectId}`);
    } catch (err) {
      setSubmitError(
        err instanceof Error ? err.message : t("projects.new.submitError")
      );
    } finally {
      setLoading(false);
    }
  };

  const handleCopyCreate = async () => {
    if (creationMethod !== "copy") return;
    if (!user?.id || !activeWorkspace || !workType || !copySourceProjectId) return;
    if (!validateStep("copy-details")) {
      setStep("copy-details");
      return;
    }
    if (!validateStep("copy-source")) {
      setStep("copy-source");
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
        setStep("copy-details");
        return;
      }

      const projectId = await copyProjectConcept(
        activeWorkspace,
        user.id,
        {
          workType,
          name: jobName,
          customerId: customer.customerId,
          customerRequest: shortDescription.trim() || undefined,
          customerName: customer.customerName,
          customerCompanyName: customer.customerCompanyName,
          customerContactPersonName: customer.customerContactPersonName,
          customerEmail: customer.customerEmail,
          customerPhone: customer.customerPhone,
          addressText: location.trim() || undefined,
          source: "web",
        },
        {
          sourceProjectId: copySourceProjectId,
          ...copyOptions,
        }
      );

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
    if (method === "copy") {
      setCopySourceProjectId(null);
    }
    if (method === "ai" && !aiProjectName.trim() && name.trim()) {
      setAiProjectName(name.trim());
    }
  };

  const handleWizardSubmit = () => {
    if (creationMethod === "copy") void handleCopyCreate();
    else void handleCreate();
  };

  const showFooterContinue =
    step !== "ai-review" && step !== "concept" && !(step === "method" && !creationMethod);
  const showFooterSubmit =
    step === "concept" && (creationMethod === "manual" || creationMethod === "copy");

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

      <div
        className={cn(
          "grid gap-8 xl:gap-12 lg:items-start",
          step === "ai-review" && aiReviewMode === "draft"
            ? "lg:grid-cols-1"
            : "lg:grid-cols-[minmax(0,1fr)_minmax(320px,380px)]"
        )}
      >
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
                            {getCustomerDisplayName(selectedCustomer) || selectedCustomer.name}
                          </p>
                          {resolveCustomerType(selectedCustomer) === "company" &&
                          getCustomerContactPersonName(selectedCustomer) ? (
                            <p className={cn("text-sm mt-0.5", nj.bodyMuted)}>
                              {t("projects.new.preview.contactPerson")}:{" "}
                              {getCustomerContactPersonName(selectedCustomer)}
                            </p>
                          ) : null}
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
                    ) : customersLoadError ? (
                      <p className="text-sm text-amber-800" role="status">
                        {customersLoadError}
                      </p>
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
                                    <span className="font-semibold text-[#0F2A4D]">
                                      {getCustomerDisplayName(c) || c.name}
                                    </span>
                                    {resolveCustomerType(c) === "company" &&
                                    getCustomerContactPersonName(c) ? (
                                      <span className="block text-xs text-[#64748B] mt-0.5">
                                        {t("projects.new.preview.contactPerson")}:{" "}
                                        {getCustomerContactPersonName(c)}
                                      </span>
                                    ) : null}
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
                    <p className="text-sm font-medium text-[#475569] -mt-1">
                      {t("projects.new.form.editableHint")}
                    </p>
                    <div className="space-y-3">
                      <span className={nj.label}>{t("projects.new.customerTypeLabel")}</span>
                      <div className="flex flex-wrap gap-3">
                        <button
                          type="button"
                          onClick={() => {
                            setNewContactType("person");
                            clearFieldError("customerCompanyName");
                            clearFieldError("customerContactPerson");
                          }}
                          className={njChoicePill(newContactType === "person")}
                        >
                          {newContactType === "person" ? (
                            <Check className="size-4 text-[#E95F2A]" aria-hidden />
                          ) : null}
                          {t("projects.new.customerType.person")}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setNewContactType("company");
                            clearFieldError("customerName");
                          }}
                          className={njChoicePill(newContactType === "company")}
                        >
                          {newContactType === "company" ? (
                            <Check className="size-4 text-[#E95F2A]" aria-hidden />
                          ) : null}
                          {t("projects.new.customerType.company")}
                        </button>
                      </div>
                    </div>

                    {newContactType === "person" ? (
                      <div>
                        <Label htmlFor="newContactName" className={nj.label}>
                          {t("projects.new.customerPersonName")}
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
                    ) : (
                      <>
                        <div>
                          <Label htmlFor="newCompanyName" className={nj.label}>
                            {t("projects.new.customerCompanyName")}
                            <RequiredMark />
                          </Label>
                          <Input
                            id="newCompanyName"
                            value={newContactName}
                            onChange={(e) => {
                              setNewContactName(e.target.value);
                              clearFieldError("customerCompanyName");
                            }}
                            className={nj.input}
                            aria-invalid={!!fieldErrors.customerCompanyName}
                          />
                          {fieldErrors.customerCompanyName ? (
                            <p className={nj.error} role="alert">
                              {fieldErrors.customerCompanyName}
                            </p>
                          ) : null}
                        </div>
                        <div>
                          <Label htmlFor="newContactPersonName" className={nj.label}>
                            {t("projects.new.customerContactPerson")}
                            <RequiredMark />
                          </Label>
                          <Input
                            id="newContactPersonName"
                            value={newContactPersonName}
                            onChange={(e) => {
                              setNewContactPersonName(e.target.value);
                              clearFieldError("customerContactPerson");
                            }}
                            className={nj.input}
                            aria-invalid={!!fieldErrors.customerContactPerson}
                          />
                          {fieldErrors.customerContactPerson ? (
                            <p className={nj.error} role="alert">
                              {fieldErrors.customerContactPerson}
                            </p>
                          ) : null}
                        </div>
                      </>
                    )}

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

                    {newContactType === "company" ? (
                      <>
                        <div className="grid gap-5 sm:grid-cols-2">
                          <div>
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
                        </div>
                        <div>
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
                      </>
                    ) : (
                      <>
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
                            <div>
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
                      </>
                    )}
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
                  copyAvailable={copyAvailable}
                  error={fieldErrors.method}
                />
              </section>
            ) : null}

            {step === "copy-source" ? (
              <section className={cn(nj.sectionGap, "flex-1")}>
                <h2 className={nj.sectionHeading}>{t("projects.new.step.copySourceTitle")}</h2>
                <CopySourceStep
                  projects={copySourceProjects}
                  loading={projectsLoading}
                  value={copySourceProjectId}
                  onChange={(id) => {
                    setCopySourceProjectId(id);
                    clearFieldError("copyProject");
                    const source = copySourceProjects.find((p) => p.id === id);
                    if (source && !name.trim()) {
                      setName(`${source.name} (${t("projects.new.copy.nameSuffix")})`);
                    }
                  }}
                  error={fieldErrors.copyProject}
                />
              </section>
            ) : null}

            {step === "copy-options" ? (
              <section className={cn(nj.sectionGap, "flex-1")}>
                <h2 className={nj.sectionHeading}>{t("projects.new.step.copyOptionsTitle")}</h2>
                <CopyOptionsStep
                  value={copyOptions}
                  onChange={(patch) => setCopyOptions((prev) => ({ ...prev, ...patch }))}
                  sourceProjectName={copySourceProject?.name}
                />
              </section>
            ) : null}

            {step === "copy-details" ? (
              <section className={cn(nj.sectionGap, "flex-1")}>
                <h2 className={nj.sectionHeading}>{t("projects.new.step.copyDetailsTitle")}</h2>
                <p className={nj.sectionLead}>{t("projects.new.step.copyDetailsLead")}</p>
                <div className={cn(nj.formGroup, nj.fieldStack, "max-w-2xl")}>
                  <div>
                    <Label htmlFor="copy-name" className={nj.label}>
                      {t("projects.new.jobName")}
                      <RequiredMark />
                    </Label>
                    <Input
                      id="copy-name"
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
                    <Label htmlFor="copy-location" className={nj.label}>
                      {t("projects.new.location")}
                    </Label>
                    <div className="relative">
                      <MapPin
                        className="absolute left-4 top-1/2 -translate-y-1/2 size-5 text-[#64748B]"
                        aria-hidden
                      />
                      <Input
                        id="copy-location"
                        value={location}
                        onChange={(e) => setLocation(e.target.value)}
                        placeholder={t("projects.new.locationPlaceholder")}
                        className={nj.inputWithIcon}
                      />
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="copy-shortDesc" className={nj.label}>
                      {t("projects.new.shortDescription")}
                    </Label>
                    <Textarea
                      id="copy-shortDesc"
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
                  uploadSessionId={aiUploadSessionId}
                  useOfficeUploadFallback
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
                  generatingWithAttachments={aiUploadedFiles.length > 0}
                  confirming={aiConfirming}
                  regenerating={aiRegenerating}
                  refiningKey={aiRefiningKey}
                  onProjectTitleChange={(title) =>
                    setAiDraft((prev) => (prev ? updateDraftProjectTitle(prev, title) : prev))
                  }
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
                  onRefine={handleRefineNode}
                  onRegenerate={
                    isWizardAiGenerationEnabled() ? () => void handleRegenerateAiDraft() : undefined
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
                  confirmError={submitError}
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
                    <dd className="font-semibold text-[#0F2A4D] text-right min-w-0 max-w-[55%]">
                      <span className="block truncate">{previewContact}</span>
                      {previewContactPerson ? (
                        <span className="mt-1 block text-sm font-medium text-[#64748B] truncate">
                          {t("projects.new.preview.contactPerson")}: {previewContactPerson}
                        </span>
                      ) : null}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-[#64748B]">{t("projects.new.preview.method")}</dt>
                    <dd className="font-semibold text-[#0F2A4D]">{previewMethodLabel}</dd>
                  </div>
                  {creationMethod === "copy" && copySourceProject ? (
                    <div className="flex justify-between gap-4">
                      <dt className="text-[#64748B]">{t("projects.new.preview.copySource")}</dt>
                      <dd className="font-semibold text-[#0F2A4D] text-right min-w-0 max-w-[55%] truncate">
                        {copySourceProject.name}
                      </dd>
                    </div>
                  ) : null}
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
                  onClick={() => void handleWizardSubmit()}
                >
                  {loading ? t("common.loading") : submitLabel}
                </Button>
              ) : null}
            </div>
          </div>
        </div>

        {!(step === "ai-review" && aiReviewMode === "draft") ? (
          <aside className="lg:sticky lg:top-8 hidden lg:block">
            <NewJobPreviewPanel
              workTypeLabel={previewType}
              contactLabel={previewContact}
              contactPersonLabel={previewContactPerson}
              activeStep={step}
              submitLabel={submitLabel}
              loading={loading}
              submitError={submitError}
              onSubmit={() => void handleWizardSubmit()}
              showSubmit={showFooterSubmit}
            />
          </aside>
        ) : null}
      </div>

      {showFooterSubmit ? (
        <div className="lg:hidden">
          <NewJobPreviewPanel
            workTypeLabel={previewType}
            contactLabel={previewContact}
            contactPersonLabel={previewContactPerson}
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
