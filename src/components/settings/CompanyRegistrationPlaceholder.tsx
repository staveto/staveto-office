"use client";

import Link from "next/link";
import { Building2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n/I18nContext";
import { useWorkspace } from "@/context/WorkspaceContext";
import { isCompanyWorkspaceType } from "@/types/workspace";
import { BUSINESS_CREATE_ROUTE } from "@/services/onboarding";
import { settingsAccentIconClassName, settingsHighlightCardClassName } from "./settingsStyles";

export function CompanyRegistrationPlaceholder() {
  const { t } = useI18n();
  const { availableWorkspaces } = useWorkspace();

  const hasCompanyWorkspace = availableWorkspaces.some((w) =>
    isCompanyWorkspaceType(w.type)
  );

  if (hasCompanyWorkspace) return null;

  return (
    <Card className={settingsHighlightCardClassName}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Building2 className={cn("size-4", settingsAccentIconClassName)} aria-hidden />
          {t("business.create.title")}
        </CardTitle>
        <CardDescription>{t("business.create.subtitle")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground leading-relaxed">
          {t("business.create.body")}
        </p>
        <Link
          href={BUSINESS_CREATE_ROUTE}
          className={cn(
            buttonVariants({ size: "sm" }),
            "bg-[#e06737] text-white hover:bg-[#c95a30]"
          )}
        >
          {t("business.create.cta")}
        </Link>
      </CardContent>
    </Card>
  );
}
