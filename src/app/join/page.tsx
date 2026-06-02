"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { getInviteByToken, acceptInvite } from "@/lib/organizations";
import { finishOnboardingAfterJoin } from "@/services/onboarding";
import { useI18n } from "@/i18n/I18nContext";
import { Loader2 } from "lucide-react";

const COLORS = {
  background: "#1D376A",
  primary: "#e06737",
  textOnDark: "#ffffff",
};

function JoinHandler() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const { user, loading, refreshUser } = useAuth();
  const { t } = useI18n();
  const [status, setStatus] = useState<"redirect" | "processing" | "done" | "error">("redirect");

  useEffect(() => {
    if (!token) {
      router.replace("/login");
      return;
    }
    if (loading) return;
    if (!user) {
      const next = encodeURIComponent(`/join?token=${token}`);
      router.replace(`/login?next=${next}`);
      return;
    }
    void (async () => {
      setStatus("processing");
      try {
        const invite = await getInviteByToken(token);
        if (!invite) {
          setStatus("error");
          return;
        }
        const orgId = await acceptInvite(invite.id, user.id, user.email ?? "");
        await finishOnboardingAfterJoin(user.id, orgId);
        await refreshUser();
        setStatus("done");
        router.replace("/app");
      } catch {
        setStatus("error");
      }
    })();
  }, [token, user, loading, router, refreshUser]);

  if (!token) {
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
  );
}
