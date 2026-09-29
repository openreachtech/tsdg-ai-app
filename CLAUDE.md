# CLAUDE.md — tsdg-ai-app

## Language

**Talk in Vietnamese. Write in English.**

| | |
|---|---|
| Anything said in the session — a proposal, a checkpoint question, a report, a summary | **Vietnamese** |
| Anything that stays in a file — `specs/`, code, comments, commit messages, PR bodies, `.hora/` records | **English** |

A proposed edit to `specs/` is discussed with you in Vietnamese and written into the file
in English. This is the kit's own rule, not an override of it: see
`.claude/skills/hora/references/structure.md`, "What language to write for humans".

**Never write two languages side by side in one file.** One copy gets updated and the two
disagree.

The `Question language` row in the spec's document information section stays `English`, so
that `.hora/questions/` reads the same as the spec it belongs to.
