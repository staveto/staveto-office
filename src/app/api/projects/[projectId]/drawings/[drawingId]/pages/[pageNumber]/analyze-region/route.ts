/**
 * POST /api/projects/:projectId/drawings/:drawingId/pages/:pageNumber/analyze-region
 *
 * Phase 1: color-mask + contour candidates from a rendered region crop.
 * Does not call Gemini and does not write quote quantities.
 *
 * Body: AnalyzeRegionRequest (imageBase64 of the region crop required on server).
 * Browser takeoff UI may also call analyzeDrawingRegion() client-side and
 * persist to Firestore directly — this route exposes the same detection contract.
 */

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import {
  guardProjectAccess,
  requireAdminConfigured,
  verifyApiAuth,
} from "@/lib/apiAuth";
import { analyzeRegionFromRaster } from "@/services/takeoff/analyzeRegionService";
import { decodePngOrJpegToRgba } from "@/lib/server/rasterDecode";
import type { BBoxPx } from "@/types/pdfTakeoff";

export const runtime = "nodejs";

const bodySchema = z.object({
  bbox_pdf: z.tuple([z.number(), z.number(), z.number(), z.number()]),
  profession: z.string().min(1).max(64).default("electrical"),
  mode: z.literal("find_all_candidates").optional().default("find_all_candidates"),
  use_gemini_for_uncertain: z.boolean().optional().default(false),
  imageBase64: z.string().min(100).max(8_000_000),
  mimeType: z.enum(["image/png", "image/jpeg"]).optional().default("image/png"),
  pageWidthPx: z.number().positive(),
  pageHeightPx: z.number().positive(),
  /** Crop placement on the page: [x, y, w, h] in page pixels. */
  regionBboxPx: z.tuple([z.number(), z.number(), z.number(), z.number()]),
  pageWidthPt: z.number().positive().optional(),
  pageHeightPt: z.number().positive().optional(),
});

type RouteParams = {
  params: Promise<{
    projectId: string;
    drawingId: string;
    pageNumber: string;
  }>;
};

export async function POST(req: NextRequest, { params }: RouteParams) {
  const { projectId, drawingId, pageNumber: pageRaw } = await params;
  const pageNumber = Number(pageRaw);
  if (!projectId || !drawingId || !Number.isFinite(pageNumber) || pageNumber < 1) {
    return NextResponse.json({ error: "Invalid path parameters" }, { status: 400 });
  }

  if (!requireAdminConfigured()) {
    return NextResponse.json({ errorCode: "ADMIN_NOT_CONFIGURED" }, { status: 503 });
  }
  const auth = await verifyApiAuth(req);
  if (!auth) {
    return NextResponse.json({ errorCode: "UNAUTHORIZED" }, { status: 401 });
  }
  const denied = await guardProjectAccess(projectId, auth.uid, auth.email);
  if (denied) return denied;

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid body", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const body = parsed.data;
  // Phase 1: Gemini fallback is intentionally ignored (wired in Phase 4).
  void body.use_gemini_for_uncertain;
  void body.mode;
  void body.bbox_pdf;

  void body.mimeType;
  const regionRaster = await decodePngOrJpegToRgba(body.imageBase64);
  if (!regionRaster) {
    return NextResponse.json(
      {
        error:
          "Could not decode region image. Install sharp (npm i sharp) or use the client-side analyzeDrawingRegion flow.",
      },
      { status: 422 }
    );
  }

  const regionBboxPx = body.regionBboxPx as BBoxPx;
  const regionId = `reg_api_${Date.now().toString(36)}`;

  const result = analyzeRegionFromRaster({
    regionRaster,
    pageNumber,
    profession: body.profession,
    regionBboxPx,
    pageWidthPx: body.pageWidthPx,
    pageHeightPx: body.pageHeightPx,
    pageWidthPt: body.pageWidthPt,
    pageHeightPt: body.pageHeightPt,
    regionId,
  });

  return NextResponse.json({
    ...result,
    // Echo path context for clients that only hit the API.
    project_id: projectId,
    drawing_id: drawingId,
    page_number: pageNumber,
  });
}
