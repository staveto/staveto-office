import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  getEstimateById,
  updateEstimate,
  deleteEstimate,
} from "@/lib/estimatesStore";

const updateEstimateSchema = z.object({
  title: z.string().min(1).optional(),
  clientName: z.string().min(1).optional(),
  clientEmail: z.string().email().optional().or(z.literal("")),
  status: z.enum(["draft", "sent", "approved", "rejected"]).optional(),
  items: z
    .array(
      z.object({
        name: z.string().min(1),
        qty: z.number().min(0),
        unit: z.string().min(1),
        unitPrice: z.number().min(0),
      })
    )
    .optional(),
  vatPercent: z.number().min(0).max(100).optional(),
  notes: z.string().optional(),
});

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const estimate = getEstimateById(id);

  if (!estimate) {
    return NextResponse.json({ error: "Estimate not found" }, { status: 404 });
  }

  return NextResponse.json(estimate);
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const estimate = getEstimateById(id);

  if (!estimate) {
    return NextResponse.json({ error: "Estimate not found" }, { status: 404 });
  }

  try {
    const body = await request.json();
    const parsed = updateEstimateSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { clientEmail, ...rest } = parsed.data;
    const updated = updateEstimate(id, {
      ...rest,
      clientEmail: clientEmail !== undefined ? (clientEmail || undefined) : undefined,
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("PUT /api/estimates/[id]:", error);
    return NextResponse.json(
      { error: "Failed to update estimate" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const deleted = deleteEstimate(id);

  if (!deleted) {
    return NextResponse.json({ error: "Estimate not found" }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}
