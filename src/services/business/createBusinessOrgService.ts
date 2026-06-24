import { getCallable } from "@/lib/firebase";
import {
  resolveTimezoneForCountry,
  type BillingPeriod,
  type BusinessPlanCode,
  type CompanyType,
  type TeamSizeBand,
} from "@/lib/onboardingTypes";

export type CreateBusinessOrgInput = {
  companyName: string;
  country: string;
  timezone?: string;
  companyType: CompanyType;
  planCode: BusinessPlanCode;
  billingPeriod: BillingPeriod;
  teamSizeBand?: TeamSizeBand;
  contactName?: string;
};

export type CreateBusinessOrgResponse = {
  orgId: string;
  planCode: string;
  status: string;
  trialEndsAt?: string;
};

function trimOrUndefined(value?: string): string | undefined {
  const trimmed = value?.trim();
  return trimmed || undefined;
}

/** Calls Cloud Function `createBusinessOrg` — org/member docs are server-only. */
export async function createBusinessOrg(
  _ownerUid: string,
  input: CreateBusinessOrgInput
): Promise<CreateBusinessOrgResponse> {
  const companyName = input.companyName.trim();
  if (!companyName) {
    throw new Error("companyName is required.");
  }

  const payload: Record<string, string> = {
    companyName,
    country: input.country.trim(),
    timezone: trimOrUndefined(input.timezone) ?? resolveTimezoneForCountry(input.country),
    companyType: input.companyType,
    planCode: input.planCode,
    billingPeriod: input.billingPeriod,
    source: "web_onboarding",
  };

  const teamSizeBand = trimOrUndefined(input.teamSizeBand);
  if (teamSizeBand) payload.teamSizeBand = teamSizeBand;

  const contactName = trimOrUndefined(input.contactName);
  if (contactName) payload.contactName = contactName;

  const callable = getCallable<typeof payload, CreateBusinessOrgResponse>(
    "createBusinessOrg"
  );
  const res = await callable(payload);
  const data = res?.data;
  if (!data?.orgId) {
    throw new Error("Invalid createBusinessOrg response from server.");
  }
  return data;
}
