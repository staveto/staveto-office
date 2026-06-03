# Staveto — Work types (mobile ↔ web) & future AI context

**Status:** Implemented on web Manager for draft zákazky creation and display. **No AI generation** in this phase.

## Field mapping (Firestore `projects`)

| Concept | Firestore field | Notes |
|---------|-----------------|-------|
| UI archetype (wizard) | `jobArchetype` | Same values as mobile `NewJobArchetype` |
| Engine type | `projectType` | `BUILD` or `TRADE` |
| Granular work | `workType` | e.g. `NEW_BUILD`, `SERVICE`, `REPAIR` |
| Service jobs | `jobWorkflowKind` | `SERVICE` when archetype is `service_inspection` |

On create, write all mapped fields; use `getProjectWorkType()` for dual-read (legacy rows may still store archetype in `projectType`).

### Enum values (`WorkType`)

| Value | SK label |
|-------|----------|
| `service_inspection` | Servis / obhliadka |
| `customer_job` | Zákazka pre klienta |
| `large_construction_project` | Veľký stavebný projekt |
| `own_build` | Vlastná stavba |
| `internal_project` | Interný projekt |

## Validation (web draft create)

| Type | `customerRequest` | Customer contact |
|------|-------------------|------------------|
| `customer_job` | Required | Recommended |
| `large_construction_project` | Required | Optional |
| `service_inspection` | Optional | Optional |
| `own_build` | Optional | Optional |
| `internal_project` | Optional | Optional |

## Future AI behavior (planned, not implemented)

When AI is enabled, `projectType` should steer prompts and suggestions:

| Work type | AI focus |
|-----------|----------|
| `service_inspection` | Service checklist, travel/time, diagnostics, follow-up questions |
| `customer_job` | Quote line items, customer questions, materials list |
| `large_construction_project` | Phases, planning, risk, budget bands, subcontract hints |
| `own_build` | Internal costs, materials, time tracking (no customer quote by default) |
| `internal_project` | Tasks, company operations; **no customer quote** unless overridden |

All AI outputs remain **draft-only**; manager confirms before quotes are sent or jobs are converted.

## Related code

- `src/lib/workTypes.ts` — enum, helpers
- `src/services/projects/projectService.ts` — `createDraftJob` maps archetype → BUILD/TRADE + `jobArchetype`
- `src/components/jobs/WorkTypeBadge.tsx` — list/detail badges
