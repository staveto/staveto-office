import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAllEstimates, createEstimate } from "@/lib/estimatesStore";

const createEstimateSchema = z.object({
  title: z.string().min(1, "Title is required"),
  clientName: z.string().min(1, "Client name is required"),
  clientEmail: z.string().email().optional().or(z.literal("")),
  status: z.enum(["draft", "sent", "approved", "rejected"]).optional(),
  items: z.array(
    z.object({
      name: z.string().min(1, "Item name is required"),
      qty: z.number().min(0),
      unit: z.string().min(1),
      unitPrice: z.number().min(0),
    })
  ),
  vatPercent: z.number().min(0).max(100).optional(),
  notes: z.string().optional(),
});

export async function GET() {
  // Legacy in-memory store has no workspace scope — fail closed outside dev.
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json([]);
  }

  try {
    const estimates = getAllEstimates();
    return NextResponse.json(estimates);
  } catch (error) {
    console.error("GET /api/estimates:", error);
    return NextResponse.json(
      { error: "Failed to fetch estimates" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({ error: "Not available" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const parsed = createEstimateSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { clientEmail, ...rest } = parsed.data;
    const estimate = createEstimate({
      ...rest,
      clientEmail: clientEmail || undefined,
    });

    return NextResponse.json(estimate, { status: 201 });
  } catch (error) {
    console.error("POST /api/estimates:", error);
    return NextResponse.json(
      { error: "Failed to create estimate" },
      { status: 500 }
    );
  }
}
