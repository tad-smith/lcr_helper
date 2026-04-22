/**
 * Shared helpers used by the content script and the callings-table page.
 * Must not depend on `chrome.*` or on any specific DOM — it runs in two
 * isolated contexts.
 */

const AARONIC_QUORUM_ADVISER_RE = /^(Priests|Teachers|Deacons) Quorum Adviser$/;
const AARONIC_QUORUM_SPECIALIST_RE = /^(Priests|Teachers|Deacons) Quorum Specialist$/;

/**
 * Normalizes and standardizes specific calling names. Returns the input
 * unchanged if no rule matches. Run BEFORE the lcr_id is computed, so
 * duplicates across the rewrite rules merge into a single row.
 *
 * @param {string} calling The raw calling name from the LCR API.
 * @returns {string} The standardized calling name.
 */
function fixCallingName(calling) {
  if (calling === 'Young Single Adult Leader') {
    return 'Young Single Adult Adviser';
  }
  if (AARONIC_QUORUM_ADVISER_RE.test(calling)) {
    return 'Aaronic Priesthood Advisors';
  }
  if (AARONIC_QUORUM_SPECIALIST_RE.test(calling) || calling === 'Young Men Specialist') {
    return 'Aaronic Priesthood Specialist';
  }
  return calling;
}

/**
 * Normalizes the organization name so related callings roll up under a
 * single parent. Returns the input unchanged if no rule matches.
 *
 * @param {string} calling The standardized calling name (post-fixCallingName).
 * @param {string} organization The raw organization name.
 * @returns {string} The standardized organization name.
 */
function fixOrganizationName(calling, organization) {
  if (calling === 'Aaronic Priesthood Advisors' || calling === 'Aaronic Priesthood Specialist') {
    return 'Aaronic Priesthood';
  }
  if (calling === 'Young Women Class Adviser' || calling === 'Young Women Specialist') {
    return 'Young Women';
  }
  return organization;
}

/**
 * Sentinel strings the email-fetching code uses when an address is
 * unavailable. These are treated as "no email" for merging.
 */
const EMAIL_SENTINELS = new Set(['', 'N/A', 'Error']);

function isRealEmail(s) {
  return !!s && !EMAIL_SENTINELS.has(s);
}

/**
 * Collapses callings that share the same lcr_id.
 *
 * Singletons (only one calling for an id) pass through with their
 * original `email` intact — including the diagnostic sentinels `'N/A'`
 * (no email on file at LCR) and `'Error'` (fetch failed), which the
 * table renders so the user can see the state.
 *
 * Merged groups (2+ real callings for the same id) have their emails
 * concatenated with commas. Sentinels are filtered out of the merge
 * only, so we don't produce malformed strings like `",foo@bar"` or
 * `"N/A,foo@bar"`. The non-sentinel emails from every merged calling
 * are preserved.
 *
 * @param {Array<Object>} callings Array of calling objects with `calling`,
 *     `organization`, `isVacant`, and (optionally) `email`.
 * @returns {Array<Object>} The merged list in original iteration order.
 */
function mergeCallings(callings) {
  if (!callings || callings.length === 0) return [];

  const callingGroups = new Map();

  for (const currentItem of callings) {
    const newGroup = { ...currentItem, multiplePeople: false };
    newGroup.calling = fixCallingName(newGroup.calling);
    newGroup.organization = fixOrganizationName(newGroup.calling, newGroup.organization);
    newGroup.id = newGroup.organization + ':' + newGroup.calling.replaceAll(' ', '-');

    const key = newGroup.id;
    if (!callingGroups.has(key)) {
      callingGroups.set(key, newGroup);
      continue;
    }

    const existingGroup = callingGroups.get(key);

    // A vacant row is never merged over a real row.
    if (currentItem.isVacant) continue;

    // A real row replaces a vacant first-seen row entirely.
    if (existingGroup.isVacant) {
      callingGroups.set(key, newGroup);
      continue;
    }

    // Both real — start tracking real emails only (sentinels dropped).
    // Lazy-initialized so we only pay this cost when an id actually
    // merges, which lets singletons keep their original .email above.
    if (!existingGroup._emailList) {
      existingGroup._emailList = isRealEmail(existingGroup.email)
        ? [existingGroup.email]
        : [];
    }
    if (isRealEmail(currentItem.email)) {
      existingGroup._emailList.push(currentItem.email);
    }
    existingGroup.multiplePeople = true;
    existingGroup.numberOfPeople = (existingGroup.numberOfPeople || 1) + 1;
  }

  // Rebuild .email from the filtered list only for groups that merged.
  // Singletons have no _emailList and keep their original .email.
  for (const group of callingGroups.values()) {
    if (group._emailList) {
      group.email = group._emailList.join(',');
      delete group._emailList;
    }
  }
  return Array.from(callingGroups.values());
}
