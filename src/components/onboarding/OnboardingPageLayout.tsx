"use client";

import Image from "next/image";
import { Building2, FileText, Users } from "lucide-react";
import { useI18n } from "@/i18n/I18nContext";
import { OnboardingLanguageSwitcher } from "@/components/onboarding/OnboardingLanguageSwitcher";

type OnboardingPageLayoutProps = {
  children: React.ReactNode;
};

const HIGHLIGHTS = [
  { key: "onboarding.feature.projects", icon: Building2 },
  { key: "onboarding.feature.team", icon: Users },
  { key: "onboarding.feature.quotes", icon: FileText },
] as const;

export function OnboardingPageLayout({ children }: OnboardingPageLayoutProps) {
  const { t } = useI18n();

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#1D376A]">
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_20%_0%,rgba(224,103,55,0.18),transparent_55%),radial-gradient(ellipse_70%_50%_at_100%_100%,rgba(255,255,255,0.06),transparent_50%)]"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -left-32 top-1/4 size-96 rounded-full bg-[#e06737]/10 blur-3xl"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -right-24 bottom-0 size-80 rounded-full bg-white/5 blur-3xl"
        aria-hidden
      />

      <header className="relative z-10 flex items-center justify-between px-5 py-4 md:px-10">
        <Image src="/logo.png" alt="Staveto" width={120} height={48} className="h-10 w-auto" priority />
        <OnboardingLanguageSwitcher />
      </header>

      <main className="relative z-10 mx-auto flex w-full max-w-6xl flex-col items-center gap-8 px-5 pb-8 pt-2 md:px-10 lg:flex-row lg:items-start lg:justify-between lg:gap-14 lg:pb-12 lg:pt-4">
        <section className="w-full max-w-md flex-1 text-white lg:sticky lg:top-24 lg:pt-6">
          <p className="text-xs font-semibold uppercase tracking-widest text-[#e06737]">
            Staveto Manager
          </p>
          <h1 className="mt-3 font-serif text-3xl font-bold leading-tight tracking-tight md:text-4xl">
            {t("onboarding.step.welcome.title")}
          </h1>
          <p className="mt-4 text-base leading-relaxed text-white/75 md:text-lg">
            {t("onboarding.sidePanel.tagline")}
          </p>
          <ul className="mt-8 hidden space-y-3 sm:block">
            {HIGHLIGHTS.map(({ key, icon: Icon }) => (
              <li
                key={key}
                className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3 backdrop-blur-sm"
              >
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[#e06737]/20 text-[#e06737]">
                  <Icon className="size-4" aria-hidden />
                </span>
                <span className="text-sm font-medium text-white/90">{t(key)}</span>
              </li>
            ))}
          </ul>
        </section>

        <div className="w-full max-w-lg shrink-0">{children}</div>
      </main>

      <p className="relative z-10 px-5 pb-6 text-center text-xs text-white/35 md:px-10 lg:max-w-6xl lg:text-left">
        {t("onboarding.legalHint")}
      </p>
    </div>
  );
}
