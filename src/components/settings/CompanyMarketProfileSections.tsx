"use client";

import { Globe2, Info, ShieldAlert } from "lucide-react";
import type { OrganizationMarketPreview } from "@/lib/market/companyMarketConfig";
import { cn } from "@/lib/utils";

type CompanyMarketProfileSectionsProps = {
  preview: OrganizationMarketPreview;
  t: (key: string, params?: Record<string, string | number>) => string;
};

function PreviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="text-sm font-medium text-foreground sm:text-right">{value}</dd>
    </div>
  );
}

export function CompanyMarketProfileSections({
  preview,
  t,
}: CompanyMarketProfileSectionsProps) {
  const requiredFields =
    preview.requiredLegalFields.length > 0
      ? preview.requiredLegalFields.join(", ")
      : t("settings.companyMarket.none");
  const optionalFields =
    preview.optionalLegalFields.length > 0
      ? preview.optionalLegalFields.join(", ")
      : t("settings.companyMarket.none");

  return (
    <div className="space-y-4">
      {preview.missingCountry ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-800/50 dark:bg-amber-950/35 dark:text-amber-100">
          {t("settings.companyMarket.missingCountryWarning")}
        </p>
      ) : null}

      <p className="rounded-lg border border-[#1D376A]/15 bg-[#1D376A]/[0.04] px-4 py-3 text-sm text-foreground/90 dark:border-[#1D376A]/30 dark:bg-[#1D376A]/10">
        <Info className="mb-1 inline size-4 align-text-bottom text-[#1D376A]" aria-hidden />
        {" "}
        {t("settings.companyMarket.countryChangeInfo")}
      </p>

      <section
        className="rounded-xl border bg-card p-4 shadow-sm space-y-3"
        aria-labelledby="company-market-profile-title"
      >
        <div className="flex items-center gap-2">
          <Globe2 className="size-4 text-[#1D376A]" aria-hidden />
          <h3 id="company-market-profile-title" className="text-sm font-semibold">
            {t("settings.companyMarket.profileTitle")}
          </h3>
        </div>

        {preview.usingCountryDefaults && !preview.missingCountry ? (
          <p className="text-xs text-muted-foreground">
            {t("settings.companyMarket.usingCountryDefaults")}
          </p>
        ) : null}

        <dl className="space-y-2.5">
          <PreviewRow
            label={t("settings.companyMarket.registeredCountry")}
            value={preview.countryDisplayName}
          />
          <PreviewRow label={t("settings.companyMarket.currency")} value={preview.currency} />
          <PreviewRow label={t("settings.companyMarket.timezone")} value={preview.timezone} />
          <PreviewRow label={t("settings.companyMarket.locale")} value={preview.locale} />
          <PreviewRow
            label={t("settings.companyMarket.documentLanguage")}
            value={preview.defaultLanguage}
          />
          <PreviewRow label={t("settings.companyMarket.vatLabel")} value={preview.vatLabel} />
          <PreviewRow
            label={t("settings.companyMarket.registrationLabel")}
            value={preview.registrationNumberLabel}
          />
          <PreviewRow label={t("settings.companyMarket.taxIdLabel")} value={preview.taxIdLabel} />
          <PreviewRow label={t("settings.companyMarket.vatIdLabel")} value={preview.vatIdLabel} />
          <PreviewRow
            label={t("settings.companyMarket.configVersion")}
            value={String(preview.marketConfigVersion)}
          />
          <PreviewRow
            label={t("settings.companyMarket.complianceStatus")}
            value={t("settings.companyMarket.complianceNeedsReview")}
          />
        </dl>
      </section>

      <section
        className="rounded-xl border bg-muted/20 p-4 space-y-3"
        aria-labelledby="company-market-rules-title"
      >
        <h3 id="company-market-rules-title" className="text-sm font-semibold">
          {t("settings.companyMarket.rulesTitle")}
        </h3>

        <div className="space-y-3 text-sm">
          <div>
            <p className="font-medium">{t("settings.companyMarket.rulesDocuments")}</p>
            <ul className="mt-1 list-disc space-y-1 pl-5 text-muted-foreground">
              <li>
                {t("settings.companyMarket.rulesDocLanguage")}: {preview.defaultLanguage}
              </li>
              <li>{t("settings.companyMarket.rulesQuoteFormatting")}</li>
              <li>
                {t("settings.companyMarket.rulesCurrencyFormatting")}: {preview.currency}
              </li>
              <li>
                {t("settings.companyMarket.rulesVatLabel")}: {preview.vatLabel}
              </li>
            </ul>
          </div>

          <div>
            <p className="font-medium">{t("settings.companyMarket.rulesCompanyFields")}</p>
            <ul className="mt-1 list-disc space-y-1 pl-5 text-muted-foreground">
              <li>
                {preview.registrationNumberLabel} ({t("settings.companyMarket.required")}:{" "}
                {requiredFields})
              </li>
              <li>{preview.taxIdLabel}</li>
              <li>{preview.vatIdLabel}</li>
              <li>
                {t("settings.companyMarket.optional")}: {optionalFields}
              </li>
            </ul>
          </div>

          <div>
            <p className="font-medium">{t("settings.companyMarket.rulesFutureInvoices")}</p>
            <p className="mt-1 text-muted-foreground">
              {t("settings.companyMarket.rulesFutureInvoicesHint")}
            </p>
          </div>

          <div className={cn("flex gap-2 rounded-lg border border-muted px-3 py-2")}>
            <ShieldAlert className="size-4 shrink-0 text-muted-foreground mt-0.5" aria-hidden />
            <p className="text-muted-foreground">{t("settings.companyMarket.rulesCompliance")}</p>
          </div>
        </div>
      </section>
    </div>
  );
}
