"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/i18n/I18nContext";
import { useAuth } from "@/context/AuthContext";
import { useWorkspace } from "@/context/WorkspaceContext";
import { isCompanyWorkspaceType } from "@/types/workspace";
import {
  getOrganization,
  getMemberDisplayName,
  listOrgMembers,
  listOrgInvites,
  createInvite,
  updateMemberRole,
  removeMember,
  revokeInvite,
  type Organization,
  type OrgMemberRole,
  type InviteWithId,
} from "@/lib/organizations";
import {
  buildCompanyTeamRows,
  canInviteCompanyMembers,
  canManageCompanyMembers,
  countActiveTeamSeats,
  getInviteRoleLabelKey,
  isOrgOwner,
  type CompanyTeamMemberRow,
} from "@/lib/companyRoles";
import {
  MemberRoleCell,
  MemberStatusCell,
  useCurrentUserCompanyRole,
} from "@/components/members/MemberRoleBadge";
import { Users, Loader2, Plus, Trash2, UserMinus, Mail, Crown } from "lucide-react";
import { getFirestoreInstance } from "@/lib/firebase";

export function CompanyMembersPanel() {
  const { t } = useI18n();
  const { user } = useAuth();
  const { activeWorkspace } = useWorkspace();

  const orgId =
    activeWorkspace && isCompanyWorkspaceType(activeWorkspace.type)
      ? (activeWorkspace?.orgId ?? activeWorkspace?.id ?? null)
      : null;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [teamRows, setTeamRows] = useState<CompanyTeamMemberRow[]>([]);
  const [invites, setInvites] = useState<InviteWithId[]>([]);
  const [ownerDisplayName, setOwnerDisplayName] = useState<string | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<OrgMemberRole>("member");
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [actioning, setActioning] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!orgId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [orgSnap, membersList, invitesList] = await Promise.all([
        getOrganization(orgId),
        listOrgMembers(orgId),
        listOrgInvites(orgId),
      ]);

      if (!orgSnap) {
        setError(t("members.loadError"));
        setOrganization(null);
        setTeamRows([]);
        setInvites([]);
        return;
      }

      setOrganization(orgSnap);
      setInvites(invitesList);

      let ownerName: string | null = null;
      const db = getFirestoreInstance();
      if (db && orgSnap.ownerUid) {
        try {
          ownerName = await getMemberDisplayName(db, orgSnap.ownerUid);
        } catch {
          ownerName = null;
        }
      }
      if (!ownerName && orgSnap.ownerUid === user?.id) {
        ownerName =
          user?.name?.trim() ||
          null;
      }
      setOwnerDisplayName(ownerName);

      setTeamRows(
        buildCompanyTeamRows({
          org: orgSnap,
          members: membersList,
          ownerDisplayName: ownerName,
          ownerEmail: orgSnap.ownerUid === user?.id ? user?.email : undefined,
        })
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : t("members.loadError"));
      setTeamRows([]);
      setInvites([]);
    } finally {
      setLoading(false);
    }
  }, [orgId, t, user?.email, user?.id, user?.name]);

  useEffect(() => {
    void load();
  }, [load]);

  const currentUserRole = useCurrentUserCompanyRole(
    organization?.ownerUid,
    user?.id,
    teamRows
  );
  const canInvite = canInviteCompanyMembers(currentUserRole);
  const canManage = canManageCompanyMembers(currentUserRole);
  const isCurrentUserOwner = isOrgOwner(organization, user?.id);

  const ownerRow = useMemo(
    () => teamRows.find((r) => r.effectiveRole === "owner"),
    [teamRows]
  );

  const ownerLabel =
    ownerRow?.displayName?.trim() ||
    ownerDisplayName?.trim() ||
    (isCurrentUserOwner ? user?.name?.trim() || user?.email : null) ||
    t("members.ownerUnknown");

  const handleInvite = async () => {
    if (!orgId || !inviteEmail.trim()) return;
    setInviting(true);
    setInviteError(null);
    try {
      if (!user?.id) throw new Error("Not signed in");
      await createInvite(orgId, inviteEmail.trim(), inviteRole, user.id);
      setInviteEmail("");
      setInviteRole("member");
      setInviteOpen(false);
      await load();
    } catch (e) {
      setInviteError(e instanceof Error ? e.message : t("members.inviteError"));
    } finally {
      setInviting(false);
    }
  };

  const handleRemoveMember = async (row: CompanyTeamMemberRow) => {
    if (row.effectiveRole === "owner") return;
    if (!orgId || !confirm(t("members.confirmRemove"))) return;
    setActioning(row.uid);
    try {
      await removeMember(orgId, row.uid);
      await load();
    } finally {
      setActioning(null);
    }
  };

  const handleChangeRole = async (uid: string, role: OrgMemberRole) => {
    if (!orgId) return;
    const row = teamRows.find((r) => r.uid === uid);
    if (!row || row.effectiveRole === "owner") return;
    setActioning(uid);
    try {
      await updateMemberRole(orgId, uid, role);
      await load();
    } finally {
      setActioning(null);
    }
  };

  const handleRevokeInvite = async (inviteId: string) => {
    if (!confirm(t("members.confirmRevoke"))) return;
    setActioning(inviteId);
    try {
      await revokeInvite(inviteId);
      await load();
    } finally {
      setActioning(null);
    }
  };

  const seatsUsed = countActiveTeamSeats(teamRows);

  if (loading) {
    return (
      <Card>
        <CardContent className="py-12 flex justify-center">
          <Loader2 className="size-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="py-6">
          <p className="text-destructive">{error}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <p className="text-sm text-muted-foreground">
            {t("members.companyLabel")}:{" "}
            <span className="font-medium text-foreground">
              {organization?.name ?? activeWorkspace?.name}
            </span>
          </p>
          <p className="text-sm text-muted-foreground">
            {t("members.ownerLabel")}:{" "}
            <span className="font-medium text-foreground">{ownerLabel}</span>
          </p>
        </div>
        {canInvite ? (
          <Button onClick={() => setInviteOpen(true)} size="sm" className="shrink-0">
            <Plus className="size-4 mr-2" />
            {t("members.invite")}
          </Button>
        ) : null}
      </div>

      {isCurrentUserOwner ? (
        <div
          className="flex items-start gap-2 rounded-lg border border-[#1D376A]/15 bg-[#1D376A]/[0.05] px-4 py-3 text-sm text-[#1D376A]"
          role="status"
        >
          <Crown className="size-4 shrink-0 mt-0.5" aria-hidden />
          <p>{t("members.ownerBanner")}</p>
        </div>
      ) : null}

      {organization ? (
        <Card>
          <CardContent className="py-4">
            <p className="text-sm text-muted-foreground">
              {t("members.seatsUsed")}: {seatsUsed} / {organization.seatLimit} ·{" "}
              {t("members.plan")}: {organization.plan}
            </p>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="size-4" />
            {t("members.membersList")}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("members.nameCol")}</TableHead>
                <TableHead>{t("members.emailCol")}</TableHead>
                <TableHead>{t("members.roleCol")}</TableHead>
                <TableHead>{t("members.statusCol")}</TableHead>
                {canManage ? <TableHead className="w-[100px]" /> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {teamRows.map((row) => (
                <TableRow key={row.uid}>
                  <TableCell>
                    <span className="inline-flex items-center gap-1.5">
                      {row.displayName || "—"}
                      {row.synthetic ? (
                        <Badge variant="outline" className="text-[10px] font-normal">
                          {t("members.ownerBadge")}
                        </Badge>
                      ) : null}
                    </span>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {row.email || row.uid}
                  </TableCell>
                  <TableCell>
                    <MemberRoleCell
                      row={row}
                      canManage={canManage}
                      actioning={actioning === row.uid}
                      onChangeRole={handleChangeRole}
                    />
                  </TableCell>
                  <TableCell>
                    <MemberStatusCell status={row.status} />
                  </TableCell>
                  {canManage ? (
                    <TableCell>
                      {row.effectiveRole !== "owner" && !row.synthetic ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRemoveMember(row)}
                          disabled={actioning === row.uid}
                          title={t("members.remove")}
                        >
                          {actioning === row.uid ? (
                            <Loader2 className="size-4 animate-spin" />
                          ) : (
                            <UserMinus className="size-4 text-destructive" />
                          )}
                        </Button>
                      ) : null}
                    </TableCell>
                  ) : null}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {invites.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Mail className="size-4" />
              {t("members.pendingInvites")}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("members.emailCol")}</TableHead>
                  <TableHead>{t("members.roleCol")}</TableHead>
                  <TableHead>{t("members.statusCol")}</TableHead>
                  {canManage ? <TableHead className="w-[80px]" /> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {invites.map((inv) => (
                  <TableRow key={inv.id}>
                    <TableCell>{inv.emailLower}</TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="font-normal">
                        {t(getInviteRoleLabelKey(inv.role))}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="font-normal">
                        {t("members.status.pending")}
                      </Badge>
                    </TableCell>
                    {canManage ? (
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRevokeInvite(inv.id)}
                          disabled={actioning === inv.id}
                          title={t("members.revoke")}
                        >
                          {actioning === inv.id ? (
                            <Loader2 className="size-4 animate-spin" />
                          ) : (
                            <Trash2 className="size-4 text-destructive" />
                          )}
                        </Button>
                      </TableCell>
                    ) : null}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : null}

      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("members.invite")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="invite-email">{t("members.emailCol")}</Label>
              <Input
                id="invite-email"
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="email@example.com"
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="invite-role">{t("members.roleCol")}</Label>
              <Select value={inviteRole} onValueChange={(v) => setInviteRole(v as OrgMemberRole)}>
                <SelectTrigger id="invite-role" className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">{t("members.role.admin")}</SelectItem>
                  <SelectItem value="member">{t("members.role.viewer")}</SelectItem>
                </SelectContent>
              </Select>
              <p className="mt-1.5 text-xs text-muted-foreground">
                {inviteRole === "admin"
                  ? t("members.roleDesc.admin")
                  : t("members.roleDesc.viewer")}
              </p>
            </div>
            {inviteError ? <p className="text-sm text-destructive">{inviteError}</p> : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInviteOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button onClick={handleInvite} disabled={inviting || !inviteEmail.trim()}>
              {inviting ? t("common.loading") : t("members.sendInvite")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
