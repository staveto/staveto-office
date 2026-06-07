"use client";

import { useRef } from "react";
import { QRCodeCanvas } from "qrcode.react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/I18nContext";
import type { CreateBusinessInviteCodeResult } from "@/services/business/businessInvitesService";
import { Copy, Download } from "lucide-react";

type InviteCodeResultPanelProps = {
  result: CreateBusinessInviteCodeResult;
  showQr?: boolean;
  hideCode?: boolean;
  emailHint?: string;
};

export function InviteCodeResultPanel({
  result,
  showQr = false,
  hideCode = false,
  emailHint,
}: InviteCodeResultPanelProps) {
  const { t } = useI18n();
  const qrRef = useRef<HTMLDivElement>(null);
  const joinUrl = result.webJoinUrl ?? "";

  const copyText = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      /* ignore */
    }
  };

  const downloadQr = () => {
    const canvas = qrRef.current?.querySelector("canvas");
    if (!canvas || !joinUrl) return;
    const link = document.createElement("a");
    link.download = "staveto-invite-qr.png";
    link.href = canvas.toDataURL("image/png");
    link.click();
  };

  return (
    <div className="space-y-4 rounded-lg bg-muted/30 px-4 py-4 ring-1 ring-border/50">
      <p className="text-sm font-medium text-[#1D376A]">{t("members.invites.codeCreated")}</p>

      {emailHint ? (
        <p className="text-xs leading-relaxed text-muted-foreground">
          {t("members.invites.emailShareHint", { email: emailHint })}
        </p>
      ) : null}

      {showQr && joinUrl ? (
        <div className="flex flex-col items-center gap-3">
          <div ref={qrRef} className="rounded-lg bg-white p-3">
            <QRCodeCanvas value={joinUrl} size={180} level="M" includeMargin />
          </div>
          <p className="text-xs text-muted-foreground text-center max-w-xs">
            {t("members.invites.scanQrHint")}
          </p>
        </div>
      ) : null}

      {!hideCode && result.code ? (
        <div>
          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground mb-1">
            {t("members.invites.inviteCode")}
          </p>
          <p className="font-mono text-lg font-semibold tracking-widest text-[#1D376A]">
            {result.code}
          </p>
        </div>
      ) : null}

      {joinUrl ? (
        <div>
          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground mb-1">
            {t("members.invites.joinLink")}
          </p>
          <p className="text-xs break-all text-muted-foreground">{joinUrl}</p>
        </div>
      ) : null}

      {result.expiresAt ? (
        <p className="text-xs text-muted-foreground">
          {t("members.invites.expiresAt", {
            date: new Date(result.expiresAt).toLocaleString(),
          })}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {!hideCode && result.code ? (
          <Button type="button" variant="outline" size="sm" onClick={() => void copyText(result.code)}>
            <Copy className="size-3.5 mr-1.5" aria-hidden />
            {t("members.invites.copyCode")}
          </Button>
        ) : null}
        {joinUrl ? (
          <Button type="button" variant="outline" size="sm" onClick={() => void copyText(joinUrl)}>
            <Copy className="size-3.5 mr-1.5" aria-hidden />
            {t("members.invites.copyLink")}
          </Button>
        ) : null}
        {showQr && joinUrl ? (
          <Button type="button" variant="outline" size="sm" onClick={downloadQr}>
            <Download className="size-3.5 mr-1.5" aria-hidden />
            {t("members.invites.downloadQr")}
          </Button>
        ) : null}
      </div>

      <p className="text-xs leading-relaxed text-muted-foreground">
        {t("members.invites.mobileHint")}
      </p>
    </div>
  );
}
