/**
 * Debug helpers. Run these from the Apps Script editor to inspect the
 * state that `doGet` / `doPost` would see at request time. They bypass
 * HTTP entirely, so they isolate "is the code right" from "is the
 * deployment serving the right code" when diagnosing a failing import.
 *
 * Not called from any HTTP endpoint.
 */

/** Prints the ward names and codes currently visible to `getConfig()`. */
function debugConfig() {
  var config = getConfig();
  console.log('ward names in _config:', Object.keys(config.wards));
  console.log('ward codes in _config:', Object.keys(config.ward_by_code));
}

/** Prints the snapshot JSON for Cordera Ward. Edit the arg to test others. */
function debugSnapshot() {
  var resp = handleSnapshot('Cordera Ward');
  console.log(resp.getContent());
}
