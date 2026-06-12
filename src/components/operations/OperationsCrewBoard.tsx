"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Loader2, Plus, User, X } from "lucide-react";
import type { ProjectDoc } from "@/lib/projects";
import type { OrgMemberRow } from "@/lib/organizations";
import {
  assignMemberToBusinessProject,
  unassignMemberFromBusinessProject,
} from "@/services/projects/businessProjectAssignmentService";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import styles from "./operations.module.css";

type Props = {
  projects: ProjectDoc[];
  members: OrgMemberRow[];
  canManage: boolean;
  onChanged: () => void;
  t: (key: string, params?: Record<string, string | number>) => string;
};

export function OperationsCrewBoard({ projects, members, canManage, onChanged, t }: Props) {
  const { user } = useAuth();
  const [assigningProjectId, setAssigningProjectId] = useState<string | null>(null);
  const [busyProjectId, setBusyProjectId] = useState<string | null>(null);

  const availableMembers = useMemo(
    () => members.filter((m) => m.status !== "removed"),
    [members]
  );

  const memberName = (uid: string) => {
    const m = availableMembers.find((x) => x.uid === uid);
    return m?.displayName || m?.email || uid.slice(0, 8);
  };

  const addMember = async (project: ProjectDoc, uid: string) => {
    if (!canManage) return;
    setBusyProjectId(project.id);
    try {
      const member = availableMembers.find((m) => m.uid === uid);
      await assignMemberToBusinessProject({
        projectId: project.id,
        uid,
        name: member?.displayName ?? undefined,
        role: member?.role,
        orgId: project.orgId,
        actorUid: user?.id,
      });
      setAssigningProjectId(null);
      onChanged();
    } finally {
      setBusyProjectId(null);
    }
  };

  const removeMember = async (projectId: string, uid: string) => {
    if (!canManage) return;
    setBusyProjectId(projectId);
    try {
      await unassignMemberFromBusinessProject({ projectId, uid });
      onChanged();
    } finally {
      setBusyProjectId(null);
    }
  };

  const activeProjects = projects.filter((p) => p.lifecycleStatus !== "completed").slice(0, 12);

  return (
    <section className={styles.sectionCard}>
      <p className={styles.sectionIntent}>{t("operations.layout.intent.crew")}</p>
      <h2 className={cn(styles.sectionTitle, "mb-4")}>{t("operations.assignedCrew")}</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        {activeProjects.map((project) => {
          const crewIds = project.assignedMemberIds ?? [];
          const unassigned = availableMembers.filter((m) => !crewIds.includes(m.uid));
          const isAssigning = assigningProjectId === project.id;

          return (
            <article key={project.id} className={styles.crewCard}>
              <div className="mb-2 flex items-start justify-between gap-2">
                <Link
                  href={`/app/projects/${project.id}`}
                  className="line-clamp-2 text-sm font-bold text-[#1D376A] hover:underline dark:text-slate-100"
                >
                  {project.name}
                </Link>
                {crewIds.length === 0 ? (
                  <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">
                    {t("operations.noCrew")}
                  </span>
                ) : null}
              </div>

              <div className="flex flex-wrap gap-1.5">
                {crewIds.map((uid) => (
                  <span key={uid} className={styles.crewChip}>
                    <User className="size-3" aria-hidden />
                    {memberName(uid)}
                    {canManage ? (
                      <button
                        type="button"
                        className="text-muted-foreground hover:text-rose-600"
                        onClick={() => void removeMember(project.id, uid)}
                        aria-label={t("operations.removeMember")}
                      >
                        <X className="size-3" />
                      </button>
                    ) : null}
                  </span>
                ))}
              </div>

              {canManage ? (
                <div className="mt-2">
                  {isAssigning ? (
                    <ul className="max-h-32 space-y-1 overflow-y-auto rounded-lg border border-border p-2">
                      {unassigned.length === 0 ? (
                        <li className="text-xs text-muted-foreground">{t("operations.crew.allAssigned")}</li>
                      ) : (
                        unassigned.map((m) => (
                          <li key={m.uid}>
                            <button
                              type="button"
                              disabled={busyProjectId === project.id}
                              className="w-full rounded-md px-2 py-1 text-left text-xs hover:bg-muted"
                              onClick={() => void addMember(project, m.uid)}
                            >
                              {m.displayName || m.email || m.uid}
                            </button>
                          </li>
                        ))
                      )}
                      <li>
                        <button
                          type="button"
                          className="mt-1 text-xs text-muted-foreground hover:underline"
                          onClick={() => setAssigningProjectId(null)}
                        >
                          {t("common.cancel")}
                        </button>
                      </li>
                    </ul>
                  ) : (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-7 gap-1 text-xs"
                      disabled={busyProjectId === project.id}
                      onClick={() => setAssigningProjectId(project.id)}
                    >
                      {busyProjectId === project.id ? (
                        <Loader2 className="size-3 animate-spin" />
                      ) : (
                        <Plus className="size-3" />
                      )}
                      {t("operations.addMember")}
                    </Button>
                  )}
                </div>
              ) : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}
