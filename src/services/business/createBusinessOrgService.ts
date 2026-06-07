import { getCallable } from "@/lib/firebase";
import type {
  BillingPeriod,
  BusinessPlanCode,
  CompanyType,
  TeamSizeBand,
} from "@/lib/onboardingTypes";

export type CreateBusinessOrgInput = {
  companyName: string;
  country: string;
  timezone?: string;
  companyType: CompanyType;
  planCode: BusinessPlanCode;
  billingPeriod: BillingPeriod;
  teamSizeBand?: TeamSizeBand;
};

export type CreateBusinessOrgResponse = {
  orgId: string;
  planCode: string;
  status: string;
  trialEndsAt?: string;
};

/** Calls Cloud Function `createBusinessOrg` — org/member docs are server-only. */
export async function createBusinessOrg(
  _ownerUid: string,
  input: CreateBusinessOrgInput
): Promise<CreateBusinessOrgResponse> {
  const payload = {
    companyName: input.companyName.trim(),
    country: input.country,
    timezone: input.timezone?.trim(),
    companyType: input.companyType,
    planCode: input.planCode,
    billingPeriod: input.billingPeriod,
    teamSizeBand: input.teamSizeBand,
  };

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
