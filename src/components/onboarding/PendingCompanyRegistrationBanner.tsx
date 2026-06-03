"use client";

import Link from "next/link";
import { Building2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n/I18nContext";
import { COMPANY_REGISTRATION_ROUTE } from "@/services/onboarding";

export function PendingCompanyRegistrationBanner() {
  const { t } = useI18n();

  return (
    <Card className="border-[#1D376A]/20 bg-gradient-to-r from-[#1D376A]/[0.06] to-transparent shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base text-[#1D376A]">
          <Building2 className="size-5 shrink-0" aria-hidden />
          {t("onboarding.pendingCompany.title")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground leading-relaxed">
          {t("onboarding.pendingCompany.body")}
        </p>
        <p className="text-xs text-muted-foreground">
          {t("onboarding.path.companyOwner.nextStepHint")}
        </p>
        <Link
          href={COMPANY_REGISTRATION_ROUTE}
          className={cn(
            buttonVariants({ size: "default" }),
            "bg-[#e06737] text-white hover:bg-[#c95a30]"
          )}
        >
          {t("onboarding.pendingCompany.cta")}
        </Link>
      </CardContent>
    </Card>
  );
}
