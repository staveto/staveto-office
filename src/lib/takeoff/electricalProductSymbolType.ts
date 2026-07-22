/**
 * Map electrical catalog productType → takeoff marker symbol type.
 * Used when starting rapid marking from the BUCO catalog picker.
 */

import type { ElectricalCatalogProduct } from "@/lib/catalog/electrical/types";

const TAKEOFF_SYMBOL_TYPES = new Set([
  "socket",
  "switch",
  "light",
  "led_strip",
  "distribution_board",
  "generic",
  "unknown",
]);

/**
 * Best-effort symbol type for PDF marking from a catalog product.
 * Falls back to "generic" when the product is not a plan symbol.
 */
export function symbolTypeFromElectricalProduct(
  product: ElectricalCatalogProduct
): string {
  const pt = (product.productType ?? "").toLowerCase();
  const name = `${product.name} ${(product.categoryPathNames ?? []).join(" ")}`.toLowerCase();

  if (
    pt.includes("double_socket") ||
    pt.includes("socket") ||
    pt.includes("cee_socket") ||
    pt.includes("usb_charger") ||
    pt.includes("cable_outlet") ||
    /\bzásuvk|\bzasuvk/.test(name)
  ) {
    return "socket";
  }
  if (
    pt.includes("switch") ||
    pt.includes("button") ||
    pt.includes("dimmer") ||
    pt.includes("blind_control") ||
    /\bvypínač|\bvypinac|\bspínač|\bspinac/.test(name)
  ) {
    return "switch";
  }
  if (pt.includes("led") || /led.?pásek|led.?pasek|led strip/.test(name)) {
    return "led_strip";
  }
  if (
    pt.includes("luminaire") ||
    pt === "light" ||
    /\bsvetl|\blamp|\blumin/.test(name)
  ) {
    return "light";
  }
  if (
    pt.includes("distribution_board") ||
    pt.includes("enclosure") ||
    /\brozvodn|\bskríž|\bskrin/.test(name)
  ) {
    return "distribution_board";
  }

  if (TAKEOFF_SYMBOL_TYPES.has(pt)) return pt;
  return "generic";
}
