"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Loader2, Plus, QrCode, RefreshCw } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { useI18n } from "@/i18n/I18nContext";
import { useAuth } from "@/context/AuthContext";
import { useWorkspace } from "@/context/WorkspaceContext";
import {
  listMyEquipment,
  setMyEquipmentProjectAssignment,
  type UserEquipmentDoc,
} from "@/services/equipment";
import { listProjectsForWorkspace } from "@/lib/projects";
import { buildEquipmentOverview } from "@/lib/equipmentOverview";
import { EquipmentOverviewView } from "@/components/equipment/overview/EquipmentOverviewView";
import { eq } from "@/components/equipment/overview/eqTheme";
import { cn } from "@/lib/utils";

export default function EquipmentListPage() {
  const { t } = useI18n();
  const { user } = useAuth();
  const { activeWorkspace } = useWorkspace();
  const [items, setItems] = useState<UserEquipmentDoc[]>([]);
  const [projectNames, setProjectNames] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    setError(null);
    try {
      const list = await listMyEquipment({ status: "all" });
      setItems(list);

      if (activeWorkspace) {
        try {
          const projects = await listProjectsForWorkspace(activeWorkspace, user.id);
          setProjectNames(new Map(projects.map((p) => [p.id, p.name])));
        } catch {
          setProjectNames(new Map());
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : t("equipment.loadError"));
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [user?.id, activeWorkspace, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const vm = useMemo(
    () => buildEquipmentOverview(items, { projectNames }),
    [items, projectNames]
  );

  const handleAssignProject = useCallback(
    async (equipmentId: string, projectId: string | null) => {
      await setMyEquipmentProjectAssignment(equipmentId, projectId);
      await load();
    },
    [load]
  );

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <h1 className={cn("text-2xl font-bold tracking-tight", eq.textPrimary)}>
            {t("equipmentBoard.title")}
          </h1>
          <p className={cn("max-w-2xl text-sm leading-relaxed", eq.textMuted)}>
            {t("equipmentBoard.subtitle")}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={eq.secondaryBtn}
            onClick={() => void load()}
            disabled={loading}
          >
            <RefreshCw className={cn("mr-2 size-4", loading && "animate-spin")} />
            {t("common.refresh")}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={eq.secondaryBtn}
            disabled
            title={t("equipmentBoard.quick.soon")}
          >
            <QrCode className="mr-2 size-4" />
            {t("equipmentBoard.action.scanQr")}
          </Button>
          <Link
            href="/app/equipment/new"
            className={cn(buttonVariants({ size: "sm" }), eq.primaryBtn)}
          >
            <Plus className="mr-2 size-4" />
            {t("equipment.add")}
          </Link>
        </div>
      </div>

      {loading && items.length === 0 ? (
        <div className="flex justify-center py-20">
          <Loader2 className="size-7 animate-spin text-[#94A3B8]" />
        </div>
      ) : error ? (
        <div className={cn(eq.card, "border-red-300 py-10 text-center text-red-600 dark:border-red-900 dark:text-red-300")}>
          {error}
        </div>
      ) : (
        <EquipmentOverviewView vm={vm} loading={loading} onAssignProject={handleAssignProject} />
      )}
    </div>
  );
}
