"use client";

import Link from "next/link";
import {
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useAuth } from "@/context/AuthContext";
import { useI18n } from "@/i18n/I18nContext";
import { useWorkspaceProduct } from "@/hooks/useWorkspaceProduct";
import { getCompanyRoleLabelKey } from "@/lib/companyRoles";
import { SettingsSectionCard } from "./SettingsSectionCard";
import {
  settingsProfileLabelClassName,
  settingsProfileRowClassName,
  settingsProfileValueClassName,
} from "./settingsStyles";

export function SettingsProfileOverview() {
  const { t } = useI18n();
  const { user, profile } = useAuth();
  const { isCompany, companyName, role } = useWorkspaceProduct();

  const displayName =
    profile?.firstName?.trim() ||
    user?.firstName?.trim() ||
    user?.name?.trim() ||
    user?.email ||
    "—";

  const email = user?.email?.trim() || "—";

  const roleLabel =
    isCompany && role
      ? t(getCompanyRoleLabelKey(role))
      : !isCompany
        ? t("header.context.personalLabel")
        : "—";

  return (
    <SettingsSectionCard>
      <CardHeader>
        <CardTitle>{t("settings.profileOverview.title")}</CardTitle>
        <CardDescription className="text-[#4a5568]">
          {t("settings.profileOverview.description")}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <dl className="grid gap-3 sm:grid-cols-2">
          <div className={settingsProfileRowClassName}>
            <dt className={settingsProfileLabelClassName}>
              {t("settings.profileOverview.name")}
            </dt>
            <dd className={settingsProfileValueClassName}>{displayName}</dd>
          </div>
          <div className={settingsProfileRowClassName}>
            <dt className={settingsProfileLabelClassName}>
              {t("settings.profileOverview.email")}
            </dt>
            <dd className={settingsProfileValueClassName}>{email}</dd>
          </div>
          {isCompany ? (
            <>
              <div className={settingsProfileRowClassName}>
                <dt className={settingsProfileLabelClassName}>
                  {t("settings.profileOverview.company")}
                </dt>
                <dd className={settingsProfileValueClassName}>
                  {companyName?.trim() || "—"}
                </dd>
              </div>
              <div className={settingsProfileRowClassName}>
                <dt className={settingsProfileLabelClassName}>
                  {t("settings.profileOverview.role")}
                </dt>
                <dd className={settingsProfileValueClassName}>{roleLabel}</dd>
              </div>
            </>
          ) : null}
        </dl>
        <p className="mt-4 text-sm">
          <Link href="/app/settings#project-invites" className="text-[#1D376A] hover:underline font-medium">
            {t("profile.openInvites")} →
          </Link>
        </p>
      </CardContent>
    </SettingsSectionCard>
  );
}
