"use client";

import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useI18n } from "@/i18n/I18nContext";
import { Mail, FileText, FolderKanban } from "lucide-react";

export default function HelpPage() {
  const { t } = useI18n();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{t("help.title")}</h1>
        <p className="mt-1 text-muted-foreground">{t("help.subtitle")}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <FileText className="size-4 text-primary" />
            {t("help.faqTitle")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <h3 className="font-medium text-foreground">{t("help.faq1q")}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{t("help.faq1a")}</p>
          </div>
          <div>
            <h3 className="font-medium text-foreground">{t("help.faq2q")}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{t("help.faq2a")}</p>
          </div>
          <div>
            <h3 className="font-medium text-foreground">{t("help.faq3q")}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{t("help.faq3a")}</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Mail className="size-4 text-primary" />
            {t("help.contactTitle")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">{t("help.contactText")}</p>
          <a
            href="mailto:support@staveto.com"
            className="mt-2 inline-block text-sm font-medium text-primary hover:underline"
          >
            support@staveto.com
          </a>
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-4">
        <Link
          href="/estimates"
          className="flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium hover:bg-muted"
        >
          <FileText className="size-4" />
          {t("nav.estimates")}
        </Link>
        <Link
          href="/app/projects"
          className="flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium hover:bg-muted"
        >
          <FolderKanban className="size-4" />
          {t("nav.projects")}
        </Link>
      </div>
    </div>
  );
}
