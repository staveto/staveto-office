"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import Link from "next/link";
import { CheckCircle2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n/I18nContext";
import { useAuth } from "@/context/AuthContext";
import { dismissBusinessSetupChecklist } from "@/services/onboarding";

const CHECKLIST_ITEMS = [
  { key: "invite", href: "/app/members" },
  { key: "project", href: "/app/projects/new" },
  { key: "vehicles", href: "/app/settings" },
  { key: "equipment", href: "/app/settings" },
  { key: "invoices", href: "/app/settings" },
] as const;

export function BusinessSetupChecklist() {
  const { t } = useI18n();
  const { user, refreshUser } = useAuth();

  const dismiss = async () => {
    if (!user?.id) return;
    await dismissBusinessSetupChecklist(user.id);
    await refreshUser();
  };

  return (
    <Card className="border-[#1D376A]/20 bg-gradient-to-r from-[#1D376A]/[0.06] to-transparent">
      <CardHeader className="flex flex-row items-start justify-between gap-2 pb-2">
        <div>
          <CardTitle className="text-base text-[#1D376A]">
            {t("onboarding.businessChecklist.title")}
          </CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("onboarding.businessChecklist.subtitle")}
          </p>
        </div>
        <Button type="button" variant="ghost" size="icon" onClick={() => void dismiss()}>
          <X className="size-4" aria-hidden />
          <span className="sr-only">{t("onboarding.businessChecklist.dismiss")}</span>
        </Button>
      </CardHeader>
      <CardContent>
        <ul className="space-y-2">
          {CHECKLIST_ITEMS.map((item) => (
            <li key={item.key}>
              <Link
                href={item.href}
                className={cn(
                  buttonVariants({ variant: "outline", size: "sm" }),
                  "w-full justify-start gap-2 border-[#1D376A]/15"
                )}
              >
                <CheckCircle2 className="size-4 shrink-0 text-[#1D376A]/60" aria-hidden />
                {t(`onboarding.businessChecklist.item.${item.key}`)}
              </Link>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
