# #provider-layer  The provider layer, stub by default
<!-- spec: provider-layer @ sha256:83f672508e611f9ab742084aa142ed546ad1bcf6de5f5a245387bb4bef95e5b0 -->
<!-- repositories: backend -->

Constraint: the stub is what a default installation runs, in every environment — not a
            test double. The whole path is exercised on a machine with no key

Constraint: the calibration target is out of scope for now (#scope). The seam promised for
            it is that the confidence formula carries a version and every run records which
            version scored it

Constraint: only the client modules open an outbound connection

Constraint: this service never writes into the client's database and holds no
            credential of theirs beyond a read-only one for fetching files (#scope,
            permanently out). Build no bypass layer

Constraint: a model call is never retried automatically (#scope, permanently out). A
            provider failure is reported and the caller resubmits under a new
            idempotency key

## Spec gate
- [x] 1. Draft or confirm the specification  <!-- skills: hoc-requirement-definition; digests: none taken — an interactive checkpoint starts no agent, and the main session read the skill in full --> <!-- wall-time: ~1800s -->
- [x] 2. Verify the use cases can be met  <!-- skills: none matched — this checkpoint's delegate covers the shared UI/UX project context, a frontend surface this feature has none of; digests: none --> <!-- wall-time: ~900s -->

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
