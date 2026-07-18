# Takeoff Analyzer Worker (optional)

Python FastAPI microservice for **future** high-DPI PDF render, vector object
extraction, and OpenCV-based masks. **Not called by production Next.js code.**

## Purpose

Keep heavy PDF/CV tooling out of the main Staveto Office (Next.js) app:

| Package | Role |
|---------|------|
| `pypdfium2` | Server PDF page / region render |
| `pdfplumber` + `pdfminer.six` | Text / lines / rects (MIT-friendly; **not** PyMuPDF/AGPL) |
| `opencv-python-headless` | Color masks, connected components |
| `numpy` / `Pillow` | Image buffers |
| `pytesseract` | Optional OCR (needs system Tesseract) |

**Do not install these into the Next.js app.**

## Local run

```bash
cd services/takeoff-analyzer-worker
python -m venv .venv
# Windows:
.venv\Scripts\activate
# macOS/Linux:
# source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8081
```

Health check: `GET http://localhost:8081/health`

## Future endpoints

| Method | Path | Status |
|--------|------|--------|
| GET | `/health` | Implemented (placeholder) |
| POST | `/analyze-region` | Stub — not implemented |
| POST | `/extract-vector-objects` | Stub — not implemented |

## Security / auth TODO

- [ ] Require Firebase ID token or shared Cloud Run IAM invoker
- [ ] Validate `projectId` / drawing ownership server-side
- [ ] Never trust client-supplied Storage paths blindly
- [ ] Rate-limit and max upload / raster size

## Cloud Run deployment TODO

- [ ] Build from this Dockerfile
- [ ] Secrets for any OCR / API keys
- [ ] Private ingress + authenticated invoker from Next.js API routes only
- [ ] Feature-flag the call site in Next.js (`TAKEOFF_ANALYZER_WORKER_URL`)

## Optional heavy extras (not in requirements.txt)

- **PaddleOCR** — better multilingual OCR; large download. Install only when needed:
  `pip install paddlepaddle paddleocr` (pin versions carefully; GPU optional).
- **SAM / GroundingDINO / YOLO / Detectron2** — only after a labeled dataset exists.
- **PyMuPDF** — **do not use** (AGPL risk for SaaS).

## Relation to Next.js takeoff

Today Analyze Region runs in-browser / API with:

- `pdfjs-dist` + custom color-mask detector
- `tesseract.js` nearby text (context-only)
- Find similar → probable `symbolCandidates` only

This worker is the next step for **vector PDF** and higher-DPI server render —
wire it only after Symbol Scan UX and Analyze Region v2 template matching stabilize.
