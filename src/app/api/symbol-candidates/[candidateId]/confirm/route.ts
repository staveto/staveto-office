/**
 * POST /api/symbol-candidates/:candidateId/confirm
 *
 * Body: { projectId, symbol_type?, quantity_value?, quantity_unit?, create_template? }
 * Uses Firebase Admin when configured; otherwise returns 503 (client SDK path
 * in the takeoff workbench remains the primary UX).
 */

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getAdminDb, isAdminConfigured } from "@/lib/firebaseAdmin";
import { guardProjectAccess, verifyApiAuth } from "@/lib/apiAuth";
import {
  applyConfirmToTakeoffItems,
  defaultLabelForSymbolType,
  defaultSymbolTypeForCandidate,
  findDuplicateConfirmedSymbol,
  sanitizeTakeoffItemForWrite,
} from "@/lib/takeoff/candidateReview";
import type {
  AnalyzeRegionCandidateDto,
  ConfirmedSymbol,
  TakeoffItem,
} from "@/types/pdfTakeoff";

export const runtime = "nodejs";

const bodySchema = z.object({
  projectId: z.string().min(1),
  symbol_type: z.string().min(1).max(80).optional(),
  quantity_value: z.number().positive().max(10_000).optional().default(1),
  quantity_unit: z.string().min(1).max(16).optional().default("ks"),
  create_template: z.boolean().optional().default(false),
  confirmedBy: z.string().optional(),
});

type RouteParams = { params: Promise<{ candidateId: string }> };

export async function POST(req: NextRequest, { params }: RouteParams) {
  const { candidateId } = await params;
  if (!candidateId) {
    return NextResponse.json({ error: "Missing candidateId" }, { status: 400 });
  }
  if (!isAdminConfigured()) {
    return NextResponse.json(
      { error: "Admin not configured — use client confirmSymbolCandidate()" },
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

  const candRef = db
    .collection("projects")
    .doc(body.projectId)
    .collection("symbolCandidates")
    .doc(candidateId);
  const candSnap = await candRef.get();
  if (!candSnap.exists) {
    return NextResponse.json({ error: "Candidate not found" }, { status: 404 });
  }
  const data = candSnap.data() as Record<string, unknown>;
  if (data.status === "rejected") {
    return NextResponse.json({ error: "Candidate rejected" }, { status: 409 });
  }
  if (data.status === "confirmed") {
    return NextResponse.json({ error: "Already confirmed" }, { status: 409 });
  }

  const dto: AnalyzeRegionCandidateDto = {
    id: candidateId,
    page_number: Number(data.pageNumber) || 1,
    bbox_pdf: data.bboxPdf as AnalyzeRegionCandidateDto["bbox_pdf"],
    bbox_px: data.bboxPx as AnalyzeRegionCandidateDto["bbox_px"],
    color_layer: data.colorLayer as AnalyzeRegionCandidateDto["color_layer"],
    kind: data.kind as AnalyzeRegionCandidateDto["kind"],
    label_suggestions:
      (data.labelSuggestions as AnalyzeRegionCandidateDto["label_suggestions"]) ?? [],
    nearby_text: (data.nearbyText as string | null) ?? null,
    confidence: Number(data.confidence) || 0,
    source: data.source as AnalyzeRegionCandidateDto["source"],
    status: data.status as AnalyzeRegionCandidateDto["status"],
    preview_image_url: (data.previewImageUrl as string | null) ?? null,
    normalized_position:
      data.normalizedPosition as AnalyzeRegionCandidateDto["normalized_position"],
  };

  const symbolType = body.symbol_type ?? defaultSymbolTypeForCandidate(dto);
  const name =
    dto.label_suggestions[0]?.label?.trim() || defaultLabelForSymbolType(symbolType);
  const drawingId = String(data.drawingId ?? "");
  const pageNumber = Number(data.pageNumber) || 1;
  const now = new Date().toISOString();

  // Duplicate protection: refuse if a confirmed symbol already overlaps this bbox.
  const confirmedSnap = await db
    .collection("projects")
    .doc(body.projectId)
    .collection("confirmedSymbols")
    .where("drawingId", "==", drawingId)
    .where("pageNumber", "==", pageNumber)
    .get();
  const existingConfirmed = confirmedSnap.docs.map((d) => ({
    ...(d.data() as Omit<ConfirmedSymbol, "id">),
    id: d.id,
  }));
  const duplicate = findDuplicateConfirmedSymbol({
    existing: existingConfirmed,
    drawingId,
    pageNumber,
    normalizedPosition: dto.normalized_position,
  });
  if (duplicate) {
    // No writes happened — surface the existing symbol so the client can
    // offer "open existing evidence" / "discard candidate".
    const evidenceSnap = await db
      .collection("projects")
      .doc(body.projectId)
      .collection("takeoffEvidence")
      .where("confirmedSymbolId", "==", duplicate.id)
      .limit(1)
      .get();
    const existingTakeoffItemId = evidenceSnap.empty
      ? null
      : ((evidenceSnap.docs[0]!.data().takeoffItemId as string | undefined) ?? null);
    return NextResponse.json(
      {
        error: "Duplicate confirmed symbol at this position",
        code: "DUPLICATE_CONFIRMED_SYMBOL",
        errorCode: "DUPLICATE_CONFIRMED_SYMBOL",
        existingSymbolId: duplicate.id,
        existingBboxPdf: duplicate.bboxPdf,
        existingNormalizedPosition: duplicate.normalizedPosition,
        existingPageNumber: duplicate.pageNumber,
        existingTakeoffItemId,
      },
      { status: 409 }
    );
  }

  await candRef.update({ status: "confirmed", updatedAt: now });

  const confirmedRef = db
    .collection("projects")
    .doc(body.projectId)
    .collection("confirmedSymbols")
    .doc();
  const confirmed = {
    candidateId,
    drawingId,
    projectId: body.projectId,
    pageNumber,
    bboxPdf: data.bboxPdf,
    normalizedPosition: data.normalizedPosition,
    symbolType,
    profession: "electrical",
    roomId: null,
    zoneId: null,
    quantityValue: body.quantity_value,
    quantityUnit: body.quantity_unit,
    confirmedBy: body.confirmedBy ?? null,
    confirmationSource: "user",
    confidence: dto.confidence,
    evidenceImageUrl: dto.preview_image_url,
    createdAt: now,
    updatedAt: now,
  };
  await confirmedRef.set(confirmed);

  const itemsSnap = await db
    .collection("projects")
    .doc(body.projectId)
    .collection("takeoffItems")
    .where("drawingId", "==", drawingId)
    .get();
  const items: TakeoffItem[] = itemsSnap.docs.map((d) => ({
    ...(d.data() as Omit<TakeoffItem, "id">),
    id: d.id,
  }));

  const { updatedItem, created } = applyConfirmToTakeoffItems({
    items,
    projectId: body.projectId,
    drawingId,
    profession: "electrical",
    symbolType,
    name,
    unit: body.quantity_unit,
    quantityValue: body.quantity_value,
    now,
    newItemId: db.collection("projects").doc().id,
  });

  const safeItem = sanitizeTakeoffItemForWrite(updatedItem);
  const itemRef = db
    .collection("projects")
    .doc(body.projectId)
    .collection("takeoffItems")
    .doc(safeItem.id);
  if (created) {
    const { id: _id, ...payload } = safeItem;
    void _id;
    await itemRef.set(payload);
  } else {
    await itemRef.update({
      quantity: safeItem.quantity,
      evidenceCount: safeItem.evidenceCount,
      status: safeItem.status,
      updatedAt: now,
    });
  }

  const evidenceRef = db
    .collection("projects")
    .doc(body.projectId)
    .collection("takeoffEvidence")
    .doc();
  await evidenceRef.set({
    takeoffItemId: updatedItem.id,
    confirmedSymbolId: confirmedRef.id,
    drawingId,
    projectId: body.projectId,
    pageNumber,
    bboxPdf: data.bboxPdf,
    normalizedPosition: data.normalizedPosition,
    evidenceImageUrl: dto.preview_image_url,
    createdAt: now,
  });

  if (body.create_template) {
    await db
      .collection("projects")
      .doc(body.projectId)
      .collection("symbolTemplates")
      .add({
        projectId: body.projectId,
        companyId: null,
        profession: "electrical",
        symbolType,
        label: name,
        colorLayer: dto.color_layer,
        templateImageUrl: dto.preview_image_url,
        maskImageUrl: null,
        createdFromSymbolId: confirmedRef.id,
        createdBy: body.confirmedBy ?? null,
        usageCount: 1,
        createdAt: now,
        updatedAt: now,
      });
  }

  return NextResponse.json({
    confirmed_symbol_id: confirmedRef.id,
    takeoff_item_id: updatedItem.id,
    takeoff_item_quantity: updatedItem.quantity,
    evidence_id: evidenceRef.id,
    source_of_quantity: "symbol_detection",
  });
}
