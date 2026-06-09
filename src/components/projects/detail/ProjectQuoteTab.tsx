"use client";

import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import type { ProjectDoc, TaskDoc } from "@/lib/projects";
import type { QuoteDraftItemDoc } from "@/lib/quoteDraftItems";
import { computeQuoteSummary, formatMoney } from "@/lib/projectDashboard";
import { isDraftJob } from "@/lib/projectLifecycle";
import { useI18n } from "@/i18n/I18nContext";
import { cn } from "@/lib/utils";

type ProjectQuoteTabProps = {
  project: ProjectDoc;
  quoteItems: QuoteDraftItemDoc[];
  tasks: TaskDoc[];
};

export function ProjectQuoteTab({ project, quoteItems, tasks }: ProjectQuoteTabProps) {
  const { t } = useI18n();
  const summary = computeQuoteSummary(project, quoteItems, tasks);
  const isSales = isDraftJob(project);
  const setupHref = `/app/projects/${project.id}?setup=ai`;

  return (
    <div className="space-y-4">
      {!summary.hasQuote && isSales ? (
        <Card className="border-[#1D376A]/15">
          <CardContent className="py-8 text-center space-y-4">
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              {t("projects.dashboard.quote.emptyHint")}
            </p>
            <Link
              href={setupHref}
              className={cn(
                buttonVariants({ variant: "default", size: "sm" }),
                "bg-[#e06737] hover:bg-[#c9582f]"
              )}
            >
              {t("projects.dashboard.action.prepareQuote")}
            </Link>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle className="text-base text-[#1D376A]">
            {t("projects.dashboard.quote.title")}
          </CardTitle>
          {isSales ? (
            <Link href={setupHref} className={buttonVariants({ variant: "outline", size: "sm" })}>
              {summary.hasQuote
                ? t("projects.dashboard.action.openQuote")
                : t("projects.dashboard.action.prepareQuote")}
            </Link>
          ) : null}
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">{t("projects.dashboard.quote.status")}</span>
            <span className="text-sm font-medium">
              {t(`projects.dashboard.quoteStatus.${summary.statusKey}`)}
            </span>
          </div>

          {summary.hasQuote ? (
            <dl className="grid gap-3 sm:grid-cols-2 text-sm border-t border-border/60 pt-4">
              <div>
                <dt className="text-muted-foreground">{t("projects.aiSetup.summary.material")}</dt>
                <dd className="font-semibold text-[#1D376A] mt-0.5">
                  {formatMoney(summary.materialTotal)}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">{t("projects.aiSetup.summary.work")}</dt>
                <dd className="font-semibold text-[#1D376A] mt-0.5">
                  {formatMoney(summary.workTotal)}
                </dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-muted-foreground">{t("projects.draft.quoteItem.grandTotal")}</dt>
                <dd className="text-xl font-bold text-[#1D376A] mt-0.5">
                  {summary.grossTotal != null ? formatMoney(summary.grossTotal) : "—"}
                </dd>
              </div>
            </dl>
          ) : (
            <p className="text-sm text-muted-foreground">{t("projects.dashboard.kpi.noQuote")}</p>
          )}

          {quoteItems.length > 0 ? (
            <div className="border-t border-border/60 pt-4">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-2">
                {t("projects.dashboard.quote.lines", { count: quoteItems.length })}
              </p>
              <ul className="space-y-1.5 text-sm max-h-48 overflow-y-auto">
                {quoteItems.slice(0, 12).map((item) => (
                  <li key={item.id} className="flex justify-between gap-2">
                    <span className="truncate">{item.name}</span>
                    <span className="text-muted-foreground shrink-0">
                      {formatMoney(item.qty * item.unitPrice)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {!isSales ? (
        <Card>
          <CardContent className="py-6">
            <p className="text-sm text-muted-foreground">{t("projects.dashboard.quote.deliveryHint")}</p>
            <Link
              href={`/app/projects/${project.id}?tab=expenses`}
              className="inline-block mt-2 text-sm font-medium text-[#e06737] hover:underline"
            >
              {t("projects.tabExpenses")}
            </Link>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
