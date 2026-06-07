"use client";

import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n/I18nContext";
import { LEGAL_URLS } from "@/lib/consent";

type ConsentCheckboxProps = {
  checked: boolean;
  onChange: (checked: boolean) => void;
  beforeKey: string;
  linkKey: string;
  href: string;
};

function ConsentCheckbox({
  checked,
  onChange,
  beforeKey,
  linkKey,
  href,
}: ConsentCheckboxProps) {
  const { t } = useI18n();

  return (
    <label
      className={cn(
        "flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition-colors",
        checked
          ? "border-[#e06737]/40 bg-[#e06737]/5"
          : "border-border/80 bg-muted/30 hover:border-[#e06737]/30 hover:bg-[#e06737]/5"
      )}
    >
      <input
        type="checkbox"
        className="mt-0.5 size-4 shrink-0 accent-[#e06737]"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="text-sm leading-relaxed text-foreground/90">
        {t(beforeKey)}{" "}
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-[#1D376A] underline underline-offset-2 hover:text-[#e06737]"
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
        >
          {t(linkKey)}
        </a>
      </span>
    </label>
  );
}

type OnboardingConsentStepProps = {
  termsAccepted: boolean;
  privacyAccepted: boolean;
  onTermsChange: (value: boolean) => void;
  onPrivacyChange: (value: boolean) => void;
};

export function OnboardingConsentStep({
  termsAccepted,
  privacyAccepted,
  onTermsChange,
  onPrivacyChange,
}: OnboardingConsentStepProps) {
  return (
    <div className="space-y-3">
      <ConsentCheckbox
        checked={termsAccepted}
        onChange={onTermsChange}
        beforeKey="onboarding.consent.terms.before"
        linkKey="onboarding.consent.terms.link"
        href={LEGAL_URLS.terms}
      />
      <ConsentCheckbox
        checked={privacyAccepted}
        onChange={onPrivacyChange}
        beforeKey="onboarding.consent.privacy.before"
        linkKey="onboarding.consent.privacy.link"
        href={LEGAL_URLS.privacy}
      />
    </div>
  );
}
