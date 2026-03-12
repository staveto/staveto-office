"use client";

import { useEffect, useState } from "react";
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
import {
  getOrganization,
  listOrgMembers,
  listOrgInvites,
  createInvite,
  updateMemberRole,
  removeMember,
  revokeInvite,
  type OrgMemberRow,
  type InviteWithId,
  type OrgMemberRole,
} from "@/lib/organizations";
import { Users, Loader2, Plus, Trash2, UserMinus, Mail } from "lucide-react";

export default function MembersPage() {
  const { t } = useI18n();
  const { user } = useAuth();
  const { activeWorkspace, memberRole } = useWorkspace();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [members, setMembers] = useState<OrgMemberRow[]>([]);
  const [invites, setInvites] = useState<InviteWithId[]>([]);
  const [org, setOrg] = useState<{ seatLimit: number; plan: string } | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<OrgMemberRole>("member");
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [actioning, setActioning] = useState<string | null>(null);

  const isAdmin = memberRole === "admin";
  const isTeam = activeWorkspace?.type === "team";
  const orgId = activeWorkspace?.type === "team" ? activeWorkspace.id : null;

  const load = async () => {
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
      setOrg(orgSnap ? { seatLimit: orgSnap.seatLimit, plan: orgSnap.plan } : null);
      setMembers(membersList);
      setInvites(invitesList);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
      setMembers([]);
      setInvites([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [orgId]);

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
      setInviteError(e instanceof Error ? e.message : "Failed to invite");
    } finally {
      setInviting(false);
    }
  };

  const handleRemoveMember = async (uid: string) => {
    if (!orgId || !confirm(t("members.confirmRemove"))) return;
    setActioning(uid);
    try {
      await removeMember(orgId, uid);
      await load();
    } finally {
      setActioning(null);
    }
  };

  const handleChangeRole = async (uid: string, role: OrgMemberRole) => {
    if (!orgId) return;
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

  const seatsUsed = members.filter((m) => m.status === "active").length;

  if (!isTeam) {
    return (
      <div className="space-y-6">
        <h2 className="text-xl font-semibold">{t("nav.members")}</h2>
        <Card>
          <CardContent className="py-8">
            <p className="text-center text-muted-foreground">
              {t("members.teamOnly")}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <h2 className="text-xl font-semibold">{t("nav.members")}</h2>
        <Card>
          <CardContent className="py-12 flex justify-center">
            <Loader2 className="size-8 animate-spin text-muted-foreground" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <h2 className="text-xl font-semibold">{t("nav.members")}</h2>
        <Card>
          <CardContent className="py-6">
            <p className="text-destructive">{error}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-xl font-semibold">{t("nav.members")}</h2>
        {isAdmin && (
          <Button onClick={() => setInviteOpen(true)} size="sm">
            <Plus className="size-4 mr-2" />
            {t("members.invite")}
          </Button>
        )}
      </div>

      {org && (
        <Card>
          <CardContent className="py-4">
            <p className="text-sm text-muted-foreground">
              {t("members.seatsUsed")}: {seatsUsed} / {org.seatLimit} · {t("members.plan")}: {org.plan}
            </p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="size-4" />
            {t("members.membersList")}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("members.nameCol")}</TableHead>
                <TableHead>{t("members.emailCol")}</TableHead>
                <TableHead>{t("members.roleCol")}</TableHead>
                <TableHead>{t("members.statusCol")}</TableHead>
                {isAdmin && <TableHead className="w-[100px]"></TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.map((m) => (
                <TableRow key={m.uid}>
                  <TableCell>{m.displayName || "-"}</TableCell>
                  <TableCell>{m.email || m.uid}</TableCell>
                  <TableCell>
                    {isAdmin ? (
                      <Select
                        value={m.role}
                        onValueChange={(v) => handleChangeRole(m.uid, v as OrgMemberRole)}
                        disabled={actioning === m.uid}
                      >
                        <SelectTrigger className="w-28 h-8">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="admin">{t("members.roleAdmin")}</SelectItem>
                          <SelectItem value="member">{t("members.roleMember")}</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : (
                      <Badge variant="secondary">{m.role}</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant={m.status === "active" ? "default" : "secondary"}>
                      {m.status}
                    </Badge>
                  </TableCell>
                  {isAdmin && (
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemoveMember(m.uid)}
                        disabled={actioning === m.uid}
                        title={t("members.remove")}
                      >
                        {actioning === m.uid ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : (
                          <UserMinus className="size-4 text-destructive" />
                        )}
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {invites.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Mail className="size-4" />
              {t("members.pendingInvites")}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("members.emailCol")}</TableHead>
                  <TableHead>{t("members.roleCol")}</TableHead>
                  {isAdmin && <TableHead className="w-[80px]"></TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {invites.map((inv) => (
                  <TableRow key={inv.id}>
                    <TableCell>{inv.emailLower}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">{inv.role}</Badge>
                    </TableCell>
                    {isAdmin && (
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
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

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
                  <SelectItem value="admin">{t("members.roleAdmin")}</SelectItem>
                  <SelectItem value="member">{t("members.roleMember")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {inviteError && (
              <p className="text-sm text-destructive">{inviteError}</p>
            )}
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
