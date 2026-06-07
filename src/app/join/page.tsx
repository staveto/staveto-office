"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { finishOnboardingAfterJoin } from "@/services/onboarding";
import { redeemBusinessInviteCode, acceptLegacyInviteToken } from "@/services/business/businessInvitesService";
import { useI18n } from "@/i18n/I18nContext";
import { OnboardingLanguageSwitcher } from "@/components/onboarding/OnboardingLanguageSwitcher";
import { Loader2 } from "lucide-react";

const COLORS = {
  background: "#1D376A",
  primary: "#e06737",
  textOnDark: "#ffffff",
};

type JoinStatus = "redirect" | "processing" | "done" | "pending" | "error";

function JoinHandler() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const code = searchParams.get("code");
  const { user, loading, refreshUser } = useAuth();
  const { t } = useI18n();
  const [status, setStatus] = useState<JoinStatus>("redirect");

  useEffect(() => {
    if (!token && !code) {
      router.replace("/login");
      return;
    }
    if (loading) return;
    if (!user) {
      const next = token
        ? `/join?token=${encodeURIComponent(token)}`
        : `/join?code=${encodeURIComponent(code ?? "")}`;
      router.replace(`/login?next=${encodeURIComponent(next)}`);
      return;
    }

    void (async () => {
      setStatus("processing");
      try {
        if (code) {
          const result = await redeemBusinessInviteCode(code);
          await finishOnboardingAfterJoin(user.id, result.orgId);
          await refreshUser();
          if (result.status === "pending") {
            setStatus("pending");
            return;
          }
          setStatus("done");
          router.replace("/app");
          return;
        }

        if (token) {
          const result = await acceptLegacyInviteToken(token);
          await finishOnboardingAfterJoin(user.id, result.orgId);
          await refreshUser();
          setStatus("done");
          router.replace("/app");
        }
      } catch {
        setStatus("error");
      }
    })();
  }, [token, code, user, loading, router, refreshUser]);

  if (!token && !code) {
    return null;
  }

  if (loading || status === "redirect" || status === "processing") {
    return (
      <div
        className="min-h-screen flex flex-col items-center justify-center p-6"
        style={{ backgroundColor: COLORS.background }}
      >
        <Loader2 className="size-8 animate-spin text-white mb-4" />
        <p style={{ color: COLORS.textOnDark }}>
          {loading ? t("join.loading") : t("join.processing")}
        </p>
      </div>
    );
  }

  if (status === "pending") {
    return (
      <div
        className="min-h-screen flex flex-col items-center justify-center p-6 text-center max-w-md mx-auto"
        style={{ backgroundColor: COLORS.background }}
      >
        <p className="text-white mb-2 font-medium">{t("join.pendingTitle")}</p>
        <p className="text-white/80 text-sm mb-6">{t("join.pendingBody")}</p>
        <button
          type="button"
          onClick={() => router.push("/app")}
          className="px-4 py-2 rounded-lg font-medium"
          style={{ backgroundColor: COLORS.primary, color: COLORS.textOnDark }}
        >
          {t("join.goToApp")}
        </button>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div
        className="min-h-screen flex flex-col items-center justify-center p-6"
        style={{ backgroundColor: COLORS.background }}
      >
        <p className="text-red-300 mb-4">{t("join.error")}</p>
        <button
          type="button"
          onClick={() => router.push("/app")}
          className="px-4 py-2 rounded-lg font-medium"
          style={{ backgroundColor: COLORS.primary, color: COLORS.textOnDark }}
        >
          {t("join.goToApp")}
        </button>
      </div>
    );
  }

  return null;
}

export default function JoinPage() {
  return (
    <>
      <div className="fixed top-4 right-4 z-50">
        <OnboardingLanguageSwitcher />
      </div>
      <Suspense
        fallback={
          <div
            className="min-h-screen flex items-center justify-center"
            style={{ backgroundColor: COLORS.background }}
          >
            <Loader2 className="size-8 animate-spin text-white" />
          </div>
        }
      >
        <JoinHandler />
      </Suspense>
    </>
  );
}
