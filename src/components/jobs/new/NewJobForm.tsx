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
  PenLine,
  Sparkles,
  Copy,
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
import { createCustomer, listCustomersForWorkspace } from "@/lib/customers";
import type { CustomerDoc, CustomerType } from "@/lib/customers";
import { listProjectsForWorkspace, type ProjectDoc } from "@/lib/projects";
import {
  WORK_TYPES,
  WORK_TYPE_ICONS,
  contactRecommendedForWorkType,
  customerFieldsOptional,
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
import { AiDraftFileUpload } from "./AiDraftFileUpload";
import { NewJobAiDraftStep, type NewJobAiDraftContext } from "./NewJobAiDraftStep";
import type { UploadedAiDraftFile } from "@/services/ai/aiDraftFiles";
import { createAiUploadSessionId } from "@/services/ai/aiDraftFiles";
import {
  WIZARD_STEPS,
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
  const { t } = useI18n();
  const { user } = useAuth();
  const { activeWorkspace, legacyActiveWorkspace } = useWorkspace();

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
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiUploadSessionId, setAiUploadSessionId] = useState(() => createAiUploadSessionId());
  const [aiAttachedFiles, setAiAttachedFiles] = useState<UploadedAiDraftFile[]>([]);

  const [projects, setProjects] = useState<ProjectDoc[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(false);
  const [projectSearch, setProjectSearch] = useState("");
  const [sourceProject, setSourceProject] = useState<ProjectDoc | null>(null);
  const [projectListOpen, setProjectListOpen] = useState(false);
  const [copyTasks, setCopyTasks] = useState(true);
  const [copyQuoteItems, setCopyQuoteItems] = useState(true);
  const [copyNotes, setCopyNotes] = useState(true);
  const [copyDocuments, setCopyDocuments] = useState(false);

  const [loading, setLoading] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);

  const stepIndex = WIZARD_STEPS.indexOf(step);

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

  useEffect(() => {
    if (step !== "method" && creationMethod !== "copy") return;
    if (!user?.id || !legacyActiveWorkspace) return;
    let cancelled = false;
    setProjectsLoading(true);
    const ws = activeWorkspace ?? legacyActiveWorkspace;
    if (!ws) return;
    void listProjectsForWorkspace(ws, user.id)
      .then((list) => {
        if (!cancelled) setProjects(list);
      })
      .catch(() => {
        if (!cancelled) setProjects([]);
      })
      .finally(() => {
        if (!cancelled) setProjectsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [step, creationMethod, user?.id, activeWorkspace, legacyActiveWorkspace]);

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

  const filteredProjects = useMemo(() => {
    const q = projectSearch.trim().toLowerCase();
    if (!q) return projects.slice(0, 10);
    return projects.filter((p) => p.name.toLowerCase().includes(q));
  }, [projects, projectSearch]);

  const stepDoneContact =
    contactMode === "none" ||
    (contactMode === "existing" && !!selectedCustomer) ||
    (contactMode === "new" && !!newContactName.trim());

  const stepDoneMethod =
    creationMethod === "manual"
      ? !!name.trim()
      : creationMethod === "ai"
        ? !!aiPrompt.trim()
        : creationMethod === "copy"
          ? !!sourceProject
          : false;

  const showContactWarning =
    !!workType &&
    contactRecommendedForWorkType(workType) &&
    contactMode === "none";

  const previewContact = useMemo(() => {
    if (contactMode === "none") return t("projects.new.preview.contactUnassigned");
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
    if (creationMethod === "ai") return t("projects.new.preview.methodAi");
    return t("projects.new.preview.methodCopy");
  }, [creationMethod, t]);

  const submitLabel = useMemo(() => {
    if (creationMethod === "ai") return t("projects.new.submitAi");
    if (creationMethod === "copy") return t("projects.new.submitCopy");
    return t("projects.new.submit");
  }, [creationMethod, t]);

  const stepperSteps = useMemo(
    () => [
      { id: "type" as NewJobStepId, label: t("projects.new.step.type"), done: !!workType },
      {
        id: "contact" as NewJobStepId,
        label: t("projects.new.step.contact"),
        done: stepDoneContact && stepIndex > 0,
      },
      {
        id: "method" as NewJobStepId,
        label: t("projects.new.step.method"),
        done: !!creationMethod && stepDoneMethod,
      },
      {
        id: "concept" as NewJobStepId,
        label: t("projects.new.step.concept"),
        done: false,
      },
    ],
    [t, workType, stepDoneContact, stepIndex, creationMethod, stepDoneMethod]
  );

  const clearFieldError = (key: string) => {
    if (fieldErrors[key]) {
      setFieldErrors((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
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
    if (s === "method") {
      if (!creationMethod) err.method = t("projects.new.validation.method");
      else if (creationMethod === "manual" && !name.trim()) {
        err.name = t("projects.new.validation.name");
      } else if (creationMethod === "ai" && !aiPrompt.trim()) {
        err.aiPrompt = t("projects.new.validation.aiPrompt");
      } else if (creationMethod === "copy" && !sourceProject) {
        err.copyProject = t("projects.new.validation.copyProject");
      }
    }
    setFieldErrors(err);
    return Object.keys(err).length === 0;
  };

  const goNext = () => {
    if (!validateStep(step)) return;
    const next = WIZARD_STEPS[stepIndex + 1];
    if (next) setStep(next);
  };

  const goBack = () => {
    const prev = WIZARD_STEPS[stepIndex - 1];
    if (prev) setStep(prev);
  };

  const resolveJobName = (): string => {
    if (name.trim()) return name.trim();
    if (creationMethod === "ai") {
      const trimmed = aiPrompt.trim();
      if (trimmed.length > 0) {
        return trimmed.length > 56 ? `${trimmed.slice(0, 56)}…` : trimmed;
      }
      return t("projects.new.aiDefaultName");
    }
    if (creationMethod === "copy" && sourceProject) {
      return `${sourceProject.name} (${t("projects.new.preview.methodCopy")})`;
    }
    return "";
  };

  const aiDraftContext: NewJobAiDraftContext | null =
    workType && contactMode && creationMethod === "ai"
      ? {
          workType,
          contactMode,
          selectedCustomer,
          newContactName,
          newContactEmail,
          newContactPhone,
          newContactType,
          newContactIco,
          newContactTaxId,
          newContactAddress,
          description: aiPrompt.trim(),
          location,
          attachedFiles: aiAttachedFiles,
        }
      : null;

  const handleCreate = async () => {
    if (creationMethod === "ai") return;
    if (!user?.id || !activeWorkspace || !workType || !creationMethod) return;
    if (!validateStep("method")) {
      setStep("method");
      return;
    }
    if (!validateStep("contact")) {
      setStep("contact");
      return;
    }

    setSubmitError(null);
    setLoading(true);
    try {
      let customerId: string | undefined;
      let customerName: string | undefined;
      let customerEmail: string | undefined;
      let customerPhone: string | undefined;

      if (contactMode === "existing" && selectedCustomer) {
        customerId = selectedCustomer.id;
        customerName = selectedCustomer.name;
        customerEmail = selectedCustomer.email;
        customerPhone = selectedCustomer.phone;
      } else if (contactMode === "new" && newContactName.trim()) {
        customerId = await createCustomer(activeWorkspace, user.id, {
          name: newContactName.trim(),
          email: newContactEmail.trim() || undefined,
          phone: newContactPhone.trim() || undefined,
          type: newContactType,
          ico: newContactIco.trim() || undefined,
          taxId: newContactTaxId.trim() || undefined,
          address: newContactAddress.trim() || undefined,
        });
        customerName = newContactName.trim();
        customerEmail = newContactEmail.trim() || undefined;
        customerPhone = newContactPhone.trim() || undefined;
      }

      const jobName = resolveJobName();
      if (!jobName) {
        setFieldErrors({ name: t("projects.new.validation.name") });
        setStep("method");
        return;
      }

      const customerRequest = shortDescription.trim() || undefined;

      const baseInput = {
        workType,
        name: jobName,
        customerId,
        customerRequest,
        customerName,
        customerEmail,
        customerPhone,
        addressText: location.trim() || undefined,
        source: "manual" as const,
      };

      let projectId: string;

      if (creationMethod === "copy" && sourceProject) {
        projectId = await copyProjectConcept(activeWorkspace, user.id, baseInput, {
          sourceProjectId: sourceProject.id,
          copyTasks,
          copyQuoteItems,
          copyNotes,
          copyDocuments,
        });
      } else {
        projectId = await createDraftJob(activeWorkspace, user.id, baseInput);
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
                <div className="space-y-3" role="radiogroup">
                  {(
                    [
                      {
                        id: "manual" as const,
                        icon: PenLine,
                        title: t("projects.new.method.manual"),
                        desc: t("projects.new.method.manualDesc"),
                      },
                      {
                        id: "ai" as const,
                        icon: Sparkles,
                        title: t("projects.new.method.ai"),
                        desc: t("projects.new.method.aiDesc"),
                      },
                      {
                        id: "copy" as const,
                        icon: Copy,
                        title: t("projects.new.method.copy"),
                        desc: t("projects.new.method.copyDesc"),
                      },
                    ] as const
                  ).map(({ id, icon: Icon, title, desc }) => {
                    const selected = creationMethod === id;
                    return (
                      <button
                        key={id}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        onClick={() => {
                          setCreationMethod(id);
                          clearFieldError("method");
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
                {fieldErrors.method ? (
                  <p className={cn("text-sm", nj.error)} role="alert">
                    {fieldErrors.method}
                  </p>
                ) : null}

                {creationMethod === "manual" ? (
                  <div className={cn(nj.formGroup, nj.fieldStack, "max-w-2xl pt-4")}>
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
                ) : null}

                {creationMethod === "ai" ? (
                  <div className={cn(nj.formGroup, nj.fieldStack, "max-w-2xl pt-4")}>
                    <div>
                      <Label htmlFor="aiPrompt" className={nj.label}>
                        {t("projects.new.aiPrompt")}
                        <RequiredMark />
                      </Label>
                      <Textarea
                        id="aiPrompt"
                        value={aiPrompt}
                        onChange={(e) => {
                          setAiPrompt(e.target.value);
                          clearFieldError("aiPrompt");
                        }}
                        rows={6}
                        placeholder={t("projects.new.aiPromptPlaceholder")}
                        className={nj.textareaAi}
                        aria-invalid={!!fieldErrors.aiPrompt}
                      />
                      <p className={nj.helper}>
                        {t("projects.new.aiHelper")} · {t("projects.new.ai.brand")}
                      </p>
                      {fieldErrors.aiPrompt ? (
                        <p className={nj.error} role="alert">
                          {fieldErrors.aiPrompt}
                        </p>
                      ) : null}
                    </div>
                    {activeWorkspace && user?.id ? (
                      <AiDraftFileUpload
                        workspace={activeWorkspace}
                        userId={user.id}
                        sessionId={aiUploadSessionId}
                        onSessionId={setAiUploadSessionId}
                        files={aiAttachedFiles}
                        onFilesChange={setAiAttachedFiles}
                      />
                    ) : null}
                    <div>
                      <Label htmlFor="aiLocation" className={nj.label}>
                        {t("projects.new.location")}
                      </Label>
                      <div className="relative">
                        <MapPin
                          className="absolute left-4 top-1/2 -translate-y-1/2 size-5 text-[#64748B]"
                          aria-hidden
                        />
                        <Input
                          id="aiLocation"
                          value={location}
                          onChange={(e) => setLocation(e.target.value)}
                          placeholder={t("projects.new.locationPlaceholder")}
                          className={nj.inputWithIcon}
                        />
                      </div>
                    </div>
                  </div>
                ) : null}

                {creationMethod === "copy" ? (
                  <div className={cn(nj.formGroup, nj.fieldStack, "max-w-2xl pt-4")}>
                    <div>
                      <Label htmlFor="copy-project-search" className={nj.label}>
                        {t("projects.new.method.copy")}
                      </Label>
                      <div className="relative">
                      <Search
                        className="absolute left-4 top-1/2 -translate-y-1/2 size-5 text-[#64748B] pointer-events-none"
                        aria-hidden
                      />
                      <Input
                        id="copy-project-search"
                        value={projectSearch}
                        onChange={(e) => {
                          setProjectSearch(e.target.value);
                          setProjectListOpen(true);
                        }}
                        onFocus={() => setProjectListOpen(true)}
                        placeholder={t("projects.new.copyProjectPlaceholder")}
                        className={nj.inputWithIcon}
                        aria-invalid={!!fieldErrors.copyProject}
                      />
                      {projectListOpen && !projectsLoading ? (
                        <ul className={cn(nj.searchDropdown, "max-h-48")}>
                          {filteredProjects.length === 0 ? (
                            <li className={cn("px-4 py-4 text-sm text-center", nj.bodyMuted)}>
                              —
                            </li>
                          ) : (
                            filteredProjects.map((p) => (
                              <li key={p.id}>
                                <button
                                  type="button"
                                  className="w-full px-4 py-3 text-left hover:bg-[#F6F8FB] font-semibold text-[#0F2A4D]"
                                  onClick={() => {
                                    setSourceProject(p);
                                    setProjectSearch(p.name);
                                    setProjectListOpen(false);
                                    if (!name.trim()) setName(`${p.name}`);
                                    clearFieldError("copyProject");
                                  }}
                                >
                                  {p.name}
                                </button>
                              </li>
                            ))
                          )}
                        </ul>
                      ) : null}
                      </div>
                      {fieldErrors.copyProject ? (
                        <p className={nj.error} role="alert">
                          {fieldErrors.copyProject}
                        </p>
                      ) : null}
                      {sourceProject ? (
                        <p className="text-sm font-bold text-[#0F2A4D] mt-2">
                          {sourceProject.name}
                        </p>
                      ) : null}
                    </div>
                    <div className="space-y-3 rounded-xl border border-[#CBD5E1] bg-white p-4">
                      {(
                        [
                          ["copyTasks", copyTasks, setCopyTasks],
                          ["copyQuoteItems", copyQuoteItems, setCopyQuoteItems],
                          ["copyNotes", copyNotes, setCopyNotes],
                          ["copyDocuments", copyDocuments, setCopyDocuments],
                        ] as const
                      ).map(([key, checked, setter]) => (
                        <label
                          key={key}
                          className="flex items-center gap-3 min-h-11 cursor-pointer text-[15px] text-[#334155]"
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => setter(e.target.checked)}
                            className="size-5 rounded border-2 border-[#94A3B8] text-[#E95F2A] focus:ring-[3px] focus:ring-[rgba(233,95,42,0.18)]"
                          />
                          {t(`projects.new.copy.${key}`)}
                        </label>
                      ))}
                    </div>
                    <div>
                      <Label htmlFor="copyName" className={nj.label}>
                        {t("projects.new.jobName")}
                      </Label>
                      <Input
                        id="copyName"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className={nj.input}
                      />
                    </div>
                  </div>
                ) : null}
              </section>
            ) : null}

            {step === "concept" ? (
              <section className={cn(nj.sectionGap, "flex-1")}>
                {creationMethod === "ai" && activeWorkspace && user?.id && aiDraftContext ? (
                  <NewJobAiDraftStep
                    workspace={activeWorkspace}
                    userId={user.id}
                    context={aiDraftContext}
                    onProjectCreated={(projectId) => {
                      router.push(`/app/projects/${projectId}?setup=ai`);
                    }}
                  />
                ) : (
                  <>
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
                  </>
                )}
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
              {step !== "concept" ? (
                <Button type="button" className={njNavPrimary()} onClick={goNext}>
                  {t("projects.new.continue")}
                </Button>
              ) : creationMethod !== "ai" ? (
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
            showSubmit={step === "concept" && creationMethod !== "ai"}
          />
        </aside>
      </div>

      {step === "concept" && creationMethod !== "ai" ? (
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
