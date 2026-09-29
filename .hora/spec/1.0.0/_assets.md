# Assets — 1.0.0

Read at `298b1f1` (the hora repository, branch `release/1.0.0`).

## Repositories read

**None.** No implementation repository exists under this root yet — this is a
greenfield project. `/hora-setup` has not run, and the stack handbook's catalog
(`docs/stack/README.md`) offers one `renchan` backend row and zero or more
`furo` frontend rows.

## Documents

| File | Declared as | Vouched for by | Note |
|---|---|---|---|
| `annex/tsdg-ai-backend-build-plan-v0.4.html` | `Annex` | confirmed as Annex by the requester | Proposal v0.4, 18 Sep 2026, bilingual EN/VI. Covers all five AI services, the shared contract, run observation, tables and jobs, the directory layout, security, testing, the roadmap, 20 OPEN items and 12 ADRs. Never extracted from: every requirement is drafted by a stage and approved before it enters `spec.md` |
| `annex/reference/` | `Annex` | the code itself, at the commits the plan cites | Extracts of the three services the plan ports from or references, copied in at the requester's instruction. 208 files, 1.6 MB, source only. `leepai` @ `4371ba0` — the multi-provider layer and the `recordFieldValues` agent loop. `rgp-yazaki` @ `8e94479` — document reading, consensus, the stub driver, the provider-upload record, the job and purge shapes. `linoa` @ `987e663` — the v1 REST renderer. `annex/reference/README.md` says what each path is and why the plan names it |

`sources/` is empty. Nothing is declared as a source for this version.

## This version's request

| File | Asked for | Where it went |
|---|---|---|
| `request/foundation-and-w1.md` | one backend service `tsdg-ai-backend` (REST API process + worker process), phase P0 foundation and phase P1 AI-W1 only | to be worked through stages 1–7. Confirmed as this version's agenda, not as spec text |

## Read but not settled here

| What | Which stage settles it |
|---|---|
| The annex covers five AI services (W1, W2, W3, W4a, W4b); the request carries only the foundation plus W1, and names the other four as later versions | 2 |
| The annex's admin console (FR-ADM, ADR-12, OPEN-05) — the request says it is a separate line item and not in this version | 2 |
| The annex's roadmap carries phase estimates; the request states they are context and never a constraint on scope or on calling something finished | 2 |
| Retention is two separate clocks in both documents — content 30 days, decision trace 730 days (OPEN-13) — and the request lists the retention numbers as still open | 3 |
| How far the provider layer and the document-reading layer are ported as-is versus redesigned. Both extracts are now in `annex/reference/`, so this is a design decision rather than a missing input | 4 |
| The stub driver is the default in every environment (DR-11). `rgp-yazaki`'s `StubAiModelProcessor` is the working example, and its fixtures are per-document-kind constants | 4 |
| Prompts, tool schemas and model choice held as DB data with `_bk` history (ADR-06) | 4 |
| The run record tables `ai_runs`, `ai_run_steps`, `ai_model_calls` plus the master tables the annex lists | 4 |
| Whether a `furo` frontend row is declared at all — the request states the service has no screens and no end-user surface, its only caller being another server | 4 |
| The W1 result naming collisions: `key` versus `path` for the field identifier, and `confidence` against the match percentage Angular already displays (OPEN-19) | 4 |
| `MediaFetchClient`'s host allow-list, the size caps checked before anything reaches a provider, and the egress record of every file handed to a provider | 4 and 6 |
| The file-staging credential — settled in the annex as the R2 URL plus read-only credentials (OPEN-20), listed by the request as still open | 6 |
| HMAC authentication over `timestamp + "." + rawBody`, the `Idempotency-Key` requirement, and the signed callback | 6 |

## Brought in after the first pass

| What | Where it came from | Read at |
|---|---|---|
| `leepai` provider layer | `openreachtech/leepai-crm-demo-backend-alpha`, read with `git archive` without touching its working tree | `4371ba0` (2026-09-15) |
| `rgp-yazaki` document-reading layer | `openreachtech/rgp-yazaki-finance-ai-backend`, cloned and checked out | `8e94479` (2026-09-09) |
| `linoa` REST renderer | `openreachtech/linoa-ai-concierge-backend`, cloned and checked out | `987e663` (2026-01-29) |

Each commit is the one the build plan states it was checked against, so the
extract and the plan describe the same code.

## Named as existing, but not available to this session

| What | Who holds it | Consequence |
|---|---|---|
| The Phase 1 build brief (OPEN-01) | Taisandaugia | The annex records it as missing and says it fixes the scope of W1. Confirmed as unavailable |
| The Phase 1 walkthrough of 11 Sep | Taisandaugia | Cited throughout the annex as the other half of the evidence. Confirmed as unavailable |
| `Auction-Project`, `auction-platform`, the `taisandaugia` prototype | Taisandaugia | The annex's source check was run against them at named commits. Not reachable here; the annex's report of what they contain is all that is available |
