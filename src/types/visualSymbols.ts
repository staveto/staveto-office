/**
 * Visual symbol counter types (additive, feature-flagged).
 *
 * Templates come from project legend crops / user-confirmed symbols /
 * internal color-hint samples — never from protected IEC/STN images.
 * Detections are heuristic and always carry bbox + confidence + review state.
 */

export type VisualBBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type VisualNormalizedPoint =
  | "switch_point"
  | "socket_point"
  | "double_socket_point"
  | "light_output"
  | "led_strip_point"
  | "unknown";

export type VisualColorHint = "red" | "green" | "orange" | "black" | "unknown";

export type VisualConfidence = "high" | "medium" | "low";

export type VisualSymbolTemplate = {
  id: string;
  source: "project_legend" | "company_custom" | "user_confirmed" | "internal_sample";
  trade: "electrical";
  normalizedPoint: VisualNormalizedPoint;
  label?: string;
  /** Legend entry this template was cropped from, when known. */
  legendEntryId?: string;
  sourcePage: number;
  bbox?: VisualBBox;
  colorHint?: VisualColorHint;
  confidence: VisualConfidence;
};

export type VisualSymbolDetection = {
  id: string;
  templateId?: string;
  normalizedPoint: VisualNormalizedPoint;
  page: number;
  roomName?: string;
  bbox: VisualBBox;
  matchScore: number;
  source: "visual_template_match" | "color_shape_detection" | "ai_visual_review";
  confidence: VisualConfidence;
  needsReview: boolean;
  reviewReason?: string;
  /** Placeholder id for a future crop image of this detection. */
  cropId?: string;
  possibleMeaning?: string;
};
