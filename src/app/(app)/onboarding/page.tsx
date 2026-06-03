"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth, isOnboardingCompleted } from "@/context/AuthContext";
import { useI18n } from "@/i18n/I18nContext";
import { OnboardingStepShell } from "@/components/onboarding/OnboardingStepShell";
import { OnboardingOptionCard } from "@/components/onboarding/OnboardingOptionCard";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Building2, Link2, User } from "lucide-react";
import {
  completeCompanyOwnerOnboarding,
  completePersonalOnboarding,
  completeWorkerJoinIntent,
  type OnboardingPath,
} from "@/services/onboarding";

const COLORS = {
  background: "#1D376A",
};

type OnboardingStep = "choose" | "details";

export default function OnboardingPage() {
  const router = useRouter();
  const { t } = useI18n();
  const { user, profile, loading, refreshUser } = useAuth();

  const [step, setStep] = useState<OnboardingStep>("choose");
  const [path, setPath] = useState<OnboardingPath>("company_owner");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [inviteToken, setInviteToken] = useState("");

  useEffect(() => {
    if (!loading && profile && isOnboardingCompleted(profile)) {
      router.replace("/app");
    }
  }, [loading, profile, router]);

  useEffect(() => {
    if (profile?.firstName) setFirstName((v) => v || profile.firstName || "");
    if (profile?.lastName) setLastName((v) => v || profile.lastName || "");
  }, [profile]);

  const handleBack = () => {
    setError(null);
    if (step === "details") {
      setStep("choose");
    }
  };

  const handleChooseContinue = () => {
    setError(null);
    if (path === "worker_join") {
      setStep("details");
      return;
    }
    if (path === "company_owner" || path === "personal") {
      const hasName = !!(profile?.firstName?.trim() && profile?.lastName?.trim());
      if (hasName) {
        void handleFinish(path);
        return;
      }
      setStep("details");
    }
  };

  const handleFinish = async (selectedPath: OnboardingPath = path) => {
    if (!user?.id) return;
    setError(null);
    setSaving(true);

    const minimal = {
      firstName: firstName.trim() || undefined,
      lastName: lastName.trim() || undefined,
    };

    try {
      if (selectedPath === "company_owner") {
        await completeCompanyOwnerOnboarding(user.id, minimal);
        await refreshUser();
        router.push("/app");
        return;
      }

      if (selectedPath === "personal") {
        await completePersonalOnboarding(user.id, minimal);
        await refreshUser();
        router.push("/app");
        return;
      }

      if (selectedPath === "worker_join") {
        const token = inviteToken.trim();
        if (!token) {
          setError(t("onboarding.error.required"));
          setSaving(false);
          return;
        }
        await completeWorkerJoinIntent(user.id);
        router.push(`/join?token=${encodeURIComponent(token)}`);
      }
    } catch {
      setError(t("onboarding.error.save"));
      setSaving(false);
    }
  };

  const totalSteps = path === "worker_join" ? 2 : 2;
  const currentStep = step === "choose" ? 1 : 2;

  const nextLabel = (): string => {
    if (step === "choose") {
      if (path === "company_owner") return t("onboarding.path.companyOwner.cta");
      if (path === "worker_join") return t("onboarding.path.workerJoin.cta");
      return t("onboarding.path.personal.cta");
    }
    if (path === "worker_join") return t("onboarding.join.openLink");
    if (path === "company_owner") return t("onboarding.path.companyOwner.cta");
    return t("onboarding.path.personal.cta");
  };

  const canProceed =
    step === "choose" ||
    (step === "details" && path === "worker_join" && !!inviteToken.trim()) ||
    (step === "details" && (path === "company_owner" || path === "personal"));

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

  const renderContent = () => {
    if (step === "choose") {
      return (
        <div className="space-y-3">
          <OnboardingOptionCard
            title={t("onboarding.path.companyOwner.title")}
            description={t("onboarding.path.companyOwner.description")}
            selected={path === "company_owner"}
            recommended
            onClick={() => setPath("company_owner")}
            icon={Building2}
          />
          <OnboardingOptionCard
            title={t("onboarding.path.workerJoin.title")}
            description={t("onboarding.path.workerJoin.description")}
            selected={path === "worker_join"}
            onClick={() => setPath("worker_join")}
            icon={Link2}
          />
          <OnboardingOptionCard
            title={t("onboarding.path.personal.title")}
            description={t("onboarding.path.personal.description")}
            selected={path === "personal"}
            onClick={() => setPath("personal")}
            icon={User}
          />
        </div>
      );
    }

    if (path === "worker_join") {
      return (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {t("onboarding.step.companyJoin.subtitle")}
          </p>
          <div className="space-y-2">
            <Label htmlFor="inviteToken">{t("onboarding.join.tokenLabel")}</Label>
            <Input
              id="inviteToken"
              value={inviteToken}
              onChange={(e) => setInviteToken(e.target.value)}
              placeholder={t("onboarding.join.tokenPlaceholder")}
              autoFocus
            />
          </div>
          <p className="text-xs text-muted-foreground">{t("onboarding.join.hint")}</p>
        </div>
      );
    }

    return (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          {t("onboarding.step.minimalProfile.subtitle")}
        </p>
        <div className="space-y-2">
          <Label htmlFor="firstName">{t("onboarding.firstName")}</Label>
          <Input
            id="firstName"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            autoComplete="given-name"
            placeholder={t("onboarding.firstName.optionalHint")}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="lastName">{t("onboarding.lastName")}</Label>
          <Input
            id="lastName"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            autoComplete="family-name"
            placeholder={t("onboarding.lastName.optionalHint")}
          />
        </div>
        {path === "company_owner" ? (
          <p className="rounded-lg border border-[#1D376A]/15 bg-[#1D376A]/[0.04] px-3 py-2 text-xs text-muted-foreground">
            {t("onboarding.path.companyOwner.nextStepHint")}
          </p>
        ) : null}
      </div>
    );
  };

  const title =
    step === "choose"
      ? t("onboarding.step.welcome.title")
      : path === "worker_join"
        ? t("onboarding.path.workerJoin.title")
        : t("onboarding.step.minimalProfile.title");

  const subtitle =
    step === "choose"
      ? t("onboarding.step.welcome.subtitle")
      : path === "worker_join"
        ? undefined
        : t("onboarding.step.minimalProfile.subtitle");

  return (
    <div
      className="min-h-screen flex flex-col md:flex-row"
      style={{ backgroundColor: COLORS.background }}
    >
      <div className="flex-1 flex flex-col justify-center p-6 md:p-12">
        <OnboardingStepShell
          step={currentStep}
          totalSteps={totalSteps}
          title={title}
          subtitle={subtitle}
          onBack={step === "details" ? handleBack : undefined}
          backLabel={t("onboarding.back")}
          onNext={step === "choose" ? handleChooseContinue : () => handleFinish()}
          nextLabel={nextLabel()}
          canProceed={canProceed}
          saving={saving}
          showBack={step === "details"}
        >
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          {renderContent()}
        </OnboardingStepShell>
        {step === "choose" ? (
          <p className="mx-auto mt-4 max-w-lg text-center text-xs text-white/50">
            {t("onboarding.legalHint")}
          </p>
        ) : null}
      </div>

      <div className="hidden md:flex flex-1 items-center justify-center p-12">
        <div
          className="w-full max-w-md space-y-4 rounded-2xl p-8"
          style={{ backgroundColor: "rgba(224, 103, 55, 0.15)" }}
        >
          <Building2 className="size-12 text-white/50" aria-hidden />
          <p className="text-sm leading-relaxed text-white/70">
            {t("onboarding.sidePanel.tagline")}
          </p>
          {step === "choose" && path === "company_owner" ? (
            <p className="text-xs font-medium uppercase tracking-wider text-white/40">
              {t("onboarding.path.companyOwner.recommended")}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
