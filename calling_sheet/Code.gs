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
 * Supported: ?action=snapshot&ward=<ward_name>&secret=<secret>
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
 * Supported: ?action=apply  body = JSON {secret, ward_name, operations, generated_at}
 */
function doPost(e) {
  try {
    var params = (e && e.parameter) || {};
    var body = parseJsonBody(e);
    if (!verifySecret((body && body.secret) || params.secret)) {
      return jsonResponse({ ok: false, error: 'unauthorized' });
    }
    if (params.action === 'apply') {
      return handleApply(body);
    }
    return jsonResponse({ ok: false, error: 'unknown_action', action: String(params.action || '') });
  } catch (err) {
    logEvent('ERROR', 'doPost failed', { err: String(err), stack: err && err.stack });
    return jsonResponse({ ok: false, error: 'internal_error', message: String(err) });
  }
}

/** Parse `e.postData.contents` as JSON; return {} if absent or unparseable. */
function parseJsonBody(e) {
  if (!e || !e.postData || !e.postData.contents) return {};
  try {
    return JSON.parse(e.postData.contents);
  } catch (err) {
    throw new Error('invalid_json_body: ' + err);
  }
}

/** Build a ContentService JSON response. */
function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

