"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Loader2, Plus, RefreshCw, Search, Wrench } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { useI18n } from "@/i18n/I18nContext";
import { useAuth } from "@/context/AuthContext";
import { listMyEquipment, type UserEquipmentDoc } from "@/services/equipment";
import { EquipmentKpiCards } from "@/components/equipment/EquipmentKpiCards";
import { EquipmentListItem } from "@/components/equipment/EquipmentListItem";
import {
  computeEquipmentStats,
  equipmentMatchesSearch,
  type EquipmentFilterKey,
  EQUIPMENT_STATUS_FILTERS,
} from "@/components/equipment/equipmentUtils";
import { eqCategoryPill } from "@/components/equipment/equipmentFormStyles";
import { cn } from "@/lib/utils";

const FILTER_LABEL_KEYS: Record<EquipmentFilterKey, string> = {
  all: "equipmentTab.filterAll",
  available: "equipmentTab.filterAvailable",
  assigned: "equipmentTab.filterAssigned",
  in_service: "equipmentTab.filterInService",
  inactive: "equipmentTab.status.inactive",
};

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

  const filtered = useMemo(() => {
    return items.filter((row) => {
      if (filter !== "all" && row.status !== filter) return false;
      return equipmentMatchesSearch(row, search);
    });
  }, [items, filter, search]);

  const visibleFilters = EQUIPMENT_STATUS_FILTERS.filter((f) => f !== "inactive");

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-[#0F2A4D]">{t("equipmentTab.listIntroTitle")}</h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-xl">
            {t("equipmentTab.listIntroSubtitle")}
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button type="button" variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={cn("size-4 mr-2", loading && "animate-spin")} />
            {t("common.refresh")}
          </Button>
          <Link href="/app/equipment/new" className={buttonVariants({ size: "sm" })}>
            <Plus className="size-4 mr-2" />
            {t("equipment.add")}
          </Link>
        </div>
      </div>

      {!loading && items.length > 0 && (
        <EquipmentKpiCards
          total={stats.total}
          assigned={stats.assigned}
          inService={stats.inService}
        />
      )}

      <div className="relative">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("equipmentTab.searchPlaceholder")}
          className="pl-9"
        />
      </div>

      <div className="flex flex-wrap gap-2">
        {visibleFilters.map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={cn(eqCategoryPill(filter === f), "px-4 py-2 text-sm")}
          >
            {t(FILTER_LABEL_KEYS[f])}
          </button>
        ))}
      </div>

      {loading && items.length === 0 ? (
        <div className="flex justify-center py-16">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : error ? (
        <Card className="border-destructive/50">
          <CardContent className="py-8 text-center text-destructive">{error}</CardContent>
        </Card>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Wrench className="size-10 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">
              {items.length === 0 ? t("equipment.empty") : t("equipmentTab.emptySearch")}
            </p>
            {items.length === 0 && (
              <Link href="/app/equipment/new" className={buttonVariants({ size: "sm" }) + " mt-4 inline-flex"}>
                <Plus className="size-4 mr-2" />
                {t("equipment.add")}
              </Link>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((item) => (
            <EquipmentListItem key={item.id} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}
