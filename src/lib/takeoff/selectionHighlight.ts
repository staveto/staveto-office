/**
 * Shared "you are looking at this one" color for the currently selected
 * mark/candidate — used by BOTH the PDF overlay (DrawingPdfViewer) and the
 * right-side review panel (SymbolCandidateReviewPanel) so a mark on the plan
 * and its row in the list always glow the SAME color. That's the only way
 * a user can visually connect "this box on the plan" ↔ "this row in the
 * list" when there are many similarly colored marks.
 *
 * A fixed vivid magenta-violet — never the layer's own color (including the
 * muted violet used for "unknown" layer marks, which this is deliberately
 * brighter/pinker than), so it never blends into similarly colored
 * neighbors.
 */
export const SELECTED_HIGHLIGHT_COLOR = "#C400FF";
