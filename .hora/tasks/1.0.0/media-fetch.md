# #media-fetch  Fetching media, and recording what left
<!-- spec: media-fetch @ sha256:78fe51b533df604f126b2b2f31209b594f4055461ca530962855b0af8337954c -->
<!-- repositories: backend -->

Constraint: video is out of scope for now (#scope). The seam promised for it is that a
            medium's kind is a value the request already carries, so a kind this version
            does not handle is refused by name rather than ignored, and adding one later is
            a row

Constraint: no fetched file is kept in long-term storage. The temporary copy lives on the
            worker's disk for the length of the run

Constraint: this service never writes into the client's database and holds no
            credential of theirs beyond a read-only one for fetching files (#scope,
            permanently out). Build no bypass layer

Constraint: a model call is never retried automatically (#scope, permanently out). A
            provider failure is reported and the caller resubmits under a new
            idempotency key

## Spec gate
- [x] 1. Draft or confirm the specification  <!-- skills: hoc-requirement-definition; digests: none taken — an interactive checkpoint starts no agent -->  <!-- wall-time: ~600s -->
      <!--
      Three use cases and six criteria, each checked for reach against a product holding
      `#run-contract`, `#provider-layer`, `#run-record` and `#run-execution` and nothing later.

      **Everything the criteria name is already declared except one thing.** The caps are in the
      non-functional section — "10 MB per photo, and at most 12 photos in one request — matching
      the client's own upload limit, so nothing is refused twice for different reasons". Both reason
      codes the fourth criterion distinguishes are in `constants/aiRunFailureReasonConstants.cjs`:
      `MEDIA_FETCH_FAILED` for a file that could not be fetched at all, `MEDIA_UNREADABLE` for one
      fetched but unreadable. The fifth criterion's "when the run ends" hook is the base worker
      `#run-execution` built.

      **The gap: nothing says where the media allow-list lives** ([[Q91]]). The first criterion
      turns on it — "a file URL whose host is not on the allow-list is refused, and nothing is
      fetched" — and the term is defined in §5's glossary as "the set of hosts this service may
      fetch a file from". But §23's key file map is an empty table, no section names a config file
      or an environment key for it, and **§18 declares its three tables exhaustively and none of
      them is an allow-list**.

      That omission-from-the-data-model is itself the strongest evidence available, and it is what
      the reading rests on: an environment key, read through the globals barrel like every other
      deployment fact this service holds. Development and live must point at different storage, so
      the value cannot be a constant; adding a host is then a deployment change rather than a
      migration. Recorded as a question rather than settled silently, because it is a durable design
      fact the spec does not state.

      **Criterion 3 was checked for reach and does not reach forward.** "Every file handed to a
      provider is recorded" reads as a property of the recording, not a claim that anything hands
      one over at this gate — the step that does is `#asset-media-extraction`'s second. The egress
      record is written by whatever does the handing, and this feature builds the table and the
      writer.
      -->
- [x] 2. Verify the use cases can be met  <!-- skills: none matched — the delegate covers the shared UI/UX context, and this product declares no frontend row; digests: none -->  <!-- wall-time: ~500s -->
      <!--
      Three use cases walked on paper. All three complete under the spec as written, once the
      allow-list has a home ([[Q91]]).

      "ORT fetches the files a run needs and refuses a URL that points anywhere else" — the refusal
      is the allow-list check; the fetch is an outbound HTTP read of a URL the request carries.

      "ORT answers, months later, exactly which file was handed to which provider and when" —
      `provider_uploaded_files` holds `AiRunMediaId`, `AiProviderId`, `provider_file_name`,
      `uploaded_at` and `expires_at`, and §18 states it is kept independently of whether the run's
      content still exists. `ai_providers` is `#provider-layer`'s and already seeded, so the join
      resolves today.

      "a run given a file too large fails with a reason the caller can act on, before anything has
      been sent" — `byte_size` is checked against the cap before any upload, and
      `MEDIA_LIMIT_EXCEEDED` is the one reason code of the seven that carries parameters, which is
      what lets the limit be named rather than described. That was confirmed against
      `.hora/contracts/1.0.0/client-api.md` rather than assumed.

      No gap, so nothing was routed to `/hora-spec`.
      -->

## Backend gate
- [ ] 3. DB and API schemas
- [ ] 4. Stub API
- [ ] 5. The modules the implementation needs
- [ ] 6. Actual API
- [ ] 7. Worker
- [ ] 8. Security audit
- [ ] 9. Verify the use cases again, against the built API

## Frontend gate
- [x] 10. Open the frontend  <!-- n/a: target names no frontend row -->
- [x] 11. Reconfirm UI/UX and the use cases  <!-- n/a: target names no frontend row -->
- [x] 12. Component design  <!-- n/a: target names no frontend row -->
- [x] 13. The frontend modules the implementation needs  <!-- n/a: target names no frontend row -->
- [x] 14. API client  <!-- n/a: target names no frontend row -->
- [x] 15. UI  <!-- n/a: target names no frontend row -->
- [x] 16. Wire the data-fetching logic in  <!-- n/a: target names no frontend row -->
- [x] 17. Local test environment  <!-- n/a: target names no frontend row -->

## Acceptance gate
- [ ] 18. Acceptance (E2E and unit both)
