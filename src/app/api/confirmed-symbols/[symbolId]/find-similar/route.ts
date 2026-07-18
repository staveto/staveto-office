/**
 * POST /api/confirmed-symbols/:symbolId/find-similar (Phase 3A)
 *
 * From one confirmed symbol, find visually similar symbols and store them as
 * PROBABLE symbolCandidates (source = template_match) for human review.
 *
 * Safety: never creates confirmedSymbols, never updates takeoffItems, never
 * creates takeoffEvidence — quantities change only via the normal confirm flow.
 *
 * The server cannot render PDFs, so the client provides the rendered page as
 * pageImageBase64 ("page" scope). The browser workbench may instead run the
 * whole flow client-side via findSimilarForConfirmedSymbol() (supports
 * "drawing" scope); this route exposes the same contract with auth for
 * external callers.
 */

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getAdminDb, isAdminConfigured } from "@/lib/firebaseAdmin";
import { guardProjectAccess, verifyApiAuth } from "@/lib/apiAuth";
import { decodePngOrJpegToRgba } from "@/lib/server/rasterDecode";
import {
  matchPageByComponents,
  prepareComponentReference,
} from "@/services/takeoff/similarSymbolDetectionService";
import {
  buildSimilarCandidates,
  FIND_SIMILAR_DEFAULT_THRESHOLD,
  FIND_SIMILAR_MAX_RESULTS,
  type ExistingRect,
} from "@/lib/takeoff/findSimilarFromConfirmed";
import { colorLayerForSymbolType } from "@/services/takeoff/confirmedSymbolSimilarService";
import type { ConfirmedSymbol, SymbolCandidate } from "@/types/pdfTakeoff";

export const runtime = "nodejs";

const bodySchema = z.object({
  projectId: z.string().min(1),
  drawingId: z.string().min(1),
  scope: z.enum(["page", "drawing"]).optional().default("page"),
  sameColorOnly: z.boolean().optional().default(true),
  threshold: z.number().min(0.3).max(1).optional().default(FIND_SIMILAR_DEFAULT_THRESHOLD),
  maxResults: z.number().int().min(1).max(500).optional().default(FIND_SIMILAR_MAX_RESULTS),
  /** Rendered page PNG/JPEG (server cannot render PDFs itself). */
  pageImageBase64: z.string().min(100).max(16_000_000),
  mimeType: z.enum(["image/png", "image/jpeg"]).optional().default("image/png"),
});

type RouteParams = { params: Promise<{ symbolId: string }> };

export async function POST(req: NextRequest, { params }: RouteParams) {
  const { symbolId } = await params;
  if (!symbolId) {
    return NextResponse.json({ error: "Missing symbolId" }, { status: 400 });
  }
  if (!isAdminConfigured()) {
    return NextResponse.json(
      { error: "Admin not configured — use client findSimilarForConfirmedSymbol()" },
      { status: 503 }
    );
  }

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const body = parsed.data;

  const auth = await verifyApiAuth(req);
  if (!auth) {
    return NextResponse.json({ errorCode: "UNAUTHORIZED" }, { status: 401 });
  }
  const denied = await guardProjectAccess(body.projectId, auth.uid, auth.email);
  if (denied) return denied;

  const db = getAdminDb();
  if (!db) {
    return NextResponse.json({ error: "Admin DB unavailable" }, { status: 503 });
  }

  // "drawing" scope needs every page rendered — client-side flow handles that.
  if (body.scope === "drawing") {
    return NextResponse.json(
      {
        error:
          "scope=drawing requires client-side rendering — use findSimilarForConfirmedSymbol()",
      },
      { status: 422 }
    );
  }

  const projectRef = db.collection("projects").doc(body.projectId);
  const symbolSnap = await projectRef.collection("confirmedSymbols").doc(symbolId).get();
  if (!symbolSnap.exists) {
    return NextResponse.json({ error: "Confirmed symbol not found" }, { status: 404 });
  }
  const symbol = { ...(symbolSnap.data() as Omit<ConfirmedSymbol, "id">), id: symbolId };
  if (symbol.projectId !== body.projectId || symbol.drawingId !== body.drawingId) {
    return NextResponse.json(
      { error: "Symbol does not belong to this project/drawing" },
      { status: 403 }
    );
  }

  const pageRaster = await decodePngOrJpegToRgba(body.pageImageBase64);
  if (!pageRaster) {
    return NextResponse.json(
      { error: "Could not decode page image (is sharp installed?)" },
      { status: 422 }
    );
  }

  // Shape matching keys on the reference's dominant ink color (sameColorOnly
  // is inherent). Dark-ink symbols have no color layer to match against here.
  const componentRef = prepareComponentReference(pageRaster, symbol.normalizedPosition);
  if (!componentRef) {
    return NextResponse.json(
      { error: "Reference symbol too small or has no dominant color layer" },
      { status: 422 }
    );
  }
  const matches = matchPageByComponents({
    pageRaster,
    refShape: componentRef.refShape,
    refPxW: componentRef.refPxW,
    refPxH: componentRef.refPxH,
    color: componentRef.color,
    pageNumber: symbol.pageNumber,
    excludeRefPx: componentRef.refPx,
  });

  // Exclusions from Firestore: confirmed symbols + existing candidates.
  const [confirmedSnap, candidatesSnap] = await Promise.all([
    projectRef.collection("confirmedSymbols").where("drawingId", "==", body.drawingId).get(),
    projectRef.collection("symbolCandidates").where("drawingId", "==", body.drawingId).get(),
  ]);
  const confirmedRects: ExistingRect[] = confirmedSnap.docs.map((d) => ({
    pageNumber: Number(d.data().pageNumber) || 1,
    normalizedPosition: d.data().normalizedPosition,
  }));
  const candidateRects: ExistingRect[] = candidatesSnap.docs.map((d) => ({
    pageNumber: Number(d.data().pageNumber) || 1,
    normalizedPosition: d.data().normalizedPosition,
    status: d.data().status,
  }));

  const candidates = buildSimilarCandidates({
    matches,
    sourceSymbol: {
      id: symbol.id,
      symbolType: symbol.symbolType,
      colorLayer: colorLayerForSymbolType(symbol.symbolType),
      pageNumber: symbol.pageNumber,
      normalizedPosition: symbol.normalizedPosition,
    },
    confirmedSymbols: confirmedRects,
    existingCandidates: candidateRects,
    threshold: body.threshold,
    maxResults: body.maxResults,
  });

  // Persist as review-only candidates — no quantity/evidence writes.
  const now = new Date().toISOString();
  for (const c of candidates) {
    const record: Omit<SymbolCandidate, "id"> = {
      projectId: body.projectId,
      drawingId: body.drawingId,
      pageNumber: c.page_number ?? symbol.pageNumber,
      regionId: null,
      bboxPdf: c.bbox_pdf,
      bboxPx: c.bbox_px,
      normalizedPosition: c.normalized_position,
      colorLayer: c.color_layer,
      kind: c.kind,
      labelSuggestions: c.label_suggestions,
      nearbyText: c.nearby_text,
      confidence: c.confidence,
      source: c.source,
      status: c.status,
      previewImageUrl: c.preview_image_url,
      createdAt: now,
      updatedAt: now,
    };
    await projectRef.collection("symbolCandidates").doc(c.id).set(record);
  }

  return NextResponse.json({
    source_symbol_id: symbolId,
    scope: body.scope,
    candidates,
    total: candidates.length,
  });
}
