# hor-constant-definition
<!-- hora-skills-ort-renchan 0.2.1 -->
<!-- source: .claude/skills/hor-constant-definition/ -->

**Read the source above whenever this leaves a question open.**

## The one rule — two files, always

Every constant is **two files**, same base name, no per-constant judgment:

| File | Module system | Role |
| --- | --- | --- |
| `constants/<name>.cjs` (repo root) | CommonJS | **Master — the single source of truth.** The actual values. |
| `app/constants/<name>.js` | ESM | **Bridge — a pure re-export** of the `.cjs` via the custom `require`. |

- App code **always imports the bridge**; app code never reaches into the root `constants/*.cjs` itself.
- Seeders **always `require` the master**: `require('../../../constants/memberRankConstants.cjs')`.
- The `.cjs` is the **only copy of the values**. The bridge never restates them — no reshaping, no merging, no extra keys.
- **One category per file** (one hash / one set). A second, unrelated set = another pair of files.
- Never stop at an ESM-only definition (`export default { ... }` with no `.cjs` master) — a seeder cannot import it.

## The `.cjs` master

`'use strict'` + `module.exports = { ... }`, a single SCREAMING_SNAKE category.

```js
// Good: constants/memberRankConstants.cjs — the single source of truth (CommonJS)
'use strict'

module.exports = {
  MEMBER_RANK: {
    BRONZE: {
      ID: 1,
      NAME: 'Bronze',
      IS_ACTIVE: true,
      DISPLAY_ORDER: 10,
    },
    SILVER: {
      ID: 2,
      NAME: 'Silver',
      IS_ACTIVE: true,
      DISPLAY_ORDER: 20,
    },
    // ...
  },
}
```

## The `.js` bridge — the whole file, never more

```js
// Good: app/constants/memberRankConstants.js — thin ESM bridge over the .cjs master
import {
  require,
} from '../globals/_.js'

const MEMBER_RANK_CONSTANT_HASH = require('../../constants/memberRankConstants.cjs')

export default MEMBER_RANK_CONSTANT_HASH
```

- **`require` here is the custom one** — `createRequire(import.meta.url)`, re-exported from the project's globals module (here `../globals/_.js`). There is no native `require` in ESM.

## Naming

- **File**: camelCase, named after the category (`memberRankConstants`, `userPermission`). `.cjs` master and `.js` bridge share the **same base name**.
- **Exported constant**: `SCREAMING_SNAKE_CASE` (`MEMBER_RANK_CONSTANT_HASH`, `USER_PERMISSION`), default export. A `_HASH` / `_CONSTANTS` suffix is common for a lookup hash but not mandatory — name it for the category, not the type, and follow the Renchan naming rules (no forbidden suffixes such as `info` / `data` / `list`).

## Note on names in this skill

The directory and value names are **illustrative fakes**; use your project's own names. The rule is project-independent and need not match a repo's existing notation.

## Finishing checklist

- [ ] **Both files exist** with the same base name: `constants/<name>.cjs` (master) **and** `app/constants/<name>.js` (bridge).
- [ ] The values live **only** in the `.cjs`; the `.js` is a pure re-export via the custom `require`.
- [ ] The file holds **one category**, exported SCREAMING_SNAKE (default export).
- [ ] App code imports the `.js`; seeders `require` the `.cjs`.
