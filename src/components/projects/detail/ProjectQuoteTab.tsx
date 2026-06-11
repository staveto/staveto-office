"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { FileText, Pencil, Printer } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { ProjectDoc, TaskDoc } from "@/lib/projects";
import type { QuoteDraftItemDoc } from "@/lib/quoteDraftItems";
import { computeQuoteSummary, formatMoney } from "@/lib/projectDashboard";
import { isDraftJob } from "@/lib/projectLifecycle";
import { buildProjectQuoteDisplayLines } from "@/lib/projectQuoteDraft";
import { listMaterialSuggestions } from "@/services/materials/projectMaterialsService";
import type { MaterialSuggestionDoc } from "@/services/materials/types";
import { useI18n } from "@/i18n/I18nContext";
import { cn } from "@/lib/utils";

type ProjectQuoteTabProps = {
  project: ProjectDoc;
  quoteItems: QuoteDraftItemDoc[];
  tasks: TaskDoc[];
};

export function ProjectQuoteTab({ project, quoteItems, tasks }: ProjectQuoteTabProps) {
  const { t } = useI18n();
  const [suggestions, setSuggestions] = useState<MaterialSuggestionDoc[]>([]);

  useEffect(() => {
    let cancelled = false;
    void listMaterialSuggestions(project.id)
      .then((rows) => {
        if (!cancelled) setSuggestions(rows);
      })
      .catch(() => {
        if (!cancelled) setSuggestions([]);
      });
    return () => {
      cancelled = true;
    };
  }, [project.id]);

  const summary = computeQuoteSummary(project, quoteItems, tasks);
  const displayLines = useMemo(
    () => buildProjectQuoteDisplayLines(project, quoteItems, tasks, suggestions),
    [project, quoteItems, tasks, suggestions]
  );
  const isSales = isDraftJob(project);
  const setupHref = `/app/projects/${project.id}?setup=ai`;
  const printHref = `/app/projects/${project.id}/print?from=quote`;

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
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="text-base text-[#1D376A]">
            {t("projects.dashboard.quote.title")}
          </CardTitle>
          {summary.hasQuote ? (
            <div className="flex flex-wrap gap-2">
              <Link
                href={printHref}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(
                  buttonVariants({ variant: "default", size: "sm" }),
                  "bg-[#1D376A] hover:bg-[#1D376A]/90"
                )}
              >
                <Printer className="size-4 mr-1.5" />
                {t("projects.dashboard.quote.viewPdf")}
              </Link>
              {isSales ? (
                <Link href={setupHref} className={buttonVariants({ variant: "outline", size: "sm" })}>
                  <Pencil className="size-4 mr-1.5" />
                  {t("projects.dashboard.action.openQuote")}
                </Link>
              ) : null}
            </div>
          ) : isSales ? (
            <Link href={setupHref} className={buttonVariants({ variant: "outline", size: "sm" })}>
              {t("projects.dashboard.action.prepareQuote")}
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
            <dl className="grid gap-3 sm:grid-cols-3 text-sm border-t border-border/60 pt-4">
              <div>
                <dt className="text-muted-foreground">{t("projects.aiSetup.summary.material")}</dt>
                <dd className="font-semibold text-[#1D376A] mt-0.5 tabular-nums">
                  {formatMoney(summary.materialTotal)}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">{t("projects.aiSetup.summary.work")}</dt>
                <dd className="font-semibold text-[#1D376A] mt-0.5 tabular-nums">
                  {formatMoney(summary.workTotal)}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">{t("projects.draft.quoteItem.grandTotal")}</dt>
                <dd className="text-xl font-bold text-[#1D376A] mt-0.5 tabular-nums">
                  {summary.grossTotal != null ? formatMoney(summary.grossTotal) : "—"}
                </dd>
              </div>
            </dl>
          ) : (
            <p className="text-sm text-muted-foreground">{t("projects.dashboard.kpi.noQuote")}</p>
          )}

          {displayLines.length > 0 ? (
            <div className="border-t border-border/60 pt-4 space-y-3">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {t("projects.dashboard.quote.lines", { count: String(displayLines.length) })}
              </p>
              <div className="rounded-lg border border-border/70 overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40 hover:bg-muted/40">
                      <TableHead>{t("quotes.print.colDescription")}</TableHead>
                      <TableHead className="w-[72px] text-right">{t("quotes.print.colQty")}</TableHead>
                      <TableHead className="w-[64px]">{t("quotes.print.colUnit")}</TableHead>
                      <TableHead className="w-[100px] text-right">{t("quotes.print.colUnitPrice")}</TableHead>
                      <TableHead className="w-[100px] text-right">{t("projects.dashboard.quote.colLineTotal")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {displayLines.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell className="font-medium text-[#1D376A] max-w-[280px]">
                          <span className="line-clamp-2">{item.name}</span>
                          {item.category === "work" ? (
                            <span className="ml-1.5 text-xs text-muted-foreground font-normal">
                              ({t("projects.aiSetup.quote.work")})
                            </span>
                          ) : null}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{item.qty}</TableCell>
                        <TableCell className="text-muted-foreground">{item.unit}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatMoney(item.unitPrice)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums font-medium">
                          {formatMoney(item.lineTotal)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                <FileText className="size-3.5 shrink-0" />
                {t("projects.dashboard.quote.pdfHint")}
              </p>
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
