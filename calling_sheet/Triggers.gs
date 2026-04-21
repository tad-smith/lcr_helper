/**
 * Spreadsheet event triggers. Separate from the import/apply routing in
 * Code.gs because they run on container events, not web app requests.
 */

/**
 * Toasts a reminder when the spreadsheet is opened. The 24-hour note
 * reflects the downstream propagation time for email forwarding
 * changes; keep the wording intact unless the owner updates it.
 */
function onOpen() {
  SpreadsheetApp.getActiveSpreadsheet().toast(
    'Any email forwarding changes made in this spreadsheet will become active within 24 hours.',
    'Please Note:',
    900,
  );
}
