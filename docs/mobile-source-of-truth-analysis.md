# Mobilná aplikácia Staveto — zdroj pravdy (source of truth)

**Účel dokumentu:** Kompletný, štruktúrovaný záznam toho, čo mobilná aplikácia Staveto **skutočne implementuje**, aby prehliadačová aplikácia Manager Web (`staveto-office`) mohla zosúladiť dáta, workspace a UX **bez hádania schémy** a **bez paralelných kolekcií**.

**Stav:** Analýza dokončená — **iba dokumentácia**; žiadne zmeny kódu, schémy Firebase ani routov v tejto úlohe.

**Posledná revízia:** 2026-06-03

**Analyzovaná cesta k mobilnému kódu:**  
`c:\Users\Marek\Staveto_Cursor\staveto-app_v2\mobile\src\`  
(primárny zdroj; zrkadlové worktree `mobile-newjob-contact/` atď. nie sú referenčné)

**Súvisiace webové dokumenty:** [`web-alignment-plan-from-mobile.md`](./web-alignment-plan-from-mobile.md), [`staveto-work-types-ai-context.md`](./staveto-work-types-ai-context.md), [`staveto-manager-feature-inventory.md`](./staveto-manager-feature-inventory.md)

---

## 1. Kompletný prehľad mobilnej aplikácie Staveto

Staveto Mobile je **autoritatívny produkt** pre:

- tvary dokumentov vo Firestore (`projects`, `organizations`, členovia, podkolekcie),
- klasifikáciu projektov / zákaziek (archetyp → `BUILD`/`TRADE` + `workType`),
- Business organizácie a role,
- capability gating (Free / Solo / Business),
- moduly: úlohy, výdavky + OCR, materiály, čas, absencie, defekty, vybavenie, AI štruktúra projektu.

Manager Web musí **čítať a zapisovať kompatibilne** s mobilom, prípadne **aditívne** rozšíriť polia (predajná fáza zákazky, `quoteItems`), ktoré mobil zatiaľ ignoruje.

**Čo mobil nemá ako first-class modul:**

- top-level kolekcia `quotes` — **neexistuje**,
- samostatný modul „cenové ponuky“ s riadkami v Firestore — ponuka je skôr UX + typ dokumentu `"quote"` pri uploadoch.

**Čo mobil už má a web musí rešpektovať:**

- `organizations/{orgId}` + `organizations/{orgId}/members/{memberId}`,
- `projects/{projectId}` s `projectType`: `BUILD` | `TRADE` a granulárnym `workType`,
- archetypy práce v UI: `service_inspection`, `customer_job`, `large_construction_project`, `own_build`, `internal_project`,
- materiály (`projects/{id}/materials`), výdavky + OCR, AI generovanie štruktúry projektu, úlohy, business role.

---

## 2. Architektúra — dve vrstvy produktu

| Vrstva | Namespace / kontext | Identifikátor | Účel |
|--------|---------------------|---------------|------|
| **B2C / osobný** | Solo používateľ | `AuthContext.orgId` = **vždy `auth.uid`** | Osobné projekty (`ownerId`), osobné capability, RevenueCat Solo |
| **B2B / firma** | Business organizácia | `BusinessContext.activeBusinessOrgId` | Tímové projekty (`projects.orgId`), členovia, `planCode`, sedadlá |

**Kritická invarianta:** `AuthContext.orgId` **nie je** ID firemnej organizácie. Firemný workspace je **`activeBusinessOrgId`** + dokument `organizations/{orgId}`.

**Web nesmie:**

- zaviesť kolekciu `workspaces/{id}` ako paralelný model,
- mapovať „company workspace“ na `users/{uid}` ako org id,
- zamieňať Solo (osobné predplatné) s Business (organizácia).

---

## 3. Spúšťací reťazec

1. Firebase Auth (email / Google).
2. `AuthContext` — `orgId := uid` (legacy B2C namespace).
3. Kontrola **pending onboarding** (AsyncStorage `pending_onboarding`).
4. Po onboardingu: hlavná navigácia (`RootNavigator`, `HomeStack`, `BusinessStack`).
5. Ak je vybraná firma: `BusinessContext` načíta `activeBusinessOrgId` (persist `staveto_active_business_org_id`).
6. Capability vrstva (`capabilities.ts`) rozhodne Free / Solo / Business podľa profilu + org stavu.

Web: rovnaké poradie — auth → profil → onboarding flag → workspace (osobný vs `organizations`) → dashboard.

---

## 4. Autentifikácia a profil používateľa

**Kolekcia:** `users/{uid}`

**Typické polia (mobil + web):**

- `displayName`, `email`, onboarding stav,
- `subscription` — B2C tier (`FREE`, `BASIC`, `PRO`, `ENTERPRISE`) + status,
- `billingIsPro`, `hasPersonalProEntitlement` — signály pre Solo,
- `primaryUsageMode` / build vs trade preferencia (`build` | `trade`),
- voliteľne `activeBusinessOrgId` na profile (web môže čítať; mobil primárne AsyncStorage + BusinessContext).

**Callable (zdieľané s webom):** `getBillingStatus` (region `europe-west1`) — read-only stav trial / Pro pre web.

---

## 5. Plány, predplatné a paywall

### 5.1 Tri produktové programy (user-facing)

| Program (UI) | Význam | Billing | Interný kód |
|--------------|--------|---------|-------------|
| **Free** | Bezplatný osobný | — | `free` |
| **Solo** | Platený **osobný** (mobil často „Staveto Pro“) | **Apple / Google** cez RevenueCat | `personal_pro`, entitlement `pro` |
| **Business** | Firma / tím | B2B objednávka / aktivácia serverom | `business` + org `planCode` |

```text
free         →  PlanType: free
Solo         →  PlanType: personal_pro  (+ RevenueCat, users.subscription, getBillingStatus)
Business     →  PlanType: business      (+ organizations.planCode, status, businessEnabled)
```

### 5.2 `PlanType` (`mobile/src/lib/capabilities.ts`)

```ts
type PlanType = "free" | "personal_pro" | "business";
```

### 5.3 Business balíčky (`planCode` — server-only na org)

| `planCode` | Balík |
|------------|--------|
| `business_starter` | Starter (napr. 5 sedadiel) |
| `business_team` | Team (napr. 15) |
| `business_company` | Company (napr. 30) |

Voliteľne UI referencia: `business_enterprise` (display).

**Web:** nesmie predávať Solo v prehliadači; iba čítať stav a odkázať do mobilnej app.

---

## 6. Onboarding

**Súbor:** `OnboardingMvpScreen.tsx`, `primaryUsageMode.ts`

| Vetva | Význam |
|-------|--------|
| `join_company` / company path | Pripojenie alebo založenie firmy — **nie** je to platený Solo plán |
| `solo` vetva v onboardingu | **Osobná cesta** (build/trade, profil) — **nie** synonymum pre `personal_pro` |

**Persistované:** `PrimaryUsageMode`: `build` | `trade` — ovplyvňuje default engine projektu, **nie** fakturáciu.

Web onboarding: mapovať **cestu** (osobná vs firma) na workspace; plány Free/Solo/Business len v billing copy.

---

## 7. Business — registrácia firmy a tím

### 7.1 Cesty Firestore

```
organizations/{orgId}
organizations/{orgId}/members/{memberId}
organizations/{orgId}/contacts/{contactId}
organizations/{orgId}/chats/...
businessOrders/{orderId}
invites/...
```

**Žiadna** kolekcia `workspaces/`.

### 7.2 `organizations/{orgId}` — kľúčové polia

| Pole | Zápis klientom | Poznámka |
|------|----------------|----------|
| `name`, `profile` | owner/admin | |
| `ownerUid` | immutable | zakladateľ |
| `status` | **server only** | `OrgStatus` |
| `businessEnabled` | **server only** | master prepínač Business |
| `seatsLimit`, `seatsUsed` | **server only** | |
| `planCode`, `billingPeriod` | **server only** | B2B SKU |
| `trialStartedAt`, `trialEndsAt` | voliteľné | |

### 7.3 `OrgStatus`

`trialing` | `pending_payment` | `active` | `past_due` | `suspended` | `cancelled`

### 7.4 Role (`OrgRole`) — `organizations/{orgId}/members/{memberId}`

`owner` | `admin` | `manager` | `worker` | `viewer`  
Legacy `"member"` → normalizované na `viewer`.

**Stav členstva:** `invited` | `pending` | `active` | `suspended` | `removed` — do `seatsUsed` počítajú len `active`.

---

## 8. Navigácia

- **HomeStack** — osobné projekty, úlohy, výdavky, domov.
- **BusinessStack** — firemný dashboard, členovia, materiály firmy, plány.
- Prepínanie kontextu cez **BusinessContext** (`activeBusinessOrgId`), nie cez zmenu `AuthContext.orgId`.

Web: zjednodušená bočná navigácia (Übersicht, Aufträge, …) musí stále odrážať **osobný vs firemný** workspace podľa rovnakých pravidiel.

---

## 9. Projekty — model a logika

### 9.1 Kolekcia

`projects/{projectId}`

### 9.2 Kľúčové polia (mobil)

| Pole | Účel |
|------|------|
| `ownerId` | Osobný vlastník |
| `orgId`, `workspaceType` | Tímový / business projekt |
| `projectType` | **`BUILD` \| `TRADE`** (úložisko) |
| `workType` | Granulárny podtyp (pozri §9.4) |
| `jobWorkflowKind` | `STANDARD` \| `SERVICE` |
| `creationMode` | `AI` \| `MANUAL` \| `TEMPLATE` \| `CLONE` |
| `businessMode` | `DIRECT` \| `SUBCONTRACT` \| `INTERNAL` |
| `name`, `addressText`, `referenceNumber`, … | |

### 9.3 Archetypy (UI / AI — Phase 1, typicky **nepersistované** ako samostatné pole)

| Archetyp | SK produkt |
|----------|------------|
| `service_inspection` | Servis / obhliadka |
| `customer_job` | Zákazka pre klienta |
| `large_construction_project` | Veľký stavebný projekt |
| `own_build` | Vlastná stavba |
| `internal_project` | Interný projekt |

**Mapovanie na úložisko (mobil):**

| Archetyp | `projectType` | `jobWorkflowKind` |
|----------|---------------|-------------------|
| `large_construction_project`, `own_build` | `BUILD` | — |
| `service_inspection` | `TRADE` | `SERVICE` |
| `customer_job`, `internal_project` | `TRADE` | — |

### 9.4 `projectType` (Firestore)

**Aktívne:** `BUILD`, `TRADE`  
**Legacy čítanie:** `MANAGEMENT`, `RESIDENTIAL`, `MAINTENANCE`, …

### 9.5 `workType` (Firestore)

**BUILD:** `NEW_BUILD`, `RENOVATION`, `INSTALLATION`, `SERVICE`  
**TRADE:** `INSTALLATION`, `REPAIR`, `RENOVATION`, `DELIVERY`  
**Legacy maintenance:** `FLEET`, `MACHINERY`, `PROPERTY`, `EQUIPMENT`

### 9.6 Podkolekcie projektu (mobil)

`tasks`, `expenses`, `materials`, `materialSuggestions`, `members`, `phases`, `attachments`, `documents`, `problems`, `equipment`, `constructionDiary`, `events`, …

### 9.7 Web-only aditívne polia (Manager)

`phase`, `lifecycleStatus`, `salesStatus`, `quoteStatus`, `customerRequest`, `projects/{id}/quoteItems`, top-level `quotes` — mobil môže ignorovať, kým nepridá filtre.

**Kritický nesúlad dnes:** web často zapisuje **reťazec archetypu** do `projects.projectType` namiesto `BUILD`/`TRADE`.

---

## 10. Úlohy

- **Cesta:** `projects/{projectId}/tasks/{taskId}`
- **Obrazovky:** `TasksScreen.tsx`, `TaskDetailScreen.tsx`
- Navigácia z `HomeStack` / detail projektu.
- Web: čiastočná podpora; plná parita nie je v Manager MVP.

---

## 11. Výdavky a OCR

- **Cesta:** `projects/{projectId}/expenses/{expenseId}`
- **OCR callables:** `extractInvoiceData`, `extractInvoiceDataFromStorage` (Cloud Functions, už v produkcii)
- **Obrazovky:** `ExpensesKpiScreen`, `ExpenseReviewScreen`, trigger z `HomeScreen` / `ProjectOverviewScreen`
- **Služby:** `invoiceOCR.ts`, `expenseDocumentParser.ts`, `expenses.ts`
- Import riadkov do materiálov: `ExpenseLineItemsMaterialImportSheet`, `aiMaterialExtractionService.ts`

Web: OCR a výdavky **nie** implementovať v prehliadači bez zdieľaného kontraktu; len dokumentovať závislosť.

---

## 12. Materiály

- **Typy:** `ProjectMaterialUsed`, `MaterialSuggestion` (`lib/types.ts`)
- **Cesty:** `projects/{id}/materials`, `projects/{id}/materialSuggestions`
- **Katalóg:** `materialCatalog.ts`
- **Obrazovky:** `ProjectMaterialsScreen`, `BusinessMaterialsOverviewScreen`

Web `projects/{id}/quoteItems` = **iný účel** (príprava ponuky pred realizáciou), nie náhrada `materials`.

---

## 13. Čas a dochádzka

- Top-level / projektové časové záznamy (`timeEntries`, project events) — mobil má modul dochádzky v širšom produkte.
- Web Manager: zatiaľ bez plnej parity; označiť „čoskoro“ v UI.

---

## 14. Absencie

- Súčasť HR / tímového modulu na mobile (leave / sick leave v produktovom pláne).
- Firestore cesty závisia od business modulu; web sidebar môže zobraziť položku ako „Demnächst“ bez implementácie.

---

## 15. Problémy / defekty

- **Podkolekcia:** `projects/{projectId}/problems/...` (defekty na stavbe)
- Web: nie je first-class v Manager MVP.

---

## 16. Vybavenie

- **Podkolekcia / polia:** `equipment`, `serviceRules` pri servisných workflow
- Väzba na archetyp `service_inspection` + `jobWorkflowKind: SERVICE`
- Onboarding môže zbierať vybavenie (equipment step).

---

## 17. Ďalšie moduly

| Modul | Mobil | Web Manager |
|-------|-------|-------------|
| Pozvánky do projektu | `invites`, project members | čiastočne |
| Chat org | `organizations/.../chats` | nie |
| Katalóg šablón | `catalogTemplates` | nie |
| Business objednávky | `businessOrders` | billing stránky read-only |
| Dokumenty / fotky | `attachments`, `documents` | deferred |
| Kalendár / reporty | áno (mobil) | deferred |

---

## 18. AI

### 18.1 Mobil (produkčné callables)

- `generateProjectStructure`
- `createProjectFromAiPlan`
- `refineGeneratedProjectNode`

**UI:** `UnifiedProjectCreationFlow`, `CreateProjectAIFlow`, `ProjectAIDraftReview`  
**Služba:** `aiProjectService.ts`  
**Kontext archetypu:** `getNewJobArchetypeAiContextHint(archetype)` v `projectEnums.ts`

### 18.2 Web Manager (samostatné callables — office repo)

- `generateProjectDraft`
- `updateProjectDraftWithAI`
- `createProjectFromDraft`

Ukladajú do `workspaces/{workspaceKey}/projectDrafts` — **workspaceKey** = `uid` alebo `orgId` (nie kolekcia `workspaces/` ako root store pre celú app).

**Pravidlo:** AI pripravuje návrh; používateľ potvrdí; finálny `projects` dokument len cez explicitný krok.

---

## 19. Capabilities / gating

Zdroj: `capabilities.ts`, `capabilities-free-pro-business.md`

| Capability / oblast | Free | Solo (`personal_pro`) | Business |
|---------------------|------|------------------------|----------|
| Osobné projekty | limitované | plné osobné Pro | — |
| Tímové funkcie | nie | nie (bez active org) | áno pri active org + `businessEnabled` |
| AI / materiály (hĺbka) | obmedzené | podľa tier | podľa org plánu |

**Inferencia `business`:** `activeBusinessOrgId` + org `status === "active"` + `businessEnabled` + členstvo `active`.

---

## 20. Firebase top-level paths

| Kolekcia / cesta | Mobil | Web Manager |
|------------------|-------|-------------|
| `users/{uid}` | áno | áno |
| `projects/{id}` | áno | áno |
| `organizations/{orgId}` | áno | áno |
| `organizations/{orgId}/members/{memberId}` | áno | áno (read/write podľa rolí) |
| `businessOrders/{id}` | áno | read / billing |
| `invites/...` | áno | join flow |
| `quotes/{id}` | **nie** | áno (interim Manager) |
| `workspaces/{id}` | **nie** | **nie** (nepridávať) |
| `workspaces/{key}/projectDrafts` | nie (web AI) | áno (web AI drafts) |

**Pravidlá:** `firestore.rules` v office repo + mobil `firestore.rules` — klient nesmie zapisovať server-only polia org (`status`, `businessEnabled`, `planCode`, …).

---

## 21. Čo web musí zosúladiť

1. **Workspace:** osobný (`ownerId` / uid) vs firemný (`organizations/{orgId}`, `activeBusinessOrgId`) — **nie** `workspaces/` kolekcia.
2. **`AuthContext.orgId` vs business:** web `WorkspaceContext` musí zodpovedať `BusinessContext` + členstvám v `organizations/.../members`.
3. **Predvolený dashboard:** ak existuje aktívna firma (owner/admin/manager), **firemný** prehľad ako default.
4. **`projectType` / `workType`:** pri vytváraní zákazky mapovať archetyp → `BUILD`|`TRADE` + `workType` + `jobWorkflowKind`; archetyp uložiť do voliteľného poľa (napr. `jobArchetype`), nie do `projectType`.
5. **Plány UI:** Free / Solo / Business; Solo ≠ Business; Solo IAP len na mobile.
6. **Role:** rozšíriť z `admin`|`member` na mobilné `owner`|`admin`|`manager`|`worker`|`viewer`.
7. **Quotes:** UI príprava povolená; **bez** predpokladu mobilného `quotes` modelu.
8. **Materiály vs quoteItems:** oddeliť pojmy v UI a dokumentácii.

---

## 22. Odporúčané poradie implementácie webu

1. **P0 — Workspace / BusinessContext parita** — `activeBusinessOrgId`, členstvá, default company dashboard (pozri [`web-alignment-plan-from-mobile.md`](./web-alignment-plan-from-mobile.md)).
2. **P0 — Zápis typu projektu** — archetyp → `BUILD`/`TRADE` + `workType`; dual-read starých web draftov.
3. **P1 — Org polia a plán copy** — `status`, `businessEnabled`, `planCode`, sedadlá; Free/Solo/Business.
4. **P1 — Role na stránke členov** — zobrazenie mobilných rolí.
5. **P2 — AI draft flow** — už nasadené funkcie; zosúladiť workspace key s org/uid.
6. **P3 — Quotes** — ponechať interim `quotes`; dokumentovať odluku od mobilu.
7. **P3 — Materiály** — import z `quoteItems` až pri prechode do realizácie (budúce).

---

## 23. Otvorené body

1. Oficiálny názov poľa pre persistovaný archetyp (`jobArchetype` vs iný).
2. Migrácia existujúcich web záznamov s archetypom v `projectType` — hromadná vs len forward fix.
3. Zdieľaná schéma `quotes` medzi Manager a mobilom — časová os.
4. Ktoré Cloud Functions sú kanonické pre registráciu firmy oproti web `createOrganization`.
5. Filtruje mobil globálne `phase: sales` drafty z webu?
6. `business_enterprise` — SKU alebo len marketing?
7. Globálne premenovanie „Staveto Pro“ → „Solo“ v mobilných lokalizáciách.
8. Deep link z webu na obnovu Solo v App Store / Play.
9. Stripe alebo výhradne RevenueCat pre `personal_pro`.
10. Import `quoteItems` → `materials` pri „convert to delivery“.

---

*Koniec dokumentu — mobilný source of truth.*
