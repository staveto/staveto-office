import type { ProductCandidate, ProductSearchIntent } from "../productSourcingTypes";
import type { ProductSupplierConnector } from "../productSupplierConnector";

/**
 * In-memory / uploaded pricebook connector.
 * Prefer this over any web scrape — user-owned supplier data.
 */
export function createPricebookConnector(
  entries: ProductCandidate[],
  opts?: { id?: string; name?: string; countryCodes?: string[] }
): ProductSupplierConnector {
  const catalog = entries.filter(
    (e) => typeof e.netUnitPrice === "number" && (e.netUnitPrice ?? 0) > 0
  );

  return {
    id: opts?.id ?? "uploaded_pricebook",
    name: opts?.name ?? "Firemný cenník",
    countryCodes: opts?.countryCodes ?? ["SK", "CZ", "AT", "DE", "CH"],
    supportsSearch: true,
    supportsPrice: true,
    supportsAvailability: false,
    async searchProducts(intent: ProductSearchIntent) {
      const keys = intent.keywords.map((k) => k.toLowerCase());
      return catalog
        .filter((row) => {
          if (row.category === intent.category) return true;
          const hay = `${row.productName} ${row.brand ?? ""} ${row.productCode ?? ""}`.toLowerCase();
          return keys.some((k) => hay.includes(k));
        })
        .map((row) => ({
          ...row,
          id: row.id || `pb_${row.productCode ?? row.productName}`,
          sourceType: "uploaded_pricebook" as const,
          matchReason: row.matchReason ?? "Zhoda vo firemnom cenníku",
          confidence:
            row.confidence === "confirmed" ? ("confirmed" as const) : ("indicative" as const),
        }));
    },
  };
}

/** Previously used / company catalog products. */
export function createCompanyCatalogConnector(
  entries: ProductCandidate[]
): ProductSupplierConnector {
  return createPricebookConnector(entries, {
    id: "company_catalog",
    name: "Firemný katalóg",
  });
}
