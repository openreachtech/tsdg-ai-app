import BaseOcrPrompt from './BaseOcrPrompt.js'

/*
 * The cover sheet's prompt, and the ways it is deliberately not the debit note's (§7.2 §7.3).
 *
 * - **It asks for the worksheet's name, and that answer is checked rather than trusted.** The model
 *   is looking at a workbook the operator never saw - one worksheet extracted out of seven
 *   (`ADR-23`) - so the name is how a bug in the extraction is caught before its rows are compared
 *   against a month they do not belong to (`SEC-009`).
 * - **It asks for the row number as the sheet prints it.** `ENG-04` matches a read row to a parsed
 *   row by that number and never by content, so a model that renumbered from one would have every
 *   row disagree. The number asked for is the spreadsheet's own, the one in the left margin.
 * - **And it says which number is not that one.** Measured on 2026-08-27: told only "not a number
 *   you counted", the model answered `1, 2, 3` for rows the margin numbers `4, 5, 6` - it was not
 *   counting, it was reading the table's own `No.` column, which the instruction did not exclude.
 *   Every row then failed to match and the whole reading came back as disagreement. Naming the
 *   competing column fixes it three times out of three, and leaves a sheet without such a column
 *   answering exactly as it did.
 * - **The amount is reported as the document writes it** - `897.95`, never `89795` and never
 *   `1,110,000`. Converting to minor units is arithmetic, and arithmetic in the reading step is the
 *   engine's job leaking into the AI's (`DR-02` `DR-05`).
 * - **An amount travels with its currency, always.** The sheet has a `Cur` column that says which
 *   one each row is in, so there is nothing to infer - and a bare figure would have to be
 *   interpreted by whatever read it next, which is how 1.0.0 compared amounts across currencies
 *   without noticing.
 * - **It asks for nothing about approvals and nothing about pages.** A spreadsheet has nothing to
 *   sign and no page to count, and a field that could only ever be null is a field a reader has to
 *   ask about (§7.2).
 *
 * The closing paragraph is the same promise the debit note's prompt makes, and it matters more here:
 * this reading is compared against a deterministic parse and **never judges anything** (`DR-01`). A
 * model invited to say which of the two is right would be doing the one thing `ADR-16` bought the
 * second opinion in order not to do.
 */
const INSTRUCTION_TEXT = `You are transcribing one worksheet of a monthly cover sheet. Report only
what the worksheet shows.

For every value you report, give the page number you read it on and, when you can, the region of
that page it sits in as left, top, right and bottom between 0 and 1000, with 0,0 at the top left
corner. Report the region as null when you cannot place the value on the page. Do not guess a region.

- Report the name of the worksheet exactly as its tab is labelled, including any trailing space or
  punctuation. Do not tidy it.
- Report every line item row of the table. For each one give:
  - the row number the spreadsheet itself shows in the left margin. **A table often prints a
    counter of its own in a column headed "No." or similar, and that is not the row number.** The
    row number of the first line item is larger than 1 on every sheet with a heading above its
    table, so a line item reported as row 1 is almost always the counter;
  - the debit note number exactly as printed;
  - the three-letter currency code the row states;
  - the amount exactly as printed, as a decimal string with no thousands separators and no currency
    symbol, together with the three-letter currency code it is stated in.
- Report every subtotal the totals block states, one per currency, each with the amount as printed
  and the three-letter currency code it is stated in.

Answer null for any value you cannot read. Never answer 0 for an amount you cannot read, never
estimate one, and never add figures together to produce one that is not printed.

Do not report the workbook's other worksheets. Do not look for signatures or approval blocks, and do
not report a page count.

Do not decide whether the worksheet is correct, whether a total adds up, or whether an amount is the
expected one. Report what is there.`

/**
 * What the model is told when it is reading a cover sheet (`AI-05` §7.3).
 *
 * **It shares its version with the debit note's prompt** (`ENV-033`), which is why the version lives
 * on the base rather than here: a reading is only reproducible if the pair is pinned together, and
 * two independent versions would let a comparison mix a v3 debit-note reading with a v2 sheet one.
 *
 * **Its design waits on real samples** (`OPEN-1` `OPEN-4`), like its sibling. Written against the
 * mock and realistic workbooks (`OPS-03`), it is enough to build the pipeline and worthless for
 * measuring accuracy.
 *
 * @extends {BaseOcrPrompt}
 */
export default class CoverSheetOcrPrompt extends BaseOcrPrompt {
  /**
   * get: What the model is told to do.
   *
   * @override
   * @returns {string} - The instruction.
   */
  get instructionText () {
    return INSTRUCTION_TEXT
  }
}
