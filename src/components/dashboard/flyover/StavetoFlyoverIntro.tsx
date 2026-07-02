"use client";

import {
  startTransition,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { ArrowRight, CheckCircle2, X } from "lucide-react";
import { useI18n } from "@/i18n/I18nContext";
import type { DashboardStats } from "@/lib/dashboardStats";
import type { ActiveWorkspace, WorkspaceRole } from "@/types/workspace";
import { canViewOperationsDashboard } from "@/lib/operationsPermissions";
import { fetchTeamLiveStatus } from "@/services/operations/operationsDashboardService";
import { listUserEquipment } from "@/services/equipment/userEquipmentService";
import type { UserEquipmentDoc } from "@/services/equipment/types";
import styles from "./staveto-flyover.module.css";

type Props = {
  open: boolean;
  onDismiss: () => void;
  onDisableAutoShow: () => void;
  workspace: ActiveWorkspace;
  uid: string;
  displayName: string;
  role?: WorkspaceRole;
  stats: DashboardStats;
  statsLoading: boolean;
};

function countAvailableVehicles(items: UserEquipmentDoc[]): number {
  return items.filter(
    (e) =>
      e.category === "vehicle" &&
      e.status !== "inactive" &&
      e.status !== "in_service" &&
      !e.assignedProjectId
  ).length;
}

type StatChip = {
  id: string;
  value: number | null;
  loading: boolean;
  label: string;
};

/** Official brick mark + wordmark — sized for dark flyover header. */
function FlyoverBrand() {
  return (
    <div className={styles.brand} aria-label="Staveto">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/logo.png" alt="" className={styles.brandMark} width={32} height={16} />
      <span className={styles.brandName}>STAVETO</span>
    </div>
  );
}

export function StavetoFlyoverIntro({
  open,
  onDismiss,
  onDisableAutoShow,
  workspace,
  uid,
  displayName,
  role,
  stats,
  statsLoading,
}: Props) {
  const { t } = useI18n();
  const titleId = useId();
  const ctaRef = useRef<HTMLButtonElement>(null);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [workersLoading, setWorkersLoading] = useState(false);
  const [vehiclesLoading, setVehiclesLoading] = useState(false);
  const [availableWorkers, setAvailableWorkers] = useState<number | null>(null);
  const [availableVehicles, setAvailableVehicles] = useState<number | null>(null);
  const [mounted, setMounted] = useState(false);

  const companyName = workspace.name?.trim() || t("flyover.companyFallback");

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setReducedMotion(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  useEffect(() => {
    if (!open || !uid) return;

    let cancelled = false;

    void (async () => {
      startTransition(() => {
        if (cancelled) return;
        setWorkersLoading(true);
        setVehiclesLoading(true);
      });

      const workersPromise = canViewOperationsDashboard(role)
        ? fetchTeamLiveStatus({ workspace, uid, role })
            .then((team) => team.filter((m) => m.status === "not_started").length)
            .catch(() => null)
        : Promise.resolve(stats.teamCount);

      const vehiclesPromise = listUserEquipment(uid, { status: "all" })
        .then((items) => countAvailableVehicles(items))
        .catch(() => null);

      const [workers, vehicles] = await Promise.all([workersPromise, vehiclesPromise]);

      if (cancelled) return;

      setAvailableWorkers(workers);
      setAvailableVehicles(vehicles);
      setWorkersLoading(false);
      setVehiclesLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [open, uid, workspace, role, stats.teamCount]);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onDismiss();
      }
    },
    [onDismiss]
  );

  useEffect(() => {
    if (!open) return;
    document.addEventListener("keydown", handleKeyDown);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusTimer = window.setTimeout(() => ctaRef.current?.focus(), 100);
    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = prev;
    };
  }, [open, handleKeyDown]);

  const statChips: StatChip[] = useMemo(
    () => [
      {
        id: "offers",
        value: statsLoading ? null : stats.quotesAwaitingCount,
        loading: statsLoading,
        label: t("flyover.stat.offers"),
      },
      {
        id: "jobs",
        value: statsLoading ? null : stats.activeJobsCount,
        loading: statsLoading,
        label: t("flyover.stat.jobs"),
      },
      {
        id: "workers",
        value: workersLoading ? null : availableWorkers,
        loading: workersLoading,
        label: t("flyover.stat.workers"),
      },
      {
        id: "vehicles",
        value: vehiclesLoading ? null : availableVehicles,
        loading: vehiclesLoading,
        label: t("flyover.stat.vehicles"),
      },
    ],
    [
      t,
      statsLoading,
      stats.quotesAwaitingCount,
      stats.activeJobsCount,
      availableWorkers,
      availableVehicles,
      workersLoading,
      vehiclesLoading,
    ]
  );

  if (!open || !mounted) return null;

  return createPortal(
    <div
      className={styles.flyoverOverlay}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <div className={styles.flyoverBackgroundVisual} aria-hidden />
      <div className={styles.flyoverScrim} aria-hidden />
      {!reducedMotion ? <div className={styles.flyoverScanLine} aria-hidden /> : null}

      <button
        type="button"
        className={styles.flyoverClose}
        onClick={onDismiss}
        aria-label={t("flyover.closeIntro")}
      >
        <X size={18} aria-hidden />
      </button>

      <main className={styles.flyoverContent}>
        <FlyoverBrand />
        <p className={styles.companyName}>{companyName}</p>
        <p className={styles.greeting}>{t("flyover.greeting", { name: displayName })}</p>

        <h1 id={titleId} className={styles.headline}>
          <span>{t("flyover.headline.line1")}</span>
          <span className={styles.headlineAccent}>{t("flyover.headline.line2")}</span>
        </h1>

        <p className={styles.subtitle}>{t("flyover.subtitle")}</p>

        <div className={styles.statusGrid}>
          {statChips.map((chip) => (
            <div key={chip.id} className={styles.statusChip}>
              <div
                className={`${styles.statusValue} ${chip.loading ? styles.statusValueLoading : ""}`}
              >
                {chip.value !== null ? chip.value : "—"}
              </div>
              <div className={styles.statusLabel}>{chip.label}</div>
            </div>
          ))}
        </div>

        <div className={styles.actions}>
          <button
            ref={ctaRef}
            type="button"
            className={styles.primaryCta}
            onClick={onDismiss}
          >
            {t("flyover.cta")}
            <ArrowRight size={17} className={styles.primaryCtaArrow} aria-hidden />
          </button>
          <button type="button" className={styles.secondaryLink} onClick={onDisableAutoShow}>
            {t("flyover.disableAutoShow")}
          </button>
        </div>

        <p className={styles.footerNote}>
          <CheckCircle2 size={13} aria-hidden />
          {t("flyover.footer")}
        </p>
      </main>
    </div>,
    document.body
  );
}
