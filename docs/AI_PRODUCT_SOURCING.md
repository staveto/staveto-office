# AI Product Sourcing — Staveto Kalkulant

> Feature flag: `NEXT_PUBLIC_ENABLE_PRODUCT_SOURCING=1`  
> Status: **mock + company pricebook** (no live wholesaler API yet)

## Purpose

After technical takeoff, Staveto helps the estimator choose **real products and prices** so material lines are not silently `0 €`.

Flow:

```
technical takeoff
  → material groups / search intents
  → product search (pricebook / connectors)
  → brand & supplier selection
  → net cost + margin → sell price
  → quote-ready material total
  → internal purchase list
```

## Source priority

1. Company uploaded pricebook (CSV)
2. Supplier API integration (connector; none live yet)
3. Company catalog / previously used products
4. Manual product entry
5. Web search / external lookup (not implemented — no illegal scraping)
6. AI suggestion **without** a real price (never treated as confirmed)

Rules:

- Strong pricebook match wins over generic mock/web.
- Supplier API price wins over generic web price.
- AI suggestion without a real price → `needs_review` / `missing`, never `confirmed`.
- Every price must carry **source type** + **priceValidAt** (ISO date).
- Prices older than `priceMaxAgeDays` become **indicative**.
- No product match → `priceStatus = "missing"` (“Cena chýba”).

## Supplier connector architecture

```ts
type ProductSupplierConnector = {
  id: string;
  name: string;
  countryCodes: string[];
  supportsSearch: boolean;
  supportsPrice: boolean;
  supportsAvailability: boolean;
  searchProducts(intent): Promise<ProductCandidate[]>;
};
```

Initial connectors:

| Connector | Role |
|-----------|------|
| `ManualPricebookConnector` / uploaded pricebook | CSV import → in-memory search |
| `CompanyCatalogConnector` | Previously used / company catalog products |
| `MockSupplierConnector` | Dev/demo indicative catalog (SK electrical) |

Later: country wholesalers, building-material suppliers, ERP feeds — each as a new connector. Do **not** hardcode a single supplier.

## Pricebook import

Parser: `src/lib/products/pricebookCsv.ts`

CSV columns:

`brand, productName, productCode, category, unit, netPrice, grossPrice, currency, vatPercent, validFrom, supplierName`

XLSX mapping UI is deferred; CSV is enough for Phase 1.

## Preferred brands

`CompanyProductPreference` (defaults in `productSourcingTypes.ts`):

- preferred brands / suppliers by trade
- default material margin %
- price tier: economy / standard / premium
- default waste/reserve %
- allow indicative prices yes/no
- price max age (days)

Ranking boosts preferred brands and the chosen price tier. If brands are empty, the UI shows:

> „Nastavte preferované značky a dodávateľov pre presnejšie ceny.“

## Product matching

`buildProductSearchIntents` maps takeoff titles → category + keywords.

Examples:

- „EL.zásuvka …“ → `socket`, 230V keywords, preferred brand
- „LED pás …“ → strip + companion intents (profil, driver) with `needsReview` for CCT/IP/W/m
- Cable without length → needsReview; do **not** invent metres

## Price confidence

| Status | Meaning |
|--------|---------|
| `confirmed` | Reliable source + fresh timestamp |
| `indicative` | Usable for draft; verify before fixed quote |
| `missing` | No usable price — block finalize |
| `needs_review` | Spec or AI guess — human must decide |

Cost formula:

```
quantityToBuy = requiredQuantity × (1 + waste%)
netCost = quantityToBuy × netUnitPrice
sellPrice = netCost × (1 + margin%/100)
```

UI shows **nákup (Einkauf)** and **predaj (Verkauf)**.

## Customer quote vs internal purchase list

| View | Content |
|------|---------|
| Customer quote | Grouped sections (e.g. LED systém, zásuvky) — no raw product URLs, confidence, or source pages by default |
| Internal purchase list | Brand, supplier, code/EAN, qty to buy, net, availability, URL, source + date |

## Missing price guard

Before a fixed quote:

- No included material with `missing` price
- No silent `0` unless customer-supplied / excluded / explicitly free
- Indicative prices listed as warnings
- Open specs listed as assumptions / questions

User options: doplniť produkty · zadať ceny ručne · dodávka zákazníka · iba orientačná ponuka.

## Limitations (honest)

- **No live wholesaler API** in this phase — mock catalog + CSV pricebook only.
- Company settings UI for brands is still default prefs + onboarding hint (full settings screen later).
- Pricebook upload UI is parser-ready; drag-drop screen can follow.
- Web search connector intentionally not shipped (legal / ToS risk).

## Legal note

Use **official supplier APIs**, licensed product feeds, or **customer-uploaded** price lists only. Do not scrape competitor or wholesaler websites in violation of terms of use or applicable law. Indicative mock prices are for demo and must be labelled as such.
