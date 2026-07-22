# Staveto product catalog — BUCO electrical import (Phase 1)

Normalized SK electrical catalog from BUCO supplier data.  
**Data layer + importer only** — does not change projects, quotes, or the company `catalogItems` UI.

## Source file

Place the scraper export here:

```text
scripts/catalog/data/SK/electrical/buco_scraper_state.json
```

Expected shape:

```json
{
  "visited": ["https://www.buco.sk/..."],
  "tree": { "/path": { "name": "...", "url": "..." } },
  "products": {
    "https://www.buco.sk/...": {
      "nazov": "...",
      "kod": "...",
      "cena_s_dph": "4,24",
      "cena_bez_dph": "3,45",
      "sklad": "12",
      "url": "https://www.buco.sk/..."
    }
  }
}
```

JSONL (`buco_kategorie_a_produkty.jsonl`) is also accepted via `--source`.

Do **not** scrape buco.sk from this script.

## Commands

Dry-run (default — **no Firestore writes**):

```bash
npm run catalog:buco:dry-run
```

Write upserts (explicit only):

```bash
npm run catalog:buco:import
```

Custom source:

```bash
npx vite-node scripts/catalog/import-buco-electrical.ts --source path/to/file.json
```

Auth for `--commit` (required — dry-run does not need it):

```bash
npm run setup:firebase-admin
# browser: prihlásenie info@staveto.sk
npm run catalog:buco:import
```

Or set `FIREBASE_SERVICE_ACCOUNT_JSON` in `.env.local`.  
If you see `Could not load the default credentials`, ADC is not set up yet — run `setup:firebase-admin` first.

## Firestore collections (additive)

| Collection | Purpose |
|------------|---------|
| `catalogCategories` | Profession-oriented electrical categories |
| `catalogProducts` | Normalized products with pricing + tokens |
| `catalogImports` | Import run metadata |

- `tradeId` = `electrical` (Elektroinštalácie profession card)
- Product IDs: `buco_<sku>` (stable upsert key)
- Reimport upserts; **never deletes** products missing from a later file
- Does **not** modify `workspaces/*/catalogItems`, projects, or quotes

## Dry-run report

```text
scripts/catalog/reports/buco-electrical-dry-run.json
```

Inspect:

- `productCounts` — total / active / needs_review
- `classificationCounts` — products per Staveto category
- `invalidPrices` — suspicious net/gross pairs
- `unmatchedProducts` — fell into „Ostatné elektro“
- `sampleNormalizedProducts` — name/brand/price samples

## Related code

- Rules: `src/lib/catalog/electrical/category-rules.ts`
- Pipeline: `src/lib/catalog/electrical/buildCatalog.ts`
- Importer: `scripts/catalog/import-buco-electrical.ts`
