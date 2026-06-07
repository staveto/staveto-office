"use client";

import Link from "next/link";
import { Building2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n/I18nContext";

export default function BusinessCreatePage() {
  const { t } = useI18n();

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Card className="border-[#1D376A]/15">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-[#1D376A]">
            <Building2 className="size-5" aria-hidden />
            {t("business.create.title")}
          </CardTitle>
          <CardDescription>{t("business.create.subtitle")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground leading-relaxed">
            {t("business.create.body")}
          </p>
          <p className="rounded-lg border border-[#1D376A]/15 bg-[#1D376A]/[0.04] px-3 py-2 text-xs text-muted-foreground">
            {t("business.create.nextStepHint")}
          </p>
          <Link
            href="/app/settings"
            className={cn(buttonVariants({ variant: "outline" }), "inline-flex")}
          >
            {t("business.create.settingsLink")}
          </Link>
          <Link
            href="/app"
            className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "inline-flex ml-2")}
          >
            {t("business.create.backToApp")}
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
