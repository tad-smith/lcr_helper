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
 * Full merge algorithm — server-side fallback / testing aid. The
 * extension computes this client-side and posts the result; Apply.gs only
 * runs the sanity check. Kept in sync with the pseudocode in
 * doc/email-merge-algorithm.md.
 *
 * @param {string[]} existing
 * @param {string[]} lcrEmails
 * @param {string} internalDomain
 * @return {{emails: string[], warnings: Object[]}}
 */
function mergeEmails(existing, lcrEmails, internalDomain) {
  var lcrLower = {};
  for (var i = 0; i < lcrEmails.length; i++) {
    lcrLower[String(lcrEmails[i]).toLowerCase()] = true;
  }
  var kept = [];
  var consumed = {};
  var warnings = [];
  for (var j = 0; j < existing.length; j++) {
    var raw = existing[j];
    var parsed = parseEmailCell(raw);
    var lower = parsed.canonical.toLowerCase();
    if (isInternalAddr(parsed.canonical, internalDomain)) {
      kept.push(raw);
    } else if (lcrLower[lower]) {
      kept.push(raw);
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
      kept.push(lcrEmails[k]);
    }
  }
  return { emails: kept, warnings: warnings };
}
