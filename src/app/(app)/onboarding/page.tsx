"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth, isOnboardingCompleted } from "@/context/AuthContext";
import { useI18n } from "@/i18n/I18nContext";
import { OnboardingStepShell } from "@/components/onboarding/OnboardingStepShell";
import { OnboardingOptionCard } from "@/components/onboarding/OnboardingOptionCard";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Loader2, User, Building2, PlusCircle, Link2 } from "lucide-react";
import {
  savePersonalProfile,
  createCompanyForOnboarding,
  finishOnboarding,
  getPersonalActiveWorkspaceId,
  ONBOARDING_FEATURE_IDS,
  type OnboardingUsageType,
  type OnboardingRole,
  type OnboardingFeature,
} from "@/services/onboarding";

const COLORS = {
  background: "#1D376A",
};

const TOTAL_STEPS = 6;

const ROLE_VALUES: OnboardingRole[] = ["craftsman", "manager", "accountant", "other"];

type CompanySetupMode = "choose" | "create" | "join";

export default function OnboardingPage() {
  const router = useRouter();
  const { t } = useI18n();
  const { user, profile, loading, refreshUser } = useAuth();

  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [role, setRole] = useState<OnboardingRole | "">("");

  const [usageType, setUsageType] = useState<OnboardingUsageType | "">("");
  const [companyMode, setCompanyMode] = useState<CompanySetupMode>("choose");
  const [companyName, setCompanyName] = useState("");
  const [inviteToken, setInviteToken] = useState("");
  const [createdOrgId, setCreatedOrgId] = useState<string | null>(null);

  const [selectedFeatures, setSelectedFeatures] = useState<OnboardingFeature[]>([]);

  useEffect(() => {
    if (!loading && profile && isOnboardingCompleted(profile)) {
      router.replace("/app");
    }
  }, [loading, profile, router]);

  useEffect(() => {
    if (profile?.firstName) setFirstName((v) => v || profile.firstName || "");
    if (profile?.lastName) setLastName((v) => v || profile.lastName || "");
    const savedRole = profile?.onboarding?.role;
    if (savedRole && ROLE_VALUES.includes(savedRole as OnboardingRole)) {
      setRole(savedRole as OnboardingRole);
    }
    const savedUsage = profile?.onboarding?.usageType;
    if (savedUsage === "personal" || savedUsage === "company") {
      setUsageType(savedUsage);
    }
    const savedFeatures = profile?.onboarding?.selectedFeatures;
    if (savedFeatures?.length) {
      setSelectedFeatures(
        savedFeatures.filter((f): f is OnboardingFeature =>
          ONBOARDING_FEATURE_IDS.includes(f as OnboardingFeature)
        )
      );
    }
  }, [profile]);

  const toggleFeature = (id: OnboardingFeature) => {
    setSelectedFeatures((prev) =>
      prev.includes(id) ? prev.filter((f) => f !== id) : [...prev, id]
    );
  };

  const handleBack = () => {
    setError(null);
    if (step === 4 && usageType === "company") {
      if (companyMode === "create" || companyMode === "join") {
        setCompanyMode("choose");
        return;
      }
    }
    setStep((s) => Math.max(1, s - 1));
  };

  const handleNext = async () => {
    if (!user?.id) return;
    setError(null);

    if (step === 1) {
      setStep(2);
      return;
    }

    if (step === 2) {
      if (!firstName.trim() || !lastName.trim() || !role) {
        setError(t("onboarding.error.required"));
        return;
      }
      setSaving(true);
      try {
        await savePersonalProfile(user.id, {
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          role,
        });
        setStep(3);
      } catch {
        setError(t("onboarding.error.save"));
      } finally {
        setSaving(false);
      }
      return;
    }

    if (step === 3) {
      if (!usageType) {
        setError(t("onboarding.error.required"));
        return;
      }
      setCompanyMode("choose");
      setStep(4);
      return;
    }

    if (step === 4) {
      if (usageType === "personal") {
        setStep(5);
        return;
      }

      if (companyMode === "choose") {
        setError(t("onboarding.error.required"));
        return;
      }

      if (companyMode === "join") {
        const token = inviteToken.trim();
        if (token) {
          router.push(`/join?token=${encodeURIComponent(token)}`);
          return;
        }
        setError(t("onboarding.error.required"));
        return;
      }

      if (companyMode === "create") {
        if (!companyName.trim()) {
          setError(t("onboarding.error.required"));
          return;
        }
        setSaving(true);
        try {
          const orgId = await createCompanyForOnboarding(user.id, companyName.trim());
          setCreatedOrgId(orgId);
          setStep(5);
        } catch {
          setError(t("onboarding.error.save"));
        } finally {
          setSaving(false);
        }
        return;
      }
      return;
    }

    if (step === 5) {
      setStep(6);
      return;
    }

    if (step === 6) {
      setSaving(true);
      try {
        let activeWorkspaceId = getPersonalActiveWorkspaceId();
        let activeWorkspaceType: "personal" | "company" = "personal";

        if (usageType === "company" && createdOrgId) {
          activeWorkspaceId = createdOrgId;
          activeWorkspaceType = "company";
        }

        await finishOnboarding(user.id, {
          usageType: usageType as OnboardingUsageType,
          selectedFeatures,
          activeWorkspaceId,
          activeWorkspaceType,
        });
        await refreshUser();
        router.push("/app");
      } catch {
        setError(t("onboarding.error.save"));
      } finally {
        setSaving(false);
      }
    }
  };

  const canProceedStep4 = (): boolean => {
    if (usageType === "personal") return true;
    if (companyMode === "choose") return false;
    if (companyMode === "join") return !!inviteToken.trim();
    if (companyMode === "create") return !!companyName.trim();
    return false;
  };

  const canProceed =
    step === 1 ||
    (step === 2 && !!firstName.trim() && !!lastName.trim() && !!role) ||
    (step === 3 && !!usageType) ||
    (step === 4 && canProceedStep4()) ||
    step === 5 ||
    step === 6;

  const nextLabel =
    step === 6 ? t("onboarding.finish") : step === 4 && companyMode === "join" ? t("onboarding.join.openLink") : t("onboarding.next");

  if (loading || !user) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ backgroundColor: COLORS.background }}
      >
        <Loader2 className="size-8 animate-spin text-white" />
      </div>
    );
  }

  if (profile && isOnboardingCompleted(profile)) {
    return null;
  }

  const renderStepContent = () => {
    switch (step) {
      case 1:
        return (
          <p className="text-muted-foreground text-sm leading-relaxed">
            {t("onboarding.step.welcome.subtitle")}
          </p>
        );

      case 2:
        return (
          <>
            <div className="space-y-2">
              <Label htmlFor="firstName">{t("onboarding.firstName")}</Label>
              <Input
                id="firstName"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                autoComplete="given-name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lastName">{t("onboarding.lastName")}</Label>
              <Input
                id="lastName"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                autoComplete="family-name"
              />
            </div>
            <div className="space-y-2">
              <Label>{t("onboarding.role.title")}</Label>
              <div className="flex flex-wrap gap-2">
                {ROLE_VALUES.map((r) => (
                  <Button
                    key={r}
                    type="button"
                    size="sm"
                    variant={role === r ? "default" : "outline"}
                    onClick={() => setRole(r)}
                    style={role === r ? { backgroundColor: "#e06737" } : undefined}
                  >
                    {t(`onboarding.role.${r}`)}
                  </Button>
                ))}
              </div>
            </div>
          </>
        );

      case 3:
        return (
          <div className="space-y-3">
            <OnboardingOptionCard
              title={t("onboarding.usage.personal.title")}
              description={t("onboarding.usage.personal.description")}
              selected={usageType === "personal"}
              onClick={() => setUsageType("personal")}
              icon={User}
            />
            <OnboardingOptionCard
              title={t("onboarding.usage.company.title")}
              description={t("onboarding.usage.company.description")}
              selected={usageType === "company"}
              onClick={() => setUsageType("company")}
              icon={Building2}
            />
          </div>
        );

      case 4:
        if (usageType === "personal") {
          return (
            <p className="text-sm text-muted-foreground">
              {t("onboarding.step.personal.subtitle")}
            </p>
          );
        }
        if (companyMode === "choose") {
          return (
            <div className="space-y-3">
              <OnboardingOptionCard
                title={t("onboarding.company.create.title")}
                description={t("onboarding.company.create.description")}
                selected={false}
                onClick={() => setCompanyMode("create")}
                icon={PlusCircle}
              />
              <OnboardingOptionCard
                title={t("onboarding.company.join.title")}
                description={t("onboarding.company.join.description")}
                selected={false}
                onClick={() => setCompanyMode("join")}
                icon={Link2}
              />
            </div>
          );
        }
        if (companyMode === "create") {
          return (
            <div className="space-y-2">
              <Label htmlFor="companyName">{t("onboarding.companyName")}</Label>
              <Input
                id="companyName"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder={t("onboarding.companyName.placeholder")}
              />
            </div>
          );
        }
        return (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">{t("onboarding.step.companyJoin.subtitle")}</p>
            <div className="space-y-2">
              <Label htmlFor="inviteToken">{t("onboarding.join.tokenLabel")}</Label>
              <Input
                id="inviteToken"
                value={inviteToken}
                onChange={(e) => setInviteToken(e.target.value)}
                placeholder={t("onboarding.join.tokenPlaceholder")}
              />
            </div>
            <p className="text-xs text-muted-foreground">{t("onboarding.join.hint")}</p>
          </div>
        );

      case 5:
        return (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {ONBOARDING_FEATURE_IDS.map((id) => (
              <label
                key={id}
                className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 cursor-pointer hover:border-[#e06737]/40"
              >
                <input
                  type="checkbox"
                  checked={selectedFeatures.includes(id)}
                  onChange={() => toggleFeature(id)}
                  className="accent-[#e06737]"
                />
                <span className="text-sm">{t(`onboarding.feature.${id}`)}</span>
              </label>
            ))}
          </div>
        );

      case 6:
        return (
          <p className="text-sm text-muted-foreground">{t("onboarding.step.done.subtitle")}</p>
        );

      default:
        return null;
    }
  };

  const stepTitle = (): string => {
    switch (step) {
      case 1:
        return t("onboarding.step.welcome.title");
      case 2:
        return t("onboarding.step.profile.title");
      case 3:
        return t("onboarding.step.usage.title");
      case 4:
        if (usageType === "personal") return t("onboarding.step.workspace.title");
        if (companyMode === "create") return t("onboarding.company.create.title");
        if (companyMode === "join") return t("onboarding.company.join.title");
        return t("onboarding.step.workspace.title");
      case 5:
        return t("onboarding.step.features.title");
      case 6:
        return t("onboarding.step.done.title");
      default:
        return "";
    }
  };

  const stepSubtitle = (): string | undefined => {
    switch (step) {
      case 2:
        return t("onboarding.step.profile.subtitle");
      case 3:
        return t("onboarding.step.usage.subtitle");
      case 4:
        if (usageType === "personal") return t("onboarding.step.personal.subtitle");
        if (companyMode === "choose") return t("onboarding.step.companyChoose.subtitle");
        if (companyMode === "create") return t("onboarding.step.companyCreate.subtitle");
        return undefined;
      case 5:
        return t("onboarding.step.features.subtitle");
      default:
        return step === 1 ? undefined : undefined;
    }
  };

  const shellShowBack = step > 1;

  return (
    <div
      className="min-h-screen flex flex-col md:flex-row"
      style={{ backgroundColor: COLORS.background }}
    >
      <div className="flex-1 flex flex-col justify-center p-6 md:p-12">
        <OnboardingStepShell
          step={step}
          totalSteps={TOTAL_STEPS}
          title={stepTitle()}
          subtitle={stepSubtitle()}
          onBack={shellShowBack ? handleBack : undefined}
          backLabel={t("onboarding.back")}
          onNext={handleNext}
          nextLabel={nextLabel}
          canProceed={canProceed}
          saving={saving}
          showBack={shellShowBack}
        >
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          {renderStepContent()}
        </OnboardingStepShell>
      </div>

      <div className="hidden md:flex flex-1 items-center justify-center p-12">
        <div
          className="w-full max-w-md aspect-square rounded-2xl flex items-center justify-center"
          style={{ backgroundColor: "rgba(224, 103, 55, 0.2)" }}
        >
          <svg
            className="w-1/2 h-1/2 text-white/40"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        </div>
      </div>
    </div>
  );
}
