/**
 * Legal consent — aligned with mobile `src/constants/consent.ts`.
 */
import type { Locale } from "@/i18n/translations";
import type { UserProfile } from "@/lib/userProfile";

export const CONSENT_TERMS_VERSION = "v1";
export const CONSENT_PRIVACY_VERSION = "v1";
export const SUPPORT_EMAIL = "support@staveto.com";

export const LEGAL_URLS = {
  terms: "https://www.staveto.com/terms-conditions",
  privacy: "https://www.staveto.com/privacy",
  subprocessor: "https://www.staveto.com/subprocessor",
  dataProcessing: "https://www.staveto.com/data-processing",
} as const;

export type ConsentAcceptancePayload = {
  termsAccepted: true;
  privacyAccepted: true;
  termsVersion: typeof CONSENT_TERMS_VERSION;
  privacyVersion: typeof CONSENT_PRIVACY_VERSION;
  locale: Locale;
};

export function hasValidLegalConsent(profile: UserProfile | null): boolean {
  if (!profile) return false;

  const termsAt = profile.termsAcceptedAt ?? profile.onboarding?.termsAcceptedAt;
  const privacyAt = profile.privacyAcceptedAt ?? profile.onboarding?.privacyAcceptedAt;
  const termsVersion = profile.termsVersion ?? profile.onboarding?.termsVersion;
  const privacyVersion = profile.privacyVersion ?? profile.onboarding?.privacyVersion;

  return (
    !!termsAt &&
    !!privacyAt &&
    termsVersion === CONSENT_TERMS_VERSION &&
    privacyVersion === CONSENT_PRIVACY_VERSION
  );
}
