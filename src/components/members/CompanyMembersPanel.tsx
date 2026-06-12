"use client";

import { useCallback, useEffect, useState } from "react";
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
  updateMemberRole,
  removeMember,
  revokeInvite,
  type Organization,
  type OrgMemberRole,
  type InviteWithId,
} from "@/lib/organizations";
import {
  fetchBusinessInvites,
  fetchBusinessInviteDisplay,
  regenerateBusinessInviteCode,
  revokeBusinessInvite,
  formatBusinessInviteError,
  getInviteListJoinUrl,
  buildLegacyTokenJoinUrl,
  resolveBusinessInviteDisplay,
  resolveInviteEmailLower,
  buildLegacyInviteDisplay,
  createdInviteToListItem,
  type BusinessInviteListItem,
  type CreateBusinessInviteCodeResult,
} from "@/services/business/businessInvitesService";
import {
  buildCompanyTeamRows,
  canInviteCompanyMembers,
  canManageCompanyMembers,
  getInviteRoleLabelKey,
  getBusinessInviteRoleLabelKey,
  getMemberDisplayLabel,
  isOnlyOwnerTeam,
  resolveOrganizationSeatLimit,
  resolveSeatsUsed,
  type CompanyTeamMemberRow,
  type OrganizationSeatFields,
} from "@/lib/companyRoles";
import {
  MemberRoleCell,
  MemberStatusCell,
  useCurrentUserCompanyRole,
} from "@/components/members/MemberRoleBadge";
import { TeamOverviewHero } from "@/components/members/TeamOverviewHero";
import { TeamFirstInviteCard } from "@/components/members/TeamFirstInviteCard";
import { TeamRoleCards } from "@/components/members/TeamRoleCards";
import { InviteMemberDialog } from "@/components/members/InviteMemberDialog";
import { InviteCodeViewDialog } from "@/components/members/InviteCodeViewDialog";
import { Users, Loader2, Plus, Trash2, UserMinus, Mail, Copy, Link2, QrCode } from "lucide-react";
import { getFirestoreInstance } from "@/lib/firebase";
import { useWorkspaceProduct } from "@/hooks/useWorkspaceProduct";
import { useTeamLiveStatus } from "@/hooks/useTeamLiveStatus";
import { TeamLiveStatusPanel } from "@/components/operations/TeamLiveStatusPanel";
import { canViewOperationsDashboard } from "@/lib/operationsPermissions";

export function CompanyMembersPanel() {
  const { t } = useI18n();
  const { user } = useAuth();
  const { activeWorkspace } = useWorkspace();
  const { role } = useWorkspaceProduct();
  const { activeWorkers } = useTeamLiveStatus(activeWorkspace, user?.id, role);

  const orgId =
    activeWorkspace && isCompanyWorkspaceType(activeWorkspace.type)
      ? (activeWorkspace?.orgId ?? activeWorkspace?.id ?? null)
      : null;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [teamRows, setTeamRows] = useState<CompanyTeamMemberRow[]>([]);
  const [invites, setInvites] = useState<InviteWithId[]>([]);
  const [businessInvites, setBusinessInvites] = useState<BusinessInviteListItem[]>([]);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [actioning, setActioning] = useState<string | null>(null);
  const [viewInviteOpen, setViewInviteOpen] = useState(false);
  const [viewInviteResult, setViewInviteResult] = useState<CreateBusinessInviteCodeResult | null>(
    null
  );
  const [viewInviteEmail, setViewInviteEmail] = useState<string | null>(null);
  const [viewInviteLegacy, setViewInviteLegacy] = useState(false);
  const [viewInviteLoading, setViewInviteLoading] = useState(false);
  const [viewInviteId, setViewInviteId] = useState<string | null>(null);
  const [viewInviteCanRegenerate, setViewInviteCanRegenerate] = useState(false);
  const [viewInviteErrorKey, setViewInviteErrorKey] = useState<string | null>(null);

  const load = useCallback(async (opts?: { background?: boolean }) => {
    if (!orgId) {
      setLoading(false);
      return;
    }
    if (!opts?.background) {
      setLoading(true);
    }
    setError(null);
    try {
      const [orgSnap, membersList, invitesList, businessInvitesList] = await Promise.all([
        getOrganization(orgId),
        listOrgMembers(orgId),
        listOrgInvites(orgId),
        fetchBusinessInvites(orgId),
      ]);

      if (!orgSnap) {
        setError(t("members.loadError"));
        setOrganization(null);
        setTeamRows([]);
        setInvites([]);
        setBusinessInvites([]);
        return;
      }

      setOrganization(orgSnap);
      setInvites(invitesList);
      setBusinessInvites(businessInvitesList);

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
        ownerName = user?.name?.trim() || null;
      }

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
      setBusinessInvites([]);
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

  const legacyPendingInvites = invites.filter((i) => i.status === "pending").length;
  const activeBusinessInvites = businessInvites.filter(
    (i) => i.status === "active" && i.usedCount < i.maxUses
  );
  const pendingInvites = legacyPendingInvites + activeBusinessInvites.length;
  const orgWithSeats = organization as OrganizationSeatFields | null;
  const seatLimit = orgWithSeats ? resolveOrganizationSeatLimit(orgWithSeats) : 5;
  const seatsUsed = orgWithSeats
    ? resolveSeatsUsed(orgWithSeats, teamRows, pendingInvites)
    : 0;
  const seatsFull = seatsUsed >= seatLimit;
  const showFirstInvite = canInvite && isOnlyOwnerTeam(teamRows) && pendingInvites === 0;

  const openInvite = () => {
    setInviteOpen(true);
  };

  const handleInviteCreated = (
    created: CreateBusinessInviteCodeResult,
    meta: { role: string; emailLower?: string | null }
  ) => {
    const item = createdInviteToListItem(created, meta);
    setBusinessInvites((prev) => {
      const without = prev.filter((i) => i.inviteId !== item.inviteId);
      return [item, ...without];
    });
    void load({ background: true });
  };

  const copyInviteLink = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      /* ignore */
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

  const handleRevokeLegacyInvite = async (inviteId: string) => {
    if (!confirm(t("members.confirmRevoke"))) return;
    setActioning(inviteId);
    try {
      await revokeInvite(inviteId);
      await load();
    } finally {
      setActioning(null);
    }
  };

  const handleRevokeBusinessInvite = async (inviteId: string) => {
    if (!orgId || !confirm(t("members.confirmRevoke"))) return;
    setActioning(inviteId);
    try {
      await revokeBusinessInvite(orgId, inviteId);
      await load();
    } finally {
      setActioning(null);
    }
  };

  const openInviteCodeView = (
    result: CreateBusinessInviteCodeResult | null,
    email?: string | null,
    legacy = false
  ) => {
    setViewInviteResult(result);
    setViewInviteEmail(email ?? null);
    setViewInviteLegacy(legacy);
    setViewInviteOpen(true);
  };

  const openBusinessInviteCodeView = async (
    inv: BusinessInviteListItem,
    inviteEmail?: string | null,
    regenerate = false
  ) => {
    if (!orgId) return;
    setViewInviteId(inv.inviteId);
    setViewInviteCanRegenerate(
      inv.type === "direct_email" || Boolean(inviteEmail ?? inv.emailLower)
    );
    setViewInviteEmail(inviteEmail ?? null);
    setViewInviteLegacy(false);
    setViewInviteOpen(true);
    setViewInviteLoading(true);
    setViewInviteResult(null);
    setViewInviteErrorKey(null);

    const cached = resolveBusinessInviteDisplay(orgId, inv);
    if (cached && !regenerate) {
      setViewInviteResult(cached);
      setViewInviteLoading(false);
      return;
    }

    try {
      const loaded = regenerate
        ? await regenerateBusinessInviteCode(orgId, inv, inviteEmail)
        : await fetchBusinessInviteDisplay(orgId, inv.inviteId);
      setViewInviteResult(loaded);
      setViewInviteId(loaded.inviteId);
      setViewInviteErrorKey(null);
      await load({ background: true });
    } catch (error) {
      setViewInviteResult(null);
      setViewInviteErrorKey(formatBusinessInviteError(error));
    } finally {
      setViewInviteLoading(false);
    }
  };

  const handleRegenerateInviteCode = () => {
    if (!orgId || !viewInviteId) return;
    const inv = businessInvites.find((i) => i.inviteId === viewInviteId);
    if (!inv) return;
    void openBusinessInviteCodeView(inv, viewInviteEmail, true);
  };

  const isSelf = useCallback(
    (row: CompanyTeamMemberRow) => (row.userId ?? row.uid) === user?.id,
    [user?.id]
  );

  if (loading) {
    return (
      <>
        <Card>
          <CardContent className="py-12 flex justify-center">
            <Loader2 className="size-8 animate-spin text-muted-foreground" />
          </CardContent>
        </Card>
        {orgId ? (
          <InviteMemberDialog
            open={inviteOpen}
            onOpenChange={setInviteOpen}
            orgId={orgId}
            seatsFull={seatsFull}
            onSuccess={handleInviteCreated}
          />
        ) : null}
      </>
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
    <div className="mx-auto max-w-5xl space-y-8 pb-8">
      {organization ? (
        <TeamOverviewHero
          organization={organization as OrganizationSeatFields}
          teamRows={teamRows}
          pendingInvites={pendingInvites}
          seatsFull={seatsFull}
        />
      ) : null}

      {canViewOperationsDashboard(role) && activeWorkers.length > 0 ? (
        <TeamLiveStatusPanel members={activeWorkers} t={t} />
      ) : null}

      {canInvite ? (
        <div className="flex justify-end">
          <Button
            onClick={openInvite}
            size="sm"
            className="shrink-0 bg-[#1D376A] hover:bg-[#1D376A]/90"
            disabled={seatsFull}
          >
            <Plus className="size-4 mr-2" />
            {t("members.invite")}
          </Button>
        </div>
      ) : null}

      {showFirstInvite ? (
        <TeamFirstInviteCard onInvite={openInvite} disabled={seatsFull} />
      ) : null}

      <TeamRoleCards />

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
                    <span className="inline-flex flex-wrap items-center gap-1.5">
                      <span className="font-medium">{getMemberDisplayLabel(row)}</span>
                      {row.effectiveRole === "owner" ? (
                        <Badge variant="default" className="text-[10px] font-normal">
                          {t("members.ownerBadge")}
                        </Badge>
                      ) : null}
                      {isSelf(row) ? (
                        <Badge variant="outline" className="text-[10px] font-normal">
                          {t("members.currentUserBadge")}
                        </Badge>
                      ) : null}
                    </span>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {row.email || "—"}
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

      {canInvite || businessInvites.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Link2 className="size-4" />
              {t("members.invites.activeTitle")}
            </CardTitle>
            {businessInvites.length === 0 ? (
              <p className="text-xs text-muted-foreground mt-1">
                {t("members.invites.emptyHint")}
              </p>
            ) : null}
          </CardHeader>
          {businessInvites.length > 0 ? (
          <CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("members.emailCol")}</TableHead>
                  <TableHead>{t("members.invites.inviteCode")}</TableHead>
                  <TableHead>{t("members.roleCol")}</TableHead>
                  <TableHead>{t("members.statusCol")}</TableHead>
                  <TableHead>{t("members.invites.usage")}</TableHead>
                  <TableHead>{t("members.invites.expiresCol")}</TableHead>
                  {canManage ? <TableHead className="w-[140px]" /> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {businessInvites.map((inv) => {
                  const joinUrl = getInviteListJoinUrl(inv);
                  const displayResult = orgId ? resolveBusinessInviteDisplay(orgId, inv) : null;
                  const inviteEmail = orgId ? resolveInviteEmailLower(orgId, inv) : inv.emailLower;
                  return (
                    <TableRow key={inv.inviteId}>
                      <TableCell className="text-sm">
                        {inviteEmail ?? "—"}
                      </TableCell>
                      <TableCell className="font-mono text-sm">
                        {displayResult?.code ?? (inv.codePrefix ? `${inv.codePrefix}…` : "—")}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="font-normal">
                          {t(getBusinessInviteRoleLabelKey(inv.role))}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="font-normal">
                          {inv.status === "active"
                            ? t("members.status.active")
                            : inv.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {inv.usedCount}/{inv.maxUses}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {inv.expiresAt
                          ? new Date(inv.expiresAt).toLocaleDateString()
                          : "—"}
                      </TableCell>
                      {canManage ? (
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              title={t("members.invites.showCodeQr")}
                              onClick={() =>
                                void openBusinessInviteCodeView(inv, inviteEmail)
                              }
                            >
                              <QrCode className="size-4" />
                            </Button>
                            {joinUrl ? (
                              <Button
                                variant="ghost"
                                size="sm"
                                title={t("members.invites.copyLink")}
                                onClick={() => void copyInviteLink(joinUrl)}
                              >
                                <Copy className="size-4" />
                              </Button>
                            ) : null}
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => void handleRevokeBusinessInvite(inv.inviteId)}
                              disabled={actioning === inv.inviteId}
                              title={t("members.revoke")}
                            >
                              {actioning === inv.inviteId ? (
                                <Loader2 className="size-4 animate-spin" />
                              ) : (
                                <Trash2 className="size-4 text-destructive" />
                              )}
                            </Button>
                          </div>
                        </TableCell>
                      ) : null}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
          ) : null}
        </Card>
      ) : null}

      {invites.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Mail className="size-4" />
              {t("members.invites.legacyPendingTitle")}
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              {t("members.invites.legacyLinkHint")}
            </p>
          </CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("members.emailCol")}</TableHead>
                  <TableHead>{t("members.roleCol")}</TableHead>
                  <TableHead>{t("members.invites.joinLink")}</TableHead>
                  <TableHead>{t("members.statusCol")}</TableHead>
                  {canManage ? <TableHead className="w-[120px]" /> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {invites.map((inv) => {
                  const legacyJoinUrl = inv.token
                    ? buildLegacyTokenJoinUrl(inv.token)
                    : null;
                  return (
                  <TableRow key={inv.id}>
                    <TableCell>{inv.emailLower}</TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="font-normal">
                        {t(getInviteRoleLabelKey(inv.role))}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-[200px]">
                      {legacyJoinUrl ? (
                        <span
                          className="block truncate text-xs text-muted-foreground font-mono"
                          title={legacyJoinUrl}
                        >
                          {legacyJoinUrl}
                        </span>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="font-normal">
                        {t("members.status.pending")}
                      </Badge>
                    </TableCell>
                    {canManage ? (
                      <TableCell>
                        <div className="flex items-center gap-1">
                          {legacyJoinUrl ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              title={t("members.invites.showCodeQr")}
                              onClick={() =>
                                openInviteCodeView(
                                  buildLegacyInviteDisplay(inv.token!, inv.id),
                                  inv.emailLower,
                                  true
                                )
                              }
                            >
                              <QrCode className="size-4" />
                            </Button>
                          ) : null}
                          {legacyJoinUrl ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              title={t("members.invites.copyLink")}
                              onClick={() => void copyInviteLink(legacyJoinUrl)}
                            >
                              <Copy className="size-4" />
                            </Button>
                          ) : null}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => void handleRevokeLegacyInvite(inv.id)}
                            disabled={actioning === inv.id}
                            title={t("members.revoke")}
                          >
                            {actioning === inv.id ? (
                              <Loader2 className="size-4 animate-spin" />
                            ) : (
                              <Trash2 className="size-4 text-destructive" />
                            )}
                          </Button>
                        </div>
                      </TableCell>
                    ) : null}
                  </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : null}

      {orgId ? (
        <>
          <InviteMemberDialog
            open={inviteOpen}
            onOpenChange={setInviteOpen}
            orgId={orgId}
            seatsFull={seatsFull}
            onSuccess={handleInviteCreated}
          />
          <InviteCodeViewDialog
            open={viewInviteOpen}
            onOpenChange={setViewInviteOpen}
            result={viewInviteResult}
            email={viewInviteEmail}
            legacy={viewInviteLegacy}
            loading={viewInviteLoading}
            errorKey={viewInviteErrorKey}
            canRegenerate={viewInviteCanRegenerate && !viewInviteLoading}
            onRegenerate={handleRegenerateInviteCode}
          />
        </>
      ) : null}
    </div>
  );
}
