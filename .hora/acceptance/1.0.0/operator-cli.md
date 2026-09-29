# Acceptance - 1.0.0 - #operator-cli

## Run 1
<!-- reach: scoped -->
<!-- scope: operator-cli -->
<!-- live: no (not requested). There is no screen and no endpoint to drive; what this feature ships is a command, and the command itself was run for real against the seeded database at checkpoints 7 and 9 -->
<!-- reuse: none. Executed at tree 60e16b9, in WSL, by the repository's own `npm test` at `--maxWorkers=4` -->
<!-- not-accepted: none -->
<!-- version-criteria: not in scope (gate) -->
<!-- environment: not brought up; the command reaches no service, only the database -->

### Verdict

passed over 1 of 11 features, partial: steps 3 and 4 had no equipped delegate

### What ran

| Step | Delegate | Result |
|---|---|---|
| environment | - | not required at a gate; nothing here is served |
| unit (tsdg-ai-backend) | `hor-backend-testing`, `hoc-jest`, `hoc-test-execution` | **4770 passed across 146 suites**, and **511 across 8**, 0 failed. `npx eslint .` clean |
| scenarios | **none equipped** | not run - see finding 1 |
| review | **none equipped** | not run - see finding 1 |
| version criteria | - | not in scope (gate) |
| UX | - | not in scope (gate); this product declares no frontend row |
| security | - | not in scope (gate); checkpoint 8 audited this feature's change set |

### Findings

1. **Steps 3 and 4 had no equipped delegate, so this is a partial run** - the gap every acceptance
   of this version has recorded. Both candidates are frontend-shaped: one asks whether each
   backend operation is reachable from the UI and requires a live end-to-end environment, the
   other derives its scenario list from the API surface. This feature has neither a screen nor an
   API, so neither would have had anything to read.

2. **A MEDIUM security finding was found and fixed inside this gate, and it is the one a reading
   would not have caught.** A correlation id and an external ref are a caller's own text, admitted
   by a rule that bounds their length and nothing else - so an escape sequence is storable. Printed
   raw, the terminal acts on it: one sequence clears the line the operator is reading and the next
   puts a row over the top of it. **The report this command exists to produce could be edited by
   the data it reports**, and it is read exactly when the service will not answer and there is no
   second place to look. Proved with a probe before it was fixed, fixed in the one method every
   text cell passes through, and the probe re-run confirms the bytes are gone.

3. **Two LOW findings, both of the version's dominant family - a note asserting a control that did
   not hold.** `reportFailure()` promised it logged no parameter the operator typed and
   interpolated the driver's message, which carries the filter value escaped into the failing SQL;
   it now logs the error's name, and a test case shaped exactly like that driver message fails if
   the parameter reappears. And three docblocks claimed the reporter owns every character leaving
   the process, which is false outside development because the database client echoes every query
   to the same stream ([[Q154]]); they now claim what is true and name the exception. Measured
   rather than assumed: a write logs a bound parameter, so no content reaches that echo.

4. **The command was run for real, and one thing only running it could show is left open.** All
   four questions answer and three kinds of refusal end under the right code - but a refusal prints
   **nothing at all**, on either stream, so a person who mistypes one of four rarely-used words
   learns nothing. No criterion is violated and a scheduled task reads the code cleanly, so the
   scope was not widened on an implementer's judgement; it is [[Q153]], with the shape a fix would
   take and the argument against it.

5. **One path has never been exercised against a real failure.** Exit `1` - the database would not
   open, or the read failed - is covered by test with a stubbed throw, never by taking the database
   away, because this environment shares it with the suite. Stated so that "passed" is not read as
   "every path was seen".

6. **A defect in the brief, caught by an implementer rather than by the author.** The run-key rule
   named in checkpoint 5's assignment inspects a row id - digits only, nineteen characters - while
   a run key is 64 characters and every seeded one carries hyphens and letters. Followed as
   written, the `run` command would have refused every real run key. It is now a glossary row,
   because the name reads as the opposite of what the class does.
