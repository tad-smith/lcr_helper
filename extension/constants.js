/**
 * Shared constants across extension contexts (service worker, content
 * script, extension-origin page). Loaded by manifest's content_scripts,
 * by importScripts in the service worker, and by a <script> tag in
 * callings-table.html.
 *
 * Not loaded into the page-world interceptor — that runs in the host
 * page's JS context and cannot see extension globals. The interceptor
 * re-declares its one shared string (LCR_API_DATA_EVENT).
 */

const LCR_API_DATA_EVENT = 'LCR_API_DATA_RECEIVED';
const MSG_OPEN_CALLINGS_TABLE = 'openCallingsTable';
const SETTINGS_STORAGE_KEY = 'callingSheetSettings';
const TABLE_SETTINGS_STORAGE_KEY = 'settings';
const TABLE_PAGE = 'callings-table.html';
