# Plán zosúladenia webu (Manager) s mobilnou aplikáciou

**Účel:** Akčný plán pre **staveto-office** — čo zmeniť, čo ponechať a čo nerobiť, bez breaking zmien Firebase schémy v tejto fáze dokumentácie.

**Prerekvizita:** [`mobile-source-of-truth-analysis.md`](./mobile-source-of-truth-analysis.md)

**Stav:** Iba dokumentácia — implementácia nasleduje podľa priorít nižšie.

**Posledná revízia:** 2026-06-02

---

## 1. Executive summary

Mobilná aplikácia je **zdroj pravdy** pre organizácie, role, ukladanie `projectType` (`BUILD` | `TRADE`), `workType` a capability model (Free / Solo / Business). Manager Web už má silný **draft zákazky** flow, nemčinu, AI callables a interim `quotes` — ale musí **prestať vynášať paralelný workspace model** a **opraviť zápis typov projektu**, inak mobil číta webové záznamy ako neplatné.

Najbližšia implementačná priorita: **zosúladiť web workspace / business kontext s mobilným `BusinessContext` a `activeBusinessOrgId`**, bez migrácie schémy a bez novej kolekcie `workspaces/`.

---

## 2. What web must change

| Priorita | Zmena | Dôvod |
|----------|-------|-------|
| **P0** | Workspace resolution — firemný workspace default pre owner/admin/manager s aktívnou org | Produktové pravidlo; dnes často „Osobný prehľad“ |
| **P0** | Načítanie členstiev `organizations/{orgId}/members` kde `userId == uid` | Rovnaký zdroj ako mobil |
| **P0** | `activeBusinessOrgId` — čítať z profilu / persistovanej voľby; nie zamieňať s `AuthContext.orgId` | Mobilná invarianta |
| **P0** | Zápis projektu: archetyp → `projectType` (`BUILD`\|`TRADE`) + `workType` + `jobWorkflowKind` | Web dnes ukladá archetyp do `projectType` |
| **P1** | UI plány: **Free / Solo / Business**; Solo = `personal_pro`, nie Business | Billing ownership |
| **P1** | Org read: `status`, `businessEnabled`, `planCode`, `seatsLimit`, `seatsUsed` | Business gating |
| **P1** | Role: `owner`, `admin`, `manager`, `worker`, `viewer` | Parita s mobilom |
| **P2** | Aktualizovať [`staveto-work-types-ai-context.md`](./staveto-work-types-ai-context.md) po P0 zápise typov | Dokumentačná konzistencia |

---

## 3. What web should keep

- **Draft-first zákazka** — `phase: sales`, lifecycle, konverzia do realizácie (mobil môže ignorovať, kým nefiltruje).
- **`projects/{id}/quoteItems`** — aditívna príprava riadkov ponuky.
- **Top-level `quotes`** — interný Manager MVP, kým neexistuje mobilný kontrakt.
- **Most medzi workspace a projektom** — `ownerId` / `orgId` na `projects`; žiadna root kolekcia `workspaces/`.
- **Existujúce aktívne projekty** a delivery UI.
- **SK / DE / EN i18n** a terminológia zákazka / koncept / ponuka.
- **Staveto AI callables** (`generateProjectDraft`, …) s workspace key = `uid` | `orgId`.
- **Legacy `/estimates`** s bannerom smerom na `/app/quotes`, kým produkt nerozhodne.
- **Osobný workspace** a prepínač workspace — vždy dostupný.

---

## 4. What web must stop doing

- **Nevytvárať** kolekciu `workspaces/{id}` ako hlavný model firmy.
- **Nepoužívať** `AuthContext.orgId` / `users.uid` ako ID firemnej organizácie.
- **Nezapisovať** archetyp (`service_inspection`, …) do poľa `projects.projectType`.
- **Nepredávať** Solo (Apple/Google) v prehliadači.
- **Neoznačovať** Solo ako Business plán ani onboarding vetvu „solo“ ako paid tier.
- **Nevynucovať** globálnu migráciu všetkých historických `projects`.
- **Nepropagovať** Firestore `quotes` ako synchronizovaný modul s mobilom.
- **Nevymýšľať** backend ponúk, kým mobil + functions nemajú zdieľaný kontrakt.
- **Nezobrazovať** desiatky „DEMNÄCHST“ badge v hlavnej navigácii — skryť alebo utlumit (UX).

---

## 5. Exact data model alignment

### Organizácie

| Koncept | Mobil | Web cieľ |
|---------|-------|----------|
| Root | `organizations/{orgId}` | Rovnaké |
| Členovia | `organizations/{orgId}/members/{memberId}` | Rovnaké |
| Vlastník | `ownerUid` | Rovnaké |
| Role | `owner`, `admin`, `manager`, `worker`, `viewer` | Čítať + zobrazovať; mapovať legacy `member` → `viewer` |
| Plán firmy | `planCode`: `business_starter`, `business_team`, `business_company` | Read-only z klienta |
| Stav | `status`, `businessEnabled` | Read-only; gating UI |

### Projekty

| Pole | Mobil hodnota | Web zápis (po zosúladení) |
|------|---------------|---------------------------|
| `projectType` | `BUILD` \| `TRADE` | Vždy engine typ |
| `workType` | `NEW_BUILD`, `RENOVATION`, … | Podľa engine |
| `jobArchetype` (navrhované) | voliteľné | `service_inspection`, `customer_job`, … |
| `jobWorkflowKind` | `STANDARD` \| `SERVICE` | Pre `service_inspection` → `SERVICE` |
| `ownerId` | uid | Osobný workspace |
| `orgId` | org id | Firemný workspace |

### Archetypy (UI) — presné reťazce

`service_inspection` | `customer_job` | `large_construction_project` | `own_build` | `internal_project`

### Plány (capability)

`free` | `personal_pro` | `business`

---

## 6. Business workspace alignment

**Mobil:**

- `BusinessContext.activeBusinessOrgId` — vybraná firma.
- Projekty firmy: `projects.orgId == activeBusinessOrgId`.
- `AuthContext.orgId` zostáva **uid** (solo namespace).

**Web (cieľ):**

1. Po prihlásení načítať všetky org, kde existuje `organizations/{orgId}/members/{uid}` s aktívnym členstvom (vrátane owner bez member doc — inferovať z `ownerUid`).
2. Ak používateľ má aspoň jednu **eligible** org (status active/trialing/trial + `businessEnabled` + rola owner/admin/manager), **predvolene** otvoriť firemný workspace — ak nie je explicitná voľba „osobný režim“.
3. Persistovať voľbu v `profile.onboarding.activeWorkspaceId` alebo ekvivalent — v súlade s mobilným `activeBusinessOrgId` (bez duplicitného významu).
4. Firemný dashboard = default pre owner/admin/manager; worker/viewer podľa oprávnení.

**Bez:** migrácie dát, novej kolekcie, zmeny mobilných dokumentov.

---

## 7. Personal / Solo / Pro alignment

| Program | Web UI | Interné | Nákup |
|---------|--------|---------|-------|
| Free | Free | `free` | — |
| Solo | Solo (mobil môže „Pro“) | `personal_pro`, entitlement `pro` | **Len mobile** RevenueCat |
| Business | Business | `business` + org `planCode` | B2B registrácia |

**Web musí:**

- Čítať `getBillingStatus`, `users.subscription`, `billingIsPro`.
- CTA: spravovať Solo v mobilnej aplikácii.
- **Neblokovať** osobné zákazky pri Solo.
- **Negrantovať** tímové Business funkcie bez active org.

---

## 8. Project archetype alignment

Pri vytváraní zákazky (web wizard):

1. Používateľ vyberie **archetyp** (5 kariet — už v UI).
2. Server / klient pred zápisom zavolá rovnakú logiku ako mobil `resolveInternalProjectTypeFromArchetype` / `resolveJobWorkflowKindFromArchetype`.
3. Do Firestore:
   - `projectType`: `BUILD` alebo `TRADE`
   - `workType`: vhodný default (napr. `SERVICE` pre servis)
   - `jobWorkflowKind`: podľa archetypu
   - voliteľne `jobArchetype`: pôvodný archetyp pre AI a UI

**Dual-read:** existujúce dokumenty s archetypom v `projectType` — načítať cez `getProjectWorkType()` / fallback.

---

## 9. Materials and AI alignment

| Oblasť | Mobil | Web |
|--------|-------|-----|
| Materiál na stavbe | `projects/.../materials` | Neimplementovať náhradu |
| Návrh ponuky | dokument / UX | `quoteItems` |
| AI štruktúra projektu | `generateProjectStructure`, … | `generateProjectDraft`, … (office CF) |
| Kontext archetypu | `getNewJobArchetypeAiContextHint` | Posielať rovnaké enumy v promptoch |

Web AI: draft v `workspaces/{key}/projectDrafts` — **key** = `uid` alebo `orgId`, nie nová root kolekcia workspace entít.

---

## 10. Quotes / estimates caution

- Mobil: **žiadna** kolekcia `quotes`.
- Web: `quotes/{id}` + `/api/estimates` (legacy) — **Manager interim**.
- UI môže pripravovať ponuku (`quoteItems`, koncept), ale:
  - **nepredpokladať** export do mobilu,
  - **nepredpokladať** rovnaké status enumy,
  - označiť v internej dokumentácii ako „dočasné, až do shared contract“.

---

## 11. Recommended implementation order

| Fáza | Obsah |
|------|--------|
| **1** | Workspace + `activeBusinessOrgId` + default company dashboard |
| **2** | Zápis `BUILD`/`TRADE` + `workType` + dual-read |
| **3** | Org billing polia + Free/Solo/Business copy |
| **4** | Role na `/app/members` |
| **5** | Doladenie AI draft paths podľa workspace key |
| **6** | Quotes — dokumentácia + UI disclaimers |
| **7** | Materiály — až po dohode importu do `materials` |

---

## 12. Risk checklist

| Riziko | Mitigácia |
|--------|-----------|
| Mobil zobrazí web draft s nesprávnym `projectType` | Fáza 2 + dual-read; filter `phase: sales` na mobile neskôr |
| Prepis `projectType` archetypom poškodí engine | Forward write len `BUILD`/`TRADE` |
| Zápis do server-only org polí | Rules + read-only v UI |
| Dva quote systémy na webe | Banner na `/estimates` |
| Solo používateľ bez firmy vidí „Vytvoriť firmu“ nesprávne | Workspace P0 |
| `workspaces/` kolekcia | Nikdy nepridať |
| IAM / CF AI | Už nasadené; rules aktuálne |

---

## 13. Next immediate implementation prompt

**Ďalšia implementácia by mala byť:**

> Align web workspace/business context with mobile BusinessContext and activeBusinessOrgId.

### Implementation summary (bez migrácie schémy)

1. **Inspect** current web `WorkspaceContext`, `workspaceService`, `organizations.ts` — ako sa skladá zoznam workspace a default.
2. **Add or adapt** BusinessContext-like logic v rámci existujúceho contextu (nemusí byť 1:1 názov súboru, ale rovnaká sémantika):
   - `activeBusinessOrgId` — ID vybranej firmy alebo `null` pre osobný režim.
   - `AuthContext` / firebase user uid **nie** ako org id firmy.
3. **Load** `organizations/{orgId}/members` kde `userId == uid` (a owner fallback cez `ownerUid`).
4. **Select** `activeBusinessOrgId` ak používateľ má aktívnu eligible firmu a nezvolil explicitne osobný režim.
5. **Keep** personal workspace vždy dostupný v prepínači.
6. **Company dashboard** (`CompanyDashboardView`) = default pre `owner` / `admin` / `manager` pri active org.
7. **No** schema migration, **no** new Firestore collections.

### Acceptance criteria

- Majiteľ registrovanej firmy po prihlásení vidí firemný prehľad, nie „Osobný prehľad“ + „Vytvoriť firmu“.
- Prepínač workspace stále funguje (osobný ↔ firma).
- Projekty sa filtrujú podľa `orgId` / `ownerId` konzistentne s mobilom.
- Mobilné dokumenty org/members zostanú nezmenené.

---

## 14. Implementačná poznámka (workspace / business, 2026-06-02)

### Čo bolo zosúladené

- Načítanie firemných workspace z `organizations/{orgId}` + `members/{memberId}` (žiadna kolekcia `workspaces/`).
- Členstvá: primárne `collectionGroup("members")` s `userId == uid`, fallback sken `organizations` + `members/{uid}` + `where("userId","==",uid)` v podkolekcii.
- `ownerUid` → rola `owner`; mobilné roly `owner|admin|manager|worker|viewer` (+ legacy `admin`/`member` → mapované v `permissions/roles`).
- `ActiveWorkspace` pre firmu: `type: "company"`, `mobileWorkspaceKind: "business"`, `source: "organization"`.
- Výber aktívneho workspace: `sessionStorage` `staveto.activeWorkspaceId`; explicitný osobný režim cez `staveto.explicitPersonalWorkspace` po prepnutí v UI.
- Ak je uložené `personal` ale používateľ má eligible firmu a neoznačil explicitný personal → `preferred-business` (predvolená firma pre owner/admin/manager).
- Dev log: `[staveto workspace]` s `selectedReason`, `availableWorkspaces`, `activeWorkspace`.

### Detekcia aktívnej firmy

Org je v prepínači, ak:

- členstvo je aktívne (`status` chýba alebo `active`; nie `invited`/`removed`), alebo používateľ je `ownerUid`;
- org nie je v stave `canceled`/`disabled`/…;
- `businessEnabled === true`, alebo `status` active/trialing, alebo owner, alebo `pending_payment` + rola owner/admin/manager.

### Oprava permission-denied (runtime overlay)

- Odstránený `getDocs(collection("organizations"))` (na produkcii s mobilnými rules zlyhá).
- Fallback: `users/{uid}.activeBusinessOrgId` + priame čítanie `organizations/{orgId}`.
- `getOrganization` / `listOrgMembers` / hero fetch: permission-denied sa nepropaguje ako runtime error.

### `/app/projects/new` (wizard zákazky, 2026-06-02)

- UI karty ukladajú archetyp presne: `service_inspection`, `customer_job`, `large_construction_project`, `own_build`, `internal_project` (lokalizované labely v DE/SK/EN).
- Zápis do `projects` (manuál / kópia / AI callable): `projectType` = `BUILD`|`TRADE`, granulárny `workType`, voliteľný `jobWorkflowKind`, `jobArchetype` = archetyp.
- Mapovanie ako mobil: BUILD ← veľký projekt / eigenbau; TRADE + `SERVICE` ← servis; ostatné TRADE.
- Vždy predajná fáza: `phase: sales`, `lifecycleStatus: new_request`, `salesStatus: draft`, `quoteStatus: none` — žiadny aktívny delivery job z wizardu.
- Dual-read: staré riadky s archetypom v `projectType` cez `getProjectWorkType()`.

### Čo zostáva

- Registrácia firmy na webe, billing UI, sync `users/{uid}.activeBusinessOrgId` pri prepnutí (voliteľné).
- Fázy 3–7 z tohto dokumentu (quotes, materiály, …).

---

## 15. AI project creation alignment

**Zdroj pravdy:** [`mobile-ai-project-creation-source-of-truth.md`](./mobile-ai-project-creation-source-of-truth.md)

### Produktová zásada

- Web AI **nie je** generický chatbot ako prvá funkcia.
- AI je **asistent na štruktúru projektu** vnútri flow **Nová zákazka** (`/app/projects/new`).
- Používateľ najprv zvolí **archetyp**, potom **kontakt/kontext**, potom **AI alebo manuál** (kópia projektu nie je súčasťou mobile-aligned shellu).
- Pri AI zadá **popis** a môže neskôr priložiť **dokumenty / fotky**.
- AI vráti **editovateľný návrh** (fázy, úlohy, voliteľné materiálové návrhy).
- Používateľ môže **upraviť**, **refinovať fázu/úlohu**, alebo **regenerovať** celý návrh.
- **Projekt sa uloží až po potvrdení** — nie pri prvom generate.

### Technická parita (mobil)

| Požiadavka | Detail |
|------------|--------|
| Callables | `generateProjectStructure`, `refineGeneratedProjectNode`, `createProjectFromAiPlan` |
| Región | `europe-west1` |
| Schéma | `AiProjectPlan` (`projectTitle`, `category`, `scope`, `summary`, `uiMode`, `phases`, `tasks`, voliteľné `materialSuggestions`) |
| Draft pred confirm | Len **klientsky stav** (`AiProjectDraft`), nie Firestore `projects/` |
| Prílohy | Storage `users/{uid}/aiProjectDrafts/{draftId}/documents/{fileName}` → `documentStoragePaths` |
| Po confirm | Backend create + web/mobil post-patch |

### Čo web pri implementácii nesmie

- Ukladať AI výstup do `projects/` pred confirm.
- Posielať e-maily, vytvárať ani odosielať ponuky automaticky z AI kroku.
- Vytvárať faktúry alebo kalendárové udalosti z draftu.
- Pridávať novú root kolekciu (napr. `aiChats/`).
- Posielať `orgId` do AI callables namiesto stamp po vytvorení.

### Business a materiály

- **Business org:** `activeBusinessOrgId` sa **nestampuje v AI callables**; po `createProjectFromAiPlan` mobil volá `stampBusinessTeamProject` — web má rovnako.
- **Materiály:** AI návrhy sú **suggestions**; backend ich pri create typicky nezapisuje — klient uloží vybrané až po confirm (`createMaterialSuggestionsBatch` / web ekvivalent).
- **Dokumenty:** Viazané na projekt **až po confirm**; predtým len draft Storage cesty pre kontext modelu.

### Súčasný stav webu (2026-06-02)

- Wizard `/app/projects/new` má **mobile-aligned AI creation shell** (archetyp → kontakt → AI/manuál → brief/review alebo manuálne detaily → potvrdenie).
- Komponenty: `AiCreationMethodStep`, `AiDraftBriefStep`, `AiDraftReviewPanel`, `AiDraftPhaseCard`, `AiDraftTaskList`.
- **Žiadny generický AI chatbot** v tomto flow; draft zostáva v **klientskom stave** (`AiProjectDraftLocal`) až do confirm.
- **Firestore `projects/` sa nevytvára** pri AI generate — len pri manuálnom `createDraftJob` alebo po `createProjectFromAiPlan` (keď sú mobilné callables zapnuté).
- Mobilné callables (`generateProjectStructure`, `refineGeneratedProjectNode`, `createProjectFromAiPlan`) sú v `src/services/ai/mobileAiProjectService.ts` a sú **defaultne vypnuté** (`NEXT_PUBLIC_MOBILE_AI_CALLABLES=1` až po E2E overení → inak review placeholder + „Pokračovať manuálne“).
- **Interim office AI** (`generateProjectDraft`, `createProjectFromDraft`, …) **nie je** použitý v `/app/projects/new`; nie je zdroj pravdy.
- Manuálna vetva: `createDraftJob` s `phase: sales`, `lifecycleStatus: new_request`, `salesStatus: draft`, `quoteStatus: none` — bez zmeny.
- Cieľ ďalšej implementácie: E2E zapnutie mobilných callables, `refineGeneratedProjectNode`, upload príloh, sales-draft parita po `createProjectFromAiPlan` — **bez zmeny Firebase schémy** (aditívne polia OK).

### Odporúčané poradie

1. Nasadenie a test 3 mobilných callables z web klienta (auth + region).
2. Review UI v kroku `concept` (nie okamžitý redirect po generate).
3. `createProjectFromAiPlan` na confirm + post-patch (contact, org, docs, materials, sales draft polia).
4. Deprecate office-only draft callables až po E2E parite.

---

## Company user management alignment

**Implemented (web `/app/members`):**

| Topic | Behavior |
|-------|----------|
| Source of truth for owner | `organizations/{orgId}.ownerUid` — always wins over member doc role |
| Team list | `organizations/{orgId}/members/{memberId}` + UI synthetic owner row when owner doc missing |
| Synthetic owner row | UI-only; no Firestore write unless existing `ensureOrgMemberForOwner` runs elsewhere |
| Canonical roles | `owner`, `admin`, `manager`, `worker`, `viewer` (mobile) |
| Legacy web mapping | Firestore `admin` → admin; Firestore `member` → **viewer** in team UI (workspace resolution still maps `member` → manager elsewhere — unchanged) |
| Invite backend | Unchanged: `admin` \| `member` on `invites` / accept; labels shown as Administrátor / Iba náhľad |
| Permissions (UI) | Owner + admin can invite and manage roles; manager/worker/viewer read-only |
| Owner protection | Owner row cannot be removed or role-changed in UI |
| Personal workspace | Message + switch to company workspace; no team list |
| Code | `src/lib/companyRoles.ts`, `src/components/members/*` |

**Firestore rules (unchanged):** member create/update/delete on `members/` restricted to org `ownerUid`; org update via `canManageOrganization` (owner or admin/manager member doc).

**Still needs full parity later:** mobile role writes (`manager`, `worker`, `viewer`) from web invite UI; seat billing; role-based route guards using `permissions/roles.ts` globally.

---

## Account vs company context UX

**Implemented (web header + mobile drawer, 2026-06-02):**

| Koncept | Správanie |
|---------|-----------|
| Používateľ | Identita — avatar + **Profil používateľa** v pravom hornom rohu (oddelené od firmy) |
| Firma | **Primárny pracovný kontext** — pill v hlavičke: logo, názov firmy, štítok „Firemný priestor“ |
| Osobný priestor | **Sekundárny** — v prepínači firiem pod sekciou „Osobný priestor“ + pomocník „Súkromné projekty mimo firmy“ |
| Viac firiem | Klik na pill → „Prepnúť firmu“ + zoznam firiem |
| Osobný priestor aktívny | Pill „Osobný priestor“ + CTA „Prepnúť na firmu“ (ak existuje firma) |
| Sidebar brand | Pri firme: logo/názov firmy; pri osobnom: „Osobný priestor“ |
| Mobile drawer | Kontext firmy hore, navigácia, profil používateľa dole |

**Pravidlá copy / UX:**

- Nepoužívať „workspace“, „orgId“, „ownerId“ v UI hlavičky.
- **Nepresentovať** používateľa a firmu ako dve rovnocenné záložky alebo dva „svety“.
- Používateľ pracuje **vo firme**; osobný priestor je súkromná oblasť mimo tímu.
- **Bez zmeny** Firebase schémy, workspace resolution, auth ani business workspace selection — len layout/copy.

**Kód:** `ActiveCompanyContextSelector`, `UserProfileMenu`, `Header`, `Sidebar` (mobile drawer).

---

## B2B-first web onboarding

**Updated (web `/onboarding`, 2026-06-02):**

| Topic | Behavior |
|-------|----------|
| Paths | `company_owner` (default) \| `join_company` \| `solo` |
| Step 1 | Terms & Privacy acceptance |
| Step 2 | Three cards: Create company (recommended), Join company, Work solo |
| Company owner | Company basics → team size → Business plan (monthly/yearly) → `createBusinessOrg` → 14-day trial → `/app` (company workspace) |
| Join path | Invite code → `/join?token=` → `finishOnboardingAfterJoin` |
| Solo path | Build/trade → country → profile → phone → Free/Pro choice → optional project/equipment → `/app` (personal workspace) |
| Business plans | `business_starter`, `business_team`, `business_company`; `business_enterprise` = contact only |
| Personal plans | `free`, `personal_pro` (Pro billing via mobile; web does not block on Pro) |
| Completion gate | `onboardingCompletedAt` (primary) + `onboarding.completed` (legacy) |
| Post-onboarding | Business setup checklist on company dashboard (dismissible) |
| Register | `/register` → `/onboarding` |
| Login | No `onboardingCompletedAt` → `/onboarding`; else → `/app` |

**Code:** `WebOnboardingWizard` (alias `MobileAlignedOnboardingWizard`), `BusinessSetupChecklist`, `onboardingService.ts`, `createBusinessOrgService.ts`, `onboardingTypes.ts`, Cloud Function `createBusinessOrg`.

---

*Koniec plánu zosúladenia webu.*
