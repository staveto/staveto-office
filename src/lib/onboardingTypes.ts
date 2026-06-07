/**
 * Web onboarding paths — B2B-first with mobile-compatible values.
 */
export type WebOnboardingPath = "company_owner" | "join_company" | "solo";

/** @deprecated Alias for join/solo mobile paths */
export type MobileOnboardingPath = "join_company" | "solo" | "company_owner";

export type PrimaryUsageMode = "build" | "trade";

export type CompanyType =
  | "hvac"
  | "electrical"
  | "plumbing"
  | "construction"
  | "painting"
  | "roofing"
  | "other";

export type TeamSizeBand = "1-5" | "6-15" | "16-30" | "31+";

export type BusinessPlanCode =
  | "business_starter"
  | "business_team"
  | "business_company"
  | "business_enterprise";

export type BillingPeriod = "monthly" | "yearly";

export type PersonalPlanChoice = "free" | "personal_pro";

export const PRIMARY_USAGE_MODES: readonly PrimaryUsageMode[] = [
  "build",
  "trade",
] as const;

export const COMPANY_TYPES: readonly CompanyType[] = [
  "hvac",
  "electrical",
  "plumbing",
  "construction",
  "painting",
  "roofing",
  "other",
] as const;

export const TEAM_SIZE_BANDS: readonly TeamSizeBand[] = [
  "1-5",
  "6-15",
  "16-30",
  "31+",
] as const;

export const BUSINESS_PLANS: readonly BusinessPlanCode[] = [
  "business_starter",
  "business_team",
  "business_company",
  "business_enterprise",
] as const;

export const ONBOARDING_COUNTRIES = [
  { code: "SK", labelKey: "onboarding.country.sk" },
  { code: "CZ", labelKey: "onboarding.country.cz" },
  { code: "DE", labelKey: "onboarding.country.de" },
  { code: "AT", labelKey: "onboarding.country.at" },
  { code: "CH", labelKey: "onboarding.country.ch" },
  { code: "PL", labelKey: "onboarding.country.pl" },
  { code: "HU", labelKey: "onboarding.country.hu" },
  { code: "OTHER", labelKey: "onboarding.country.other" },
] as const;

const COUNTRY_TIMEZONE: Record<string, string> = {
  SK: "Europe/Bratislava",
  CZ: "Europe/Prague",
  DE: "Europe/Berlin",
  AT: "Europe/Vienna",
  CH: "Europe/Zurich",
  PL: "Europe/Warsaw",
  HU: "Europe/Budapest",
};

export function resolveTimezoneForCountry(countryCode: string): string {
  if (countryCode && COUNTRY_TIMEZONE[countryCode]) {
    return COUNTRY_TIMEZONE[countryCode];
  }
  if (typeof Intl !== "undefined") {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/Bratislava";
  }
  return "Europe/Bratislava";
}

export function recommendPlanForTeamSize(band: TeamSizeBand): BusinessPlanCode {
  switch (band) {
    case "1-5":
      return "business_starter";
    case "6-15":
      return "business_team";
    case "16-30":
      return "business_company";
    case "31+":
      return "business_enterprise";
    default:
      return "business_starter";
  }
}

export function planSeatLimit(planCode: BusinessPlanCode): number {
  switch (planCode) {
    case "business_starter":
      return 5;
    case "business_team":
      return 15;
    case "business_company":
      return 30;
    case "business_enterprise":
      return 31;
    default:
      return 5;
  }
}

export function legacyOrgPlan(planCode: BusinessPlanCode): "TEAM_5" | "TEAM_15" | "TEAM_30" {
  switch (planCode) {
    case "business_team":
      return "TEAM_15";
    case "business_company":
    case "business_enterprise":
      return "TEAM_30";
    default:
      return "TEAM_5";
  }
}
