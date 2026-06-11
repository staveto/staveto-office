"use client";

import { useMemo, useState } from "react";
import { Loader2, Plus, X } from "lucide-react";
import type { ProjectDoc } from "@/lib/projects";
import type { OrgMemberRow } from "@/lib/organizations";
import {
  assignMemberToBusinessProject,
  unassignMemberFromBusinessProject,
} from "@/services/projects/businessProjectAssignmentService";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";

type Props = {
  projects: ProjectDoc[];
  members: OrgMemberRow[];
  canManage: boolean;
  onChanged: () => void;
  t: (key: string, params?: Record<string, string | number>) => string;
};

export function ProjectCrewBoard({ projects, members, canManage, onChanged, t }: Props) {
  const { user } = useAuth();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busyProjectId, setBusyProjectId] = useState<string | null>(null);

  const availableMembers = useMemo(
    () => members.filter((m) => m.status !== "removed"),
    [members]
  );

  const memberName = (uid: string) => {
    const m = availableMembers.find((x) => x.uid === uid);
    return m?.displayName || m?.email || uid;
  };

  const toggleSelected = (uid: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(uid)) next.delete(uid);
      else next.add(uid);
      return next;
    });
  };

  const bulkAssign = async (project: ProjectDoc) => {
    if (!canManage || selected.size === 0) return;
    setBusyProjectId(project.id);
    try {
      const chosen = [...selected];
      await Promise.all(
        chosen.map((uid) => {
          const member = availableMembers.find((m) => m.uid === uid);
          return assignMemberToBusinessProject({
            projectId: project.id,
            uid,
            name: member?.displayName ?? undefined,
            role: member?.role,
            orgId: project.orgId,
            actorUid: user?.id,
          });
        })
      );
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

  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <h3 className="mb-3 text-sm font-semibold">{t("operations.assignedCrew")}</h3>
      <div className="grid gap-3 lg:grid-cols-[220px_1fr]">
        <aside className="rounded-lg border border-border bg-background p-3">
          <p className="mb-2 text-xs font-semibold text-muted-foreground">{t("operations.addMember")}</p>
          <ul className="space-y-1.5">
            {availableMembers.map((member) => (
              <li key={member.uid}>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={selected.has(member.uid)}
                    onChange={() => toggleSelected(member.uid)}
                    disabled={!canManage}
                  />
                  <span className="truncate">{member.displayName || member.email || member.uid}</span>
                </label>
              </li>
            ))}
          </ul>
        </aside>

        <div className="grid gap-2 md:grid-cols-2">
          {projects.map((project) => {
            const crewIds = project.assignedMemberIds ?? [];
            return (
              <div key={project.id} className="rounded-lg border border-border bg-background p-3">
                <div className="mb-2 flex items-start justify-between gap-2">
                  <p className="line-clamp-1 text-sm font-medium">{project.name}</p>
                  {canManage ? (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 px-2 text-xs"
                      disabled={selected.size === 0 || busyProjectId === project.id}
                      onClick={() => void bulkAssign(project)}
                    >
                      {busyProjectId === project.id ? (
                        <Loader2 className="size-3 animate-spin" />
                      ) : (
                        <Plus className="mr-1 size-3" />
                      )}
                      {t("operations.addMember")}
                    </Button>
                  ) : null}
                </div>
                {crewIds.length === 0 ? (
                  <p className="text-xs text-amber-700 dark:text-amber-400">{t("operations.noCrew")}</p>
                ) : (
                  <ul className="space-y-1">
                    {crewIds.map((uid) => (
                      <li
                        key={`${project.id}-${uid}`}
                        className="flex items-center justify-between rounded-md bg-muted/40 px-2 py-1"
                      >
                        <span className="truncate text-xs">{memberName(uid)}</span>
                        {canManage ? (
                          <button
                            type="button"
                            className="text-muted-foreground hover:text-rose-600"
                            onClick={() => void removeMember(project.id, uid)}
                            aria-label={t("operations.removeMember")}
                          >
                            <X className="size-3.5" />
                          </button>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
