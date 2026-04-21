/**
 * Shared-secret verification. The secret is stored in Script Properties under
 * the key `SHARED_SECRET`. Set it via the Apps Script editor:
 *   Project Settings > Script Properties > Add script property.
 * It must never be committed or logged.
 */

var SHARED_SECRET_KEY = 'SHARED_SECRET';

/**
 * Returns true if `provided` matches the shared secret. Uses a length-aware
 * byte-wise compare that does not short-circuit on first mismatch.
 */
function verifySecret(provided) {
  if (typeof provided !== 'string' || provided.length === 0) return false;
  var expected = PropertiesService.getScriptProperties().getProperty(SHARED_SECRET_KEY);
  if (typeof expected !== 'string' || expected.length === 0) return false;
  return constantTimeEq(provided, expected);
}

/**
 * Length-aware constant-time-ish string compare. Returns false immediately
 * on length mismatch (length is not secret in our model), otherwise XORs all
 * bytes and reports whether any differed.
 */
function constantTimeEq(a, b) {
  if (a.length !== b.length) return false;
  var diff = 0;
  for (var i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}
