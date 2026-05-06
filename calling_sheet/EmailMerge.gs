/**
 * Server-side port of the email merge algorithm and the internal-alias
 * sanity check used by Apply.gs. The canonical description and worked
 * examples live in doc/email-merge-algorithm.md. This file must stay in
 * sync with extension/callings-sheet-import.js.
 */

/**
 * Parse one cell. Matches `foo@bar [GoogleAccount: baz@qux]` (case
 * insensitive on the literal `GoogleAccount`, tolerates whitespace).
 *
 * @param {string} raw
 * @return {{canonical: string, annotation: (string|null), raw: string}}
 */
var ANNOTATION_RE = /^(.+?)\s*\[GoogleAccount:\s*([^\]]+?)\s*\]\s*$/i;
var KEEP_RE = /\bkeep\b/i;

/** True if the cell-level note string contains the `keep` keyword. */
function hasKeepNote(note) {
  if (!note) return false;
  return KEEP_RE.test(String(note));
}

function parseEmailCell(raw) {
  var s = raw === null || raw === undefined ? '' : String(raw);
  var m = s.match(ANNOTATION_RE);
  if (m) {
    return {
      canonical: trim(m[1]),
      annotation: trim(m[2]),
      raw: s,
    };
  }
  return {
    canonical: trim(s),
    annotation: null,
    raw: s,
  };
}

/** True if `addr` (a bare email, no annotation) ends in @<internal_domain>. */
function isInternalAddr(addr, internalDomain) {
  if (!addr || !internalDomain) return false;
  var suffix = '@' + String(internalDomain).toLowerCase();
  return String(addr).toLowerCase().slice(-suffix.length) === suffix;
}

/**
 * Sanity check run in Apply.gs before writing a row.
 *
 * For every cell in `existing` whose canonical form is an internal alias,
 * verify the same cell appears verbatim in `newEmails`. Returns the list of
 * missing cells; ok=true iff list is empty.
 */
function verifyInternalAliasesPreserved(existing, newEmails, internalDomain) {
  var newSet = {};
  for (var i = 0; i < newEmails.length; i++) {
    newSet[String(newEmails[i])] = true;
  }
  var missing = [];
  for (var j = 0; j < existing.length; j++) {
    var raw = existing[j];
    var parsed = parseEmailCell(raw);
    if (isInternalAddr(parsed.canonical, internalDomain)) {
      if (!newSet[String(raw)]) {
        missing.push(raw);
      }
    }
  }
  return { ok: missing.length === 0, missing: missing };
}

/**
 * Sanity check run in Apply.gs before writing a row.
 *
 * For every cell in `existing` whose parallel note in `existingNotes`
 * matches \bkeep\b, verify the same cell appears verbatim in `newEmails`.
 * Defense against a misbehaving extension that ignored the keep rule.
 */
function verifyKeptCellsPreserved(existing, existingNotes, newEmails) {
  var newSet = {};
  for (var i = 0; i < newEmails.length; i++) {
    newSet[String(newEmails[i])] = true;
  }
  var missing = [];
  for (var j = 0; j < existing.length; j++) {
    var note = existingNotes && existingNotes[j];
    if (!hasKeepNote(note)) continue;
    var raw = existing[j];
    if (!newSet[String(raw)]) {
      missing.push(raw);
    }
  }
  return { ok: missing.length === 0, missing: missing };
}

/**
 * Full merge algorithm — server-side fallback / testing aid. The
 * extension computes this client-side and posts the result; Apply.gs only
 * runs the sanity check. Kept in sync with the pseudocode in
 * doc/email-merge-algorithm.md.
 *
 * @param {string[]} existing
 * @param {string[]} existingNotes  Parallel cell-note array; '' for no note.
 * @param {string[]} lcrEmails
 * @param {string} internalDomain
 * @return {{emails: string[], notes: string[], warnings: Object[]}}
 */
function mergeEmails(existing, existingNotes, lcrEmails, internalDomain) {
  var notes = existingNotes || [];
  var lcrLower = {};
  for (var i = 0; i < lcrEmails.length; i++) {
    lcrLower[String(lcrEmails[i]).toLowerCase()] = true;
  }
  var personal = [];
  var personalNotes = [];
  var internals = [];
  var internalNotes = [];
  var consumed = {};
  var warnings = [];
  for (var j = 0; j < existing.length; j++) {
    var raw = existing[j];
    var note = notes[j] || '';
    var parsed = parseEmailCell(raw);
    var lower = parsed.canonical.toLowerCase();
    if (isInternalAddr(parsed.canonical, internalDomain)) {
      internals.push(raw);
      internalNotes.push(note);
    } else if (lcrLower[lower]) {
      personal.push(raw);
      personalNotes.push(note);
      consumed[lower] = true;
    } else if (hasKeepNote(note)) {
      personal.push(raw);
      personalNotes.push(note);
      consumed[lower] = true;
    } else if (parsed.annotation) {
      warnings.push({
        kind: 'annotation_lost',
        dropped_canonical: parsed.canonical,
        google_account: parsed.annotation,
        raw: raw,
      });
    }
  }
  for (var k = 0; k < lcrEmails.length; k++) {
    var l = String(lcrEmails[k]).toLowerCase();
    if (!consumed[l]) {
      personal.push(lcrEmails[k]);
      personalNotes.push('');
    }
  }
  // Internal aliases always trail all personal emails.
  return {
    emails: personal.concat(internals),
    notes: personalNotes.concat(internalNotes),
    warnings: warnings,
  };
}
