"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Building2,
  Hammer,
  Link2,
  User,
  Wrench,
  Briefcase,
  Users,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useI18n } from "@/i18n/I18nContext";
import { OnboardingStepShell } from "@/components/onboarding/OnboardingStepShell";
import { OnboardingOptionCard } from "@/components/onboarding/OnboardingOptionCard";
import { OnboardingConsentStep } from "@/components/onboarding/OnboardingConsentStep";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  ONBOARDING_COUNTRIES,
  COMPANY_TYPES,
  TEAM_SIZE_BANDS,
  BUSINESS_PLANS,
  recommendPlanForTeamSize,
  resolveTimezoneForCountry,
  type WebOnboardingPath,
  type PrimaryUsageMode,
  type CompanyType,
  type TeamSizeBand,
  type BusinessPlanCode,
  type BillingPeriod,
  type PersonalPlanChoice,
} from "@/lib/onboardingTypes";
import {
  saveOnboardingTermsAcceptance,
  saveOnboardingPathChoice,
  saveJoinCompanyIntent,
  completeSoloOnboarding,
  completeCompanyOwnerOnboarding,
  defaultWorkTypeForUsageMode,
  getPersonalActiveWorkspaceId,
} from "@/services/onboarding";
import { hasValidLegalConsent } from "@/lib/consent";
import { resolveBusinessOrgErrorMessage } from "@/lib/businessOrgErrors";
import { createDraftJob } from "@/services/projects";
import { fromLegacyWorkspace } from "@/lib/workspace-types";
import {
  ONBOARDING_BODY,
  ONBOARDING_HINT,
  ONBOARDING_INPUT,
  ONBOARDING_INPUT_READONLY,
  ONBOARDING_LABEL,
  ONBOARDING_MUTED_BOX,
  ONBOARDING_SELECT,
} from "@/components/onboarding/onboardingFormStyles";

type StepId =
  | "terms"
  | "path"
  | "join_invite"
  | "company_basics"
  | "team_size"
  | "business_plan"
  | "usage"
  | "country"
  | "profile"
  | "phone"
  | "personal_plan"
  | "project"
  | "equipment";

const COMPANY_STEPS: StepId[] = [
  "terms",
  "path",
  "company_basics",
  "team_size",
  "business_plan",
];

const JOIN_STEPS: StepId[] = ["terms", "path", "join_invite"];

const SOLO_STEPS: StepId[] = [
  "terms",
  "path",
  "usage",
  "country",
  "profile",
  "phone",
  "personal_plan",
  "project",
  "equipment",
];

const SELF_SERVICE_PLANS: BusinessPlanCode[] = [
  "business_starter",
  "business_team",
  "business_company",
];

function stepsForPath(path: WebOnboardingPath): StepId[] {
  if (path === "company_owner") return COMPANY_STEPS;
  if (path === "join_company") return JOIN_STEPS;
  return SOLO_STEPS;
}

function BusinessPlanCard({
  planCode,
  selected,
  recommended,
  billingPeriod,
  disabled,
  onSelect,
  t,
}: {
  planCode: BusinessPlanCode;
  selected: boolean;
  recommended?: boolean;
  billingPeriod: BillingPeriod;
  disabled?: boolean;
  onSelect: () => void;
  t: (key: string) => string;
}) {
  const isEnterprise = planCode === "business_enterprise";
  const priceKey =
    billingPeriod === "yearly"
      ? `onboarding.web.plan.${planCode}.priceYearly`
      : `onboarding.web.plan.${planCode}.priceMonthly`;

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onSelect}
      className={cn(
        "w-full rounded-xl border-2 p-4 text-left transition-colors",
        disabled && "cursor-not-allowed opacity-60",
        selected
          ? "border-[#e06737] bg-[#fff7f4] ring-1 ring-[#e06737]/20"
          : recommended
            ? "border-[#1D376A]/25 bg-[#f8fafc] hover:border-[#e06737]/50"
            : "border-[#cbd5e1] bg-white hover:border-[#e06737]/40"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className={cn("font-semibold", selected ? "text-[#e06737]" : "text-[#111111]")}>
            {t(`onboarding.web.plan.${planCode}.name`)}
          </p>
          <p className="mt-0.5 text-sm text-[#555555]">
            {t(`onboarding.web.plan.${planCode}.seats`)}
          </p>
        </div>
        {recommended ? (
          <span className="shrink-0 rounded-full bg-[#1D376A]/10 px-2 py-0.5 text-xs font-medium text-[#1D376A]">
            {t("onboarding.web.recommended")}
          </span>
        ) : null}
      </div>
      <p className="mt-2 text-sm font-semibold text-[#1D376A]">
        {isEnterprise ? t("onboarding.web.plan.business_enterprise.contact") : t(priceKey)}
      </p>
    </button>
  );
}

export function WebOnboardingWizard() {
  const router = useRouter();
  const { t, locale } = useI18n();
  const { user, profile, refreshUser } = useAuth();

  const [stepId, setStepId] = useState<StepId>("terms");
  const [path, setPath] = useState<WebOnboardingPath>("company_owner");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [termsAccepted, setTermsAccepted] = useState(false);
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [inviteToken, setInviteToken] = useState("");

  const [companyName, setCompanyName] = useState("");
  const [companyCountry, setCompanyCountry] = useState("SK");
  const [companyType, setCompanyType] = useState<CompanyType>("construction");
  const [teamSizeBand, setTeamSizeBand] = useState<TeamSizeBand>("1-5");
  const [billingPeriod, setBillingPeriod] = useState<BillingPeriod>("monthly");
  const [businessPlan, setBusinessPlan] = useState<BusinessPlanCode>("business_starter");

  const [primaryUsageMode, setPrimaryUsageMode] = useState<PrimaryUsageMode>("build");
  const [primaryCountry, setPrimaryCountry] = useState("SK");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phoneE164, setPhoneE164] = useState("");
  const [personalPlan, setPersonalPlan] = useState<PersonalPlanChoice>("free");
  const [projectName, setProjectName] = useState("");
  const [createProject, setCreateProject] = useState(false);

  const businessPlanSubmittingRef = useRef(false);

  const companyTimezone = useMemo(
    () => resolveTimezoneForCountry(companyCountry),
    [companyCountry]
  );

  const recommendedPlan = useMemo(
    () => recommendPlanForTeamSize(teamSizeBand),
    [teamSizeBand]
  );

  useEffect(() => {
    if (hasValidLegalConsent(profile)) {
      setTermsAccepted(true);
      setPrivacyAccepted(true);
    }
    if (profile?.firstName) setFirstName((v) => v || profile.firstName || "");
    if (profile?.lastName) setLastName((v) => v || profile.lastName || "");
    if (profile?.primaryUsageMode === "build" || profile?.primaryUsageMode === "trade") {
      setPrimaryUsageMode(profile.primaryUsageMode);
    }
    if (profile?.primaryCountry) {
      setPrimaryCountry(profile.primaryCountry);
      setCompanyCountry(profile.primaryCountry);
    }
    if (profile?.phoneE164) setPhoneE164(profile.phoneE164);
    const savedPath = profile?.onboarding?.path;
    if (
      savedPath === "join_company" ||
      savedPath === "solo" ||
      savedPath === "company_owner"
    ) {
      setPath(savedPath);
    }
  }, [profile]);

  useEffect(() => {
    if (recommendedPlan === "business_enterprise") {
      setBusinessPlan("business_company");
      return;
    }
    setBusinessPlan(recommendedPlan);
  }, [recommendedPlan]);

  const steps = stepsForPath(path);
  const stepIndex = steps.indexOf(stepId);
  const totalSteps = steps.length;
  const currentStep = stepIndex >= 0 ? stepIndex + 1 : 1;

  const goBack = useCallback(() => {
    setError(null);
    if (stepIndex <= 0) return;
    setStepId(steps[stepIndex - 1]!);
  }, [stepIndex, steps]);

  const goNext = useCallback(async () => {
    if (!user?.id) return;
    setError(null);

    if (stepId === "terms") {
      if (!termsAccepted || !privacyAccepted) {
        setError(t("onboarding.error.termsRequired"));
        return;
      }
      setSaving(true);
      try {
        await saveOnboardingTermsAcceptance(user.id, locale);
        setStepId("path");
      } catch {
        setError(t("onboarding.error.save"));
      } finally {
        setSaving(false);
      }
      return;
    }

    if (stepId === "path") {
      setSaving(true);
      try {
        await saveOnboardingPathChoice(user.id, path);
        if (path === "company_owner") setStepId("company_basics");
        else if (path === "join_company") setStepId("join_invite");
        else setStepId("usage");
      } catch {
        setError(t("onboarding.error.save"));
      } finally {
        setSaving(false);
      }
      return;
    }

    if (stepId === "join_invite") {
      const raw = inviteToken.trim();
      if (!raw) {
        setError(t("onboarding.error.required"));
        return;
      }
      setSaving(true);
      try {
        await saveJoinCompanyIntent(user.id);
        const isLegacyToken = raw.length >= 32 && /^[a-f0-9]+$/i.test(raw);
        if (isLegacyToken) {
          router.push(`/join?token=${encodeURIComponent(raw)}`);
        } else {
          router.push(`/join?code=${encodeURIComponent(raw.toUpperCase())}`);
        }
      } catch {
        setError(t("onboarding.error.save"));
        setSaving(false);
      }
      return;
    }

    if (stepId === "company_basics") {
      if (!companyName.trim() || !companyCountry || !companyType) {
        setError(t("onboarding.error.required"));
        return;
      }
      setStepId("team_size");
      return;
    }

    if (stepId === "team_size") {
      setStepId("business_plan");
      return;
    }

    if (stepId === "business_plan") {
      if (businessPlanSubmittingRef.current) return;
      if (!SELF_SERVICE_PLANS.includes(businessPlan)) {
        setError(t("onboarding.web.error.enterpriseContact"));
        return;
      }
      if (!companyName.trim() || !companyCountry || !companyType) {
        setError(t("onboarding.error.required"));
        setStepId("company_basics");
        return;
      }
      businessPlanSubmittingRef.current = true;
      setSaving(true);
      try {
        await completeCompanyOwnerOnboarding(user.id, {
          companyName: companyName.trim(),
          country: companyCountry,
          timezone: companyTimezone,
          companyType,
          planCode: businessPlan,
          billingPeriod,
          teamSizeBand,
        });
        await refreshUser();
        router.push("/app");
      } catch (err) {
        businessPlanSubmittingRef.current = false;
        setError(resolveBusinessOrgErrorMessage(err, t));
        setSaving(false);
      }
      return;
    }

    if (stepId === "usage") {
      if (!primaryUsageMode) {
        setError(t("onboarding.error.required"));
        return;
      }
      setStepId("country");
      return;
    }

    if (stepId === "country") {
      if (!primaryCountry) {
        setError(t("onboarding.error.required"));
        return;
      }
      setStepId("profile");
      return;
    }

    if (stepId === "profile") {
      setStepId("phone");
      return;
    }

    if (stepId === "phone") {
      setStepId("personal_plan");
      return;
    }

    if (stepId === "personal_plan") {
      setStepId("project");
      return;
    }

    if (stepId === "project") {
      setStepId("equipment");
      return;
    }

    if (stepId === "equipment") {
      setSaving(true);
      try {
        const skippedFirstProject = !createProject || !projectName.trim();
        await completeSoloOnboarding(user.id, {
          primaryUsageMode,
          primaryCountry,
          firstName: firstName.trim() || undefined,
          lastName: lastName.trim() || undefined,
          phoneE164: phoneE164.trim() || undefined,
          personalPlan,
          skippedFirstProject,
          skippedFirstEquipment: true,
        });

        if (createProject && projectName.trim()) {
          const personalWs = fromLegacyWorkspace(
            {
              id: getPersonalActiveWorkspaceId(),
              name: "Personal",
              type: "personal",
            },
            user.id
          );
          await createDraftJob(personalWs, user.id, {
            workType: defaultWorkTypeForUsageMode(primaryUsageMode),
            name: projectName.trim(),
            source: "web",
          });
        }

        await refreshUser();
        router.push("/app");
      } catch {
        setError(t("onboarding.error.save"));
        setSaving(false);
      }
    }
  }, [
    user?.id,
    stepId,
    termsAccepted,
    privacyAccepted,
    path,
    inviteToken,
    companyName,
    companyCountry,
    companyType,
    companyTimezone,
    teamSizeBand,
    businessPlan,
    billingPeriod,
    primaryUsageMode,
    primaryCountry,
    firstName,
    lastName,
    phoneE164,
    personalPlan,
    createProject,
    projectName,
    router,
    refreshUser,
    t,
  ]);

  const skipProject = useCallback(() => {
    if (stepId !== "project") return;
    setCreateProject(false);
    setProjectName("");
    setStepId("equipment");
  }, [stepId]);

  const canProceed = useMemo(() => {
    switch (stepId) {
      case "terms":
        return termsAccepted && privacyAccepted;
      case "path":
        return !!path;
      case "join_invite":
        return !!inviteToken.trim();
      case "company_basics":
        return !!companyName.trim() && !!companyCountry && !!companyType;
      case "team_size":
        return !!teamSizeBand;
      case "business_plan":
        return SELF_SERVICE_PLANS.includes(businessPlan);
      case "usage":
        return !!primaryUsageMode;
      case "country":
        return !!primaryCountry;
      case "profile":
      case "phone":
      case "personal_plan":
        return true;
      case "project":
        return !createProject || !!projectName.trim();
      case "equipment":
        return true;
      default:
        return false;
    }
  }, [
    stepId,
    termsAccepted,
    privacyAccepted,
    path,
    inviteToken,
    companyName,
    companyCountry,
    companyType,
    teamSizeBand,
    businessPlan,
    primaryUsageMode,
    primaryCountry,
    createProject,
    projectName,
  ]);

  const title = useMemo(() => {
    const keys: Partial<Record<StepId, string>> = {
      terms: "onboarding.mobile.step.terms.title",
      path: "onboarding.web.step.path.title",
      join_invite: "onboarding.mobile.path.joinCompany.title",
      company_basics: "onboarding.web.step.companyBasics.title",
      team_size: "onboarding.web.step.teamSize.title",
      business_plan: "onboarding.web.step.businessPlan.title",
      usage: "onboarding.mobile.step.usage.title",
      country: "onboarding.mobile.step.country.title",
      profile: "onboarding.mobile.step.profile.title",
      phone: "onboarding.mobile.step.phone.title",
      personal_plan: "onboarding.web.step.personalPlan.title",
      project: "onboarding.mobile.step.project.title",
      equipment: "onboarding.mobile.step.equipment.title",
    };
    const key = keys[stepId];
    return key ? t(key) : "";
  }, [stepId, t]);

  const subtitle = useMemo(() => {
    const keys: Partial<Record<StepId, string>> = {
      terms: "onboarding.mobile.step.terms.subtitle",
      path: "onboarding.web.step.path.subtitle",
      join_invite: "onboarding.step.companyJoin.subtitle",
      company_basics: "onboarding.web.step.companyBasics.subtitle",
      team_size: "onboarding.web.step.teamSize.subtitle",
      business_plan: "onboarding.web.step.businessPlan.subtitle",
      usage: "onboarding.mobile.step.usage.subtitle",
      country: "onboarding.mobile.step.country.subtitle",
      profile: "onboarding.mobile.step.profile.subtitle",
      phone: "onboarding.mobile.step.phone.subtitle",
      personal_plan: "onboarding.web.step.personalPlan.subtitle",
      project: "onboarding.mobile.step.project.subtitle",
      equipment: "onboarding.mobile.step.equipment.subtitle",
    };
    const key = keys[stepId];
    return key ? t(key) : undefined;
  }, [stepId, t]);

  const nextLabel = useMemo(() => {
    if (stepId === "join_invite") return t("onboarding.join.openLink");
    if (stepId === "business_plan") return t("onboarding.web.activateBusiness");
    if (stepId === "equipment") return t("onboarding.finish");
    return t("onboarding.next");
  }, [stepId, t]);

  const renderStep = () => {
    switch (stepId) {
      case "terms":
        return (
          <OnboardingConsentStep
            termsAccepted={termsAccepted}
            privacyAccepted={privacyAccepted}
            onTermsChange={setTermsAccepted}
            onPrivacyChange={setPrivacyAccepted}
          />
        );

      case "path":
        return (
          <div className="space-y-3">
            <OnboardingOptionCard
              title={t("onboarding.web.path.createCompany.title")}
              description={t("onboarding.web.path.createCompany.description")}
              selected={path === "company_owner"}
              recommended
              onClick={() => setPath("company_owner")}
              icon={Briefcase}
            />
            <OnboardingOptionCard
              title={t("onboarding.mobile.path.joinCompany.title")}
              description={t("onboarding.mobile.path.joinCompany.description")}
              selected={path === "join_company"}
              onClick={() => setPath("join_company")}
              icon={Link2}
            />
            <OnboardingOptionCard
              title={t("onboarding.mobile.path.solo.title")}
              description={t("onboarding.mobile.path.solo.description")}
              selected={path === "solo"}
              onClick={() => setPath("solo")}
              icon={User}
            />
          </div>
        );

      case "join_invite":
        return (
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="inviteToken" className={ONBOARDING_LABEL}>
                {t("onboarding.join.codeLabel")}
              </Label>
              <Input
                id="inviteToken"
                value={inviteToken}
                onChange={(e) => setInviteToken(e.target.value)}
                placeholder={t("onboarding.join.codePlaceholder")}
                className={ONBOARDING_INPUT}
                autoFocus
              />
            </div>
            <p className={ONBOARDING_HINT}>{t("onboarding.join.codeHint")}</p>
          </div>
        );

      case "company_basics":
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="companyName" className={ONBOARDING_LABEL}>
                {t("onboarding.companyName")}
              </Label>
              <Input
                id="companyName"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder={t("onboarding.companyName.placeholder")}
                className={ONBOARDING_INPUT}
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="companyCountry" className={ONBOARDING_LABEL}>
                {t("onboarding.web.companyCountry")}
              </Label>
              <select
                id="companyCountry"
                value={companyCountry}
                onChange={(e) => setCompanyCountry(e.target.value)}
                className={ONBOARDING_SELECT}
              >
                {ONBOARDING_COUNTRIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {t(c.labelKey)}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="timezone" className={ONBOARDING_LABEL}>
                {t("onboarding.web.timezone")}
              </Label>
              <Input
                id="timezone"
                value={companyTimezone}
                readOnly
                className={ONBOARDING_INPUT_READONLY}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="companyType" className={ONBOARDING_LABEL}>
                {t("onboarding.web.companyType")}
              </Label>
              <select
                id="companyType"
                value={companyType}
                onChange={(e) => setCompanyType(e.target.value as CompanyType)}
                className={ONBOARDING_SELECT}
              >
                {COMPANY_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {t(`onboarding.web.companyType.${type}`)}
                  </option>
                ))}
              </select>
            </div>
          </div>
        );

      case "team_size":
        return (
          <div className="space-y-3">
            {TEAM_SIZE_BANDS.map((band) => (
              <OnboardingOptionCard
                key={band}
                title={t(`onboarding.web.teamSize.${band}`)}
                description={t(`onboarding.web.teamSize.${band}.hint`)}
                selected={teamSizeBand === band}
                recommended={recommendPlanForTeamSize(band) === recommendedPlan}
                onClick={() => setTeamSizeBand(band)}
                icon={Users}
              />
            ))}
          </div>
        );

      case "business_plan":
        return (
          <div className="space-y-4">
            <div className="flex rounded-lg border border-[#cbd5e1] bg-[#f8fafc] p-1">
              <button
                type="button"
                className={cn(
                  "flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  billingPeriod === "monthly"
                    ? "bg-[#1D376A] text-white"
                    : "text-[#555555] hover:text-[#111111]"
                )}
                onClick={() => setBillingPeriod("monthly")}
              >
                {t("onboarding.web.billing.monthly")}
              </button>
              <button
                type="button"
                className={cn(
                  "flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  billingPeriod === "yearly"
                    ? "bg-[#1D376A] text-white"
                    : "text-[#555555] hover:text-[#111111]"
                )}
                onClick={() => setBillingPeriod("yearly")}
              >
                {t("onboarding.web.billing.yearly")}
              </button>
            </div>
            <p className="text-xs text-[#1D376A]">{t("onboarding.web.billing.yearlyHint")}</p>

            <div className="space-y-2">
              {BUSINESS_PLANS.map((planCode) => (
                <BusinessPlanCard
                  key={planCode}
                  planCode={planCode}
                  selected={businessPlan === planCode}
                  recommended={
                    planCode === recommendedPlan ||
                    (recommendedPlan === "business_enterprise" &&
                      planCode === "business_company")
                  }
                  billingPeriod={billingPeriod}
                  disabled={planCode === "business_enterprise"}
                  onSelect={() => {
                    if (planCode !== "business_enterprise") setBusinessPlan(planCode);
                  }}
                  t={t}
                />
              ))}
            </div>

            {teamSizeBand === "31+" ? (
              <p className={ONBOARDING_HINT}>{t("onboarding.web.enterpriseNote")}</p>
            ) : null}

            <div className="rounded-lg border border-[#1D376A]/20 bg-[#1D376A]/5 px-3 py-3 text-sm text-[#1D376A]">
              {t("onboarding.web.trialConfirmation")}
            </div>
          </div>
        );

      case "usage":
        return (
          <div className="space-y-3">
            <OnboardingOptionCard
              title={t("onboarding.mobile.usage.build.title")}
              description={t("onboarding.mobile.usage.build.description")}
              selected={primaryUsageMode === "build"}
              onClick={() => setPrimaryUsageMode("build")}
              icon={Building2}
            />
            <OnboardingOptionCard
              title={t("onboarding.mobile.usage.trade.title")}
              description={t("onboarding.mobile.usage.trade.description")}
              selected={primaryUsageMode === "trade"}
              onClick={() => setPrimaryUsageMode("trade")}
              icon={Wrench}
            />
          </div>
        );

      case "country":
        return (
          <div className="space-y-2">
            <Label htmlFor="country" className={ONBOARDING_LABEL}>
              {t("onboarding.mobile.country.label")}
            </Label>
            <select
              id="country"
              value={primaryCountry}
              onChange={(e) => setPrimaryCountry(e.target.value)}
              className={ONBOARDING_SELECT}
            >
              {ONBOARDING_COUNTRIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {t(c.labelKey)}
                </option>
              ))}
            </select>
          </div>
        );

      case "profile":
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="firstName" className={ONBOARDING_LABEL}>
                {t("onboarding.firstName")}
              </Label>
              <Input
                id="firstName"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                autoComplete="given-name"
                className={ONBOARDING_INPUT}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lastName" className={ONBOARDING_LABEL}>
                {t("onboarding.lastName")}
              </Label>
              <Input
                id="lastName"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                autoComplete="family-name"
                className={ONBOARDING_INPUT}
              />
            </div>
          </div>
        );

      case "phone":
        return (
          <div className="space-y-2">
            <Label htmlFor="phone" className={ONBOARDING_LABEL}>
              {t("onboarding.mobile.phone.label")}
            </Label>
            <Input
              id="phone"
              type="tel"
              value={phoneE164}
              onChange={(e) => setPhoneE164(e.target.value)}
              placeholder={t("onboarding.mobile.phone.placeholder")}
              autoComplete="tel"
              className={ONBOARDING_INPUT}
            />
            <p className={ONBOARDING_HINT}>{t("onboarding.mobile.phone.hint")}</p>
          </div>
        );

      case "personal_plan":
        return (
          <div className="space-y-3">
            <OnboardingOptionCard
              title={t("onboarding.web.personal.free.title")}
              description={t("onboarding.web.personal.free.description")}
              selected={personalPlan === "free"}
              onClick={() => setPersonalPlan("free")}
              icon={User}
            />
            <OnboardingOptionCard
              title={t("onboarding.web.personal.pro.title")}
              description={t("onboarding.web.personal.pro.description")}
              selected={personalPlan === "personal_pro"}
              onClick={() => setPersonalPlan("personal_pro")}
              icon={Hammer}
            />
            <p className={ONBOARDING_MUTED_BOX}>{t("onboarding.web.personal.proWebHint")}</p>
          </div>
        );

      case "project":
        return (
          <div className="space-y-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                className="size-4 accent-[#e06737]"
                checked={createProject}
                onChange={(e) => setCreateProject(e.target.checked)}
              />
              <span className="text-sm text-[#111111]">{t("onboarding.mobile.project.createToggle")}</span>
            </label>
            {createProject ? (
              <div className="space-y-2">
                <Label htmlFor="projectName" className={ONBOARDING_LABEL}>
                  {t("onboarding.mobile.project.nameLabel")}
                </Label>
                <Input
                  id="projectName"
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  placeholder={t("onboarding.mobile.project.namePlaceholder")}
                  className={ONBOARDING_INPUT}
                />
              </div>
            ) : null}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-[#1D376A] hover:text-[#e06737]"
              onClick={() => skipProject()}
            >
              {t("onboarding.mobile.skip")}
            </Button>
          </div>
        );

      case "equipment":
        return (
          <div className="space-y-4">
            <p className={ONBOARDING_BODY}>{t("onboarding.mobile.equipment.description")}</p>
            <div className={cn("flex items-center gap-2 py-4", ONBOARDING_MUTED_BOX)}>
              <Hammer className="size-4 shrink-0" aria-hidden />
              {t("onboarding.mobile.equipment.comingSoon")}
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-[#1D376A] hover:text-[#e06737]"
              onClick={() => void goNext()}
            >
              {t("onboarding.mobile.skip")}
            </Button>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <OnboardingStepShell
      step={currentStep}
      totalSteps={totalSteps}
      title={title}
      subtitle={subtitle}
      onBack={stepIndex > 0 ? goBack : undefined}
      backLabel={t("onboarding.back")}
      onNext={() => void goNext()}
      nextLabel={nextLabel}
      canProceed={canProceed}
      saving={saving}
      showBack={stepIndex > 0}
    >
      {error ? <p className="text-sm text-[#c2410c]">{error}</p> : null}
      {renderStep()}
    </OnboardingStepShell>
  );
}

/** @deprecated Use WebOnboardingWizard */
export const MobileAlignedOnboardingWizard = WebOnboardingWizard;
