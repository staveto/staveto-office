"use client";

import Image from "next/image";
import Link from "next/link";
import { Suspense, useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { resolvePostAuthRoute } from "@/lib/userProfile";
import { useI18n } from "@/i18n/I18nContext";
import { OnboardingLanguageSwitcher } from "@/components/onboarding/OnboardingLanguageSwitcher";

const COLORS = {
  background: "#1D376A",
  primary: "#e06737",
  textOnDark: "#ffffff",
  google: "#4285F4",
};

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/app";
  const { user, profile, loading, signIn, signUpWithGoogle, refreshUser } = useAuth();
  const { t } = useI18n();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitLoading, setSubmitLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function resolveDestination(): string {
    if (next.startsWith("/join")) return next;
    return resolvePostAuthRoute(profile, next);
  }

  useEffect(() => {
    if (!loading && user) {
      router.replace(resolveDestination());
    }
  }, [user, profile, loading, router, next]);

  async function handleEmailSignIn(e: React.FormEvent) {
    e.preventDefault();
    setSubmitLoading(true);
    setError(null);
    try {
      await signIn(email, password);
      const refreshedProfile = await refreshUser();
      router.push(
        next.startsWith("/join") ? next : resolvePostAuthRoute(refreshedProfile, next)
      );
      router.refresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    } finally {
      setSubmitLoading(false);
    }
  }

  async function handleGoogleSignIn() {
    setGoogleLoading(true);
    setError(null);
    try {
      await signUpWithGoogle();
      const refreshedProfile = await refreshUser();
      router.push(
        next.startsWith("/join") ? next : resolvePostAuthRoute(refreshedProfile, next)
      );
      router.refresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    } finally {
      setGoogleLoading(false);
    }
  }

  if (loading || user) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ backgroundColor: COLORS.background }}
      >
        <div className="fixed top-4 right-4 z-50">
          <OnboardingLanguageSwitcher />
        </div>
        <Loader2 className="size-8 animate-spin text-white" />
      </div>
    );
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
        className="text-4xl font-bold text-center mb-6"
        style={{ color: COLORS.textOnDark }}
      >
        {t("login.title")}
      </h1>

      <div className="w-full max-w-sm space-y-4">
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <form onSubmit={handleEmailSignIn} className="space-y-4">
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
              className="bg-white/10 border-white/30 text-white placeholder:text-white/50"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password" className="text-white/90">
              {t("login.password")}
            </Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              className="bg-white/10 border-white/30 text-white placeholder:text-white/50"
            />
          </div>
          <Button
            type="submit"
            disabled={submitLoading}
            className="w-full h-12 rounded-2xl text-base font-semibold"
            style={{ backgroundColor: COLORS.primary, color: COLORS.textOnDark }}
          >
            {submitLoading ? (
              <Loader2 className="size-5 animate-spin" />
            ) : (
              t("login.title")
            )}
          </Button>
        </form>

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t border-white/30" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-[#1D376A] px-2 text-white/60">{t("login.or")}</span>
          </div>
        </div>

        <Button
          type="button"
          onClick={handleGoogleSignIn}
          disabled={googleLoading}
          className="w-full h-12 rounded-2xl text-base font-semibold flex items-center justify-center gap-2"
          style={{ backgroundColor: COLORS.google, color: COLORS.textOnDark }}
        >
          {googleLoading ? (
            <Loader2 className="size-5 animate-spin" />
          ) : (
            <svg className="size-5" viewBox="0 0 24 24">
              <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
              <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
              <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
            </svg>
          )}
          {googleLoading ? t("login.loading") : t("login.google")}
        </Button>

        <p className="text-center text-sm text-white/80">
          {t("login.noAccount")}{" "}
          <Link
            href={`/register${next !== "/app" ? `?next=${encodeURIComponent(next)}` : ""}`}
            className="font-medium underline hover:text-white"
            style={{ color: COLORS.primary }}
          >
            {t("login.signUpLink")}
          </Link>
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
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
      <LoginForm />
    </Suspense>
  );
}
