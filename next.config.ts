import type { NextConfig } from "next";

const PRODUCTION_AI_ENV = {
  NEXT_PUBLIC_ENABLE_AI_ESTIMATOR_FLOW:
    process.env.NEXT_PUBLIC_ENABLE_AI_ESTIMATOR_FLOW ?? "1",
  NEXT_PUBLIC_ENABLE_AI_SYMBOL_LIBRARY:
    process.env.NEXT_PUBLIC_ENABLE_AI_SYMBOL_LIBRARY ?? "1",
  NEXT_PUBLIC_ENABLE_AI_EVIDENCE_PDF_VIEWER:
    process.env.NEXT_PUBLIC_ENABLE_AI_EVIDENCE_PDF_VIEWER ?? "1",
  NEXT_PUBLIC_ENABLE_AI_SYMBOL_READING:
    process.env.NEXT_PUBLIC_ENABLE_AI_SYMBOL_READING ?? "1",
  NEXT_PUBLIC_ENABLE_AI_VISUAL_SYMBOL_COUNTER:
    process.env.NEXT_PUBLIC_ENABLE_AI_VISUAL_SYMBOL_COUNTER ?? "1",
  NEXT_PUBLIC_ENABLE_PRODUCT_SOURCING:
    process.env.NEXT_PUBLIC_ENABLE_PRODUCT_SOURCING ?? "1",
} as const;

const nextConfig: NextConfig = {
  env: PRODUCTION_AI_ENV,
  async headers() {
    return [
      {
        source: "/app/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "no-store, must-revalidate",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
