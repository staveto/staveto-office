"use client";

/**
 * Client for the identifyDrawingSymbol callable — AI names a marked symbol
 * from a small PNG crop of the drawing.
 */

import { getAiCallable } from "@/lib/firebase";

export type IdentifiedSymbol = {
  name: string;
  category:
    | "socket"
    | "switch"
    | "lighting"
    | "led_strip"
    | "cable"
    | "distribution_board"
    | "installation_material"
    | "other"
    | "unknown";
  confidence: "high" | "medium" | "low";
  reason?: string;
};

export async function identifyDrawingSymbol(input: {
  imageBase64: string;
  mimeType?: "image/png" | "image/jpeg";
  language?: "sk" | "de" | "en";
  currentLabel?: string;
  legendEntries?: Array<{ label?: string; description: string }>;
}): Promise<IdentifiedSymbol> {
  const call = getAiCallable<typeof input, IdentifiedSymbol>("identifyDrawingSymbol");
  const result = await call({
    mimeType: "image/png",
    language: "sk",
    ...input,
  });
  return result.data;
}
