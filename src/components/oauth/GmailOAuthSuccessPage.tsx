"use client";

import { Mail, Search, Sparkles } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/I18nContext";
import { GMAIL_OAUTH_MESSAGE_CONNECTED } from "@/services/email/gmailIntegrationService";

export function GmailOAuthSuccessPage() {
  const { t } = useI18n();
  const searchParams = useSearchParams();
  const email = searchParams.get("email");
  const oauthPopup = searchParams.get("oauth_popup") === "1";
  const returnPath = searchParams.get("return") || "/app/settings/app-center?category=communication";

  const handleDone = () => {
    if (oauthPopup && typeof window !== "undefined" && window.opener) {
      window.opener.postMessage({ type: GMAIL_OAUTH_MESSAGE_CONNECTED }, window.location.origin);
      window.close();
      return;
    }
    window.location.href = returnPath.includes("?")
      ? `${returnPath}&gmail=connected`
      : `${returnPath}?gmail=connected`;
  };

  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-[#f4f6f9] p-6">
      <div className="w-full max-w-lg rounded-2xl border border-[#d8dee8] bg-white p-8 shadow-lg">
        <div className="flex items-center justify-center gap-4">
          <div className="flex size-14 items-center justify-center rounded-2xl bg-white shadow ring-1 ring-[#e2e8f0]">
            <Mail className="size-8 text-[#ea4335]" aria-hidden />
          </div>
          <span className="text-2xl text-[#94a3b8]" aria-hidden>
            ↔
          </span>
          <div className="flex size-14 items-center justify-center rounded-2xl bg-[#1D376A] text-lg font-bold text-white shadow">
            S
          </div>
        </div>

        <h1 className="mt-8 text-center text-2xl font-bold text-[#1D376A]">
          {t("gmail.success.title")}
        </h1>
        {email ? (
          <p className="mt-2 text-center text-sm text-muted-foreground">{email}</p>
        ) : null}

        <ul className="mt-8 space-y-4">
          <li className="flex gap-3 rounded-xl border border-[#e8edf3] bg-[#f8fafc] p-4">
            <Search className="mt-0.5 size-5 shrink-0 text-[#1D376A]" aria-hidden />
            <div>
              <p className="font-semibold text-[#152238]">{t("gmail.success.searchTitle")}</p>
              <p className="mt-1 text-sm text-[#5a6577]">{t("gmail.success.searchDesc")}</p>
            </div>
          </li>
          <li className="flex gap-3 rounded-xl border border-[#e8edf3] bg-[#f8fafc] p-4">
            <Sparkles className="mt-0.5 size-5 shrink-0 text-[#e06737]" aria-hidden />
            <div>
              <p className="font-semibold text-[#152238]">{t("gmail.success.aiTitle")}</p>
              <p className="mt-1 text-sm text-[#5a6577]">{t("gmail.success.aiDesc")}</p>
            </div>
          </li>
        </ul>

        <p className="mt-6 text-center text-xs text-[#5a6577]">{t("gmail.success.privacy")}</p>

        <Button
          type="button"
          className="mt-6 w-full bg-[#e06737] hover:bg-[#c9562d]"
          size="lg"
          onClick={handleDone}
        >
          {t("gmail.success.done")}
        </Button>
      </div>
    </div>
  );
}
