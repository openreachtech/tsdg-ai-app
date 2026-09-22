# Open questions — 1.0.0

Append-only. Answered by editing `specs/1.0.0/`, not by editing this file.

---

## Q1 · undefined-detail · blocking: no

**Raised at** stage 1, 2026-09-22.

The annex records a "Phase 1 build brief" (its OPEN-01) as the document that fixes the
scope of the asset-media-extraction feature, and records it as missing. It was confirmed
at stage 0 as not available to this project.

W1's scope for 1.0.0 was therefore settled in conversation and approved section by
section, rather than read from that brief.

**What to do if the brief arrives:** read it against `#asset-media-extraction`'s use cases
and acceptance criteria. Where it contradicts what was approved, the contradiction is a
finding for `/hora-spec` at stage 1, not a silent correction.

**Not blocking** — the feature is fully specified without it.

---

## Q2 · orphan · blocking: no

**Raised at** planning, 2026-09-22.
<!-- spec: — -->

`specs/1.0.0/annex/reference/` holds 207 files that nothing links to from `spec.md`. Only
its `README.md` is linked.

- [x] resolved
      They are a code extract, read as a whole rather than as documents of their own, and
      the `Annex` table says so in as many words. Linking 207 source files individually
      would describe them as things somebody is meant to open one at a time. Nothing is
      extracted from them: the row is `Annex`, so they produce no feature and no task.

## Q3 · undefined-detail · blocking: no

**Raised at** planning, 2026-09-22.
<!-- spec: — -->

The spec did not say which database engine the automated suite runs on. The boilerplate
fixes `development` to SQLite while the spec's manual verification declares MariaDB, and
nothing in `specs/` recorded that the two cover different runs.

- [x] resolved
      A `Test engine` row was added to the non-functional requirements in this session,
      stating both engines, that the split is deliberate, and the risk it leaves open:
      `text('medium')`, `json` and `datetime(3)` behave differently on the two, so a type
      error can pass the suite and appear only on the engine that runs live.
