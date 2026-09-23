# hoc-naming
<!-- hora-skills-ort-core 0.4.0 -->
<!-- source: .claude/skills/hoc-naming/ -->

**Read the source above whenever this leaves a question open.**

## Class names

- UpperCamelCase. **Singular noun** (`User`, never `Users`) — so the array of instances can be `users`.
- **Avoid a single-word class name wherever possible**; use a compound of two or more words. If review flags it, change it without discussion.
- When no name is dictated, name the class for the logic it encapsulates.
- Abstract class → `Base~` prefix; extended for the application → `BaseAppSample`. `Base~` / `App~` are "super prefixes." A derived class **removes the super prefix, keeps the suffix, and replaces the prefix with a distinguishing one**:

```javascript
class BaseSample {}
class BaseAppSample extends BaseSample {}
class AlphaSample extends BaseSample {}
class BetaSample extends BaseAppSample {}
```

## Method names

- A method name is a **predicate**, not a complete sentence — the receiver is the subject. `#isValidStatus()` (reads "object is valid status"), never `#isStatusValid()`.
- Start with the **base (present tense) form of a verb**: `findUsers()`, `deleteUsers()`. An auxiliary verb is also allowed (`#canFindEntity()`, `#shouldHaveFulfilledInput()`).
- **A third-person-singular verb or auxiliary verb carries the convention that the return value is boolean** — `is...()` / `has...()` / `can...()` / `should...()` / `containsInvalidTag()`.
- **A single-word name for an instance method is basically prohibited** — `#load()` doesn't reveal what is loaded; use `#loadCardNumbers()`. For a **static** method the class name supplies the context, so a single word is exceptionally allowed (`CardNumbersLoader.load()`).
- An **entry-point** method is a transitive verb with an object: for `ChunkBuilder`, `#buildChunks()`, not `#build()`.
- Starting with a particle/preposition is allowed but avoid it alone (`fromOpenedAt()` correct / `from()` incorrect). Exception: inflator methods (`.from()` / `.of()` / `.by()`).

### Verb choice among highly abstract verbs

| Verb | Usage |
| :-- | :-- |
| `create~` | Instantiate an instance from a class |
| `generate~` | Generate a primitive value |
| `build~` | Generate a temporary object |
| `make~` | Not used |
| `find~` | Retrieve an entity from the DB (anything wrapping `Model.findOne()`/`findAll()` uses `find`, not `get`/`fetch`) |
| `fetch~` | Access an external API to retrieve data |
| `extract~` | Extract data from a variable/property |
| `save~` | Wraps processing that persists to the DB |
| `send~` | Access an external API to update external data |
| `set~` | Property update (rarely used since setters are prohibited) |

For other verbs, choose a word faithful to the method's responsibility.

## Properties, variables, accessors

- Property names are in principle **nouns**; acceptable if clear.
- A variable or property holding an **array is always the plural form of the noun denoting its element** (`#payments` correct / `#paymentList` incorrect). Never express plurality with a `List` suffix.
- Getter names are in principle nouns; a boolean-style getter name (third-person-singular verb / auxiliary verb) is also permitted. Setters are prohibited, so no setter naming rule.
- Higher-order function callbacks take `it` as the item parameter (`(it, index, array)`). A **nested** inner callback names its item by meaning. A `reduce()`/`reduceRight()` accumulator is named for the value being accumulated (`total`).

## Datetime suffixes: `At` for an instant, `On` for a date

- A value carrying a **time of day** ends with `At` (`modifiedAt`, `trashedAt`, `expiredAt`).
- A value whose meaning stops at the **calendar date** ends with `On` (`billedOn`, `dueOn`).
- A **range** keeps the suffix and appends `From` / `To` (`modifiedAtFrom` / `modifiedAtTo`, `billedOnFrom` / `billedOnTo`). Never `modifiedFrom`.
- `From` / `To` mark **the two ends of a range**. A single value meaning "in effect from this moment" is not a range end — `effectiveAt`, not `effectiveFrom`.

## Abbreviations

- **Any abbreviation not in the whitelist below is prohibited.** Only two kinds qualify: abbreviations universally used in society, or ones conventionally used in programming for many years (`char`, `exec`, `eval` are also conventionally allowed).

| Whitelisted | admin, app, config, enum, env, id, init, int, max, min, nav, sin, cos, tan, `Ctor` (constructor is reserved), noop, faq, func |
| :-- | :-- |
| **Prohibited** | `acc`, `arr`, `avg`, `auth`, `btn`, `cate`, `cfg`, `cnt`, `cond`, `ctx`, `e`, `err`, `ev`, `ex`, `fmt`, `msg`, `no`, `num`, `prod`, `tx`, `tz`, and so on |

- `func` is reluctantly allowed (`function` is reserved); prefer a name stating the functionality. **`fn` / `f` are not allowed.**
- An abbreviation used inside an external module is **not** a reason to use it yourself (do not imitate Sequelize's `msg` or Express's `req` / `res`).
- The whitelist is shared between JavaScript and CSS (CSS custom property names follow it too).

## Prohibited words (as prefix or suffix)

`info` (`information`) · `data` · `helper` · `manager` · `item` · `list` · `util` (`utils`) · `type` (**prohibited as a suffix** — use `Category`: `granteeCategory` / `GranteeCategory`).

- `type`'s **only exception** is a name borrowed verbatim from an external vocabulary: `mimeType` (MIME standard), `contentType` (HTTP `Content-Type`), a constant mirrored from an external package (`columnTypeName`).
- **No redundant compound words** — a word that adds no new meaning is redundant.

| Redundant | Good example |
| :-- | :-- |
| UserInfo | userDetail / userPayment |
| SaveData | saveUser / saveMessages |
| FileUtil | FileNameCollector |

## American spelling — always

For words with both American and British spellings, **always write the American form**.

| American | British |
| :--: | :--: |
| color | colour |
| center | centre |
| behavior | behaviour |
| meter | metre |
| finalize | finalise |
| organize | organise |
| analyze | analyse |
| license | licence |
| dialog | dialogue |
| canceled | cancelled |

## Contrasting terms — fixed pairs

| Positive | Negative |
| :-- | :-- |
| add | remove |
| append | extract (append to / remove from a list) |
| setup | teardown |
| initialize | terminalize |
| benefit | drawback |
| pros | cons |

## Non-ASCII

- **Do not use non-ASCII characters** in variable names, class names, member names, etc.
