"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { CompanyProfileSettings } from "@/components/settings/CompanyProfileSettings";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n/I18nContext";

export default function CompanySettingsPage() {
  const { t } = useI18n();

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Link
        href="/app/settings"
        className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "inline-flex gap-1.5 px-0")}
      >
        <ArrowLeft className="size-4" aria-hidden />
        {t("settings.companyProfile.backToSettings")}
      </Link>
      <CompanyProfileSettings />
    </div>
  );
}
