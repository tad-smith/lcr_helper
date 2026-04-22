/**
 * Web app entry points. Routes requests to handlers in the other .gs files.
 *
 * Apps Script web apps cannot set HTTP status codes from ContentService
 * responses — everything successful returns 200. The convention here is
 * that the JSON body always has an `ok` boolean, and an `error` string on
 * failure. Callers check the body, not the status.
 */

/**
 * GET handler.
 *
 * Supported: ?action=snapshot&ward=<ward_name>&secret=<secret>
 *
 * Retained for backward compatibility and editor-driven debugging. The
 * extension itself posts to doPost so the secret never appears in a query
 * string.
 */
function doGet(e) {
  try {
    var params = (e && e.parameter) || {};
    if (!verifySecret(params.secret)) {
      return jsonResponse({ ok: false, error: 'unauthorized' });
    }
    if (params.action === 'snapshot') {
      return handleSnapshot(params.ward || '');
    }
    return jsonResponse({ ok: false, error: 'unknown_action', action: String(params.action || '') });
  } catch (err) {
    logEvent('ERROR', 'doGet failed', { err: String(err), stack: err && err.stack });
    return jsonResponse({ ok: false, error: 'internal_error', message: String(err) });
  }
}

/**
 * POST handler.
 * Supported:
 *   ?action=snapshot body = JSON {secret, ward}
 *   ?action=apply    body = JSON {secret, ward_name, operations, generated_at}
 */
function doPost(e) {
  try {
    var params = (e && e.parameter) || {};
    var parsed = parseJsonBody(e);
    if (!parsed.ok) {
      return jsonResponse({ ok: false, error: 'invalid_json_body', message: parsed.error });
    }
    var body = parsed.body;
    if (!verifySecret((body && body.secret) || params.secret)) {
      return jsonResponse({ ok: false, error: 'unauthorized' });
    }
    if (params.action === 'apply') {
      return handleApply(body);
    }
    if (params.action === 'snapshot') {
      return handleSnapshot((body && body.ward) || params.ward || '');
    }
    return jsonResponse({ ok: false, error: 'unknown_action', action: String(params.action || '') });
  } catch (err) {
    logEvent('ERROR', 'doPost failed', { err: String(err), stack: err && err.stack });
    return jsonResponse({ ok: false, error: 'internal_error', message: String(err) });
  }
}

/**
 * Parse `e.postData.contents` as JSON. Returns {ok: true, body} on
 * success or {ok: false, error} on failure — the specific reason is
 * preserved so the caller can surface `invalid_json_body` instead of the
 * generic `internal_error`.
 */
function parseJsonBody(e) {
  if (!e || !e.postData || !e.postData.contents) return { ok: true, body: {} };
  try {
    return { ok: true, body: JSON.parse(e.postData.contents) };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

/** Build a ContentService JSON response. */
function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

