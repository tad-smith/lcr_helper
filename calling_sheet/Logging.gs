/**
 * Lightweight logger. Appends a row to the `_log` tab (auto-created) and
 * also writes to Stackdriver via `console.log` so operators can choose.
 *
 * The `_log` tab is not part of the user-facing data model — treat it as a
 * diagnostic sidecar that can be cleared at any time.
 */

var LOG_TAB = '_log';
var LOG_HEADER = ['timestamp', 'level', 'message', 'data'];

/**
 * @param {string} level   e.g. 'INFO', 'WARN', 'ERROR'
 * @param {string} message human-readable
 * @param {Object=} data   optional structured payload; JSON-stringified
 */
function logEvent(level, message, data) {
  var payload = data ? safeStringify(data) : '';
  try {
    console.log('[' + level + '] ' + message + (payload ? ' ' + payload : ''));
  } catch (e) {
    // ignore — console may not be available in all contexts
  }
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(LOG_TAB);
    if (!sheet) {
      sheet = ss.insertSheet(LOG_TAB);
      sheet.appendRow(LOG_HEADER);
    }
    sheet.appendRow([new Date(), String(level), String(message), payload]);
  } catch (e) {
    // Last-resort: swallow to avoid masking the real error.
  }
}

function safeStringify(obj) {
  try {
    return JSON.stringify(obj);
  } catch (e) {
    return '[unstringifiable: ' + String(e) + ']';
  }
}
