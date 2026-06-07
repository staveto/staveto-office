"use client";

import Image from "next/image";
import Link from "next/link";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { sendPasswordReset } from "@/lib/firebase";
import { getAuthErrorMessageKey } from "@/lib/authErrors";
import { useI18n } from "@/i18n/I18nContext";
import { OnboardingLanguageSwitcher } from "@/components/onboarding/OnboardingLanguageSwitcher";

const COLORS = {
  background: "#1D376A",
  primary: "#e06737",
  textOnDark: "#ffffff",
};

function ForgotPasswordForm() {
  const searchParams = useSearchParams();
  const { t } = useI18n();
  const [email, setEmail] = useState(() => searchParams.get("email") ?? "");
  const [submitLoading, setSubmitLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitLoading(true);
    setError(null);
    setSuccess(false);
    try {
      await sendPasswordReset(email);
      setSuccess(true);
    } catch (err) {
      setError(t(getAuthErrorMessageKey(err)));
    } finally {
      setSubmitLoading(false);
    }
  }

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center p-6"
      style={{ backgroundColor: COLORS.background }}
    >
      <div className="fixed top-4 right-4 z-50">
        <OnboardingLanguageSwitcher />
      </div>
      <Image
        src="/logo.png"
        alt="Staveto"
        width={160}
        height={80}
        className="mb-6"
      />
      <h1
        className="text-4xl font-bold text-center mb-2"
        style={{ color: COLORS.textOnDark }}
      >
        {t("forgotPassword.title")}
      </h1>
      <p className="text-center text-sm text-white/70 mb-6 max-w-sm">
        {t("forgotPassword.subtitle")}
      </p>

      <div className="w-full max-w-sm space-y-4">
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}
        {success && (
          <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
            {t("forgotPassword.success")}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email" className="text-white/90">
              {t("login.email")}
            </Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              autoComplete="email"
              className="bg-white/10 border-white/30 text-white placeholder:text-white/50"
            />
          </div>
          <Button
            type="submit"
            disabled={submitLoading || success}
            className="w-full h-12 rounded-2xl text-base font-semibold"
            style={{ backgroundColor: COLORS.primary, color: COLORS.textOnDark }}
          >
            {submitLoading ? (
              <Loader2 className="size-5 animate-spin" />
            ) : (
              t("forgotPassword.submit")
            )}
          </Button>
        </form>

        <p className="text-center text-sm text-white/80">
          <Link
            href="/login"
            className="font-medium underline hover:text-white"
            style={{ color: COLORS.primary }}
          >
            {t("forgotPassword.backToLogin")}
          </Link>
        </p>
      </div>
    </div>
  );
}

export default function ForgotPasswordPage() {
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
      <ForgotPasswordForm />
    </Suspense>
  );
}
