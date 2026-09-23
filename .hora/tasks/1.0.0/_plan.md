# 1.0.0

## Features

 1. [x] #run-contract             backend
 2. [ ] #run-record               backend   depends: run-contract
 3. [ ] #run-execution            backend   depends: run-record
 4. [ ] #provider-layer           backend   depends: run-execution
 5. [ ] #media-fetch              backend   depends: run-execution
 6. [ ] #run-delivery             backend   depends: run-execution
 7. [ ] #asset-media-extraction   backend   depends: run-delivery, provider-layer, media-fetch
 8. [ ] #run-list                 backend   depends: run-delivery
 9. [ ] #run-cancel               backend   depends: run-execution
10. [ ] #operator-cli             backend   depends: run-list
11. [ ] #retention                backend   depends: run-record

## Acceptance

- [ ] Sweep the whole version, once every feature above is done
      Version criteria: 6 (#version-acceptance-1-0-0), 0 resting on a not-accepted feature

## Not accepted

None. `Existing assets` declares no baseline permission, so no feature of this version
is listed rather than specified.

## Withdrawn

- #run-progress   kicked in 1.0.0. Deferred rather than dropped: it is an "out of scope
                  for now" entry naming its unblock condition and its seam. Nothing of it
                  was implemented, so no removal task is owed
