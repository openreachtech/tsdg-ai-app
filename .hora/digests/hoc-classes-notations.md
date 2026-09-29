# hoc-classes-notations
<!-- hora-skills-ort-core 0.4.0 -->
<!-- source: .claude/skills/hoc-classes-notations/ -->

**Read the source above whenever this leaves a question open.**

Covers only the **writing order** of members in a class body. What a class may hold is the class design principles convention.

## Placement order of members

1. `static` fields
2. `constructor`
3. The factory methods (`.create()` → `.createAsync()`)
4. static inflator methods
5. static getters
6. static methods
7. instance getters
8. instance methods

Item 3 = the class's own factory methods published as API; `.create()` sits immediately after the `constructor` (method-definition convention). Item 4 naming/definition: inflator-methods convention.

## Order among getters (categories 5 and 7)

1. Getters that return a fixed value — among them, the `~Ctor` ones (static getters for delegation) first.
2. The rest (getters that compute the value they return).
3. Abstract getters last, together.

`~Ctor` naming is governed by the accessor-definition convention.

## Order among methods (categories 6 and 8)

The order is **the order of appearance in an outline that writes out the nesting structure of calls**. Immediately after a method, place the methods that it calls (depth-first, first appearance). Leave out of that enumeration members of another category (getters and the like) and anything not an own member of the class (methods of a delegate or dependency class).

**For instance methods, the call outline of the private methods takes priority.** Abstract members are therefore *not* collected at the end; they go at their first-appearance position in the outline.

## The shape

```javascript
export default class Sample extends BaseSample {
  // static field
  static pool = new WeakMap()

  constructor (...) { ... }

  // factory methods
  static create (...) { ... }
  static async createAsync (...) { ... }

  // static inflator method
  static as (...) { ... }

  // static getters
  static get AlphaCtor () { ... }
  static get beta () { ... }
  static get gamma () { ... }
  /** @abstract */
  static get delta () { throw new Error('...') }

  // static methods
  static buildAlpha (...) { ... }
  static generateBeta (...) { ... }
  static buildGamma (...) { ... }
  static createAlphaClient (...) { ... }

  // instance getters
  get Ctor () { ... }

  // instance methods
  buildAlpha (...) { ... }
  generateBeta (...) { ... }
  /** @abstract */
  normalizeBeta (...) { throw new Error('...') }
  defineGamma (...) { ... }
  defineDelta (...) { ... }
}
```

## What the order does not determine

Use **the order in which they are written from the top within the class**. When enumerating or documenting members, follow that same order.

full call-outline worked example: `.claude/skills/hoc-classes-notations/SKILL.md#order-among-methods`
