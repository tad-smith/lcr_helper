/**
 * Reads and caches the _config and _position_overrides tabs.
 *
 * Cache key is derived from the spreadsheet's last-modified time so user
 * edits invalidate automatically; TTL is 5 minutes as a belt-and-suspenders
 * fallback.
 */

var CONFIG_TAB = '_config';
var OVERRIDES_TAB = '_position_overrides';
var CONFIG_CACHE_TTL_SECONDS = 300;

/**
 * Returns:
 *   {
 *     wards: { [ward_name]: { ward_code, internal_domain } },
 *     overrides: { [ward_code]: { [sheet_position]: lcr_id } },
 *     ward_by_code: { [ward_code]: { ward_name, internal_domain } }
 *   }
 *
 * All keys/values trimmed. Blank rows skipped. Leading/trailing whitespace
 * tolerated in every column.
 */
function getConfig() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var lastModified = DriveApp.getFileById(ss.getId()).getLastUpdated().getTime();
  var cacheKey = 'config:' + lastModified;
  var cache = CacheService.getScriptCache();

  var cached = cache.get(cacheKey);
  if (cached) {
    try {
      return JSON.parse(cached);
    } catch (e) {
      // fall through and re-read
    }
  }

  var config = readConfigFromSheet(ss);
  try {
    cache.put(cacheKey, JSON.stringify(config), CONFIG_CACHE_TTL_SECONDS);
  } catch (e) {
    // CacheService has a 100KB per-item limit; fall back to no cache.
    logEvent('WARN', 'Config cache put failed', { err: String(e) });
  }
  return config;
}

/** Reads both config tabs and assembles the returned structure. */
function readConfigFromSheet(ss) {
  var wards = {};
  var ward_by_code = {};
  var overrides = {};

  var configSheet = ss.getSheetByName(CONFIG_TAB);
  if (!configSheet) {
    throw new Error('Missing required tab: ' + CONFIG_TAB);
  }
  var configRows = configSheet.getDataRange().getValues();
  // row 0 = header, start at 1
  for (var i = 1; i < configRows.length; i++) {
    var r = configRows[i];
    var wardCode = trim(r[0]);
    var wardName = trim(r[1]);
    var internalDomain = trim(r[2]);
    if (!wardCode && !wardName && !internalDomain) continue;
    if (!wardCode || !wardName || !internalDomain) {
      logEvent('WARN', 'Skipping incomplete _config row', { row: i + 1, values: [wardCode, wardName, internalDomain] });
      continue;
    }
    wards[wardName] = { ward_code: wardCode, internal_domain: internalDomain };
    ward_by_code[wardCode] = { ward_name: wardName, internal_domain: internalDomain };
  }

  var overridesSheet = ss.getSheetByName(OVERRIDES_TAB);
  if (overridesSheet) {
    var overrideRows = overridesSheet.getDataRange().getValues();
    for (var j = 1; j < overrideRows.length; j++) {
      var or = overrideRows[j];
      var wc = trim(or[0]);
      var sp = trim(or[1]);
      var li = trim(or[2]);
      if (!wc && !sp && !li) continue;
      if (!wc || !sp || !li) {
        logEvent('WARN', 'Skipping incomplete _position_overrides row', { row: j + 1 });
        continue;
      }
      if (!overrides[wc]) overrides[wc] = {};
      overrides[wc][sp] = li;
    }
  }

  return { wards: wards, ward_by_code: ward_by_code, overrides: overrides };
}

function trim(v) {
  if (v === null || v === undefined) return '';
  return String(v).replace(/^\s+|\s+$/g, '');
}
