/*
 * The pieces both of Gemini's response schemas are assembled from (§7.2).
 *
 * **Named exports rather than a class**, because there is no state here and nothing to do: these are
 * fragments of one provider's structured-output dialect, and a class holding only static members
 * would be a namespace wearing a class's clothes (`03-class-design.md` §4-2).
 *
 * **They live apart from either processor because both branches of §7.2 use them.** The debit note's
 * schema and the cover sheet's differ in what they ask for and agree exactly on how a value is
 * wrapped, so a copy in each would be the one place the two could drift - and a drift here shows up
 * as a region the normalizer silently drops rather than as an error.
 *
 * The type names are spelled out rather than imported from the SDK: only `app/geminiClient/` may
 * reach for a provider package (`DR-11` `SEC-003`), and one enum is not an exception worth making.
 */

export const SCHEMA_TYPE = {
  OBJECT: 'OBJECT',
  ARRAY: 'ARRAY',
  STRING: 'STRING',
  INTEGER: 'INTEGER',
  BOOLEAN: 'BOOLEAN',
}

/*
 * Where a value was seen, asked for the same way for every value (§7.2).
 *
 * **The four sides are `required` and `nullable` together**, which is how a structured-output schema
 * says "answer this or answer null" rather than "you may omit it". A model allowed to omit a side
 * would produce three-sided boxes, and a box missing a side is one the normalizer drops entirely -
 * so asking properly is what keeps regions from silently disappearing (`FR-131`).
 */
export const REGION_SCHEMA = {
  type: SCHEMA_TYPE.OBJECT,
  nullable: true,
  properties: {
    left: {
      type: SCHEMA_TYPE.INTEGER,
    },
    top: {
      type: SCHEMA_TYPE.INTEGER,
    },
    right: {
      type: SCHEMA_TYPE.INTEGER,
    },
    bottom: {
      type: SCHEMA_TYPE.INTEGER,
    },
  },
  required: [
    'left',
    'top',
    'right',
    'bottom',
  ],
}

/*
 * An amount and the currency it is written in, never one without the other (`DR-05`).
 *
 * `STRING` rather than `NUMBER`, because §7.2 wants `897.95` as it is printed: a binary float cannot
 * hold it, and the wire is the one place a float could enter.
 */
export const AMOUNT_VALUE_SCHEMA = {
  type: SCHEMA_TYPE.OBJECT,
  nullable: true,
  properties: {
    amount: {
      type: SCHEMA_TYPE.STRING,
    },
    currencyCode: {
      type: SCHEMA_TYPE.STRING,
    },
  },
  required: [
    'amount',
    'currencyCode',
  ],
}

export const TEXT_VALUE_SCHEMA = {
  type: SCHEMA_TYPE.STRING,
  nullable: true,
}

/*
 * The signature field, and the reason it is `nullable`.
 *
 * A boolean the model must answer would make it guess, and a guess here reads as an accusation: a
 * block it could not make out would come back `false`, which is `NG-003` against the subsidiary
 * rather than `NG-010` against our own reading (`DR-03` `ENG-03` rule 5). Null is the answer the
 * prompt asks for when the field cannot be made out, and the schema has to permit it.
 */
export const FLAG_VALUE_SCHEMA = {
  type: SCHEMA_TYPE.BOOLEAN,
  nullable: true,
}

/**
 * Build the schema of one provenance envelope.
 *
 * A function rather than one constant per value type, because every envelope differs only in the
 * type of its value - and hand-written copies are as many places for the page and the region to
 * drift apart.
 *
 * @param {{
 *   valueSchema: Record<string, *>
 * }} params - Parameters of this function.
 * @returns {Record<string, *>} - The envelope schema.
 */
export function buildEnvelopeSchema ({
  valueSchema,
}) {
  return {
    type: SCHEMA_TYPE.OBJECT,
    properties: {
      value: valueSchema,
      pageNumber: {
        type: SCHEMA_TYPE.INTEGER,
        nullable: true,
      },
      region: REGION_SCHEMA,
    },
    required: [
      'value',
      'pageNumber',
      'region',
    ],
  }
}
