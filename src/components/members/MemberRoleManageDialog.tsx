"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n/I18nContext";
import { useAuth } from "@/context/AuthContext";
import { useWorkspace } from "@/context/WorkspaceContext";
import {
  getCompanyRoleLabelKey,
  getMemberDisplayLabel,
  type CanonicalCompanyRole,
  type CompanyTeamMemberRow,
} from "@/lib/companyRoles";
import {
  PERMISSION_SECTIONS,
  getEffectivePermissions,
  getRolePreset,
  permissionsEqual,
  resetPermissionsToRolePreset,
  type BusinessPermissionKey,
  type BusinessPermissions,
} from "@/lib/businessRolePermissions";
import {
  getOrgMemberDetail,
  mapRoleUpdateError,
  updateBusinessMemberRole,
} from "@/services/business/businessMembersService";
import {
  assignMemberToBusinessProject,
  listBusinessOrgProjects,
  listBusinessProjectsAssignedToMember,
  unassignMemberFromBusinessProject,
} from "@/services/projects/businessProjectAssignmentService";
import type { ProjectDoc } from "@/lib/projects";
import { Loader2, Plus, X } from "lucide-react";

const ALL_ROLES: CanonicalCompanyRole[] = ["owner", "admin", "manager", "worker", "viewer"];

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orgId: string;
  row: CompanyTeamMemberRow | null;
  teamRows: CompanyTeamMemberRow[];
  actorRole: CanonicalCompanyRole | null;
  onSaved: () => void;
};

function PermissionToggle({
  checked,
  disabled,
  onChange,
  label,
  description,
}: {
  checked: boolean;
  disabled: boolean;
  label: string;
  description: string;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-t border-border py-3 first:border-t-0">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors",
          disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer",
          checked ? "bg-[#1D376A]" : "bg-muted"
        )}
      >
        <span
          className={cn(
            "pointer-events-none inline-block size-5 translate-y-0.5 rounded-full bg-white shadow transition-transform",
            checked ? "translate-x-5" : "translate-x-0.5"
          )}
        />
      </button>
    </div>
  );
}

export function MemberRoleManageDialog({
  open,
  onOpenChange,
  orgId,
  row,
  teamRows,
  actorRole,
  onSaved,
}: Props) {
  const { t } = useI18n();
  const { user } = useAuth();
  const { activeWorkspace } = useWorkspace();

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedRole, setSelectedRole] = useState<CanonicalCompanyRole | null>(null);
  const [permissions, setPermissions] = useState<BusinessPermissions | null>(null);
  const [assignedProjects, setAssignedProjects] = useState<ProjectDoc[]>([]);
  const [orgProjects, setOrgProjects] = useState<ProjectDoc[]>([]);
  const [assignmentsLoading, setAssignmentsLoading] = useState(false);
  const [assignBusyFor, setAssignBusyFor] = useState<string | null>(null);
  const [showAssignPicker, setShowAssignPicker] = useState(false);
  const [baselineRole, setBaselineRole] = useState<CanonicalCompanyRole | null>(null);
  const [baselinePermissions, setBaselinePermissions] = useState<BusinessPermissions | null>(null);

  const isActorOwner = actorRole === "owner";
  const isActorAdmin = actorRole === "admin";
  const activeOwnerCount = teamRows.filter(
    (m) => m.effectiveRole === "owner" && String(m.status).toLowerCase() === "active"
  ).length;

  const loadMember = useCallback(async () => {
    if (!orgId || !row) return;
    setLoading(true);
    setError(null);
    try {
      const detail = await getOrgMemberDetail(orgId, row.uid);
      if (!detail) {
        setError(t("members.roleManage.loadError"));
        return;
      }
      const role = detail.role;
      const effective = getEffectivePermissions(role, detail.permissions);
      setSelectedRole(role);
      setPermissions(effective);
      setBaselineRole(role);
      setBaselinePermissions(effective);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("members.roleManage.loadError"));
    } finally {
      setLoading(false);
    }
  }, [orgId, row, t]);

  const loadAssignments = useCallback(async () => {
    if (!activeWorkspace || !row?.userId) {
      setAssignedProjects([]);
      setOrgProjects([]);
      return;
    }
    setAssignmentsLoading(true);
    try {
      const [assigned, allOrg] = await Promise.all([
        listBusinessProjectsAssignedToMember(activeWorkspace, user?.id ?? "", row.userId),
        isActorOwner || isActorAdmin
          ? listBusinessOrgProjects(activeWorkspace, user?.id ?? "")
          : Promise.resolve([] as ProjectDoc[]),
      ]);
      setAssignedProjects(assigned);
      setOrgProjects(allOrg);
    } catch {
      setAssignedProjects([]);
    } finally {
      setAssignmentsLoading(false);
    }
  }, [activeWorkspace, row?.userId, user?.id, isActorOwner, isActorAdmin]);

  useEffect(() => {
    if (!open || !row) return;
    void loadMember();
  }, [open, row, loadMember]);

  useEffect(() => {
    if (!open || !row?.userId) return;
    void loadAssignments();
  }, [open, row?.userId, loadAssignments]);

  const targetRole = row?.effectiveRole ?? "viewer";
  const targetStatus = String(row?.status ?? "").toLowerCase();

  const readOnly = useMemo(() => {
    if (!row) return true;
    return targetRole === "owner" && !isActorOwner;
  }, [row, targetRole, isActorOwner]);

  const soleActiveOwnerLocked = useMemo(() => {
    if (!row) return false;
    if (targetRole !== "owner" || targetStatus !== "active") return false;
    return activeOwnerCount <= 1;
  }, [row, targetRole, targetStatus, activeOwnerCount]);

  const canEdit = !readOnly && !soleActiveOwnerLocked && (isActorOwner || isActorAdmin);
  const permissionsLocked = selectedRole === "owner";

  const rolePreset = useMemo(
    () => (selectedRole ? getRolePreset(selectedRole) : null),
    [selectedRole]
  );

  const isDirty = useMemo(() => {
    if (selectedRole == null || !permissions || baselineRole == null || !baselinePermissions) {
      return false;
    }
    if (selectedRole !== baselineRole) return true;
    return !permissionsEqual(permissions, baselinePermissions);
  }, [baselinePermissions, baselineRole, permissions, selectedRole]);

  const showCustomHint =
    selectedRole != null &&
    selectedRole !== "owner" &&
    rolePreset != null &&
    permissions != null &&
    !permissionsEqual(permissions, rolePreset);

  const assignableProjects = useMemo(() => {
    const assignedIds = new Set(assignedProjects.map((p) => p.id));
    return orgProjects.filter((p) => !assignedIds.has(p.id));
  }, [assignedProjects, orgProjects]);

  const onSelectRole = (role: CanonicalCompanyRole) => {
    setSelectedRole(role);
    setPermissions(resetPermissionsToRolePreset(role));
  };

  const onTogglePermission = (key: BusinessPermissionKey, value: boolean) => {
    if (!permissions || permissionsLocked || !canEdit) return;
    setPermissions({ ...permissions, [key]: value });
  };

  const onResetDefaults = () => {
    if (!selectedRole || !canEdit) return;
    setPermissions(resetPermissionsToRolePreset(selectedRole));
  };

  const onSave = async () => {
    if (!orgId || !row || selectedRole == null || !permissions || !canEdit) return;
    setSaving(true);
    setError(null);
    try {
      const payload: Parameters<typeof updateBusinessMemberRole>[0] = {
        orgId,
        memberUid: row.uid,
        role: selectedRole,
      };
      if (selectedRole !== "owner") {
        payload.permissions = { ...permissions };
      }
      await updateBusinessMemberRole(payload);
      onSaved();
      onOpenChange(false);
    } catch (e) {
      setError(mapRoleUpdateError(t, e));
    } finally {
      setSaving(false);
    }
  };

  const onAssignProject = async (project: ProjectDoc) => {
    if (!orgId || !row?.userId || !user?.id) return;
    setAssignBusyFor(project.id);
    try {
      await assignMemberToBusinessProject({
        projectId: project.id,
        uid: row.userId,
        name: getMemberDisplayLabel(row),
        role: selectedRole ?? row.effectiveRole,
        orgId,
        actorUid: user.id,
      });
      setShowAssignPicker(false);
      await loadAssignments();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("members.roleManage.loadError"));
    } finally {
      setAssignBusyFor(null);
    }
  };

  const onUnassignProject = async (project: ProjectDoc) => {
    if (!row?.userId) return;
    setAssignBusyFor(project.id);
    try {
      await unassignMemberFromBusinessProject({
        projectId: project.id,
        uid: row.userId,
      });
      await loadAssignments();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("members.roleManage.loadError"));
    } finally {
      setAssignBusyFor(null);
    }
  };

  const roleDescriptionKey = (role: CanonicalCompanyRole): string => {
    if (role === "owner") return "members.rolesSection.owner.description";
    if (role === "admin") return "members.rolesSection.admin.description";
    if (role === "manager") return "members.rolesSection.manager.description";
    if (role === "worker") return "members.rolesSection.worker.description";
    return "members.roleDesc.viewer";
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-hidden flex flex-col p-0">
        <DialogHeader className="px-6 pt-6 pb-2">
          <DialogTitle>{t("members.roleManage.title")}</DialogTitle>
          <p className="text-sm text-muted-foreground">{t("members.roleManage.subtitle")}</p>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 pb-4 space-y-5">
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="size-8 animate-spin text-muted-foreground" />
            </div>
          ) : !row || selectedRole == null || !permissions ? (
            <p className="text-destructive text-sm">{error ?? t("members.roleManage.loadError")}</p>
          ) : (
            <>
              <div className="rounded-lg border bg-card p-4 space-y-2">
                <p className="font-semibold">{getMemberDisplayLabel(row)}</p>
                <Badge variant="secondary">{t(getCompanyRoleLabelKey(row.effectiveRole))}</Badge>
                <p className="text-xs text-muted-foreground">{t("members.roleManage.currentRole")}</p>
                <p className="text-sm font-medium">{t(getCompanyRoleLabelKey(row.effectiveRole))}</p>
              </div>

              {readOnly ? (
                <p className="text-sm text-amber-600 dark:text-amber-400">
                  {t("members.roleManage.readOnly")}
                </p>
              ) : null}
              {soleActiveOwnerLocked ? (
                <p className="text-sm text-amber-600 dark:text-amber-400">
                  {t("members.roleManage.lastOwnerCannotBeChanged")}
                </p>
              ) : null}
              {error ? <p className="text-sm text-destructive">{error}</p> : null}

              <div className="space-y-2">
                <p className="text-sm font-semibold">{t("members.inviteDialog.chooseRole")}</p>
                {ALL_ROLES.map((role) => {
                  const ownerChoiceBlocked = role === "owner" && !isActorOwner;
                  const disabled = !canEdit || ownerChoiceBlocked;
                  const selected = selectedRole === role;
                  return (
                    <button
                      key={role}
                      type="button"
                      disabled={disabled}
                      onClick={() => {
                        if (!disabled) onSelectRole(role);
                      }}
                      className={cn(
                        "w-full rounded-lg border p-3 text-left transition-colors",
                        selected ? "border-[#e06737] bg-[#e06737]/5" : "border-border",
                        disabled && "opacity-50 cursor-not-allowed"
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-sm">
                          {t(getCompanyRoleLabelKey(role))}
                        </span>
                        {ownerChoiceBlocked ? (
                          <span className="text-[10px] text-muted-foreground text-right">
                            {t("members.roleManage.onlyOwnerCanAssignOwner")}
                          </span>
                        ) : null}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">{t(roleDescriptionKey(role))}</p>
                    </button>
                  );
                })}
              </div>

              <div className="space-y-3">
                <p className="text-sm font-semibold">{t("members.roleManage.permissionsTitle")}</p>
                {permissionsLocked ? (
                  <p className="text-xs text-muted-foreground">
                    {t("members.roleManage.ownerPermissionsLocked")}
                  </p>
                ) : showCustomHint ? (
                  <p className="text-xs text-muted-foreground">
                    {t("members.roleManage.customizedHint")}
                  </p>
                ) : null}

                {PERMISSION_SECTIONS.map((section) => (
                  <div key={section.id} className="rounded-lg border bg-card p-3">
                    <p className="text-sm font-semibold mb-1">
                      {t(`members.permissions.section.${section.id}`)}
                    </p>
                    {section.keys.map((key) => (
                      <PermissionToggle
                        key={key}
                        checked={permissions[key]}
                        disabled={!canEdit || permissionsLocked}
                        label={t(`members.permissions.${key}.label`)}
                        description={t(`members.permissions.${key}.description`)}
                        onChange={(value) => onTogglePermission(key, value)}
                      />
                    ))}
                  </div>
                ))}

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!canEdit || permissionsLocked}
                  onClick={onResetDefaults}
                >
                  {t("members.roleManage.resetDefaults")}
                </Button>
              </div>

              <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
                <p className="text-sm font-semibold">{t("members.roleManage.assignedProjectsTitle")}</p>
                <p className="text-xs text-muted-foreground">
                  {t("members.roleManage.assignedProjectsHint")}
                </p>
                {!row.userId ? (
                  <p className="text-xs text-muted-foreground">
                    {t("members.roleManage.pendingMember")}
                  </p>
                ) : assignmentsLoading ? (
                  <Loader2 className="size-5 animate-spin text-muted-foreground" />
                ) : assignedProjects.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    {t("members.roleManage.noProjects")}
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {assignedProjects.map((project) => (
                      <li key={project.id} className="flex items-center justify-between gap-2">
                        <span className="text-sm truncate">{project.name}</span>
                        {canEdit ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            disabled={assignBusyFor === project.id}
                            onClick={() => void onUnassignProject(project)}
                          >
                            <X className="size-4 text-destructive" />
                          </Button>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
                {canEdit && row.userId ? (
                  <>
                    {!showAssignPicker ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={assignableProjects.length === 0}
                        onClick={() => setShowAssignPicker(true)}
                      >
                        <Plus className="size-4 mr-1" />
                        {t("members.roleManage.assignProject")}
                      </Button>
                    ) : (
                      <div className="rounded-md border bg-background p-2 max-h-40 overflow-y-auto space-y-1">
                        {assignableProjects.map((project) => (
                          <button
                            key={project.id}
                            type="button"
                            disabled={assignBusyFor === project.id}
                            className="w-full text-left text-sm px-2 py-1.5 rounded hover:bg-muted"
                            onClick={() => void onAssignProject(project)}
                          >
                            {project.name}
                          </button>
                        ))}
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="w-full mt-1"
                          onClick={() => setShowAssignPicker(false)}
                        >
                          {t("common.cancel")}
                        </Button>
                      </div>
                    )}
                  </>
                ) : null}
              </div>
            </>
          )}
        </div>

        <DialogFooter className="px-6 py-4 border-t">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button
            type="button"
            className="bg-[#e06737] hover:bg-[#e06737]/90"
            disabled={!canEdit || saving || loading || !isDirty}
            onClick={() => void onSave()}
          >
            {saving ? <Loader2 className="size-4 animate-spin mr-2" /> : null}
            {t("members.roleManage.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
