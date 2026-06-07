"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n/I18nContext";
import {
  type InviteRoleChoice,
  isInviteRoleChoiceAvailable,
  mapInviteRoleChoiceToBusinessRole,
} from "@/lib/companyRoles";
import { mapInviteChoiceToPreviewRole } from "@/lib/rolePermissions";
import { RolePermissionPreview } from "@/components/members/RolePermissionPreview";
import { InviteCodeResultPanel } from "@/components/members/InviteCodeResultPanel";
import {
  cacheBusinessInviteCode,
  createBusinessInviteCode,
  formatBusinessInviteError,
  type CreateBusinessInviteCodeResult,
} from "@/services/business/businessInvitesService";
import { ArrowLeft, ArrowRight, QrCode, Hash } from "lucide-react";

const INVITE_ROLE_CHOICES: InviteRoleChoice[] = [
  "manager",
  "worker",
  "viewer",
  "partner",
  "customer",
];

type InviteMethod = "code" | "qr";

type DialogStep = "role" | "email" | "method" | "result";

type InviteMemberDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orgId: string;
  seatsFull: boolean;
  onSuccess?: (created: CreateBusinessInviteCodeResult, meta: { role: string; emailLower?: string | null }) => void;
};

export function InviteMemberDialog({
  open,
  onOpenChange,
  orgId,
  seatsFull,
  onSuccess,
}: InviteMemberDialogProps) {
  const { t } = useI18n();
  const [step, setStep] = useState<DialogStep>("role");
  const [roleChoice, setRoleChoice] = useState<InviteRoleChoice>("worker");
  const [method, setMethod] = useState<InviteMethod>("code");
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CreateBusinessInviteCodeResult | null>(null);
  const [invitedEmail, setInvitedEmail] = useState<string | null>(null);
  const [createdForSuccess, setCreatedForSuccess] = useState<{
    result: CreateBusinessInviteCodeResult;
    emailLower?: string | null;
  } | null>(null);

  useEffect(() => {
    if (!open) {
      setStep("role");
      setRoleChoice("worker");
      setMethod("code");
      setEmail("");
      setError(null);
      setResult(null);
      setInvitedEmail(null);
      setCreatedForSuccess(null);
      setSubmitting(false);
    }
  }, [open]);

  const runCreate = async (opts: {
    emailLower?: string;
    requiresApproval: boolean;
    nextStep: DialogStep;
  }) => {
    if (!orgId || seatsFull) return;
    setSubmitting(true);
    setError(null);
    try {
      const created = await createBusinessInviteCode({
        orgId,
        role: mapInviteRoleChoiceToBusinessRole(roleChoice),
        emailLower: opts.emailLower,
        requiresApproval: opts.requiresApproval,
        platform: "web",
      });
      cacheBusinessInviteCode(orgId, created, {
        role: mapInviteRoleChoiceToBusinessRole(roleChoice),
        emailLower: opts.emailLower ?? null,
      });
      setResult(created);
      setInvitedEmail(opts.emailLower ?? null);
      setCreatedForSuccess({ result: created, emailLower: opts.emailLower ?? null });
      setStep(opts.nextStep);
    } catch (e) {
      const key = formatBusinessInviteError(e);
      setError(t(key));
    } finally {
      setSubmitting(false);
    }
  };

  const handleContinueFromRole = () => {
    if (isInviteRoleChoiceAvailable(roleChoice)) {
      setStep("email");
    }
  };

  const handleSelectMethod = async (selected: InviteMethod) => {
    setMethod(selected);
    await runCreate({ requiresApproval: true, nextStep: "result" });
  };

  const handleEmailSubmit = async () => {
    const normalized = email.trim().toLowerCase();
    if (!normalized) return;
    await runCreate({
      emailLower: normalized,
      requiresApproval: false,
      nextStep: "result",
    });
  };

  const handleClose = () => {
    if (step === "result" && createdForSuccess) {
      onSuccess?.(createdForSuccess.result, {
        role: mapInviteRoleChoiceToBusinessRole(roleChoice),
        emailLower: createdForSuccess.emailLower ?? null,
      });
    }
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {step === "role"
              ? t("members.inviteDialog.chooseRole")
              : step === "method"
                ? t("members.inviteDialog.chooseMethod")
                : step === "email"
                  ? t("members.invites.inviteByEmail")
                  : step === "result" && invitedEmail
                    ? t("members.invites.inviteByEmail")
                    : method === "qr"
                      ? t("members.invites.createQrCode")
                      : t("members.invite")}
          </DialogTitle>
        </DialogHeader>

        {seatsFull ? (
          <p className="text-sm text-[#e06737]">{t("members.seatsFullWarning")}</p>
        ) : null}

        {step === "role" ? (
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">
              {t("members.inviteDialog.rolePrompt")}
            </p>
            <ul className="space-y-2" role="list">
              {INVITE_ROLE_CHOICES.map((choice) => {
                const available = isInviteRoleChoiceAvailable(choice);
                const selected = roleChoice === choice;
                return (
                  <li key={choice}>
                    <button
                      type="button"
                      disabled={!available || seatsFull}
                      onClick={() => available && setRoleChoice(choice)}
                      className={cn(
                        "w-full rounded-xl px-4 py-3 text-left ring-1 transition-colors",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e06737]/40",
                        !available && "cursor-not-allowed opacity-60",
                        available && "cursor-pointer hover:bg-muted/40",
                        selected && available
                          ? "border-l-[3px] border-l-[#e06737] bg-[#e06737]/[0.06] ring-[#e06737]/25 pl-[calc(1rem-3px)]"
                          : "border-l-[3px] border-l-transparent ring-border/60"
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium">
                          {t(`members.inviteDialog.role.${choice}.title`)}
                        </span>
                        {!available ? (
                          <Badge variant="secondary" className="text-[10px] font-normal">
                            {t("members.rolesSection.comingSoon")}
                          </Badge>
                        ) : null}
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {t(`members.inviteDialog.role.${choice}.description`)}
                      </p>
                    </button>
                  </li>
                );
              })}
            </ul>
            {isInviteRoleChoiceAvailable(roleChoice) ? (
              <div className="rounded-lg bg-muted/30 px-3 py-3 ring-1 ring-border/50">
                <RolePermissionPreview
                  role={mapInviteChoiceToPreviewRole(roleChoice)}
                  compact
                />
              </div>
            ) : null}
          </div>
        ) : null}

        {step === "email" ? (
          <div className="space-y-4 py-2">
            <div className="rounded-lg bg-muted/40 px-3 py-2 text-sm">
              <span className="text-muted-foreground">{t("members.roleCol")}: </span>
              <span className="font-medium">
                {t(`members.inviteDialog.role.${roleChoice}.title`)}
              </span>
            </div>
            <p className="text-sm text-muted-foreground">
              {t("members.inviteDialog.emailPrompt")}
            </p>
            <RolePermissionPreview
              role={mapInviteChoiceToPreviewRole(roleChoice)}
              compact
            />
            <div>
              <Label htmlFor="invite-email">{t("members.emailCol")}</Label>
              <Input
                id="invite-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="email@example.com"
                className="mt-1"
                autoFocus
              />
            </div>
            <button
              type="button"
              className="text-xs text-[#1D376A] underline underline-offset-2 hover:text-[#1D376A]/80"
              onClick={() => setStep("method")}
              disabled={submitting}
            >
              {t("members.inviteDialog.codeOnlyLink")}
            </button>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
          </div>
        ) : null}

        {step === "method" ? (
          <div className="space-y-3 py-2">
            <div className="rounded-lg bg-muted/40 px-3 py-2 text-sm">
              <span className="text-muted-foreground">{t("members.roleCol")}: </span>
              <span className="font-medium">
                {t(`members.inviteDialog.role.${roleChoice}.title`)}
              </span>
            </div>
            <p className="text-sm text-muted-foreground">
              {t("members.inviteDialog.methodPrompt")}
            </p>
            <ul className="space-y-2" role="list">
              {(
                [
                  { id: "code" as const, icon: Hash, label: "members.invites.createInviteCode" },
                  { id: "qr" as const, icon: QrCode, label: "members.invites.createQrCode" },
                ] as const
              ).map(({ id, icon: Icon, label }) => (
                <li key={id}>
                  <button
                    type="button"
                    disabled={submitting || seatsFull}
                    onClick={() => void handleSelectMethod(id)}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left ring-1 ring-border/60",
                      "hover:bg-muted/40 transition-colors",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e06737]/40"
                    )}
                  >
                    <Icon className="size-5 shrink-0 text-[#1D376A]" aria-hidden />
                    <span className="text-sm font-medium">{t(label)}</span>
                  </button>
                </li>
              ))}
            </ul>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
          </div>
        ) : null}

        {step === "result" && result ? (
          <div className="py-2">
            <InviteCodeResultPanel
              result={result}
              showQr
              emailHint={invitedEmail ?? undefined}
            />
          </div>
        ) : null}

        <DialogFooter className="gap-2 sm:gap-0">
          {step === "result" ? (
            <Button type="button" onClick={handleClose}>
              {t("members.invites.done")}
            </Button>
          ) : step === "email" ? (
            <>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setStep("role")}
                disabled={submitting}
              >
                <ArrowLeft className="size-4 mr-1" aria-hidden />
                {t("members.inviteDialog.back")}
              </Button>
              <Button
                type="button"
                onClick={() => void handleEmailSubmit()}
                disabled={submitting || !email.trim() || seatsFull}
              >
                {submitting ? t("common.loading") : t("members.invites.generateInvite")}
              </Button>
            </>
          ) : step === "method" ? (
            <>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setStep("email")}
                disabled={submitting}
              >
                <ArrowLeft className="size-4 mr-1" aria-hidden />
                {t("members.inviteDialog.back")}
              </Button>
              <Button type="button" variant="outline" onClick={handleClose} disabled={submitting}>
                {t("common.cancel")}
              </Button>
            </>
          ) : step === "role" ? (
            <>
              <Button type="button" variant="outline" onClick={handleClose}>
                {t("common.cancel")}
              </Button>
              <Button
                type="button"
                onClick={handleContinueFromRole}
                disabled={seatsFull || !isInviteRoleChoiceAvailable(roleChoice)}
              >
                {t("members.inviteDialog.continue")}
                <ArrowRight className="size-4 ml-1" aria-hidden />
              </Button>
            </>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
