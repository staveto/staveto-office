/**
 * Assembly rules — derive supporting items from a confirmed occurrence type.
 *
 * Transparent and safe: derived lines are marked source=rule_derived and
 * status=needs_review; the user must confirm, edit or remove them before
 * they influence a fixed quote. Prices are intentionally left empty —
 * we never invent a silent 0 € price.
 */

import type { TakeoffTrade } from "@/types/drawingTakeoff";

export type AssemblyComponent = {
  /** i18n key for the component name. */
  nameKey: string;
  category: "material" | "work";
  /** Quantity per one occurrence of the parent type. */
  qtyPerUnit: number;
  unit: string;
};

export type AssemblyRule = {
  trade: TakeoffTrade;
  /** Type id from TAKEOFF_TYPE_CATALOG. */
  typeId: string;
  components: AssemblyComponent[];
};

export const ASSEMBLY_RULES: AssemblyRule[] = [
  {
    trade: "electrical",
    typeId: "switch",
    components: [
      { nameKey: "takeoff.assembly.switch.device", category: "material", qtyPerUnit: 1, unit: "ks" },
      { nameKey: "takeoff.assembly.common.flushBox", category: "material", qtyPerUnit: 1, unit: "ks" },
      { nameKey: "takeoff.assembly.common.frame", category: "material", qtyPerUnit: 1, unit: "ks" },
      { nameKey: "takeoff.assembly.switch.install", category: "work", qtyPerUnit: 1, unit: "ks" },
      { nameKey: "takeoff.assembly.common.sundries", category: "material", qtyPerUnit: 1, unit: "ks" },
    ],
  },
  {
    trade: "electrical",
    typeId: "socket",
    components: [
      { nameKey: "takeoff.assembly.socket.device", category: "material", qtyPerUnit: 1, unit: "ks" },
      { nameKey: "takeoff.assembly.common.flushBox", category: "material", qtyPerUnit: 1, unit: "ks" },
      { nameKey: "takeoff.assembly.common.frame", category: "material", qtyPerUnit: 1, unit: "ks" },
      { nameKey: "takeoff.assembly.socket.install", category: "work", qtyPerUnit: 1, unit: "ks" },
      { nameKey: "takeoff.assembly.common.sundries", category: "material", qtyPerUnit: 1, unit: "ks" },
    ],
  },
  {
    trade: "electrical",
    typeId: "light",
    components: [
      { nameKey: "takeoff.assembly.light.outlet", category: "material", qtyPerUnit: 1, unit: "ks" },
      { nameKey: "takeoff.assembly.light.install", category: "work", qtyPerUnit: 1, unit: "ks" },
    ],
  },
  {
    trade: "heating",
    typeId: "radiator",
    components: [
      { nameKey: "takeoff.assembly.radiator.body", category: "material", qtyPerUnit: 1, unit: "ks" },
      { nameKey: "takeoff.assembly.radiator.valve", category: "material", qtyPerUnit: 1, unit: "ks" },
      { nameKey: "takeoff.assembly.radiator.returnValve", category: "material", qtyPerUnit: 1, unit: "ks" },
      { nameKey: "takeoff.assembly.radiator.brackets", category: "material", qtyPerUnit: 1, unit: "sada" },
      { nameKey: "takeoff.assembly.radiator.install", category: "work", qtyPerUnit: 1, unit: "ks" },
    ],
  },
  {
    trade: "plumbing",
    typeId: "sink",
    components: [
      { nameKey: "takeoff.assembly.sink.coldWater", category: "material", qtyPerUnit: 1, unit: "ks" },
      { nameKey: "takeoff.assembly.sink.hotWater", category: "material", qtyPerUnit: 1, unit: "ks" },
      { nameKey: "takeoff.assembly.sink.drain", category: "material", qtyPerUnit: 1, unit: "ks" },
      { nameKey: "takeoff.assembly.sink.siphon", category: "material", qtyPerUnit: 1, unit: "ks" },
      { nameKey: "takeoff.assembly.sink.angleValves", category: "material", qtyPerUnit: 2, unit: "ks" },
      { nameKey: "takeoff.assembly.sink.install", category: "work", qtyPerUnit: 1, unit: "ks" },
    ],
  },
];

export function assemblyRuleFor(
  trade: TakeoffTrade,
  typeId: string
): AssemblyRule | undefined {
  return ASSEMBLY_RULES.find((r) => r.trade === trade && r.typeId === typeId);
}
