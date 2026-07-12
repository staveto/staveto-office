"use client";

import { isAiEstimatorDebugEnabled, isAiEstimatorFlowEnabled } from "@/lib/ai/aiEstimatorFeature";
import { useI18n } from "@/i18n/I18nContext";
import { cn } from "@/lib/utils";

type Props = {
  /** Present when estimator was attempted but classic draft was used instead. */
  fallbackReason?: string | null;
  /** Estimator session successfully returned facts. */
  estimatorActive?: boolean;
  className?: string;
};

/**
 * Status of AI Estimator vs classic fallback.
 * Technical reasons only when NEXT_PUBLIC_AI_ESTIMATOR_DEBUG=1.
 */
export function AiEstimatorFlowStatusBanner({
  fallbackReason,
  estimatorActive,
  className,
}: Props) {
  const { t } = useI18n();
  const enabled = isAiEstimatorFlowEnabled();
  const debug = isAiEstimatorDebugEnabled();
  if (!enabled) return null;

  if (typeof window !== "undefined" && process.env.NODE_ENV === "development") {
    if (fallbackReason) {
      console.warn(`[ai-estimator] Classic AI fallback used because: ${fallbackReason}`);
    } else if (estimatorActive) {
      console.info("[ai-estimator] AI Estimator Flow active");
    }
  }

  if (fallbackReason) {
    return (
      <div
        role="status"
        className={cn(
          "rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100",
          className
        )}
      >
        <p className="font-semibold">{t("projects.aiEstimator.fallback.friendlyTitle")}</p>
        <p className="mt-0.5 text-xs opacity-90">
          {t("projects.aiEstimator.fallback.friendlyBody")}
        </p>
        {debug ? (
          <details className="mt-2 rounded border border-amber-400/40 bg-amber-100/50 px-2 py-1.5 text-xs dark:bg-amber-950/60">
            <summary className="cursor-pointer font-medium">
              {t("projects.aiEstimator.fallback.debugLabel")}
            </summary>
            <pre className="mt-1 whitespace-pre-wrap break-words font-mono opacity-90">
              {fallbackReason}
            </pre>
          </details>
        ) : null}
      </div>
    );
  }

  if (!debug) return null;

  return (
    <div
      role="status"
      className={cn(
        "rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-950 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-100",
        className
      )}
    >
      <p className="font-semibold">{t("projects.aiEstimator.debug.activeTitle")}</p>
      <p className="mt-0.5 text-xs opacity-90">
        {estimatorActive
          ? t("projects.aiEstimator.debug.activeBody")
          : t("projects.aiEstimator.debug.awaitingBody")}
      </p>
    </div>
  );
}
