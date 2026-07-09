"use client";

import { useState } from "react";
import {
  Calendar,
  CheckCircle2,
  HardHat,
  MessageSquare,
  Paperclip,
  Wrench,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { GanttTaskNode } from "@/lib/ganttTimeline";
import type { TaskDoc } from "@/lib/projects";
import { countWorkingDaysInclusive } from "@/lib/planningDateRange";
import styles from "./gantt.module.css";

export type TaskDrawerSelection = {
  projectId: string;
  projectName: string;
  phaseName: string;
  task: GanttTaskNode;
  taskDoc?: TaskDoc;
};

type TaskPlanningDrawerProps = {
  selection: TaskDrawerSelection | null;
  open: boolean;
  canEdit: boolean;
  onClose: () => void;
  onEditDates?: () => void;
  onMarkDone?: () => void;
  onNotify?: () => void;
  t: (key: string, params?: Record<string, string | number>) => string;
};

export function TaskPlanningDrawer({
  selection,
  open,
  canEdit,
  onClose,
  onEditDates,
  onMarkDone,
  onNotify,
  t,
}: TaskPlanningDrawerProps) {
  const [commentDraft, setCommentDraft] = useState("");

  if (!open || !selection) return null;

  const { task, projectName, phaseName, taskDoc } = selection;
  const tools = task.assignedTools ?? [];
  const start = task.startYmd;
  const end = task.endYmd ?? task.startYmd;
  const duration =
    start && end ? countWorkingDaysInclusive(start, end) : null;

  return (
    <>
      <button
        type="button"
        className={styles.drawerBackdrop}
        aria-label={t("planning.taskDrawer.close")}
        onClick={onClose}
      />
      <aside className={styles.taskDrawer} role="dialog" aria-label={task.title}>
        <div className={styles.taskDrawerHeader}>
          <div className="min-w-0 flex-1">
            <p className={styles.taskDrawerEyebrow}>{projectName}</p>
            <h2 className={styles.taskDrawerTitle}>{task.title}</h2>
          </div>
          <button type="button" className={styles.taskDrawerClose} onClick={onClose}>
            <X className="size-5" />
          </button>
        </div>

        <div className={styles.taskDrawerBody}>
          <dl className={styles.taskDrawerMeta}>
            <div>
              <dt>{t("planning.taskDrawer.phase")}</dt>
              <dd>{phaseName}</dd>
            </div>
            <div>
              <dt>{t("planning.taskDrawer.status")}</dt>
              <dd>{t(`gantt.legend.${task.barStatus}`)}</dd>
            </div>
            <div>
              <dt>{t("planning.taskDrawer.plannedStart")}</dt>
              <dd>{task.startYmd ?? "—"}</dd>
            </div>
            <div>
              <dt>{t("planning.taskDrawer.plannedEnd")}</dt>
              <dd>{task.endYmd ?? task.startYmd ?? "—"}</dd>
            </div>
            <div>
              <dt>{t("planning.taskDrawer.dueDate")}</dt>
              <dd>{taskDoc?.dueDate?.slice(0, 10) ?? task.endYmd ?? "—"}</dd>
            </div>
            {duration !== null ? (
              <div>
                <dt>{t("planning.dateEditor.workingDays")}</dt>
                <dd>{duration}</dd>
              </div>
            ) : null}
            <div>
              <dt>
                <HardHat className="mr-1 inline size-3.5" />
                {t("planning.taskDrawer.worker")}
              </dt>
              <dd>{task.assigneeName ?? t("projects.tasks.unassigned")}</dd>
            </div>
            <div>
              <dt>
                <Wrench className="mr-1 inline size-3.5" />
                {t("planning.taskDrawer.equipment")}
              </dt>
              <dd>
                {tools.length > 0
                  ? tools.map((tl) => tl.name).join(", ")
                  : t("planning.empty.noEquipmentAssigned")}
              </dd>
            </div>
          </dl>

          {canEdit ? (
            <Button type="button" variant="outline" size="sm" className="mt-2" onClick={onEditDates}>
              <Calendar className="mr-1 size-4" />
              {t("planning.taskDrawer.changeDates")}
            </Button>
          ) : null}

          <section className={styles.taskDrawerSection}>
            <h3 className={styles.taskDrawerSectionTitle}>
              <MessageSquare className="size-4" />
              {t("planning.taskDrawer.comments")}
            </h3>
            <p className={styles.taskDrawerPlaceholder}>{t("planning.taskDrawer.commentsPlaceholder")}</p>
            {canEdit ? (
              <Textarea
                rows={3}
                value={commentDraft}
                onChange={(e) => setCommentDraft(e.target.value)}
                placeholder={t("planning.taskDrawer.commentInputPlaceholder")}
                disabled
                className="opacity-70"
              />
            ) : null}
          </section>

          <section className={styles.taskDrawerSection}>
            <h3 className={styles.taskDrawerSectionTitle}>
              <Paperclip className="size-4" />
              {t("planning.taskDrawer.attachments")}
            </h3>
            <p className={styles.taskDrawerPlaceholder}>{t("planning.taskDrawer.attachmentsPlaceholder")}</p>
          </section>
        </div>

        {canEdit ? (
          <div className={styles.taskDrawerActions}>
            <Button type="button" variant="outline" size="sm" disabled title={t("planning.taskDrawer.commentsPlaceholder")}>
              <MessageSquare className="mr-1 size-4" />
              {t("planning.taskDrawer.addComment")}
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={onNotify}>
              {t("planning.notify.title")}
            </Button>
            <Button
              type="button"
              size="sm"
              className="bg-[#1D376A] hover:bg-[#162d58]"
              onClick={onMarkDone}
            >
              <CheckCircle2 className="mr-1 size-4" />
              {t("planning.taskDrawer.markDone")}
            </Button>
          </div>
        ) : null}
      </aside>
    </>
  );
}
