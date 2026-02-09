

/**
 * Normalizes and standardizes specific calling names based on defined rules.
 * This function checks for several known calling titles and replaces them
 * with a standardized equivalent to ensure consistency across data sets.
 * If no matching rule is found, the original calling name is returned unchanged.
 * 
 * @param {string} calling The raw calling name string extracted from the DOM.
 * @returns {string} The standardized and corrected calling name.
 */
function fixCallingName(calling) {
  if (calling === 'Young Single Adult Leader') {
    return 'Young Single Adult Adviser';
  } 
  else if (calling.match(/^(Priests|Teachers|Deacons) Quorum Adviser$/)) {
    return 'Aaronic Priesthood Advisors';
  }
  else if (calling.match(/^(Priests|Teachers|Deacons) Quorum Specialist$/)
           || calling === 'Young Men Specialist') {
    return 'Aaronic Priesthood Specialist';
  }
  else {
    return calling;
  }
}

/**
 * Normalizes and standardizes the organization name based on the specific calling title.
 * This function is primarily used to ensure that callings related to youth
 * organizations are consistently grouped under a standardized parent name,
 * regardless of the specific organization name found in the DOM. If the
 * calling does not match a standardization rule, the original organization
 * name is returned.
 *
 * @param {string} calling The standardized calling name (e.g., from fixCallingName).
 * @param {string} organization The raw organization name extracted from the parent element.
 * @returns {string} The standardized organization name (e.g., "Young Women"),
 * or the original organization name if no rule matches.
 */
function fixOrganizationName(calling, organization) {
  if (calling === 'Aaronic Priesthood Advisors' || calling === 'Aaronic Priesthood Specialist') {
    return 'Aaronic Priesthood';
  }
  else if (calling === 'Young Women Class Adviser' || calling === 'Young Women Specialist') {
    return 'Young Women';
  }
  else {
    return organization;
  }
}

/**
 * Merges objects in an array that share the same 'id' attribute,
 * regardless of their position. The emails from all grouped objects are
 * concatenated, and the properties of the FIRST encountered object are retained.
 *
 * @param {Array<Object>} callings - Array of objects, each expected to have 'calling', 'email', and 'isVacant' properties.
 * @returns {Array<Object>} A new array containing the merged/grouped objects.
 */
function mergeCallings(callings) {
  console.log(callings);
  if (!callings || callings.length === 0) return [];

  // Use a Map to group callings. Keys are the unique calling strings.
  const callingGroups = new Map();

  for (const currentItem of callings) {
    const newGroup = {
      ...currentItem,
      multiplePeople: false // Default state
    };
    newGroup.calling = fixCallingName(newGroup.calling);
    newGroup.organization = fixOrganizationName(newGroup.calling, newGroup.organization);
    newGroup.id = newGroup.organization + ':' + newGroup.calling.replaceAll(' ', '-');

    const key = newGroup.id;
    if (!callingGroups.has(key)) {
      callingGroups.set(key, newGroup);
    } else {
      // 2. Found a duplicate calling: Merge the data into the existing group.

      // Retrieve the existing group object
      let existingGroup = callingGroups.get(key);

      // Skip merging if the current item is vacant (based on your original logic)
      if (currentItem.isVacant) {
          continue;
      }

      // If the first calling encountered was vacant, then let's replace it
      if (existingGroup.isVacant) {
        callingGroups.set(key, newGroup);
      } else {
        // Concatenate the email address
        existingGroup.email += `,${currentItem.email}`;

        // Flag that this group contained multiple items
        existingGroup.multiplePeople = true;

        // Increment the count of people in this calling
        const currentCount = existingGroup.numberOfPeople || 1;
        existingGroup.numberOfPeople = currentCount + 1;
      }

      // Note: All other properties (like isVacant, etc.) remain those of the first object encountered.
    }
  }

  // Convert the Map values back into a final array
  return Array.from(callingGroups.values());
}

