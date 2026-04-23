# Email merge algorithm

The canonical rules for reconciling the LCR email list for a calling against
the existing email cells on a ward-tab row. Implemented authoritatively in
`extension/callings-sheet-import.js` and mirrored as a sanity check in
`calling_sheet/EmailMerge.gs`.

## Inputs

- `existing` — the row's current cell values, in order, starting at
  column E (column D holds the reserved Name and is skipped). Already
  trimmed and filtered to non-empty strings.
- `lcrEmails` — the personal email addresses LCR reports for this calling.
  May be empty (vacant calling, or calling has no members with recorded
  emails). Already trimmed and filtered to non-empty strings.
- `internalDomain` — bare domain (no `@`) for the ward's forwarding
  aliases, e.g., `csnorth.org`.

Comparison is case-insensitive for email addresses but the cell is
preserved in its original casing.

## Output

- `emails` — the final list of cell values in final order, to be written
  starting at column E.
- `warnings` — annotations-lost warnings surfaced in the review modal.
  Never block the apply.

## The `[GoogleAccount: …]` annotation

A cell may look like:

```
user@example.com [GoogleAccount: user.gmail@gmail.com]
```

This is a manual annotation recording which Google Account is associated
with the LCR email for shared-doc access. The annotation is metadata that
the import must reason about but cannot regenerate.

Parsing rule (regex):

```js
const ANNOTATION_RE = /^(.+?)\s*\[GoogleAccount:\s*([^\]]+?)\s*\]\s*$/i;
```

`parseEmailCell(raw)` returns `{canonical, annotation, raw}` where
`canonical` is the email portion before the bracket (or the whole cell if
no bracket), `annotation` is the account inside the brackets (or `null`),
and `raw` is the original string.

## Algorithm

Pseudocode:

```js
function mergeEmails({ existing, lcrEmails, internalDomain }) {
  const isInternal = addr =>
    addr.toLowerCase().endsWith('@' + internalDomain.toLowerCase());
  const lcrLower = new Set(lcrEmails.map(e => e.toLowerCase()));
  const personal = [];
  const internals = [];
  const consumed = new Set();
  const warnings = [];

  for (const rawAddr of existing) {
    const parsed = parseEmailCell(rawAddr);
    const lower = parsed.canonical.toLowerCase();

    if (isInternal(parsed.canonical)) {
      internals.push(rawAddr);              // preserve verbatim; slotted at end later
    } else if (lcrLower.has(lower)) {
      personal.push(rawAddr);               // LCR match — preserve cell verbatim
      consumed.add(lower);
    } else if (parsed.annotation) {
      warnings.push({
        kind: 'annotation_lost',
        dropped_canonical: parsed.canonical,
        google_account: parsed.annotation,
        raw: rawAddr,
      });
      // cell is dropped
    }
    // else: plain personal email no longer in LCR — drop silently
  }

  for (const addr of lcrEmails) {
    if (!consumed.has(addr.toLowerCase())) {
      personal.push(addr);
    }
  }

  // Internal aliases always trail all personal emails.
  return { emails: [...personal, ...internals], warnings };
}
```

### Properties

- **Internal aliases are always preserved, and always trail all personal
  emails.** Verbatim, including any annotation. Their relative order
  among each other is preserved.
- **Personal emails keep their order relative to each other.** Someone
  who stays called and was in column E stays in column E, minus any
  internal aliases that used to sit between them.
- **Newly called people are appended** in LCR's order after existing
  personal cells — and therefore before any internal aliases.
- **Released people are dropped silently** (plain cell, no annotation).
- **Released people with annotations trigger a warning.** Their cell is
  dropped; the warning lets the user re-annotate after import if desired.
- **One-time rearrangement on first import.** Sheets whose internal
  aliases were interleaved between personal emails will have their
  internal aliases moved to the tail on the first import after this rule
  landed. This is the diff review's opportunity to catch anything
  unintended.

## Worked examples

All examples use `internalDomain = "csnorth.org"`.

### 1. Simple update — email changes for the same person

Before:
```
D: oldaddr@gmail.com
```
LCR says: `["newaddr@gmail.com"]`

After:
```
D: newaddr@gmail.com
```

`oldaddr@gmail.com` doesn't match LCR and has no annotation → silently
dropped. `newaddr@gmail.com` isn't consumed → appended. No warnings.

### 2. Multi-person calling — add a third person

Before:
```
D: alice@x.com   E: bob@y.com
```
LCR says: `["alice@x.com", "bob@y.com", "carol@z.com"]`

After:
```
D: alice@x.com   E: bob@y.com   F: carol@z.com
```

Both existing cells match LCR (preserved verbatim, marked consumed).
`carol@z.com` is new → appended.

### 3. Vacate — calling is empty

Before:
```
D: alice@x.com   E: co.secretary@csnorth.org
```
LCR says: `[]`

After:
```
D: co.secretary@csnorth.org
```

Internal alias preserved. Personal email dropped (no annotation, no
warning).

### 4. Interleaved internal + personal — internals move to the tail

Before:
```
D: alice@x.com   E: co.bishop@csnorth.org   F: bob@y.com
```
LCR says: `["alice@x.com", "bob@y.com"]`

After:
```
D: alice@x.com   E: bob@y.com   F: co.bishop@csnorth.org
```

Personal emails stay in their original relative order (Alice, Bob).
The internal alias is preserved verbatim and slotted at the tail. No
personal email is dropped; no warning.

### 5. Person released, new person called

Before:
```
D: alice@x.com   E: bob@y.com
```
LCR says: `["alice@x.com", "carol@z.com"]`

After:
```
D: alice@x.com   E: carol@z.com
```

Alice preserved. Bob dropped (no annotation → silent). Carol appended.

### 6. Annotation preserved across import

Before:
```
D: alice@x.com [GoogleAccount: alice.gmail@gmail.com]
```
LCR says: `["alice@x.com"]`

After:
```
D: alice@x.com [GoogleAccount: alice.gmail@gmail.com]
```

Canonical email still matches LCR → cell preserved verbatim, annotation
and all. No warning.

### 7. Annotation lost

Before:
```
D: alice@x.com [GoogleAccount: alice.gmail@gmail.com]
```
LCR says: `["diane@x.com"]`

After:
```
D: diane@x.com
```

Alice's cell is dropped, Diane is appended. Warning surfaced:

```js
{
  kind: 'annotation_lost',
  dropped_canonical: 'alice@x.com',
  google_account: 'alice.gmail@gmail.com',
  raw: 'alice@x.com [GoogleAccount: alice.gmail@gmail.com]',
}
```

The review modal shows `⚠` on the row and an inline note. The import is
not blocked; the user may re-annotate Diane's cell manually afterward.

## Server-side sanity check

`calling_sheet/EmailMerge.gs` re-runs the same parse + classification on
the server to catch a misbehaving extension. The server rejects an
operation if any cell in the row's **existing** values whose `canonical`
form is internal is missing from the operation's `new_emails`. This
guarantees internal aliases survive even if the client computed the wrong
answer.

## See also

- [`architecture.md`](./architecture.md) — where the merge fits in the
  overall flow.
- [`sheet-setup.md`](./sheet-setup.md) — where `internal_domain` is set.
- [`position-mapping.md`](./position-mapping.md) — how a sheet row and an
  LCR calling get paired up before the merge runs.
