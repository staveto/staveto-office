"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  Activity,
  Boxes,
  Building2,
  Car,
  ChevronRight,
  CircleCheck,
  Cog,
  Hash,
  Package,
  Plus,
  QrCode,
  Search,
  UserPlus,
  Wrench,
} from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { useI18n } from "@/i18n/I18nContext";
import { cn } from "@/lib/utils";
import {
  boardCategoryLabelKey,
  boardStatusBadgeClass,
  boardStatusLabelKey,
  equipmentMatchesBoardFilter,
  equipmentMatchesBoardSearch,
  type EquipmentBoardFilter,
  type EquipmentCategoryKey,
  type EquipmentItemViewModel,
  type EquipmentOverviewViewModel,
} from "@/lib/equipmentOverview";
import { AssignProjectDialog } from "@/components/equipment/AssignProjectDialog";
import { eq } from "./eqTheme";

type Props = {
  vm: EquipmentOverviewViewModel;
  loading: boolean;
  onAssignProject: (equipmentId: string, projectId: string | null) => Promise<void>;
};

const CATEGORY_ICON: Record<EquipmentCategoryKey, typeof Wrench> = {
  vehicle: Car,
  machine: Cog,
  tool: Wrench,
  building: Building2,
  other: Package,
};

const BOARD_FILTERS: { key: EquipmentBoardFilter; labelKey: string }[] = [
  { key: "all", labelKey: "equipmentBoard.filter.all" },
  { key: "available", labelKey: "equipmentBoard.filter.available" },
  { key: "in_use", labelKey: "equipmentBoard.filter.inUse" },
  { key: "maintenance", labelKey: "equipmentBoard.filter.maintenance" },
  { key: "vehicle", labelKey: "equipmentBoard.filter.vehicles" },
  { key: "tool", labelKey: "equipmentBoard.filter.tools" },
  { key: "machine", labelKey: "equipmentBoard.filter.machines" },
  { key: "unassigned", labelKey: "equipmentBoard.filter.unassigned" },
];

export function EquipmentOverviewView({ vm, loading, onAssignProject }: Props) {
  const { t } = useI18n();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<EquipmentBoardFilter>("all");
  const [assignTarget, setAssignTarget] = useState<EquipmentItemViewModel | null>(null);

  const filtered = useMemo(
    () =>
      vm.items.filter(
        (item) =>
          equipmentMatchesBoardFilter(item, filter) &&
          equipmentMatchesBoardSearch(item, search)
      ),
    [vm.items, filter, search]
  );

  const movements = useMemo(
    () =>
      [...vm.items]
        .filter((item) => item.lastMovementLabel)
        .sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""))
        .slice(0, 4),
    [vm.items]
  );

  const maintenanceItems = useMemo(
    () =>
      vm.items.filter(
        (item) => item.status === "service" || item.status === "maintenance_due"
      ),
    [vm.items]
  );

  const assignFirstReady = () => {
    const target = vm.items.find((i) => i.status === "available") ?? vm.items[0] ?? null;
    if (target) setAssignTarget(target);
  };

  return (
    <div className="space-y-5">
      <StatusStrip vm={vm} t={t} />

      <MetricGrid vm={vm} t={t} />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,7fr)_minmax(0,3fr)]">
        {/* Left column: search + filters + list */}
        <div className="min-w-0 space-y-4">
          <div className={cn(eq.card, "p-3 sm:p-4 space-y-3")}>
            <div className="relative">
              <Search
                className={cn("absolute left-3 top-1/2 size-4 -translate-y-1/2", eq.textMuted)}
                aria-hidden
              />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("equipmentBoard.searchPlaceholder")}
                aria-label={t("equipmentBoard.searchPlaceholder")}
                className={cn(
                  "h-11 w-full rounded-lg border bg-transparent pl-9 pr-3 text-sm outline-none transition-colors",
                  "border-[#D8E1EA] dark:border-[#334155]",
                  "placeholder:text-[#94A3B8] focus:border-[#C9481D]",
                  eq.textPrimary
                )}
              />
            </div>
            <div className="flex flex-wrap gap-1.5">
              {BOARD_FILTERS.map((f) => {
                const active = filter === f.key;
                return (
                  <button
                    key={f.key}
                    type="button"
                    onClick={() => setFilter(f.key)}
                    className={cn(
                      "min-h-9 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                      active
                        ? "border-[#C9481D] bg-[#C9481D]/10 text-[#B8431D] dark:border-[#C9481D] dark:bg-[#C9481D]/20 dark:text-[#FDBA74]"
                        : cn(eq.secondaryBtn, "hover:border-[#C9481D]/40")
                    )}
                  >
                    {t(f.labelKey)}
                  </button>
                );
              })}
            </div>
            <p className={cn("text-xs", eq.textMuted)}>
              {t("equipmentBoard.results", {
                shown: filtered.length,
                total: vm.total,
              })}
            </p>
          </div>

          {vm.total === 0 ? (
            <EmptyState t={t} />
          ) : filtered.length === 0 ? (
            <div className={cn(eq.card, "p-10 text-center")}>
              <p className={cn("text-sm", eq.textSecondary)}>
                {t("equipmentTab.emptySearch")}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filtered.map((item) => (
                <EquipmentCard
                  key={item.id}
                  item={item}
                  t={t}
                  onAssign={() => setAssignTarget(item)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Right column: health, maintenance, movements, quick actions */}
        <div className="flex flex-col gap-4">
          <QuickActions
            t={t}
            disabled={loading}
            canAssign={vm.total > 0}
            onAssign={assignFirstReady}
          />
          <HealthCard vm={vm} t={t} />
          <MaintenanceCard items={maintenanceItems} t={t} />
          <MovementsCard items={movements} t={t} />
        </div>
      </div>

      <AssignProjectDialog
        open={assignTarget !== null}
        onOpenChange={(open) => !open && setAssignTarget(null)}
        currentProjectId={assignTarget?.assignedProjectId ?? null}
        onSelect={async (projectId) => {
          if (assignTarget) await onAssignProject(assignTarget.id, projectId);
        }}
      />
    </div>
  );
}

type Tfn = (key: string, params?: Record<string, string | number>) => string;

function StatusStrip({ vm, t }: { vm: EquipmentOverviewViewModel; t: Tfn }) {
  const needsAttention = vm.maintenance > 0 || vm.unassigned > 0;
  return (
    <div
      className={cn(
        eq.cardElevated,
        "flex flex-wrap items-center gap-x-2 gap-y-1.5 px-4 py-2.5 text-sm"
      )}
    >
      <Activity className={cn("size-4 shrink-0", eq.textMuted)} aria-hidden />
      <span className={eq.textSecondary}>
        {t("equipmentBoard.strip.summary", {
          available: vm.available,
          inUse: vm.inUse,
          maintenance: vm.maintenance,
          unassigned: vm.unassigned,
        })}
      </span>
      {vm.maintenance > 0 ? (
        <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800 dark:border-amber-800/70 dark:bg-amber-950/40 dark:text-amber-300">
          <Wrench className="size-3" aria-hidden />
          {t("equipmentBoard.strip.checkMaintenance")}
        </span>
      ) : null}
      {vm.unassigned > 0 ? (
        <span className="inline-flex items-center gap-1 rounded-full border border-[#D8E1EA] bg-white px-2 py-0.5 text-xs font-medium text-[#475569] dark:border-[#334155] dark:bg-[#243247] dark:text-[#CBD5E1]">
          <Boxes className="size-3" aria-hidden />
          {t("equipmentBoard.strip.unassignedAttention")}
        </span>
      ) : null}
      {!needsAttention && vm.total > 0 ? (
        <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:border-[#047857] dark:bg-[#064E3B] dark:text-[#6EE7B7]">
          <CircleCheck className="size-3" aria-hidden />
          {t("equipmentBoard.strip.allClear")}
        </span>
      ) : null}
    </div>
  );
}

function MetricGrid({ vm, t }: { vm: EquipmentOverviewViewModel; t: Tfn }) {
  const metrics = [
    {
      label: t("equipmentBoard.metric.available"),
      help: t("equipmentBoard.metric.availableHelp"),
      value: vm.available,
      icon: CircleCheck,
      dot: "bg-emerald-500",
    },
    {
      label: t("equipmentBoard.metric.inUse"),
      help: t("equipmentBoard.metric.inUseHelp"),
      value: vm.inUse,
      icon: Activity,
      dot: "bg-sky-500",
    },
    {
      label: t("equipmentBoard.metric.maintenance"),
      help: t("equipmentBoard.metric.maintenanceHelp"),
      value: vm.maintenance,
      icon: Wrench,
      dot: "bg-amber-500",
    },
    {
      label: t("equipmentBoard.metric.unassigned"),
      help: t("equipmentBoard.metric.unassignedHelp"),
      value: vm.unassigned,
      icon: Boxes,
      dot: "bg-slate-400",
    },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {metrics.map((m) => {
        const Icon = m.icon;
        return (
          <div key={m.label} className={cn(eq.card, "p-3.5 sm:p-4")}>
            <div className="flex items-center justify-between">
              <span className={cn("flex items-center gap-1.5 text-xs font-medium", eq.textMuted)}>
                <span className={cn("size-2 rounded-full", m.dot)} aria-hidden />
                {m.label}
              </span>
              <Icon className={cn("size-4", eq.textMuted)} aria-hidden />
            </div>
            <p className={cn("mt-2 text-2xl font-bold tabular-nums", eq.textPrimary)}>
              {m.value}
            </p>
            <p className={cn("mt-0.5 truncate text-xs", eq.textMuted)}>{m.help}</p>
          </div>
        );
      })}
    </div>
  );
}

function Thumbnail({ item }: { item: EquipmentItemViewModel }) {
  const Icon = CATEGORY_ICON[item.category] ?? Package;
  return (
    <div
      className={cn(
        "relative size-16 shrink-0 overflow-hidden rounded-xl border",
        "border-[#D8E1EA] bg-[#F1F5F9] dark:border-[#334155] dark:bg-[#243247]"
      )}
    >
      {item.imageUrl ? (
        <Image src={item.imageUrl} alt="" fill className="object-cover" sizes="64px" unoptimized />
      ) : (
        <div className="flex h-full w-full items-center justify-center">
          <Icon className="size-7 text-[#64748B] dark:text-[#94A3B8]" strokeWidth={1.75} aria-hidden />
        </div>
      )}
    </div>
  );
}

function InfoCell({ label, value, t }: { label: string; value: string; t: Tfn }) {
  return (
    <div className="min-w-0">
      <p className={cn("text-[11px] font-medium uppercase tracking-wide", eq.textMuted)}>
        {t(label)}
      </p>
      <p className={cn("mt-0.5 truncate text-sm", eq.textSecondary)}>{value}</p>
    </div>
  );
}

function EquipmentCard({
  item,
  t,
  onAssign,
}: {
  item: EquipmentItemViewModel;
  t: Tfn;
  onAssign: () => void;
}) {
  const metaParts = [
    t(boardCategoryLabelKey(item.category)),
    item.subtype,
    item.code,
  ].filter(Boolean) as string[];

  const assignedTo =
    item.assignedWorkerName ||
    item.assignedProjectName ||
    (item.assignedProjectId ? t("equipmentTab.rowAssignedShort") : t("equipmentBoard.card.none"));

  return (
    <div className={cn(eq.card, "p-3 sm:p-4")}>
      <div className="flex gap-3 sm:gap-4">
        <Thumbnail item={item} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className={cn("truncate text-base font-semibold", eq.textPrimary)}>
                {item.name || t("equipment.unnamed")}
              </h3>
              {metaParts.length > 0 ? (
                <p className={cn("mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs", eq.textMuted)}>
                  {item.code ? <Hash className="size-3 shrink-0" aria-hidden /> : null}
                  <span className="truncate">{metaParts.join(" · ")}</span>
                </p>
              ) : null}
            </div>
            <span
              className={cn(
                "inline-flex shrink-0 items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold",
                boardStatusBadgeClass(item.status)
              )}
            >
              {t(boardStatusLabelKey(item.status))}
            </span>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
            <InfoCell
              label="equipmentBoard.card.location"
              value={item.location || t("equipmentBoard.card.none")}
              t={t}
            />
            <InfoCell label="equipmentBoard.card.assignedTo" value={assignedTo} t={t} />
            <InfoCell
              label="equipmentBoard.card.nextMaintenance"
              value={item.nextMaintenanceLabel || t("equipmentBoard.card.notPlanned")}
              t={t}
            />
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className={cn("min-h-11 sm:min-h-9", eq.secondaryBtn)}
              onClick={onAssign}
            >
              <UserPlus className="mr-1.5 size-4" />
              {t("equipmentBoard.card.assign")}
            </Button>
            <Link
              href={`/app/equipment/${item.id}`}
              className={cn(
                buttonVariants({ size: "sm", variant: "outline" }),
                "min-h-11 sm:min-h-9",
                eq.secondaryBtn
              )}
            >
              {t("equipmentBoard.card.details")}
              <ChevronRight className="ml-1 size-4" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

function HealthRow({ label, value, dot }: { label: string; value: number; dot: string }) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="flex items-center gap-2 text-sm">
        <span className={cn("size-2 rounded-full", dot)} aria-hidden />
        <span className={eq.textSecondary}>{label}</span>
      </span>
      <span className={cn("text-sm font-semibold tabular-nums", eq.textPrimary)}>{value}</span>
    </div>
  );
}

function HealthCard({ vm, t }: { vm: EquipmentOverviewViewModel; t: Tfn }) {
  return (
    <div className={cn(eq.card, "p-4")}>
      <h2 className={cn("text-sm font-semibold", eq.textPrimary)}>
        {t("equipmentBoard.health.title")}
      </h2>
      <div className="mt-2 divide-y divide-[#D8E1EA] dark:divide-[#334155]">
        <HealthRow label={t("equipmentBoard.health.available")} value={vm.available} dot="bg-emerald-500" />
        <HealthRow label={t("equipmentBoard.health.inUse")} value={vm.inUse} dot="bg-sky-500" />
        <HealthRow label={t("equipmentBoard.health.maintenance")} value={vm.maintenance} dot="bg-amber-500" />
        <HealthRow label={t("equipmentBoard.health.missingData")} value={vm.missingData} dot="bg-slate-400" />
      </div>
    </div>
  );
}

function MaintenanceCard({ items, t }: { items: EquipmentItemViewModel[]; t: Tfn }) {
  return (
    <div className={cn(eq.card, "p-4")}>
      <h2 className={cn("flex items-center gap-1.5 text-sm font-semibold", eq.textPrimary)}>
        <Wrench className="size-4 text-amber-500" aria-hidden />
        {t("equipmentBoard.maintenance.title")}
      </h2>
      {items.length === 0 ? (
        <p className={cn("mt-2 text-sm", eq.textMuted)}>{t("equipmentBoard.maintenance.none")}</p>
      ) : (
        <ul className="mt-2 space-y-1.5">
          {items.map((item) => (
            <li key={item.id} className="flex items-center justify-between gap-2 text-sm">
              <span className={cn("truncate", eq.textSecondary)}>{item.name}</span>
              <span className="shrink-0 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800 dark:border-amber-800/70 dark:bg-amber-950/40 dark:text-amber-300">
                {t("equipmentBoard.status.service")}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function MovementsCard({ items, t }: { items: EquipmentItemViewModel[]; t: Tfn }) {
  return (
    <div className={cn(eq.card, "p-4")}>
      <h2 className={cn("text-sm font-semibold", eq.textPrimary)}>
        {t("equipmentBoard.movements.title")}
      </h2>
      {items.length === 0 ? (
        <p className={cn("mt-2 text-sm", eq.textMuted)}>{t("equipmentBoard.movements.none")}</p>
      ) : (
        <ul className="mt-2 space-y-2">
          {items.map((item) => (
            <li key={item.id} className="flex items-center justify-between gap-2 text-sm">
              <span className={cn("truncate", eq.textSecondary)}>{item.name}</span>
              <span className={cn("shrink-0 text-xs tabular-nums", eq.textMuted)}>
                {t("equipmentBoard.movements.updated")} {item.lastMovementLabel}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function QuickActions({
  t,
  disabled,
  canAssign,
  onAssign,
}: {
  t: Tfn;
  disabled: boolean;
  canAssign: boolean;
  onAssign: () => void;
}) {
  return (
    <div className={cn(eq.card, "order-first p-4 lg:order-none")}>
      <h2 className={cn("text-sm font-semibold", eq.textPrimary)}>
        {t("equipmentBoard.quick.title")}
      </h2>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Link
          href="/app/equipment/new"
          className={cn(
            buttonVariants({ size: "sm" }),
            "min-h-11 justify-start",
            eq.primaryBtn
          )}
        >
          <Plus className="mr-1.5 size-4" />
          {t("equipmentBoard.quick.add")}
        </Link>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className={cn("min-h-11 justify-start", eq.secondaryBtn)}
          disabled={!canAssign || disabled}
          onClick={onAssign}
        >
          <UserPlus className="mr-1.5 size-4" />
          {t("equipmentBoard.quick.assign")}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className={cn("min-h-11 justify-start", eq.secondaryBtn)}
          disabled
          title={t("equipmentBoard.quick.soon")}
        >
          <QrCode className="mr-1.5 size-4" />
          {t("equipmentBoard.quick.scanQr")}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className={cn("min-h-11 justify-start", eq.secondaryBtn)}
          disabled
          title={t("equipmentBoard.quick.soon")}
        >
          <Wrench className="mr-1.5 size-4" />
          {t("equipmentBoard.quick.logMaintenance")}
        </Button>
      </div>
    </div>
  );
}

function EmptyState({ t }: { t: Tfn }) {
  return (
    <div className={cn(eq.card, "px-6 py-14 text-center")}>
      <div
        className={cn(
          "mx-auto mb-4 flex size-16 items-center justify-center rounded-2xl",
          "bg-[#F1F5F9] dark:bg-[#243247]"
        )}
      >
        <Wrench className="size-8 text-[#94A3B8]" aria-hidden />
      </div>
      <p className={cn("text-base font-semibold", eq.textPrimary)}>
        {t("equipmentBoard.empty.title")}
      </p>
      <p className={cn("mx-auto mt-1.5 max-w-md text-sm", eq.textMuted)}>
        {t("equipmentBoard.empty.body")}
      </p>
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        <Link
          href="/app/equipment/new"
          className={cn(buttonVariants({ size: "sm" }), eq.primaryBtn)}
        >
          <Plus className="mr-1.5 size-4" />
          {t("equipment.add")}
        </Link>
        <Button type="button" size="sm" variant="outline" className={eq.secondaryBtn} disabled>
          <QrCode className="mr-1.5 size-4" />
          {t("equipmentBoard.empty.secondary")}
        </Button>
      </div>
    </div>
  );
}
