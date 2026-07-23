"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Plus, FileText, Loader2, RefreshCw } from "lucide-react";
import { useI18n } from "@/i18n/I18nContext";
import { useAuth } from "@/context/AuthContext";
import { useWorkspace } from "@/context/WorkspaceContext";
import { buttonVariants } from "@/components/ui/button";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatMoney } from "@/lib/format";
import { listQuotesForWorkspaceEnsured } from "@/services/quotes";
import { QuoteStatusBadge } from "@/components/quotes/QuoteStatusBadge";
import { useSetupChecklistVisit } from "@/hooks/useSetupChecklistVisit";
import { useQuotesAgentScreenSync } from "@/hooks/useManagerAgentScreenSync";
import {
  getQuoteEditorHref,
  projectQuoteTabHref,
} from "@/lib/projectCreationFeature";

export default function QuotesPage() {
  const { t } = useI18n();
  useSetupChecklistVisit("first_offer");
  const { user } = useAuth();
  const { activeWorkspace } = useWorkspace();
  const [quotes, setQuotes] = useState<Awaited<ReturnType<typeof listQuotesForWorkspaceEnsured>>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const workspaceReady = Boolean(user?.id && activeWorkspace);

  const load = async () => {
    if (!user?.id || !activeWorkspace) {
      setQuotes([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const list = await listQuotesForWorkspaceEnsured(activeWorkspace, user.id);
      setQuotes(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("quotes.loadError"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [user?.id, activeWorkspace?.id]);

  useQuotesAgentScreenSync(loading ? null : quotes.length);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{t("quotes.title")}</h1>
          <p className="text-muted-foreground mt-1">{t("quotes.subtitle")}</p>
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void load()}
            disabled={!workspaceReady}
          >
            <RefreshCw className="size-4 mr-1" />
            {t("common.refresh")}
          </Button>
          <Link href="/app/quotes/new" className={buttonVariants()}>
            <Plus className="size-4 mr-2" />
            {t("quotes.new")}
          </Link>
        </div>
      </div>

      {(loading || !workspaceReady) && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="size-8 animate-spin text-muted-foreground" />
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-destructive text-sm">
          {error}
        </div>
      )}

      {workspaceReady && !loading && !error && quotes.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-16 px-4">
          <FileText className="size-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium">{t("quotes.empty")}</h3>
          <p className="text-muted-foreground text-center mt-1 mb-4 max-w-md">
            {t("quotes.emptyHint")}
          </p>
          <Link href="/app/projects" className={buttonVariants({ variant: "outline" })}>
            {t("quotes.goProjects")}
          </Link>
        </div>
      )}

      {workspaceReady && !loading && !error && quotes.length > 0 && (
        <div className="rounded-xl border border-border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("quotes.colTitle")}</TableHead>
                <TableHead>{t("quotes.colClient")}</TableHead>
                <TableHead>{t("quotes.colProject")}</TableHead>
                <TableHead>{t("quotes.colStatus")}</TableHead>
                <TableHead className="text-right">{t("quotes.colTotal")}</TableHead>
                <TableHead className="w-[80px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {quotes.map((q) => (
                <TableRow key={q.id}>
                  <TableCell className="font-medium">
                    <Link
                      href={getQuoteEditorHref(q)}
                      className="hover:underline text-[#1D376A]"
                    >
                      {q.title}
                    </Link>
                  </TableCell>
                  <TableCell>{q.clientName}</TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {q.projectName && q.projectId ? (
                      <Link
                        href={projectQuoteTabHref(q.projectId)}
                        className="hover:underline"
                      >
                        {q.projectName}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell>
                    <QuoteStatusBadge status={q.status} />
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatMoney(q.grandTotal, q.currency || "CHF")}
                  </TableCell>
                  <TableCell>
                    <Link
                      href={getQuoteEditorHref(q)}
                      className={buttonVariants({ variant: "ghost", size: "sm" })}
                    >
                      {t("quotes.view")}
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {process.env.NODE_ENV === "development" && (
        <p className="text-xs text-muted-foreground">
          {t("quotes.legacyNote")}{" "}
          <Link href="/estimates" className="text-[#1D376A] hover:underline">
            {t("quotes.legacyLink")}
          </Link>
        </p>
      )}
    </div>
  );
}
