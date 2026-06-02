"use client";

import Link from "next/link";
import { useWorkspace } from "@/context/WorkspaceContext";
import { useI18n } from "@/i18n/I18nContext";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getAppEntryUrl } from "@/services/tenant/tenantResolver";

export function TenantGate({ children }: { children: React.ReactNode }) {
  const { tenant } = useWorkspace();
  const { t } = useI18n();

  if (!tenant || tenant.mode !== "tenant") {
    return <>{children}</>;
  }

  if (tenant.status === "not_found") {
    return (
      <div className="flex min-h-[60vh] items-center justify-center p-6">
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle>{t("tenant.notFoundTitle")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {t("tenant.notFoundBody", { slug: tenant.slug ?? "" })}
            </p>
            <Link
              href={getAppEntryUrl()}
              className={cn(buttonVariants({ size: "lg" }), "inline-flex")}
            >
              {t("tenant.goToApp")}
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (tenant.status === "access_denied") {
    return (
      <div className="flex min-h-[60vh] items-center justify-center p-6">
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle>{t("tenant.accessDeniedTitle")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {t("tenant.accessDeniedBody", {
                slug: tenant.slug ?? "",
                name: tenant.organizationName ?? "",
              })}
            </p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Link
                href="/join"
                className={cn(buttonVariants({ size: "lg" }), "inline-flex justify-center")}
              >
                {t("tenant.joinInvite")}
              </Link>
              <Link
                href={getAppEntryUrl()}
                className={cn(
                  buttonVariants({ variant: "outline", size: "lg" }),
                  "inline-flex justify-center"
                )}
              >
                {t("tenant.goToApp")}
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return <>{children}</>;
}
