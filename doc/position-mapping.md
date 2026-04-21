# Position mapping

How the sheet's `Position` column gets paired with an LCR calling id so
the import knows which row holds which calling.

## The id format

Every LCR calling, after the extension's normalization and merge pass,
has an id of the form:

```
<Organization>:<Calling Name With Dashes>
```

Examples:

- `Bishopric:Bishop`
- `Bishopric:Ward-Executive-Secretary`
- `Elders Quorum Presidency:Elders-Quorum-First-Counselor`
- `Aaronic Priesthood:Aaronic-Priesthood-Advisors`
- `Young Women:Young-Women-Specialist`

The id is constructed by
[`extension/common.js::mergeCallings`](../extension/common.js). See the
*Normalization rules* in [`CLAUDE.md`](../CLAUDE.md) for the renames
applied before the id is built (e.g., "Priests Quorum Adviser" →
"Aaronic Priesthood Advisors").

## Natural derivation rule

For a sheet row with Organization `O`, Position `P`, and the ward's
`ward_code` `W`, the server computes:

```
If P starts with "<W> " then
    lcr_id = O + ":" + P.substring("<W> ".length).replaceAll(" ", "-")
Else
    lcr_id = null  (classified as Custom / Unmatched by the extension)
```

Examples for `ward_code = "CO"`:

| Organization | Position | Derived `lcr_id` |
|--------------|----------|------------------|
| Bishopric | CO Bishop | `Bishopric:Bishop` |
| Bishopric | CO Ward Executive Secretary | `Bishopric:Ward-Executive-Secretary` |
| Elders Quorum Presidency | CO Elders Quorum First Counselor | `Elders Quorum Presidency:Elders-Quorum-First-Counselor` |
| Primary Presidency | CO Primary Secretary | `Primary Presidency:Primary-Secretary` |

## Overrides

Some sheet labels don't match the natural derivation. That's what
`_position_overrides` is for:

| ward_code | sheet_position | lcr_id |
|-----------|----------------|--------|
| CO | CO Young Women Advisors | `Young Women:Young-Women-Class-Adviser` |
| CO | CO Aaronic Priesthood Specialists | `Aaronic Priesthood:Aaronic-Priesthood-Specialist` |
| CO | CO Email Communication Specialist / Bulletin | `Technology:Email-Communication-Specialist` |

Rules:

- The override is keyed by `(ward_code, sheet_position)`, both matched
  as trimmed strings.
- The match on `sheet_position` is exact and case-sensitive.
- When an override fires, the snapshot response marks
  `override_applied: true` for that row.
- An override always wins over natural derivation.

## Custom rows (no override, no match)

A row is *Custom / Unmatched* when either:

1. The position does not start with `<ward_code> `, AND has no
   override (so the derivation returns `null`); or
2. The derivation returns an id that doesn't appear in the extension's
   scraped `collapsedCallings` (maps to nothing LCR knows about).

Case 1 is detected by the server (`lcr_id = null`). Case 2 is detected
by the extension. Both land in the review modal's *Custom or Unmatched*
section and are never modified.

Typical cases:

- A manual entry like "CO Zoom Account" that has no LCR equivalent.
- A position that was renamed in LCR but still bears the old label on
  the sheet — either rename the sheet row or add an override.
- A calling that isn't in the extension's `SYSTEM_FILTERS["Email Alias
  Filter"]` selection set; the scraper may not even present it. If you
  want it imported, widen that selection list in
  `extension/generated-table-script.js` and redeploy the extension.

## When to use an override vs. keep a row custom

Add an override when:

- The sheet label is a deliberate, human-friendly paraphrase of the LCR
  calling (e.g., *Advisors* vs. *Class Adviser*).
- Multiple LCR-level callings are grouped into one sheet row and you
  want LCR's list of holders to flow in.

Leave the row custom when:

- The row represents something outside LCR (shared account, external
  service alias, ad-hoc role).
- You want the emails to remain entirely hand-managed.

## Debugging a mismatch

1. Click *Extract Callings* and open the generated table. Find the
   calling you care about in the *Organization* and *Calling* columns.
   The row id attribute in DevTools is the `lcr_id`.
2. Compare against the sheet's Position value (minus the ward_code
   prefix).
3. If they don't match, add an override or fix the sheet position.

> **Note.** The id includes normalizations applied in
> `extension/common.js::fixCallingName` and `fixOrganizationName`. If
> you are adding support for a *new* LCR calling name that should roll
> up with an existing one, extend those functions rather than pasting
> a noisy override list.

## See also

- [`sheet-setup.md`](./sheet-setup.md) — where `_position_overrides`
  lives.
- [`architecture.md`](./architecture.md) — the snapshot response
  includes `lcr_id` and `override_applied` per row.
- [`email-merge-algorithm.md`](./email-merge-algorithm.md) — what
  happens *after* the position mapping is resolved.
- [`../CLAUDE.md`](../CLAUDE.md) — the normalization rules in
  `common.js`.
