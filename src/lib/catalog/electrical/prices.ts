import type { CatalogAvailabilityStatus, CatalogPriceStatus } from "./types";

/** Parse European decimal string ("4,24" / "1.234,56") into integer cents. */
export function parseEuroToCents(raw: string | null | undefined): number | null {
  if (raw == null) return null;
  let s = String(raw).trim();
  if (!s) return null;
  s = s.replace(/\s/g, "").replace(/€/gi, "").replace(/[^\d,.\-]/g, "");
  if (!s || s === "-" || s === "," || s === ".") return null;

  // 1.234,56 → 1234.56 ; 4,24 → 4.24 ; 4.24 → 4.24
  if (s.includes(",") && s.includes(".")) {
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (s.includes(",")) {
    s = s.replace(",", ".");
  }

  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100);
}

export type ParsedPricing = {
  netCents: number | null;
  grossCents: number | null;
  priceStatus: CatalogPriceStatus;
  suspiciousReasons: string[];
};

/**
 * Validate net/gross pair. Do not invent missing side.
 * SK VAT 20% → ratio ≈ 1.20; allow 1.05–1.40 band.
 */
export function validatePricePair(
  netCents: number | null,
  grossCents: number | null
): ParsedPricing {
  const reasons: string[] = [];
  let net = netCents;
  let gross = grossCents;

  if (net != null && net < 0) {
    reasons.push("negative_net");
    net = null;
  }
  if (gross != null && gross < 0) {
    reasons.push("negative_gross");
    gross = null;
  }

  if (net == null && gross == null) {
    return {
      netCents: null,
      grossCents: null,
      priceStatus: "missing",
      suspiciousReasons: reasons.length ? reasons : ["missing_both"],
    };
  }

  if (net != null && gross != null) {
    if (net > gross) {
      reasons.push("net_gt_gross");
    }
    if (net > 0) {
      const ratio = gross / net;
      if (ratio < 1.05 || ratio > 1.4) {
        reasons.push("implausible_vat_ratio");
      }
    } else if (gross > 0) {
      reasons.push("zero_net_positive_gross");
    }
  }

  if (reasons.length > 0) {
    return {
      netCents: net,
      grossCents: gross,
      priceStatus: "needs_review",
      suspiciousReasons: reasons,
    };
  }

  return {
    netCents: net,
    grossCents: gross,
    priceStatus: "valid",
    suspiciousReasons: [],
  };
}

export function parseAvailability(sklad: string | null | undefined): {
  quantity: number | null;
  status: CatalogAvailabilityStatus;
} {
  if (sklad == null || String(sklad).trim() === "") {
    return { quantity: null, status: "unknown" };
  }
  const n = Number(String(sklad).replace(",", ".").trim());
  if (!Number.isFinite(n)) return { quantity: null, status: "unknown" };
  const qty = Math.max(0, Math.floor(n));
  return {
    quantity: qty,
    status: qty > 0 ? "in_stock" : "out_of_stock",
  };
}
