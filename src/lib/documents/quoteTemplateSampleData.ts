import type { QuoteDoc } from "@/lib/quotes";
import type { OrganizationPrintInfo } from "@/lib/organizationProfile";
import type { QuotePrintContext } from "@/lib/quoteDocumentMeta";

/** Static sample data for settings preview — no real customer quotes. */
export const SAMPLE_QUOTE: QuoteDoc = {
  id: "sample-preview",
  title: "Electrical installation — sample project",
  projectId: "sample-project",
  projectName: "Sample renovation",
  clientName: "Sample Customer Ltd.",
  clientEmail: "customer@example.com",
  status: "draft",
  items: [
    {
      id: "m1",
      category: "material",
      name: "Cable NYM-J 3×2.5 mm²",
      qty: 120,
      unit: "m",
      unitPrice: 2.4,
      total: 288,
    },
    {
      id: "w1",
      category: "work",
      name: "Installation and connection",
      qty: 16,
      unit: "h",
      unitPrice: 65,
      total: 1040,
    },
  ],
  subtotal: 1328,
  vatPercent: 20,
  vatAmount: 265.6,
  grandTotal: 1593.6,
  currency: "CHF",
  orgId: "sample-org",
};

export const SAMPLE_ORGANIZATION: OrganizationPrintInfo = {
  orgId: "sample-org",
  name: "Sample Builder s.r.o.",
  profile: {
    legalName: "Sample Builder s.r.o.",
    addressText: "Main Street 12",
    city: "Bratislava",
    zip: "811 01",
    country: "SK",
    registrationNumber: "12345678",
    email: "office@sample-builder.sk",
    phone: "+421 900 000 000",
    bankAccount: "SK00 0000 0000 0000 0000 0000",
  },
  market: {
    countryCode: "SK",
    currency: "EUR",
    timezone: "Europe/Bratislava",
    locale: "sk-SK",
    defaultLanguage: "sk",
    taxProfile: null,
    legalProfile: null,
    marketConfigVersion: 1,
  },
};

export const SAMPLE_PRINT_CONTEXT: QuotePrintContext = {
  scopeOfWork:
    "✓ Site preparation\n✓ Material delivery\n✓ Installation and testing\n✓ Final handover",
  conditions:
    "Quote valid for 14 days.\nWork according to agreed scope.\nChanges billed separately.",
  paymentTerms: "50% advance, 50% on completion.",
  contactPerson: {
    name: "Ján Novák",
    role: "Project manager",
    phone: "+421 900 111 222",
    email: "jan@sample-builder.sk",
  },
  priceSummary: {
    materialTotal: 288,
    workTotal: 1040,
    otherTotal: 0,
    netTotal: 1328,
    vatPercent: 20,
    vatAmount: 265.6,
    grossTotal: 1593.6,
    isComplete: true,
    isFlatRate: false,
  },
  currency: "CHF",
  customerNumber: "Z-1042",
  projectNumber: "P-2026-001",
};
