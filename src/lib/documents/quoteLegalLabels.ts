/**
 * Country-specific legal/tax label placeholders for quote documents.
 * complianceStatus is always needs_legal_review — not final legal compliance.
 */
import type { LegalProfile, TaxProfile } from "@/lib/market/marketProfileContract";
import { normalizeCountryCode } from "@/lib/workspace/countryConfig";

export type QuoteLegalLabels = {
  registrationNumberLabel: string;
  taxIdLabel: string;
  vatIdLabel: string;
  vatLabel: string;
  complianceStatus: "needs_legal_review";
};

const COUNTRY_LEGAL_DEFAULTS: Record<string, QuoteLegalLabels> = {
  SK: {
    registrationNumberLabel: "IČO",
    taxIdLabel: "DIČ",
    vatIdLabel: "IČ DPH",
    vatLabel: "DPH",
    complianceStatus: "needs_legal_review",
  },
  CZ: {
    registrationNumberLabel: "IČO",
    taxIdLabel: "DIČ",
    vatIdLabel: "DIČ / VAT ID",
    vatLabel: "DPH",
    complianceStatus: "needs_legal_review",
  },
  DE: {
    registrationNumberLabel: "Handelsregisternummer",
    taxIdLabel: "Steuernummer",
    vatIdLabel: "USt-IdNr.",
    vatLabel: "MwSt.",
    complianceStatus: "needs_legal_review",
  },
  AT: {
    registrationNumberLabel: "Firmenbuchnummer",
    taxIdLabel: "Steuernummer",
    vatIdLabel: "UID-Nummer",
    vatLabel: "USt.",
    complianceStatus: "needs_legal_review",
  },
  CH: {
    registrationNumberLabel: "UID",
    taxIdLabel: "Unternehmens-ID",
    vatIdLabel: "MWST-Nr.",
    vatLabel: "MWST",
    complianceStatus: "needs_legal_review",
  },
};

const GENERIC_DEFAULTS: QuoteLegalLabels = {
  registrationNumberLabel: "Registration no.",
  taxIdLabel: "Tax ID",
  vatIdLabel: "VAT ID",
  vatLabel: "VAT",
  complianceStatus: "needs_legal_review",
};

export function getCountryLegalLabelDefaults(
  countryCode: string | null | undefined
): QuoteLegalLabels {
  const normalized = normalizeCountryCode(countryCode);
  if (normalized && COUNTRY_LEGAL_DEFAULTS[normalized]) {
    return { ...COUNTRY_LEGAL_DEFAULTS[normalized] };
  }
  return { ...GENERIC_DEFAULTS };
}

export function resolveQuoteLegalLabels(
  countryCode: string | null | undefined,
  legalProfile?: LegalProfile | null,
  taxProfile?: TaxProfile | null
): QuoteLegalLabels {
  const defaults = getCountryLegalLabelDefaults(countryCode);
  return {
    registrationNumberLabel:
      legalProfile?.companyRegistrationNumberLabel?.trim() ||
      defaults.registrationNumberLabel,
    taxIdLabel: legalProfile?.taxIdLabel?.trim() || defaults.taxIdLabel,
    vatIdLabel: legalProfile?.vatIdLabel?.trim() || defaults.vatIdLabel,
    vatLabel: taxProfile?.vatLabel?.trim() || defaults.vatLabel,
    complianceStatus: "needs_legal_review",
  };
}
