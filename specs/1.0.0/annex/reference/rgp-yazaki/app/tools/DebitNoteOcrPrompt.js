import BaseOcrPrompt from './BaseOcrPrompt.js'

/*
 * The prompt asks for transcription, never for assessment (`40-backend.md` §7.3).
 *
 * Seven demands in it are not decoration:
 *
 * - **The debit note number is spelled out rather than recognized.** Measured on 2026-08-28 against
 *   the client's own scans - 1-bit, 200 DPI, no text layer: told only to read the number "exactly as
 *   printed", the model answered one document with four different codes in six readings, dropping a
 *   letter, doubling a letter, and swapping a letter for one that made the code look more like a
 *   code. Every other field of the same six readings agreed six times out of six. Asked to spell the
 *   run out, the same model got every character right and said each was unambiguous - so the glyphs
 *   were legible and what failed was that the code was being recognized as a word. Naming the three
 *   failures is what stops it. It is the field a document is matched to its cover sheet row by, so a
 *   run of capitals nobody spells the same way twice is `NG-008` on the reading and `NG-006` on the
 *   match, both of them on a document that was fine (`ENG-02` `ENG-05`).
 * - **The two page scopes are opposite, and the prompt states both.** The total is on page 1 and
 *   only page 1 (`ADR-22`): the model is told to read it there and to answer null rather than look
 *   further, because the inner pages of a bundle carry line items and subtotals that read like
 *   totals. The approval block may be on **any** page and is often a late one, so every page is to
 *   be examined for it. Stating one scope and leaving the other to inference is how a prompt ends up
 *   hunting for a total on page 9.
 * - **Page 2 is where the frame is, and the prompt says so before it says "any page".** Checked by
 *   hand across the sample bundle, and every block of every reading on 2026-08-27 came back on page
 *   2. The scope stays "any page" behind it, because `FR-032` says the block may sit anywhere and
 *   one subsidiary's bundle is not the rule - what changes is the order it looks in, which is what a
 *   model spends its attention on. A page hint is cheap to state and cheap to be wrong about; a page
 *   restriction is neither.
 * - **The block is named by where it sits, not by looking like one.** It is inside the
 *   `FOR ISSUING AFFILIATE USE ONLY` frame, and its fields are numbered `(2) LAST NAME`,
 *   `(4) DEPARTMENT`, `(5) SIGNATURE` (§6.1). An earlier wording asked for "a framed area captioned
 *   with words such as APPROVED BY", and a reading of the real bundle on 2026-08-27 answered with
 *   the document's routing fields as well - `1. APPLY TO (SEND TO)`, `2. ISSUANCE (FROM)`,
 *   `(10) AUTHORIZATION FROM SUPERVISOR OF PAYMENT COMPANY`. Two costs, and the second is the
 *   serious one: the set of blocks differed between readings of one document, so `ENG-05` had blocks
 *   agreed on by one reading of three; and `ENG-03` rule 1 passes a document as soon as **any** block
 *   is signed, so a bundle whose issuing affiliate never signed could pass on the paying company's
 *   supervisor box instead (`FR-032` `TERM-06`).
 * - **Null rather than a guess on `isSignaturePresent` and on `blockLabel`.** These two nulls are the
 *   only input `ENG-03` rule 5 has: without them a block the model could not make out comes back
 *   `false`, which accuses the subsidiary of an unsigned document instead of admitting we could not
 *   read it (`DR-03` `NG-010`).
 * - **Null rather than zero** for an amount that cannot be read. An unreadable amount that arrived
 *   as 0 would compare against a cover sheet row and produce a confident wrong answer (`DR-05`
 *   `ADR-09`).
 * - **The document's own line items are not asked for at all.** They had one consumer in 1.0.0, the
 *   per-row signature flag, and the approval is a document-level block. Asking anyway would spend
 *   the bulk of the output budget on an array nothing reads (§7.2).
 *
 * The closing paragraph is what keeps `DR-02` true at the source: the model is told, in words, that
 * deciding is not its job.
 */
const INSTRUCTION_TEXT = `You are transcribing a debit note. Report only what the document shows.

For every value you report, give the page number you read it on and, when you can, the region of
that page it sits in as left, top, right and bottom between 0 and 1000, with 0,0 at the top left
corner. Report the region as null when you cannot place the value on the page. Do not guess a region.

- Read the debit note number exactly as printed. **It is a reference code, not a word.** Read it
  one character at a time and report every character you read, including the letters that spell no
  word: do not drop one, do not repeat one, and do not adjust one to make the code resemble another
  code you have seen. Answer null when no number is printed.
- Read the total amount of the debit note **from page 1 only**. Report it as it is printed, as a
  decimal string with no thousands separators and no currency symbol, together with the three-letter
  currency code it is stated in. If page 1 does not show a total for the whole document, answer null.
  Do not take a figure from any other page: later pages carry line items and running subtotals that
  look like totals.
- Report how many pages the document has.
- Find the printed approval blocks of the issuing affiliate. **Look at page 2 first** - on the
  documents seen so far the frame is printed there. If page 2 does not carry it, look **on any page**,
  and expect a late one: a bundle may also carry more than one block.
- **An approval block is a field captioned "APPROVED BY" or "CONFIRMED BY" inside the frame headed
  "FOR ISSUING AFFILIATE USE ONLY".** That frame numbers its fields, among them "(2) LAST NAME",
  "(4) DEPARTMENT" and "(5) SIGNATURE". Report the caption you actually read, even where it is
  worded differently from those two - but report it only for a field of that frame.
- **Do not report any other field of the form as an approval block.** A box saying where the document
  is sent, who issued it, or that another company's supervisor authorized the payment is not the
  issuing affiliate's approval, however much it looks like one. Report those as nothing at all.
- For each block report the page it is on, the caption without any trailing colon or full stop, the
  approver's last name, the approver's department, and whether the signature field carries a
  signature or a stamp.
- Answer null for the caption, the name, the department or the signature field whenever you cannot
  make it out. Answering false for a signature field you cannot read says the document was not
  approved, which is not what you saw.
- **Report the same set of blocks you would report on a second look.** A field belongs in your answer
  because the frame above names it as an approval, not because it happens to have a line to write on.

Do not list the document's own line items. They are not needed.

Answer null for any amount or number you cannot read. Never answer 0 for an amount you cannot read,
and never estimate one.

Do not decide whether the document is correct, whether an amount is the expected one, or whether an
approval was required. Report what is there.`

/**
 * What the model is told when it is reading a debit note (`AI-02` §7.3).
 *
 * **Its design waits on real samples** (`OPEN-1`). Written against the mock documents (`OPS-03`), it
 * is enough to build the pipeline and worthless for measuring accuracy.
 *
 * @extends {BaseOcrPrompt}
 */
export default class DebitNoteOcrPrompt extends BaseOcrPrompt {
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
