/**
 * Resolves the target Google Spreadsheet via its id, stored as the
 * `SHEET_ID` script property.
 *
 * The deployment mode is standalone — the script is not container-bound
 * to any sheet. `SHEET_ID` must be set in the Apps Script project's
 * Script Properties; see doc/apps-script-deploy.md.
 */

var SHEET_ID_KEY = 'SHEET_ID';
var _cachedTargetSpreadsheet = null;

function getTargetSpreadsheet() {
  if (_cachedTargetSpreadsheet) return _cachedTargetSpreadsheet;

  var sheetId = PropertiesService.getScriptProperties().getProperty(SHEET_ID_KEY);
  if (!sheetId) {
    throw new Error(
      'SHEET_ID script property is not set. See doc/apps-script-deploy.md.',
    );
  }
  try {
    _cachedTargetSpreadsheet = SpreadsheetApp.openById(sheetId.replace(/^\s+|\s+$/g, ''));
  } catch (e) {
    throw new Error(
      'SHEET_ID is set but openById failed: ' + e +
      '. Check the value and that the deploying account has access.',
    );
  }
  return _cachedTargetSpreadsheet;
}
