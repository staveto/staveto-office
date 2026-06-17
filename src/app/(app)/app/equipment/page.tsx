"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Loader2, Plus, RefreshCw, Wrench } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useI18n } from "@/i18n/I18nContext";
import { useAuth } from "@/context/AuthContext";
import { listMyEquipment, type UserEquipmentDoc } from "@/services/equipment";
import { EquipmentKpiCards } from "@/components/equipment/EquipmentKpiCards";
import { EquipmentListItem } from "@/components/equipment/EquipmentListItem";
import { EquipmentListToolbar } from "@/components/equipment/EquipmentListToolbar";
import {
  computeEquipmentFilterCounts,
  computeEquipmentStats,
  equipmentMatchesSearch,
  type EquipmentFilterKey,
} from "@/components/equipment/equipmentUtils";
import { cn } from "@/lib/utils";

export default function EquipmentListPage() {
  const { t } = useI18n();
  const { user } = useAuth();
  const [items, setItems] = useState<UserEquipmentDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<EquipmentFilterKey>("all");
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    setError(null);
    try {
      const list = await listMyEquipment({ status: "all" });
      setItems(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("equipment.loadError"));
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [user?.id, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const stats = useMemo(() => computeEquipmentStats(items), [items]);
  const filterCounts = useMemo(
    () => computeEquipmentFilterCounts(items, search),
    [items, search]
  );

  const filtered = useMemo(() => {
    return items.filter((row) => {
      if (filter !== "all" && row.status !== filter) return false;
      return equipmentMatchesSearch(row, search);
    });
  }, [items, filter, search]);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight text-[#0F2A4D]">
            {t("equipmentTab.listIntroTitle")}
          </h1>
          <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
            {t("equipmentTab.listIntroSubtitle")}
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={cn("mr-2 size-4", loading && "animate-spin")} />
            {t("common.refresh")}
          </Button>
          <Link href="/app/equipment/new" className={buttonVariants({ size: "sm" })}>
            <Plus className="mr-2 size-4" />
            {t("equipment.add")}
          </Link>
        </div>
      </div>

      {!loading && items.length > 0 && (
        <EquipmentKpiCards
          total={stats.total}
          assigned={stats.assigned}
          inService={stats.inService}
          activeFilter={filter}
          onFilterChange={setFilter}
        />
      )}

      {!loading && items.length > 0 && (
        <EquipmentListToolbar
          search={search}
          onSearchChange={setSearch}
          filter={filter}
          onFilterChange={setFilter}
          filterCounts={filterCounts}
          shownCount={filtered.length}
          totalCount={items.length}
        />
      )}

      {loading && items.length === 0 ? (
        <div className="flex justify-center py-20">
          <Loader2 className="size-7 animate-spin text-muted-foreground" />
        </div>
      ) : error ? (
        <Card className="border-destructive/50">
          <CardContent className="py-10 text-center text-destructive">{error}</CardContent>
        </Card>
      ) : filtered.length === 0 ? (
        <Card className="overflow-hidden border-[#E2E8F0] shadow-sm">
          <CardContent className="py-14 text-center">
            <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-2xl bg-[#F8FAFC]">
              <Wrench className="size-8 text-[#94A3B8]" />
            </div>
            <p className="text-base font-medium text-[#0F2A4D]">
              {items.length === 0 ? t("equipment.empty") : t("equipmentTab.emptySearch")}
            </p>
            {items.length === 0 && (
              <Link
                href="/app/equipment/new"
                className={buttonVariants({ size: "sm" }) + " mt-5 inline-flex"}
              >
                <Plus className="mr-2 size-4" />
                {t("equipment.add")}
              </Link>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {filtered.map((item) => (
            <EquipmentListItem key={item.id} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}
