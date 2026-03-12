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
import { useAuth } from "@/context/AuthContext";
import { useWorkspace } from "@/context/WorkspaceContext";
import { getOrganization } from "@/lib/organizations";
import { listOrgMembers } from "@/lib/organizations";
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
  const { user } = useAuth();
  const { activeWorkspace } = useWorkspace();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [org, setOrg] = useState<{
    name: string;
    plan: string;
    seatLimit: number;
    trialEndsAt?: number | null;
  } | null>(null);
  const [seatsUsed, setSeatsUsed] = useState(0);

  const isTeam = activeWorkspace?.type === "team";
  const orgId = isTeam ? activeWorkspace?.id : null;

  useEffect(() => {
    if (!orgId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    Promise.all([getOrganization(orgId), listOrgMembers(orgId)])
      .then(([orgSnap, members]) => {
        if (orgSnap) {
          setOrg({
            name: orgSnap.name,
            plan: orgSnap.plan,
            seatLimit: orgSnap.seatLimit,
            trialEndsAt: toTimestampMs(orgSnap.trialEndsAt),
          });
        } else {
          setOrg(null);
        }
        setSeatsUsed(members.filter((m) => m.status === "active").length);
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : "Failed to load");
        setOrg(null);
      })
      .finally(() => setLoading(false));
  }, [orgId]);

  const trialExpired = org?.trialEndsAt ? org.trialEndsAt < Date.now() : false;
  const atSeatLimit = org ? seatsUsed >= org.seatLimit : false;

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

      {(trialExpired || atSeatLimit) && (
        <Card className="border-[#e06737] bg-[#e06737]/10">
          <CardContent className="py-4 flex items-start gap-3">
            <AlertTriangle className="size-5 text-[#e06737] shrink-0 mt-0.5" />
            <div>
              {trialExpired && (
                <p className="font-medium text-[#e06737]">{t("billing.trialExpired")}</p>
              )}
              {atSeatLimit && !trialExpired && (
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
              <p className="font-medium">{org?.plan ?? "-"}</p>
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
              <p className="font-medium">
                {trialExpired ? t("subscription.statusExpired") : t("subscription.statusActive")}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 pt-4">
            <Button variant="default" disabled title={t("billing.upgradeComingSoon")}>
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
    </div>
  );
}
