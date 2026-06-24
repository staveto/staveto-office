"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ExternalLink,
  Loader2,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useI18n } from "@/i18n/I18nContext";
import { useAuth } from "@/context/AuthContext";
import { useWorkspace } from "@/context/WorkspaceContext";
import { listProjectsForWorkspace } from "@/lib/projects";
import {
  deleteMyEquipment,
  getMyEquipment,
  listMyEquipmentServiceRules,
  listMyEquipmentServiceTasks,
  completeMyEquipmentServiceTask,
  setMyEquipmentProjectAssignment,
  type ServiceRuleDoc,
  type UserEquipmentDoc,
  type UserEquipmentServiceTaskDoc,
} from "@/services/equipment";
import { removeUserEquipmentPhoto } from "@/services/equipment/userEquipmentPhotoService";
import { AssignProjectDialog } from "./AssignProjectDialog";
import { eq } from "./equipmentFormStyles";
import {
  equipmentCategoryLabelKey,
  equipmentStatusBadgeClass,
  equipmentStatusLabelKey,
  formatEquipmentDate,
  formatEquipmentShortDate,
} from "./equipmentUtils";
import { cn } from "@/lib/utils";

function DetailRow({
  label,
  value,
  multiline,
}: {
  label: string;
  value: string;
  multiline?: boolean;
}) {
  return (
    <div className={eq.detailRow}>
      <dt className="text-sm font-medium text-muted-foreground">{label}</dt>
      <dd className={cn(eq.detailValue, multiline && "whitespace-pre-wrap")}>{value}</dd>
    </div>
  );
}

function Section({
  title,
  children,
  action,
}: {
  title: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <section className={eq.section}>
      <div className="flex items-center justify-between gap-2 mb-3">
        <h2 className={eq.detailSectionTitle}>{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

type EquipmentDetailPanelProps = {
  equipmentId: string;
};

export function EquipmentDetailPanel({ equipmentId }: EquipmentDetailPanelProps) {
  const router = useRouter();
  const { t } = useI18n();
  const { user } = useAuth();
  const { activeWorkspace } = useWorkspace();

  const [row, setRow] = useState<UserEquipmentDoc | null>(null);
  const [projectName, setProjectName] = useState<string | null>(null);
  const [rules, setRules] = useState<ServiceRuleDoc[]>([]);
  const [openTasks, setOpenTasks] = useState<UserEquipmentServiceTaskDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [completingTaskId, setCompletingTaskId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    setError(null);
    try {
      const doc = await getMyEquipment(equipmentId);
      setRow(doc);
      if (!doc) return;

      let pname: string | null = null;
      if (doc.assignedProjectId && activeWorkspace) {
        const list = await listProjectsForWorkspace(activeWorkspace, user.id);
        pname = list.find((p) => p.id === doc.assignedProjectId)?.name ?? null;
      }
      setProjectName(pname);

      const [rulesList, tasksList] = await Promise.all([
        listMyEquipmentServiceRules(equipmentId),
        listMyEquipmentServiceTasks(equipmentId, { status: "OPEN" }),
      ]);
      setRules(rulesList);
      setOpenTasks(tasksList.filter((task) => task.isActive !== false));
    } catch (e) {
      setError(e instanceof Error ? e.message : t("equipment.loadError"));
      setRow(null);
    } finally {
      setLoading(false);
    }
  }, [user?.id, equipmentId, activeWorkspace, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleAssign = async (projectId: string | null) => {
    await setMyEquipmentProjectAssignment(equipmentId, projectId);
    await load();
  };

  const handleCompleteTask = async (task: UserEquipmentServiceTaskDoc) => {
    if (!confirm(t("equipment.completeServiceConfirm", { name: task.title }))) return;
    setCompletingTaskId(task.id);
    try {
      await completeMyEquipmentServiceTask(equipmentId, task.id);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("equipment.saveError"));
    } finally {
      setCompletingTaskId(null);
    }
  };

  const handleDelete = async () => {
    if (!confirm(t("equipment.confirmDelete"))) return;
    setDeleting(true);
    try {
      if (row?.photoPath) await removeUserEquipmentPhoto(row.photoPath);
      await deleteMyEquipment(equipmentId);
      router.push("/app/equipment");
    } catch (e) {
      setError(e instanceof Error ? e.message : t("equipment.deleteError"));
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="size-7 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!row) {
    return (
      <Card className="border-border bg-card">
        <CardContent className="py-12 text-center text-muted-foreground">
          {error ?? t("equipmentTab.notFound")}
        </CardContent>
      </Card>
    );
  }

  const categoryText =
    t(equipmentCategoryLabelKey(String(row.category))) +
    (row.kind ? ` · ${row.kind}` : "") +
    (row.model ? ` · ${row.model}` : "");

  return (
    <div className="space-y-6">
      {error && <div className={eq.errorBanner}>{error}</div>}

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <h1 className={eq.pageTitle}>{row.name}</h1>
            <span
              className={cn(
                "inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium",
                equipmentStatusBadgeClass(row.status)
              )}
            >
              {t(equipmentStatusLabelKey(row.status))}
            </span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/app/equipment/${equipmentId}/edit`}
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            <Pencil className="size-4 mr-2" />
            {t("equipmentTab.edit")}
          </Link>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-destructive"
            onClick={() => void handleDelete()}
            disabled={deleting}
          >
            {deleting ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <>
                <Trash2 className="size-4 mr-2" />
                {t("common.delete")}
              </>
            )}
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_260px]">
        <div className="space-y-5">
          <Section title={t("equipmentTab.sectionBasics")}>
            <dl>
              <DetailRow label={t("equipmentTab.fieldCategory")} value={categoryText} />
              <DetailRow label={t("equipmentTab.fieldSerial")} value={row.serialNumber || "—"} />
              <DetailRow label={t("equipmentTab.fieldInternalCode")} value={row.internalCode || "—"} />
              <DetailRow label={t("equipmentTab.fieldLocation")} value={row.locationText || "—"} />
              <DetailRow
                label={t("equipmentTab.fieldNotes")}
                value={row.notes || "—"}
                multiline
              />
            </dl>
          </Section>

          <Section title={t("equipmentTab.sectionAssignment")}>
            <dl>
              <DetailRow
                label={t("equipmentTab.assignedProject")}
                value={
                  row.assignedProjectId
                    ? projectName ?? row.assignedProjectId
                    : t("equipmentTab.none")
                }
              />
            </dl>
            {row.assignedProjectId && (
              <Link
                href={`/app/projects/${row.assignedProjectId}`}
                className="inline-flex items-center gap-1 text-sm font-medium text-[#E06737] mt-3 hover:underline"
              >
                {t("equipmentTab.openProject")}
                <ExternalLink className="size-3.5" />
              </Link>
            )}
            <div className="flex flex-wrap gap-2 mt-4">
              <Button type="button" variant="outline" size="sm" onClick={() => setAssignOpen(true)}>
                {t("equipmentTab.assignProject")}
              </Button>
              {row.assignedProjectId && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void handleAssign(null)}
                >
                  {t("equipmentTab.unassignProject")}
                </Button>
              )}
            </div>
          </Section>

          <Link
            href={`/app/equipment/${equipmentId}/service-rules/new`}
            className={eq.servicePlanCta}
          >
            <Plus className="size-5" />
            {t("equipment.addServicePlanCta")}
          </Link>

          <Section title={t("equipment.servicePlans")}>
            {rules.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("equipment.noServicePlans")}</p>
            ) : (
              <ul className="space-y-2">
                {rules.map((r) => (
                  <li key={r.id}>
                    <Link
                      href={`/app/equipment/${equipmentId}/service-rules/${r.id}/edit`}
                      className={eq.serviceRuleLink}
                    >
                      <div className="min-w-0">
                        <p className={eq.serviceRuleTitle}>{r.title}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {r.intervalUnit === "weeks"
                            ? t("equipment.everyWeeks", { count: String(r.intervalValue) })
                            : t("equipment.everyMonths", { count: String(r.intervalValue) })}
                        </p>
                        {r.nextDueAt && (
                          <p className="text-xs text-[#E06737] mt-0.5">
                            {t("equipment.nextInspection")}: {formatEquipmentShortDate(r.nextDueAt)}
                          </p>
                        )}
                      </div>
                      <Pencil className="size-4 shrink-0 text-muted-foreground" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title={t("equipment.openServiceTasks")}>
            {openTasks.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("equipment.noOpenTasks")}</p>
            ) : (
              <ul className="space-y-2">
                {openTasks.map((task) => (
                  <li
                    key={task.id}
                    className={cn(
                      "flex flex-wrap items-center justify-between gap-3 py-2",
                      eq.listDivider,
                      "last:border-0"
                    )}
                  >
                    <div>
                      <p className="text-sm font-medium text-foreground">{task.title}</p>
                      {task.dueDate && (
                        <p className="text-xs text-muted-foreground mt-0.5">{task.dueDate}</p>
                      )}
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      disabled={completingTaskId === task.id}
                      onClick={() => void handleCompleteTask(task)}
                    >
                      {completingTaskId === task.id ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        t("equipment.completeService")
                      )}
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title={t("equipmentTab.sectionMeta")}>
            <dl>
              <DetailRow label={t("equipmentTab.createdAt")} value={formatEquipmentDate(row.createdAt)} />
              <DetailRow label={t("equipmentTab.updatedAt")} value={formatEquipmentDate(row.updatedAt)} />
            </dl>
          </Section>
        </div>

        {row.photoUrl && (
          <aside>
            <div className={eq.photoCard}>
              <h3 className={eq.sectionTitle}>{t("equipmentTab.photoSection")}</h3>
              <div className={`${eq.photoPreview} relative`}>
                <Image src={row.photoUrl} alt="" fill className="object-cover" unoptimized />
              </div>
            </div>
          </aside>
        )}
      </div>

      <AssignProjectDialog
        open={assignOpen}
        onOpenChange={setAssignOpen}
        currentProjectId={row.assignedProjectId}
        onSelect={handleAssign}
      />
    </div>
  );
}
