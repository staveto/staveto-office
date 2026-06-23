"use client";

import { useEffect, useState } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { useI18n } from "@/i18n/I18nContext";
import { useWorkspace } from "@/context/WorkspaceContext";
import { isCompanyWorkspaceType } from "@/types/workspace";
import { getOrganization, listOrgMembers } from "@/lib/organizations";
import { BillingPlanUpgradeDialog } from "@/components/billing/BillingPlanUpgradeDialog";
import type { BillingPeriod, BusinessPlanCode } from "@/services/business/businessPaymentsService";
import { CreditCard, Loader2, AlertTriangle, Mail } from "lucide-react";

function toTimestampMs(raw: unknown): number | null {
  if (!raw) return null;
  if (typeof raw === "object" && raw !== null && "toDate" in raw) {
    return (raw as { toDate: () => Date }).toDate().getTime();
  }
  return null;
}

export default function BillingPage() {
  const { t } = useI18n();
  const { activeWorkspace } = useWorkspace();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [org, setOrg] = useState<{
    name: string;
    plan: string;
    planCode?: string;
    seatLimit: number;
    trialEndsAt?: number | null;
    status?: string;
    activeBusinessOrderId?: string;
    billingPeriod?: string;
  } | null>(null);
  const [seatsUsed, setSeatsUsed] = useState(0);
  const [upgradeOpen, setUpgradeOpen] = useState(false);

  const isTeam = isCompanyWorkspaceType(activeWorkspace?.type);
  const orgId = isTeam ? (activeWorkspace?.orgId ?? activeWorkspace?.id ?? null) : null;

  const [nowMs] = useState(() => Date.now());

  const reload = async () => {
    if (!orgId) return;
    setLoading(true);
    setError(null);
    try {
      const [orgSnap, members] = await Promise.all([
        getOrganization(orgId),
        listOrgMembers(orgId),
      ]);
      if (orgSnap) {
        setOrg({
          name: orgSnap.name,
          plan: orgSnap.plan,
          planCode: orgSnap.planCode,
          seatLimit: orgSnap.seatLimit,
          trialEndsAt: toTimestampMs(orgSnap.trialEndsAt),
          status: orgSnap.status,
          activeBusinessOrderId: orgSnap.activeBusinessOrderId,
          billingPeriod: orgSnap.billingPeriod,
        });
      } else {
        setOrg(null);
      }
      setSeatsUsed(members.filter((m) => m.status === "active").length);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
      setOrg(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!orgId) {
        if (!cancelled) setLoading(false);
        return;
      }
      await reload();
      if (cancelled) return;
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId]);

  const orgStatus = (org?.status ?? "").toLowerCase();
  const trialExpired = org?.trialEndsAt ? org.trialEndsAt < nowMs : false;
  const atSeatLimit = org ? seatsUsed >= org.seatLimit : false;

  const statusLabel = (() => {
    if (orgStatus === "active") return t("subscription.statusActive");
    if (orgStatus === "trialing") return t("billing.statusTrialing");
    if (orgStatus === "pending_payment") return t("billing.statusPaymentDue");
    if (trialExpired) return t("subscription.statusExpired");
    return t("subscription.statusActive");
  })();

  if (!isTeam) {
    return (
      <div className="space-y-6">
        <h2 className="text-xl font-semibold">{t("nav.billing")}</h2>
        <Card>
          <CardContent className="py-8">
            <p className="text-center text-muted-foreground">
              {t("billing.teamOnly")}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <h2 className="text-xl font-semibold">{t("nav.billing")}</h2>
        <Card>
          <CardContent className="py-12 flex justify-center">
            <Loader2 className="size-8 animate-spin text-muted-foreground" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <h2 className="text-xl font-semibold">{t("nav.billing")}</h2>
        <Card>
          <CardContent className="py-6">
            <p className="text-destructive">{error}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold">{t("nav.billing")}</h2>

      {(trialExpired || atSeatLimit || orgStatus === "pending_payment") && (
        <Card className="border-[#e06737] bg-[#e06737]/10">
          <CardContent className="py-4 flex items-start gap-3">
            <AlertTriangle className="size-5 text-[#e06737] shrink-0 mt-0.5" />
            <div>
              {trialExpired && (
                <p className="font-medium text-[#e06737]">{t("billing.trialExpired")}</p>
              )}
              {orgStatus === "pending_payment" && !trialExpired && (
                <p className="font-medium text-[#e06737]">{t("billing.statusPaymentDue")}</p>
              )}
              {atSeatLimit && !trialExpired && orgStatus !== "pending_payment" && (
                <p className="font-medium text-[#e06737]">{t("billing.seatLimitReached")}</p>
              )}
              <p className="text-sm text-muted-foreground mt-1">
                {t("billing.contactSupportHint")}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="size-4" />
            {t("billing.planTitle")}
          </CardTitle>
          <CardDescription>{t("billing.planDescription")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="text-sm text-muted-foreground">{t("billing.plan")}</p>
              <p className="font-medium">{org?.planCode ?? org?.plan ?? "-"}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">{t("billing.seatLimit")}</p>
              <p className="font-medium">{org?.seatLimit ?? "-"}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">{t("billing.seatsUsed")}</p>
              <p className="font-medium">{seatsUsed}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">{t("billing.status")}</p>
              <p className="font-medium">{statusLabel}</p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 pt-4">
            <Button
              variant="default"
              className="bg-[#e06737] hover:bg-[#e06737]/90"
              onClick={() => setUpgradeOpen(true)}
            >
              {t("billing.upgradePlan")}
            </Button>
            <a
              href="mailto:support@staveto.com"
              className={buttonVariants({ variant: "outline" })}
            >
              <Mail className="size-4 mr-2" />
              {t("billing.contactSupport")}
            </a>
          </div>
        </CardContent>
      </Card>

      {orgId ? (
        <BillingPlanUpgradeDialog
          open={upgradeOpen}
          onOpenChange={setUpgradeOpen}
          orgId={orgId}
          orderId={org?.activeBusinessOrderId ?? null}
          currentPlanCode={(org?.planCode as BusinessPlanCode | undefined) ?? null}
          currentBillingPeriod={(org?.billingPeriod as BillingPeriod | undefined) ?? null}
          onUpdated={() => void reload()}
        />
      ) : null}
    </div>
  );
}
