"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n/I18nContext";
import {
  BILLING_PLANS,
  createBusinessCheckoutSession,
  updateBusinessOrderPlan,
  type BillingPeriod,
  type BusinessPlanCode,
} from "@/services/business/businessPaymentsService";
import { Loader2 } from "lucide-react";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orgId: string;
  orderId: string | null;
  currentPlanCode?: BusinessPlanCode | string | null;
  currentBillingPeriod?: BillingPeriod | string | null;
  onUpdated: () => void;
};

export function BillingPlanUpgradeDialog({
  open,
  onOpenChange,
  orgId,
  orderId,
  currentPlanCode,
  currentBillingPeriod,
  onUpdated,
}: Props) {
  const { t } = useI18n();
  const [selectedPlanCode, setSelectedPlanCode] = useState<BusinessPlanCode>(
    (currentPlanCode as BusinessPlanCode) ?? "business_starter"
  );
  const [billingPeriod, setBillingPeriod] = useState<BillingPeriod>(
    currentBillingPeriod === "yearly" ? "yearly" : "monthly"
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async () => {
    if (!orderId?.trim()) {
      setError(t("billing.upgradeNoOrder"));
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await updateBusinessOrderPlan({
        orgId,
        orderId: orderId.trim(),
        planCode: selectedPlanCode,
        billingPeriod,
      });
      const checkout = await createBusinessCheckoutSession({ orgId, orderId: orderId.trim() });
      if (checkout.checkoutUrl) {
        window.location.href = checkout.checkoutUrl;
        return;
      }
      onUpdated();
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("billing.upgradeFailed"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-md overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("billing.upgradeDialogTitle")}</DialogTitle>
          <p className="text-sm text-muted-foreground">{t("billing.upgradeDialogSubtitle")}</p>
        </DialogHeader>

        <div className="flex gap-2">
          {(["monthly", "yearly"] as BillingPeriod[]).map((period) => (
            <Button
              key={period}
              type="button"
              variant={billingPeriod === period ? "default" : "outline"}
              size="sm"
              className={billingPeriod === period ? "bg-[#1D376A] hover:bg-[#1D376A]/90" : ""}
              onClick={() => setBillingPeriod(period)}
            >
              {period === "yearly" ? t("billing.billingYearly") : t("billing.billingMonthly")}
            </Button>
          ))}
        </div>

        <div className="space-y-2">
          {BILLING_PLANS.map((plan) => {
            const selected = plan.planCode === selectedPlanCode;
            const price = billingPeriod === "yearly" ? plan.yearlyPrice : plan.monthlyPrice;
            return (
              <button
                key={plan.planCode}
                type="button"
                onClick={() => setSelectedPlanCode(plan.planCode)}
                className={cn(
                  "w-full rounded-lg border p-4 text-left transition-colors",
                  selected ? "border-[#e06737] bg-[#e06737]/5" : "border-border"
                )}
              >
                <p className="font-semibold">{t(plan.titleKey)}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {t("billing.planSeats", { count: plan.seatsIncluded })}
                </p>
                <p className="text-sm font-medium mt-2">
                  {billingPeriod === "yearly"
                    ? t("billing.yearlyPrice", { price: String(price) })
                    : t("billing.monthlyPrice", { price: String(price) })}
                </p>
              </button>
            );
          })}
        </div>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button
            type="button"
            className="bg-[#e06737] hover:bg-[#e06737]/90"
            disabled={submitting}
            onClick={() => void onSubmit()}
          >
            {submitting ? <Loader2 className="size-4 animate-spin mr-2" /> : null}
            {t("billing.upgradePlan")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
