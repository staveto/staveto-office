"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ProjectDoc } from "@/lib/projects";
import { getUserRoleInOrganization } from "@/lib/organizations";
import { mapLegacyOrgRoleToWorkspaceRole } from "@/permissions/roles";
import {
  listOrgMemberProfilesViaCallable,
  orgMemberProfileLookup,
} from "@/services/organizations/orgMemberProfilesService";
import {
  listProjectMembers,
  upsertProjectMembers,
  type UpsertProjectMemberInput,
} from "@/services/projects/projectMembersService";
import {
  createProjectInvitedNotification,
} from "@/services/notifications/userNotificationService";
import {
  assignMemberToBusinessProject,
  inviteMemberToBusinessProject,
  unassignMemberFromBusinessProject,
} from "@/services/projects/businessProjectAssignmentService";
import { inviteProjectMemberByEmail } from "@/services/projects/inviteProjectMemberByEmail";
import { useAuth } from "@/context/AuthContext";
import { useWorkspace } from "@/context/WorkspaceContext";
import { useWorkspaceProduct } from "@/hooks/useWorkspaceProduct";
import { canManageCrewAssignments } from "@/lib/operationsPermissions";
import { getOrganization } from "@/lib/organizations";

type Props = {
  open: boolean;
  project: ProjectDoc | null;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
  t: (key: string, params?: Record<string, string | number>) => string;
};

type Candidate = {
  userId: string;
  name?: string;
  email?: string;
  locked?: boolean;
  pendingInvite?: boolean;
};

export function ProjectMembersQuickAssignDialog({
  open,
  project,
  onOpenChange,
  onSaved,
  t,
}: Props) {
  const { user } = useAuth();
  const { activeWorkspace } = useWorkspace();
  const { role } = useWorkspaceProduct();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  /** Members who already have project access (active / assigned). */
  const [previousActiveIds, setPreviousActiveIds] = useState<string[]>([]);
  /** Members with a pending invite (status invited). */
  const [previousInvitedIds, setPreviousInvitedIds] = useState<string[]>([]);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviting, setInviting] = useState(false);
  const [inviteMessage, setInviteMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !project) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setSearch("");
    setInviteEmail("");
    setInviteMessage(null);

    void (async () => {
      try {
        const effectiveOrgId =
          project.orgId?.trim() ||
          (activeWorkspace?.type === "company"
            ? (activeWorkspace.orgId ?? activeWorkspace.id)?.trim()
            : undefined);

        const extraUserIds = [
          ...(project.assignedMemberIds ?? []),
          ...(project.ownerId ? [project.ownerId] : []),
        ];

        const [existingMembers, orgProfiles] = await Promise.all([
          listProjectMembers(project.id),
          effectiveOrgId
            ? listOrgMemberProfilesViaCallable(effectiveOrgId, extraUserIds)
            : Promise.resolve(null),
        ]);
        if (cancelled) return;

        const profileByKey = orgMemberProfileLookup(orgProfiles ?? []);

        const resolveProfile = (id: string) =>
          profileByKey.get(id) ?? profileByKey.get(id.toLowerCase());

        const byId = new Map<string, Candidate>();
        for (const profile of orgProfiles ?? []) {
          byId.set(profile.uid, {
            userId: profile.uid,
            name: profile.displayName ?? undefined,
            email: profile.email ?? undefined,
          });
        }
        for (const row of existingMembers) {
          const profile = resolveProfile(row.userId);
          byId.set(row.userId, {
            userId: row.userId,
            name: row.name ?? profile?.displayName ?? undefined,
            email: row.email ?? profile?.email ?? undefined,
          });
        }
        for (const uid of project.assignedMemberIds ?? []) {
          if (byId.has(uid)) continue;
          const profile = resolveProfile(uid);
          byId.set(uid, {
            userId: uid,
            name: profile?.displayName ?? undefined,
            email: profile?.email ?? undefined,
          });
        }
        if (project.ownerId && !byId.has(project.ownerId)) {
          const profile = resolveProfile(project.ownerId);
          byId.set(project.ownerId, {
            userId: project.ownerId,
            name: profile?.displayName ?? undefined,
            email: profile?.email ?? undefined,
            locked: true,
          });
        }

        const activeFromMembers = existingMembers
          .filter((m) => m.status !== "invited" && m.status !== "removed")
          .map((m) => m.userId);
        const invitedFromMembers = existingMembers
          .filter((m) => m.status === "invited")
          .map((m) => m.userId);

        const activeIds = new Set<string>([
          ...activeFromMembers,
          ...(project.assignedMemberIds ?? []),
          ...(project.ownerId ? [project.ownerId] : []),
        ]);
        const invitedIds = new Set<string>(
          invitedFromMembers.filter((uid) => !activeIds.has(uid))
        );

        const list = [...byId.values()].map((c) => ({
          ...c,
          locked: c.userId === project.ownerId || c.locked,
          pendingInvite: invitedIds.has(c.userId),
        }));

        const initial = new Set<string>([...activeIds, ...invitedIds]);
        if (project.ownerId) initial.add(project.ownerId);

        setCandidates(list.sort((a, b) => (a.name ?? a.email ?? a.userId).localeCompare(b.name ?? b.email ?? b.userId)));
        setSelectedIds(initial);
        setPreviousActiveIds([...activeIds]);
        setPreviousInvitedIds([...invitedIds]);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
          setCandidates([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, project, activeWorkspace]);

  const visibleCandidates = useMemo(() => {
    if (!search.trim()) return candidates;
    const q = search.trim().toLowerCase();
    return candidates.filter((c) => {
      const text = `${c.name ?? ""} ${c.email ?? ""} ${c.userId}`.toLowerCase();
      return text.includes(q);
    });
  }, [candidates, search]);

  const toggle = (uid: string, locked?: boolean) => {
    if (locked) return;
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(uid)) next.delete(uid);
      else next.add(uid);
      return next;
    });
  };

  const handleSave = async () => {
    if (!project || !user?.id) return;

    const workspaceOrgId =
      activeWorkspace?.type === "company"
        ? (activeWorkspace.orgId ?? activeWorkspace.id)
        : undefined;
    const effectiveOrgId = project.orgId?.trim() || workspaceOrgId?.trim();

    let canAssign = canManageCrewAssignments(role);
    if (!canAssign && effectiveOrgId) {
      const org = await getOrganization(effectiveOrgId);
      const isOrgOwner = org?.ownerUid === user.id;
      const firestoreRole = await getUserRoleInOrganization(
        effectiveOrgId,
        user.id,
        user.email
      );
      const mapped = mapLegacyOrgRoleToWorkspaceRole(firestoreRole ?? "", {
        isOrgOwner,
      });
      canAssign = canManageCrewAssignments(mapped) || isOrgOwner;
    }
    if (!canAssign && project.ownerId !== user.id) {
      setError(t("projects.membersQuick.permissionDenied"));
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const activeSet = new Set(previousActiveIds);
      const invitedSet = new Set(previousInvitedIds);
      const selected: UpsertProjectMemberInput[] = candidates
        .filter((c) => selectedIds.has(c.userId))
        .map((c) => ({
          userId: c.userId,
          name: c.name,
          email: c.email,
          role: c.userId === project.ownerId ? "owner" : "member",
        }));

      const selectedUidSet = new Set(selected.map((s) => s.userId));
      const actorName =
        [user.firstName, user.lastName].filter(Boolean).join(" ").trim() ||
        user.email ||
        undefined;

      // New checkbox selections → pending invite (must accept on mobile/web).
      const toInvite = selected.filter(
        (s) =>
          s.userId !== project.ownerId &&
          !activeSet.has(s.userId)
      );
      // Already active → heal membership only (never re-invite / re-activate invited).
      const toHeal = selected.filter(
        (s) => s.userId !== project.ownerId && activeSet.has(s.userId)
      );
      const removedActiveIds = previousActiveIds.filter(
        (uid) => uid !== project.ownerId && !selectedUidSet.has(uid)
      );
      const cancelledInviteIds = previousInvitedIds.filter(
        (uid) => !selectedUidSet.has(uid)
      );

      if (effectiveOrgId) {
        await Promise.all([
          ...toHeal.map((member) =>
            assignMemberToBusinessProject({
              projectId: project.id,
              uid: member.userId,
              name: member.name,
              orgId: effectiveOrgId,
              actorUid: user.id,
            })
          ),
          ...[...removedActiveIds, ...cancelledInviteIds].map((uid) =>
            unassignMemberFromBusinessProject({ projectId: project.id, uid })
          ),
        ]);

        const inviteResults = await Promise.all(
          toInvite.map(async (member) => {
            const result = await inviteMemberToBusinessProject({
              projectId: project.id,
              uid: member.userId,
              name: member.name,
              email: member.email,
              orgId: effectiveOrgId,
              actorUid: user.id,
            });
            return { member, result };
          })
        );

        const notifyTargets = inviteResults.filter(
          (row) =>
            row.member.userId !== user.id &&
            (row.result === "invited" ||
              // Fresh checkbox on an invite that already existed (e.g. email path)
              (row.result === "already_invited" && !invitedSet.has(row.member.userId)))
        );

        await Promise.all(
          notifyTargets.map(({ member }) =>
            createProjectInvitedNotification({
              targetUserId: member.userId,
              projectId: project.id,
              projectName: project.name?.trim() || project.id,
              assignedBy: user.id,
              assignedByName: actorName,
              orgId: effectiveOrgId,
            }).catch((err) => {
              console.warn("[membersQuick] createProjectInvitedNotification failed:", err);
            })
          )
        );
      } else {
        // Personal projects: new members stay invited until accept; keep actives.
        const personalPrevious = [...activeSet, ...invitedSet];
        await upsertProjectMembers(project.id, selected, personalPrevious, user.id);
      }

      onSaved();
      onOpenChange(false);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.toLowerCase().includes("permission")) {
        const hint =
          role === "owner" ? ` ${t("projects.membersQuick.rulesHint")}` : "";
        setError(`${t("projects.membersQuick.permissionDenied")}${hint}`);
      } else {
        setError(msg);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleSendEmailInvite = async () => {
    if (!project || !user?.id || inviting) return;
    const email = inviteEmail.trim().toLowerCase();
    if (!email.includes("@")) {
      setError(t("projectInvites.invalidEmail"));
      return;
    }
    setInviting(true);
    setError(null);
    setInviteMessage(null);
    try {
      const workspaceOrgId =
        activeWorkspace?.type === "company"
          ? (activeWorkspace.orgId ?? activeWorkspace.id)
          : undefined;
      const effectiveOrgId = project.orgId?.trim() || workspaceOrgId?.trim();
      const known = candidates.find(
        (c) => (c.email ?? "").trim().toLowerCase() === email
      );
      const actorName =
        [user.firstName, user.lastName].filter(Boolean).join(" ").trim() ||
        user.email ||
        undefined;

      let notifyUserId: string | null = null;

      if (known?.userId && effectiveOrgId) {
        // Prefer uid-keyed invite so checkbox save and acceptProjectInvite stay aligned.
        const inviteResult = await inviteMemberToBusinessProject({
          projectId: project.id,
          uid: known.userId,
          name: known.name,
          email,
          orgId: effectiveOrgId,
          actorUid: user.id,
        });
        if (inviteResult === "already_active") {
          setError(t("projectInvites.alreadyMember"));
          return;
        }
        notifyUserId = known.userId;
        setSelectedIds((prev) => new Set(prev).add(known.userId));
        setPreviousInvitedIds((prev) =>
          prev.includes(known.userId) ? prev : [...prev, known.userId]
        );
      } else {
        const result = await inviteProjectMemberByEmail({
          projectId: project.id,
          email,
          name: known?.name,
          invitedByUid: user.id,
        });
        notifyUserId = result.targetUserId;
      }

      if (notifyUserId && notifyUserId !== user.id && effectiveOrgId) {
        await createProjectInvitedNotification({
          targetUserId: notifyUserId,
          projectId: project.id,
          projectName: project.name?.trim() || project.id,
          assignedBy: user.id,
          assignedByName: actorName,
          orgId: effectiveOrgId,
        }).catch((err) => {
          console.warn("[membersQuick] email invite notification failed:", err);
        });
      }

      setInviteEmail("");
      setInviteMessage(t("projectInvites.inviteSent"));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("ALREADY_MEMBER")) {
        setError(t("projectInvites.alreadyMember"));
      } else if (msg.toLowerCase().includes("permission")) {
        setError(t("projects.membersQuick.permissionDenied"));
      } else {
        setError(msg);
      }
    } finally {
      setInviting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("projects.membersQuick.dialogTitle")}</DialogTitle>
          <DialogDescription>{t("projects.membersQuick.dialogHint")}</DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-3">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("projects.membersQuick.searchPlaceholder")}
            />
            <div className="max-h-72 overflow-y-auto rounded-md border border-border">
              {visibleCandidates.length === 0 ? (
                <p className="px-3 py-4 text-sm text-muted-foreground">
                  {t("projects.membersQuick.noCandidates")}
                </p>
              ) : (
                <ul className="divide-y divide-border" role="list">
                  {visibleCandidates.map((candidate) => {
                    const selected = selectedIds.has(candidate.userId);
                    return (
                      <li key={candidate.userId}>
                        <label className="flex w-full items-start gap-3 px-3 py-2.5 hover:bg-muted/40">
                          <input
                            type="checkbox"
                            checked={selected}
                            onChange={() => toggle(candidate.userId, candidate.locked)}
                            disabled={candidate.locked}
                            className="mt-0.5"
                          />
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-medium">
                              {candidate.name?.trim() || candidate.email || candidate.userId}
                            </span>
                            <span className="block truncate text-xs text-muted-foreground">
                              {candidate.email || candidate.userId}
                              {candidate.locked
                                ? ` - ${t("projects.membersQuick.ownerLocked")}`
                                : candidate.pendingInvite
                                  ? ` - ${t("members.status.invited")}`
                                  : ""}
                            </span>
                          </span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
            <div className="rounded-md border border-dashed border-border p-3 space-y-2">
              <p className="text-sm font-medium text-[#1D376A]">
                {t("projectInvites.inviteByEmailTitle")}
              </p>
              <p className="text-xs text-muted-foreground">
                {t("projectInvites.inviteByEmailHint")}
              </p>
              <div className="flex gap-2">
                <Input
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder={t("projectInvites.inviteByEmailPlaceholder")}
                />
                <Button
                  type="button"
                  variant="outline"
                  disabled={inviting || !inviteEmail.trim()}
                  onClick={() => void handleSendEmailInvite()}
                >
                  {inviting ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    t("projectInvites.sendInvite")
                  )}
                </Button>
              </div>
              {inviteMessage ? (
                <p className="text-xs text-emerald-700">{inviteMessage}</p>
              ) : null}
            </div>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            {t("common.cancel")}
          </Button>
          <Button onClick={() => void handleSave()} disabled={saving || loading}>
            {saving ? <Loader2 className="size-4 animate-spin" /> : t("projects.membersQuick.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
