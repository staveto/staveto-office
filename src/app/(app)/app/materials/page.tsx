"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, Package, RefreshCw } from "lucide-react";
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
import { useI18n } from "@/i18n/I18nContext";
import { useWorkspace } from "@/context/WorkspaceContext";
import { useWorkspaceProduct } from "@/hooks/useWorkspaceProduct";
import { isCompanyWorkspaceType } from "@/types/workspace";
import {
  formatBusinessMaterialCurrencyTotals,
  getBusinessMaterialsOverview,
  type BusinessMaterialsOverview,
} from "@/services/materials";

function categoryLabel(t: (k: string) => string, category: string): string {
  const key = `materials.category.${category}`;
  const v = t(key);
  return v === key ? category : v;
}

export default function MaterialsOverviewPage() {
  const { t } = useI18n();
  const { activeWorkspace } = useWorkspace();
  const { isCompany, canManage, isField } = useWorkspaceProduct();
  const [overview, setOverview] = useState<BusinessMaterialsOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const orgId = isCompanyWorkspaceType(activeWorkspace?.type ?? "personal")
    ? activeWorkspace?.orgId?.trim()
    : undefined;

  const load = useCallback(async () => {
    if (!orgId) {
      setOverview(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await getBusinessMaterialsOverview(orgId);
      setOverview(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("materials.overview.loadError"));
      setOverview(null);
    } finally {
      setLoading(false);
    }
  }, [orgId, t]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!isCompany || !orgId) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          {t("materials.overview.companyOnly")}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold">{t("materials.overview.title")}</h2>
          <p className="text-sm text-muted-foreground">{t("materials.overview.subtitle")}</p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
          <RefreshCw className={`size-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          {t("common.refresh")}
        </Button>
      </div>

      {loading && !overview ? (
        <div className="flex justify-center py-16">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : error ? (
        <Card className="border-destructive/50">
          <CardContent className="py-8 text-center text-destructive">{error}</CardContent>
        </Card>
      ) : overview ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {t("materials.overview.totalSpend")}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xl font-semibold">
                  {formatBusinessMaterialCurrencyTotals(overview.totalsByCurrency)}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {t("materials.overview.usedItems")}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xl font-semibold">{overview.usedItemCount}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {t("materials.overview.pendingSuggestions")}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xl font-semibold">{overview.pendingSuggestedCount}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {t("materials.overview.projectsWithMaterials")}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xl font-semibold">{overview.projectsWithMaterialsCount}</p>
              </CardContent>
            </Card>
          </div>

          {overview.projectSummaries.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Package className="size-4" />
                  {t("materials.overview.topProjects")}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("estimates.titleCol")}</TableHead>
                      <TableHead>{t("materials.overview.usedItems")}</TableHead>
                      <TableHead>{t("materials.overview.pendingSuggestions")}</TableHead>
                      <TableHead>{t("materials.materialTotal")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {overview.projectSummaries.map((p) => (
                      <TableRow key={p.projectId}>
                        <TableCell>
                          <Link
                            href={`/app/projects/${p.projectId}?tab=materials`}
                            className="font-medium hover:underline text-[#1D376A]"
                          >
                            {p.projectName}
                          </Link>
                        </TableCell>
                        <TableCell>{p.usedItemCount}</TableCell>
                        <TableCell>{p.suggestedItemCount}</TableCell>
                        <TableCell>{formatBusinessMaterialCurrencyTotals(p.totalsByCurrency)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {(overview.categorySummaries.length > 0 || overview.supplierSummaries.length > 0) && (
            <div className="grid gap-6 lg:grid-cols-2">
              {overview.categorySummaries.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">{t("materials.overview.topCategories")}</CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>{t("materials.category")}</TableHead>
                          <TableHead>{t("materials.overview.usedItems")}</TableHead>
                          <TableHead>{t("materials.materialTotal")}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {overview.categorySummaries.map((c) => (
                          <TableRow key={c.category}>
                            <TableCell>{categoryLabel(t, c.category)}</TableCell>
                            <TableCell>{c.usedItemCount}</TableCell>
                            <TableCell>{formatBusinessMaterialCurrencyTotals(c.totalsByCurrency)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              )}
              {overview.supplierSummaries.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">{t("materials.overview.topSuppliers")}</CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>{t("materials.supplier")}</TableHead>
                          <TableHead>{t("materials.overview.usedItems")}</TableHead>
                          <TableHead>{t("materials.materialTotal")}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {overview.supplierSummaries.map((s) => (
                          <TableRow key={s.supplierName}>
                            <TableCell>{s.supplierName}</TableCell>
                            <TableCell>{s.usedItemCount}</TableCell>
                            <TableCell>{formatBusinessMaterialCurrencyTotals(s.totalsByCurrency)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              )}
            </div>
          )}

          {overview.usedItemCount === 0 && overview.pendingSuggestedCount === 0 && (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                {t("materials.overview.empty")}
              </CardContent>
            </Card>
          )}

          {isField && !canManage && (
            <p className="text-xs text-muted-foreground">{t("materials.overview.readOnlyHint")}</p>
          )}
        </>
      ) : null}
    </div>
  );
}
