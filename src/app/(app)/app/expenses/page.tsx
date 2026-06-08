"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Download, Loader2, Plus, Receipt, RefreshCw } from "lucide-react";
import { useI18n } from "@/i18n/I18nContext";
import { useAuth } from "@/context/AuthContext";
import { useWorkspace } from "@/context/WorkspaceContext";
import { useWorkspaceProduct } from "@/hooks/useWorkspaceProduct";
import { useEnabledModules } from "@/context/EnabledModulesContext";
import { isModuleEnabled } from "@/lib/enabledModules";
import { buttonVariants } from "@/components/ui/button";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatMoney } from "@/lib/format";
import {
  FirestoreIndexError,
  listExpensesForWorkspace,
  filterExpensesByRange,
  buildExpensesKpiCsv,
  downloadCsvFile,
  getRangeLabelKey,
  canWriteExpenses,
  type ExpenseRangeKey,
  type ExpenseProjectFilter,
  type ExpenseExportRow,
} from "@/lib/expenses";

const RANGE_KEYS: ExpenseRangeKey[] = ["today", "7d", "30d", "month"];
const PROJECT_FILTERS: ExpenseProjectFilter[] = ["all", "mine", "shared"];

type ProjectRow = {
  projectId: string;
  projectName: string;
  totalAmount: number;
  travelAmount: number;
  otherAmount: number;
  isShared: boolean;
};

export default function ExpensesOverviewPage() {
  const { t } = useI18n();
  const { user } = useAuth();
  const { activeWorkspace } = useWorkspace();
  const { isCompany, role } = useWorkspaceProduct();
  const { modules } = useEnabledModules();

  const [rangeKey, setRangeKey] = useState<ExpenseRangeKey>("30d");
  const [projectFilter, setProjectFilter] = useState<ExpenseProjectFilter>("all");
  const [bundles, setBundles] = useState<Awaited<ReturnType<typeof listExpensesForWorkspace>>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const moduleEnabled = isCompany ? isModuleEnabled(modules, "expenses") : true;
  const canAdd = canWriteExpenses(role);

  const load = useCallback(async () => {
    if (!user?.id || !activeWorkspace) {
      setBundles([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await listExpensesForWorkspace(activeWorkspace, user.id);
      setBundles(data);
    } catch (e) {
      setError(e instanceof FirestoreIndexError ? e.message : t("expenses.loadError"));
      setBundles([]);
    } finally {
      setLoading(false);
    }
  }, [user?.id, activeWorkspace, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const projectRows = useMemo((): ProjectRow[] => {
    return bundles.map(({ project, expenses }) => {
      const filtered = filterExpensesByRange(expenses, rangeKey);
      const totalAmount = filtered.reduce((sum, e) => sum + (e.amount ?? 0), 0);
      const travelAmount = filtered
        .filter((e) => e.category === "TRAVEL")
        .reduce((sum, e) => sum + (e.amount ?? 0), 0);
      return {
        projectId: project.id,
        projectName: project.name,
        totalAmount,
        travelAmount,
        otherAmount: totalAmount - travelAmount,
        isShared: project.isSharedToMe === true,
      };
    });
  }, [bundles, rangeKey]);

  const filteredRows = useMemo(() => {
    if (projectFilter === "mine") return projectRows.filter((r) => !r.isShared);
    if (projectFilter === "shared") return projectRows.filter((r) => r.isShared);
    return projectRows;
  }, [projectRows, projectFilter]);

  const totalSum = useMemo(() => filteredRows.reduce((s, r) => s + r.totalAmount, 0), [filteredRows]);
  const travelSum = useMemo(() => filteredRows.reduce((s, r) => s + r.travelAmount, 0), [filteredRows]);
  const otherSum = totalSum - travelSum;

  const rowsWithExpenses = filteredRows.filter((r) => r.totalAmount > 0);

  const handleExport = () => {
    const exportRows: ExpenseExportRow[] = [];
    for (const { project, expenses } of bundles) {
      const passesFilter =
        projectFilter === "all" ||
        (projectFilter === "mine" && !project.isSharedToMe) ||
        (projectFilter === "shared" && project.isSharedToMe);
      if (!passesFilter) continue;

      const filtered = filterExpensesByRange(expenses, rangeKey);
      for (const exp of filtered) {
        exportRows.push({
          projectName: project.name,
          date: exp.date ? exp.date.slice(0, 10) : "",
          title: exp.title,
          amount: exp.amount,
          currency: exp.currency,
          supplierName: exp.supplierName ?? exp.ocrSupplierName,
          category: exp.category,
          note: exp.note,
        });
      }
    }

    if (exportRows.length === 0) {
      alert(t("expensesKpi.noExpensesInPeriod"));
      return;
    }

    const rangeLabel = t(getRangeLabelKey(rangeKey));
    const csv = buildExpensesKpiCsv(exportRows, rangeLabel);
    const fileName = `expenses-${rangeKey}-${new Date().toISOString().slice(0, 10)}.csv`;
    downloadCsvFile(csv, fileName);
  };

  if (isCompany && !moduleEnabled) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          {t("expenses.moduleDisabled")}
        </CardContent>
      </Card>
    );
  }

  if (!isCompany) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          {t("expenses.companyOnly")}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{t("expenses.title")}</h1>
          <p className="text-muted-foreground mt-1">{t("expenses.subtitle")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={`size-4 mr-1 ${loading ? "animate-spin" : ""}`} />
            {t("common.refresh")}
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={handleExport} disabled={loading}>
            <Download className="size-4 mr-1" />
            {t("expensesKpi.export")}
          </Button>
          {canAdd && (
            <Link href="/app/expenses/new" className={buttonVariants({ size: "sm" })}>
              <Plus className="size-4 mr-1" />
              {t("expenses.new")}
            </Link>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {RANGE_KEYS.map((key) => (
          <Button
            key={key}
            type="button"
            size="sm"
            variant={rangeKey === key ? "secondary" : "outline"}
            onClick={() => setRangeKey(key)}
          >
            {t(getRangeLabelKey(key))}
          </Button>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        {PROJECT_FILTERS.map((key) => (
          <Button
            key={key}
            type="button"
            size="sm"
            variant={projectFilter === key ? "secondary" : "ghost"}
            onClick={() => setProjectFilter(key)}
          >
            {t(`expenses.filter.${key}`)}
          </Button>
        ))}
      </div>

      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="size-8 animate-spin text-muted-foreground" />
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-destructive text-sm">
          {error}
        </div>
      )}

      {!loading && !error && (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {t("expenses.total")}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-semibold tabular-nums">{formatMoney(totalSum)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {t("expenses.travel")}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-semibold tabular-nums">{formatMoney(travelSum)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {t("expenses.other")}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-semibold tabular-nums">{formatMoney(otherSum)}</p>
              </CardContent>
            </Card>
          </div>

          {rowsWithExpenses.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-16 px-4">
              <Receipt className="size-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium">{t("expenses.emptyPeriod")}</h3>
              {canAdd && (
                <Link href="/app/expenses/new" className={`${buttonVariants({ variant: "outline" })} mt-4`}>
                  {t("expenses.new")}
                </Link>
              )}
            </div>
          ) : (
            <div className="rounded-xl border border-border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("expenses.colProject")}</TableHead>
                    <TableHead className="text-right">{t("expenses.total")}</TableHead>
                    <TableHead className="text-right hidden sm:table-cell">{t("expenses.travel")}</TableHead>
                    <TableHead className="text-right hidden sm:table-cell">{t("expenses.other")}</TableHead>
                    <TableHead className="w-[80px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rowsWithExpenses.map((row) => (
                    <TableRow key={row.projectId}>
                      <TableCell className="font-medium">
                        {row.projectName}
                        {row.isShared && (
                          <span className="ml-2 text-xs text-muted-foreground">({t("expenses.shared")})</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{formatMoney(row.totalAmount)}</TableCell>
                      <TableCell className="text-right tabular-nums hidden sm:table-cell">
                        {formatMoney(row.travelAmount)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums hidden sm:table-cell">
                        {formatMoney(row.otherAmount)}
                      </TableCell>
                      <TableCell>
                        <Link
                          href={`/app/projects/${row.projectId}?tab=expenses`}
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
        </>
      )}
    </div>
  );
}
