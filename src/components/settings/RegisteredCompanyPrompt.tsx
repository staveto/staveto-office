"use client";

import Link from "next/link";
import { Building2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n/I18nContext";
import { useWorkspace } from "@/context/WorkspaceContext";
import { useWorkspaceProduct } from "@/hooks/useWorkspaceProduct";
import { isCompanyWorkspaceType } from "@/types/workspace";

export function RegisteredCompanyPrompt() {
  const { t } = useI18n();
  const { availableWorkspaces, setActiveWorkspace } = useWorkspace();
  const { isCompany } = useWorkspaceProduct();

  if (isCompany) return null;

  const companyWorkspace = availableWorkspaces.find((w) =>
    isCompanyWorkspaceType(w.type)
  );
  if (!companyWorkspace) return null;

  return (
    <Card className="border-[#1D376A]/15 bg-[#1D376A]/[0.03]">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Building2 className="size-4 text-[#1D376A]" aria-hidden />
          {t("settings.registeredCompany.title")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground leading-relaxed">
          {t("settings.registeredCompany.body", { company: companyWorkspace.name })}
        </p>
        <Button
          type="button"
          className="bg-[#e06737] hover:bg-[#c95a30] text-white"
          onClick={() => setActiveWorkspace(companyWorkspace)}
        >
          {t("settings.registeredCompany.switch")}
        </Button>
        <Link
          href="/app"
          onClick={() => setActiveWorkspace(companyWorkspace)}
          className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "inline-flex")}
        >
          {t("settings.registeredCompany.openOverview")}
        </Link>
      </CardContent>
    </Card>
  );
}
