# AI Estimator fixtures

Place the main electrical acceptance PDF here with this exact name:

`08_Znacenie_elektrika_2.pdf`

Source name from customer input may be `08_Znacenie_elektrika 2.pdf` — rename/copy to the underscore form above.
You can also download it from Firebase Storage (uploaded via the in-app estimator):

```
node scripts/fetch-fixture-pdf.mjs
```

Fresh end-to-end analysis (real Gemini extraction + acceptance report):

```
npm run test:ai-estimator-electrical-pdf
```

Outputs `reports/ai-estimator/fresh-session-facts.json` and
`reports/ai-estimator/electrical-pdf-report.json`. If the PDF is missing, the
command fails with "Missing fixture: fixtures/ai-estimator/08_Znacenie_elektrika_2.pdf"
and only the Firestore replay fallback (`session-facts.json`, fetched via
`npm run fetch:estimator-session`) is available — never presented as fresh extraction.

Visual symbol counter (pixel-level detection of graphical symbols, e.g. switches):

```
npm run test:ai-estimator-visual-symbols
```

Renders the fixture PDF at high resolution (pdfjs-dist + @napi-rs/canvas), runs
color/shape detection and writes `reports/ai-estimator/visual-symbol-report.json`.
In the app the UI is gated by `NEXT_PUBLIC_ENABLE_AI_VISUAL_SYMBOL_COUNTER=1`.

Optional (later):
- `photo-only-sample.jpg` — site photo smoke test
- `text-only.txt` — not required; text-only is run from the wizard brief

Do not commit large customer PDFs if they contain personal data unless explicitly approved.
