"use client";

import { useAuth } from "@/context/AuthContext";
import { useI18n } from "@/i18n/I18nContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Check } from "lucide-react";

export default function SubscriptionPage() {
  const { user, refreshUser } = useAuth();
  const { t } = useI18n();
  const billing = user?.billing ?? null;

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-semibold">{t("subscription.title")}</h1>
        <p className="text-muted-foreground mt-1">
          {t("subscription.firstLoginTrialMessage")}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("subscription.planSingle")}</CardTitle>
          <CardDescription>{t("subscription.planSingleDescription")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <ul className="space-y-2">
            {["paywall.benefit1", "paywall.benefit2", "paywall.benefit3", "paywall.benefit4"].map(
              (key) => (
                <li key={key} className="flex items-center gap-2">
                  <Check className="size-4 text-primary" />
                  <span>{t(key)}</span>
                </li>
              )
            )}
          </ul>

          {billing ? (
            <div className="rounded-lg border p-4 space-y-2">
              <p className="font-medium">
                {billing.isPro
                  ? t("subscription.proActive")
                  : billing.status === "trial"
                  ? t("subscription.statusTrial")
                  : t("subscription.statusExpired")}
              </p>
              {billing.status === "trial" && !billing.isPro && (
                <p className="text-sm text-muted-foreground">
                  {t("subscription.trialRemainingDays", {
                    count: billing.remainingTrialDays,
                  })}
                </p>
              )}
              {billing.isPro && billing.currentPeriodEndAt && (
                <p className="text-sm text-muted-foreground">
                  {t("subscription.renewsAt", {
                    date: new Date(billing.currentPeriodEndAt).toLocaleDateString(),
                  })}
                </p>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
          )}

          <Button
            variant="outline"
            onClick={() => refreshUser()}
            className="w-full"
          >
            {t("common.refresh")}
          </Button>

          <p className="text-xs text-muted-foreground">
            {t("subscription.webNote")}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
