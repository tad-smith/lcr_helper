/**
 * Builds the snapshot response for a ward. See doc/architecture.md for the
 * wire format and doc/position-mapping.md for the lcr_id derivation rules.
 */

var FIRST_EMAIL_COLUMN = 4;  // column D — first writable column
var ORG_COLUMN = 1;          // column A
var FWD_COLUMN = 2;          // column B
var POS_COLUMN = 3;          // column C

/**
 * Public entry — called by Code.gs doGet router.
 */
function handleSnapshot(wardName) {
  var wn = trim(wardName);
  if (!wn) {
    return jsonResponse({ ok: false, error: 'missing_ward' });
  }

  var config;
  try {
    config = getConfig();
  } catch (e) {
    logEvent('ERROR', 'Config read failed', { err: String(e) });
    return jsonResponse({ ok: false, error: 'config_unreadable', message: String(e) });
  }

  var wardMeta = config.wards[wn];
  if (!wardMeta) {
    return jsonResponse({ ok: false, error: 'ward_not_configured', ward_name: wn });
  }

  var wardCode = wardMeta.ward_code;
  var internalDomain = wardMeta.internal_domain;
  var overrides = config.overrides || {};

  var ss = getTargetSpreadsheet();
  var tab = ss.getSheetByName(wardCode);
  if (!tab) {
    return jsonResponse({ ok: false, error: 'ward_tab_missing', ward_code: wardCode });
  }

  var values = tab.getDataRange().getValues();
  var rows = [];
  // row 0 = header; data starts at row index 1 (absolute sheet row 2).
  for (var i = 1; i < values.length; i++) {
    var raw = values[i];
    var organization = trim(raw[ORG_COLUMN - 1]);
    var position = trim(raw[POS_COLUMN - 1]);
    // Skip rows with blank organization AND blank position. Any emails
    // in such a row are NOT returned in the snapshot and are therefore
    // invisible to the diff — `verifyInternalAliasesPreserved` in
    // Apply.gs cannot protect them. Don't leave orphan emails on rows
    // with no position.
    if (!organization && !position) continue;

    var emails = [];
    for (var c = FIRST_EMAIL_COLUMN - 1; c < raw.length; c++) {
      var cell = trim(raw[c]);
      if (cell) emails.push(cell);
    }

    var derived = deriveLcrId(organization, position, wardCode, overrides);

    rows.push({
      row_index: i + 1,  // 1-indexed absolute sheet row
      organization: organization,
      position: position,
      lcr_id: derived.lcr_id,
      override_applied: derived.override_applied,
      emails: emails,
    });
  }

  return jsonResponse({
    ok: true,
    ward_name: wn,
    ward_code: wardCode,
    internal_domain: internalDomain,
    rows: rows,
    generated_at: new Date().toISOString(),
  });
}

/**
 * Compute the lcr_id for a sheet row.
 *
 * Priority:
 *   1. Strip `<ward_code> ` from the start of `position` if present; call
 *      the remainder `rest`. If no prefix, `rest = position`.
 *   2. If `rest` appears in `_position_overrides`, use that mapping. The
 *      overrides map is global — one mapping applies across every ward.
 *   3. Else if the original `position` had the `<ward_code> ` prefix,
 *      derive naturally: `organization + ":" + rest.replaceAll(" ", "-")`.
 *   4. Else fall through to `lcr_id = null`. The extension classifies the
 *      row as CUSTOM_OR_UNMATCHED.
 */
function deriveLcrId(organization, position, wardCode, overrides) {
  var prefix = wardCode + ' ';
  var hasWardPrefix = position.indexOf(prefix) === 0;
  var rest = hasWardPrefix ? position.substring(prefix.length) : position;

  if (overrides && Object.prototype.hasOwnProperty.call(overrides, rest)) {
    return { lcr_id: overrides[rest], override_applied: true };
  }

  if (hasWardPrefix && organization && rest) {
    return {
      lcr_id: organization + ':' + rest.replace(/ /g, '-'),
      override_applied: false,
    };
  }

  return { lcr_id: null, override_applied: false };
}
