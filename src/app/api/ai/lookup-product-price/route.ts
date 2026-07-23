/**
 * POST /api/ai/lookup-product-price
 *
 * Gemini + Google Search grounding → indicative unit price for a product.
 * Never auto-applies; the client must confirm before writing quoteItems.
 */

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { verifyApiAuth } from "@/lib/apiAuth";
import {
  buildProductPriceLookupPrompt,
  extractGroundingUrls,
  parseProductPriceLookupText,
  type ProductPriceLookupResult,
} from "@/lib/ai/productPriceLookup";

export const runtime = "nodejs";
export const maxDuration = 60;

const bodySchema = z.object({
  productName: z.string().trim().min(2).max(240),
  brand: z.string().trim().max(80).optional(),
  sku: z.string().trim().max(80).optional(),
  countryCode: z.string().trim().max(8).optional(),
  currency: z.string().trim().max(8).optional(),
});

export async function POST(req: NextRequest) {
  const auth = await verifyApiAuth(req);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json(
      {
        error: "GEMINI_NOT_CONFIGURED",
        message:
          "GEMINI_API_KEY is not configured on the server. Add it to .env.local and restart npm run dev.",
      },
      { status: 503 }
    );
  }

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const model = process.env.GEMINI_PRICE_LOOKUP_MODEL?.trim() || "gemini-2.0-flash";
  const prompt = buildProductPriceLookupPrompt(body);

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          tools: [{ google_search: {} }],
          generationConfig: { temperature: 0.2 },
        }),
      }
    );

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.error("[lookup-product-price] Gemini error", res.status, detail.slice(0, 400));
      return NextResponse.json(
        { error: "AI price lookup failed", status: res.status },
        { status: 502 }
      );
    }

    const data = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const text =
      data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("\n") ?? "";
    const sourceUrls = extractGroundingUrls(data);
    const result: ProductPriceLookupResult = parseProductPriceLookupText(
      text,
      body.productName,
      sourceUrls
    );

    return NextResponse.json({ result });
  } catch (err) {
    console.error("[lookup-product-price]", err);
    return NextResponse.json({ error: "AI price lookup failed" }, { status: 502 });
  }
}
