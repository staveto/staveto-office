# AI Project Creation — Current State

> Investigation + estimator upgrade notes for Staveto Office.
> Last updated: 2026-07-12

## 1. Classic flow (unchanged when flag is off)

AI project creation is a **two-step Gemini pipeline**:

1. Upload PDF/images → **Vision summary** (per file).
2. **Text-only draft model** builds a project draft from that summary + user brief.
3. User reviews → `createProjectFromDraft` creates a **sales project** with phases/tasks/materials/`quoteItems`.
4. A real **`quotes/{id}` document** is created later in AI setup (`?setup=ai`).

```
/app/projects/new
  → generateProjectDraft
  → ai-review
  → createProjectFromDraft
  → /app/projects/{id}?setup=ai → upsertQuoteFromProject
```

For dense technical PDFs (e.g. electrical marking plans), classic Vision summaries lose room/item detail.

## 2. AI Estimator / Kalkulant (feature-flagged)

**Flag:** `NEXT_PUBLIC_ENABLE_AI_ESTIMATOR_FLOW=1`  
**Debug:** `NEXT_PUBLIC_AI_ESTIMATOR_DEBUG=1` or `AI_ESTIMATOR_DEBUG=1`

When enabled, generation tries document intelligence first, then still builds a classic draft (enriched with estimator rows). If estimator callables are missing, it falls back to classic `generateProjectDraft` only.

```
Inputs (PDF / photo / text)
  → generateEstimatorFacts
  → AiEstimatorReviewPanel (facts / questions / risks / calc / offer)
  → generateEstimateDraft → generateQuoteDraftFromEstimate
  → convertEstimatorSessionToProject (quote + execution project)
  Fallback: generateProjectDraft
```

Sessions: `workspaces/{storageKey}/aiEstimatorSessions/{sessionId}` (additive; no migration of existing data).

### New Cloud Functions

| Callable | Role |
|----------|------|
| `generateEstimatorFacts` | Per-file structured facts (rooms, items, questions, risks) |
| `generateEstimateDraft` | Estimate lines from session facts |
| `generateQuoteDraftFromEstimate` | Customer-facing quote draft |
| `convertEstimatorSessionToProject` | Quote doc + execution project from session |

### Key client files

| Area | Path |
|------|------|
| Types | `src/types/aiEstimator.ts` |
| Flag | `src/lib/ai/aiEstimatorFeature.ts` |
| Country | `src/lib/ai/estimatorCountryProfile.ts` (SK/CZ/AT/DE/CH) |
| Client API | `src/services/ai/aiEstimatorService.ts` |
| Wizard wire | `src/services/ai/aiWizardGenerationService.ts` |
| Enrich plan | `src/lib/ai/enrichPlanWithEstimatorFacts.ts` |
| UI | `src/components/jobs/new/ai/AiEstimatorReviewPanel.tsx` |
| CF | `functions/src/estimator/*` |

### Limits (raised safely)

- Vision max output tokens: 6144 (classic path)
- Estimator facts max output: 8192
- Draft materials guidance: up to 60; phases/tasks schema: 12×12

### Still not done (safe follow-ups)

- True PDF page-by-page render/OCR (`pageByPageUsed` stays false until added)
- PDF text-layer extraction when `extractedText` is empty on draft files
- Deploy new callables to the Firebase project used by local/prod
- Full manual acceptance on electrical marking PDF / photo-only / text-only

## 3. How to enable locally

1. In `.env.local`:
   ```
   NEXT_PUBLIC_ENABLE_AI_ESTIMATOR_FLOW=1
   NEXT_PUBLIC_AI_ESTIMATOR_DEBUG=1
   ```
2. Deploy functions (or emulator) so `generateEstimatorFacts` etc. exist.
3. Restart Next.js so the public flag is picked up.
4. Create a job via AI with an electrical marking PDF and open the Kalkulant tabs on review.

Without deploy, the wizard logs a fallback reason and uses the classic draft path.
