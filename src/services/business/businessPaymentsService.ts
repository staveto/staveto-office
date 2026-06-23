import { getCallable } from "@/lib/firebase";

export type BusinessPlanCode = "business_starter" | "business_team" | "business_company";
export type BillingPeriod = "monthly" | "yearly";

export type CreateBusinessCheckoutSessionInput = {
  orgId: string;
  orderId: string;
};

export type CreateBusinessCheckoutSessionResult = {
  checkoutUrl: string;
};

export type UpdateBusinessOrderPlanInput = {
  orgId: string;
  orderId: string;
  planCode: BusinessPlanCode;
  billingPeriod: BillingPeriod;
};

export type UpdateBusinessOrderPlanResult = {
  ok: true;
  planCode: BusinessPlanCode;
  billingPeriod: BillingPeriod;
  requestedSeats: number;
};

export async function createBusinessCheckoutSession(
  input: CreateBusinessCheckoutSessionInput
): Promise<CreateBusinessCheckoutSessionResult> {
  const callable = getCallable<
    CreateBusinessCheckoutSessionInput,
    CreateBusinessCheckoutSessionResult
  >("createBusinessCheckoutSession", { timeoutMs: 15_000 });
  const res = await callable(input);
  const data = res.data;
  if (!data?.checkoutUrl) {
    throw new Error("Invalid checkout session response.");
  }
  return data;
}

export async function updateBusinessOrderPlan(
  input: UpdateBusinessOrderPlanInput
): Promise<UpdateBusinessOrderPlanResult> {
  const callable = getCallable<UpdateBusinessOrderPlanInput, UpdateBusinessOrderPlanResult>(
    "updateBusinessOrderPlan",
    { timeoutMs: 15_000 }
  );
  const res = await callable(input);
  const data = res.data;
  if (!data?.ok) {
    throw new Error("Invalid update plan response.");
  }
  return data;
}

export const BILLING_PLANS: Array<{
  planCode: BusinessPlanCode;
  titleKey: string;
  seatsIncluded: number;
  monthlyPrice: number;
  yearlyPrice: number;
}> = [
  {
    planCode: "business_starter",
    titleKey: "billing.plans.starter",
    seatsIncluded: 5,
    monthlyPrice: 149,
    yearlyPrice: 1490,
  },
  {
    planCode: "business_team",
    titleKey: "billing.plans.team",
    seatsIncluded: 15,
    monthlyPrice: 329,
    yearlyPrice: 3290,
  },
  {
    planCode: "business_company",
    titleKey: "billing.plans.company",
    seatsIncluded: 30,
    monthlyPrice: 649,
    yearlyPrice: 6490,
  },
];
