# PDF Takeoff — Dependency Audit

Audit date: 2026-07-17  
App: Staveto Office (Next.js / React / TypeScript + Firebase)

## Audited table

| Tool | Installed? | Implemented? | Where used | Should install now? | Reason |
|------|------------|--------------|------------|---------------------|--------|
| **pdfjs-dist** | Yes | Yes | `DrawingPdfViewer`, `PlanTakeoffWorkbench`, `takeoffImageService`, `similarSymbolDetectionService` | No (already present) | Core PDF render + overlays |
| **sharp** | Yes | Yes | `src/lib/server/rasterDecode.ts` → analyze-region / find-similar API; `functions` also has sharp | No | Server PNG/JPEG → RGBA |
| **firebase** | Yes | Yes | Auth, Firestore, Storage client | No | App data layer |
| **firebase-admin** | Yes | Yes | API routes / admin | No | Server auth + privileged writes |
| **tesseract.js** | Yes | Yes | `ocrAdapter.ts` → nearbyText on candidates | No | Context-only OCR |
| **OpenCV JS** | No | No (custom CC instead) | — | **No** | Keep custom raster detector in Next.js |
| **pg / pgvector (npm)** | Yes* | **No** | Not imported by takeoff code | **No wire** | Present from earlier install; unused — do not use this phase |
| **Azure Document Intelligence SDK** | Yes* | **No** | Not imported by takeoff code | **No wire** | Unused; optional later |
| **SAM / GroundingDINO / YOLO / Detectron2** | No | No | — | **No** | Need labeled dataset first |
| **pypdfium2** | Machine / worker req only | No (not wired) | `services/takeoff-analyzer-worker/requirements.txt` | Worker only | Not in Next.js |
| **pdfplumber / pdfminer.six** | Worker req only | No | Worker scaffold | Worker only | Vector/text extract later |
| **opencv-python-headless** | Worker req only | No | Worker scaffold | Worker only | Server CV later |
| **numpy / Pillow / pytesseract** | Worker req only | No | Worker scaffold | Worker only | Worker image/OCR |
| **PaddleOCR** | No | No | — | **No (optional later)** | Heavy; README optional extra |
| **PyMuPDF** | No | No | — | **Never** | AGPL risk |
| **Qdrant** | No | No | — | **No** | External; later embeddings |
| **Postgres / pgvector server** | No (compose file only) | No | `docker-compose.pgvector.yml` | **No** until Docker + product need | Compose exists; Docker not required for current phase |
| **CVAT / Label Studio** | No | No | — | **No** | Offline labeling tools |

\* Installed in `package.json` but **not implemented** in takeoff flows.

## What is installed (main Next.js app)

Safe runtime packages already present and used:

- `pdfjs-dist` — page render, markers, crops
- `sharp` — server raster decode
- `firebase` / `firebase-admin`
- `tesseract.js` — nearby OCR text

Also present but **unused by takeoff** (do not expand this phase):

- `pg`, `pgvector`
- `@azure-rest/ai-document-intelligence`, `@azure/core-auth`

Firebase Functions (`functions/package.json`): `sharp`, `firebase-admin`, `@google/generative-ai` (Gemini for drafts/estimator — **not** takeoff symbol fallback).

## What is implemented

| Capability | Status | Notes |
|------------|--------|-------|
| PDF.js viewer + overlays | Yes | `DrawingPdfViewer` / `PlanTakeoffWorkbench` |
| Analyze region (raster color masks) | Yes | `visualSymbolCounter` + `regionAnalyzer` + `analyzeRegionService` |
| Custom connected components | Yes | Labeled `source: "opencv"` historically — **not** real OpenCV |
| Symbol candidates / confirm / reject | Yes | Quantities only after confirm |
| Find similar | Yes | Probable `template_match` candidates only; no auto confirm / evidence |
| OCR nearby text | Yes | Context-only; never updates quantities |
| Preview/evidence/template images | Yes | Firebase Storage under project takeoff paths |
| Vector path/curve/line extraction | **Missing** | No `getOperatorList` extractor; worker not wired |
| Gemini takeoff symbol fallback | **Disabled** | Not used in analyze-region pipeline |
| Python worker | Scaffold only | `services/takeoff-analyzer-worker/` — **not called** |

## What is missing (intentionally)

- True vector PDF extraction
- Production Python worker call path
- Real OpenCV in the browser
- PaddleOCR / SAM / detectors
- Qdrant / live pgvector usage
- CVAT / Label Studio

## What not to install now

Do **not** add to the main Next.js app:

- pypdfium2, pdfplumber, opencv-python, PaddleOCR  
- SAM, GroundingDINO, RT-DETR, YOLOX, MMDetection, Detectron2  
- CVAT, Label Studio, Qdrant server, pgvector **usage**  
- PyMuPDF (AGPL)

## Current recommended path

1. **Analyze Region v2 A1** — template matching *inside* analyze region (reuse Find Similar matching; still probable candidates only)
2. **Symbol Scan & Highlight UX** — clearer candidate panel / highlight feedback
3. **Plan type detector v2 via PDF.js** — raster / vector / hybrid heuristics without Python
4. **Optional Python worker** — wire only after auth + Cloud Run TODOs (`services/takeoff-analyzer-worker`)
5. **Later ML tools** — only after a labeled symbol dataset exists

## Doctor

```bash
npm run takeoff:doctor
```

UI (development only): `/app/dev/takeoff-doctor`

Example CLI summary:

```
Symbol marking support: YES
Summary: ok=… warning=… missing=… failed=0
[OK     ] pdfjs-dist
[OK     ] sharp
[OK     ] tesseract.js
[OK     ] Raster / color-mask pipeline
[OK     ] Find similar / template match
[MISSING] Vector PDF extraction
[WARNING] Python takeoff worker (scaffold, not wired)
```

## Quantity safety

This audit/install task does **not** change:

- takeoff quantity logic  
- confirm / reject rules  
- OCR context-only contract  
- Find similar “probable only” contract  
