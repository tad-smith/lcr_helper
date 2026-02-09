/**
 * SYSTEM FILTERS
 * Hardcoded filters that are not saved to storage and cannot be modified by the user.
 */
const SYSTEM_FILTERS = [
  {
    name: "Email Alias Filter",
    collapseCallings: true,
    onlyShowSelected: true,
    hideVacantCallings: false,
    selectedCallings: ['Bishopric:Bishop', 'Bishopric:Bishopric-First-Counselor', 'Bishopric:Ward-Executive-Secretary', 'Bishopric:Bishopric-Second-Counselor', 'Bishopric:Ward-Assistant-Executive-Secretary', 'Bishopric:Ward-Clerk', 'Bishopric:Ward-Assistant-Clerk', 'Bishopric:Ward-Assistant-Clerk--Membership', 'Bishopric:Ward-Assistant-Clerk--Finance', 'Elders Quorum Presidency:Elders-Quorum-President', 'Elders Quorum Presidency:Elders-Quorum-First-Counselor', 'Elders Quorum Presidency:Elders-Quorum-Second-Counselor', 'Elders Quorum Presidency:Elders-Quorum-Secretary', 'Relief Society Presidency:Relief-Society-President', 'Relief Society Presidency:Relief-Society-First-Counselor', 'Relief Society Presidency:Relief-Society-Second-Counselor', 'Relief Society Presidency:Relief-Society-Secretary', 'Aaronic Priesthood:Aaronic-Priesthood-Advisors', 'Aaronic Priesthood:Aaronic-Priesthood-Specialist', 'Young Women Presidency:Young-Women-President', 'Young Women Presidency:Young-Women-First-Counselor', 'Young Women Presidency:Young-Women-Second-Counselor', 'Young Women Presidency:Young-Women-Secretary', 'Young Women:Young-Women-Specialist', 'Young Women:Young-Women-Class-Adviser', 'Sunday School Presidency:Sunday-School-President', 'Sunday School Presidency:Sunday-School-First-Counselor', 'Sunday School Presidency:Sunday-School-Second-Counselor', 'Sunday School Presidency:Sunday-School-Secretary', 'Primary Presidency:Primary-President', 'Primary Presidency:Primary-First-Counselor', 'Primary Presidency:Primary-Second-Counselor', 'Primary Presidency:Primary-Secretary', 'Ward Missionaries:Ward-Mission-Leader', 'Ward Missionaries:Assistant-Ward-Mission-Leader', 'Temple and Family History:Ward-Temple-and-Family-History-Leader', 'Young Single Adult:Young-Single-Adult-Adviser', 'History:History-Specialist', 'Technology:Email-Communication-Specialist', 'Technology:Technology-Specialist']
  },
  {
    name: "No filter",
    collapseCallings: false,
    onlyShowSelected: false,
    hideVacantCallings: false,
    selectedCallings: []
  }
];

/** * Global Variables */
let settings = {
  savedFilters: [],
  currentState: {
    collapseCallings: true,
    onlyShowSelected: false,
    hideVacantCallings: false,
    selectedCallings: [],
    loadedFilterName: null
  }
};

/** Global Constants */
const callings = decodeUrlParameter('callings', true);
const collapsedCallings = mergeCallings(callings);
const ward = decodeUrlParameter('ward', false);

/**
 * Reads a URL parameter that is an encoded JSON array, decodes it, 
 * and parses it back into a JavaScript array of objects.
 *
 * @param {string} paramName - The name of the URL parameter (e.g., 'data').
 * @returns {Array<Object> | null} The decoded array of objects, or null if the parameter is missing or invalid.
 */
function decodeUrlParameter(paramName, isJson) {
  try {
    // 1. Get the current URL's query string parameters
    // We use window.location.search to get the part of the URL starting with '?'
    const urlParams = new URLSearchParams(window.location.search);

    // 2. Get the value of the specified parameter
    const encodedValue = urlParams.get(paramName);

    if (!encodedValue) {
      // Return null if the parameter isn't present
      return null;
    }

    // 3. URL Decode the string
    // The browser's URLSearchParams.get() often handles the basic decoding automatically, 
    // but using decodeURIComponent ensures robustness against complex encoding.
    const decodedString = decodeURIComponent(encodedValue);

    if (!isJson) {
      return decodedString;
    }

    // 4. JSON Parse the resulting string back into an array/object
    const jsonArray = JSON.parse(decodedString);

    // Ensure the result is an array before returning
    if (Array.isArray(jsonArray)) {
      return jsonArray;
    } else {
      console.error("Decoded parameter is not an array:", jsonArray);
      return null;
    }

  } catch (error) {
    // Catch errors during parsing (e.g., if the URL parameter was corrupted)
    console.error("Error decoding or parsing URL parameter:", error);
    return null;
  }
}

/**
 * Updates the web page's title and the text content of all elements 
 * with the class 'ward-name' to the provided organizational unit name.
 * * This function is used to dynamically inject the contextually relevant
 * unit (Ward or Branch) name into various parts of the user interface.
 *
 * @param {string} ward The name of the organizational unit (Ward or Branch) 
 * to be applied across the page.
 * @returns {void}
 */
function applyWard(ward) {
  document.title = ward;

  const elements = document.querySelectorAll('.ward-name');
  elements.forEach(element => {
    element.textContent = ward;
  });
}

/**
 * Locates the table body element with the fixed ID 'callings-table-body' 
 * and removes all of its child row elements (<tr>).
 * * This effectively clears the display of the callings table without removing 
 * the <tbody> container itself.
 * * @returns {void}
 */
function clearCallingsTable() {
  const tbody = document.getElementById('callings-table-body');

  if (tbody) {
    // The preferred and most performant way to remove all children
    // is to set the innerHTML property to an empty string.
    tbody.innerHTML = '';
    console.log("Successfully cleared all rows from 'callings-table-body'.");
  } else {
    console.warn("Could not find table body element with ID 'callings-table-body'.");
  }
}

/**
 * Generates and appends rows to the 'callings-table-body' <tbody> element
 * based on an array of calling objects.
 * * This function handles row creation, sets unique row IDs based on calling data, 
 * applies initial visibility filters based on 'only-show-selected-columns' and the 
 * global 'settings.selectedCallings' array, and attaches a row visibility toggle 
 * listener to each row's checkbox.
 *
 * @param {Array<Object>} callings An array of calling objects to be displayed.
 * @param {string} callings.id The unique identifier for the calling (used as row ID).
 * @param {string} callings.organization The organization name.
 * @param {string} callings.calling The specific calling title.
 * @param {boolean} callings.isVacant True if the calling is vacant.
 * @param {boolean} [callings.multiplePeople] True if the calling has multiple people assigned (merged).
 * @param {string} [callings.profileLink] The URL to the person's profile, if assigned.
 * @param {string} [callings.person] The name of the person assigned, if assigned.
 * @param {string} [callings.email] The email address(es) associated with the calling.
 * @returns {void}
 * * @global {Object} settings - Expected to contain {Array<string>} selected for initial filtering.
 * @global {function} toggleSelected - The event listener function to attach to the row-selector checkbox.
 * @fires {function} updateVisibleRowCount - Called after all rows are appended to update the displayed row count.
 */
function appendCallingsTable(callings) {
  // 1. Create the <table> element
  const tbody = document.getElementById('callings-table-body');
  const onlyShowSelected = settings.currentState.onlyShowSelected;
  const hideVacant = settings.currentState.hideVacantCallings;

  // Append Calling rows to table
  callings.forEach(calling => {
    const row = document.createElement('tr');
    row.id = calling.id;

    // Tag row with vacant status for easier filtering later
    if (calling.isVacant) {
      row.classList.add('vacant-row');
    }

    // Determine Visibility
    let isSelected = settings.currentState.selectedCallings.indexOf(row.id) !== -1;
    let shouldHide = false;

    if (onlyShowSelected && !isSelected) shouldHide = true;
    if (hideVacant && calling.isVacant) shouldHide = true;

    if (shouldHide) {
      row.className += ' hidden-row'; // Append class
    }

    const selectedCol = document.createElement('td');
    const checkbox = document.createElement('input');
    checkbox.className = 'row-selector';
    checkbox.type = 'checkbox';
    checkbox.checked = isSelected;
    checkbox.addEventListener('change', toggleSelected);
    selectedCol.append(checkbox);
    row.append(selectedCol);

    const orgCol = document.createElement('td');
    orgCol.textContent = `${calling.organization}`;
    row.append(orgCol);

    const callingCol = document.createElement('td');
    callingCol.textContent = `${calling.calling}`;
    row.append(callingCol);

    const personCol = document.createElement('td');
    let person = null;
    if (calling.isVacant) {
      person = '';
    } else if (calling.multiplePeople) {
      person = `<i>Multiple Individuals Called (${calling.numberOfPeople})</i>`;
    } else {
      person = `<a href="${calling.profileLink}" target="_blank" rel="noopener noreferrer" class="calling-link">${calling.person}</a>`;
    }
    personCol.innerHTML = `${person}`;
    row.append(personCol);

    const emailCol = document.createElement('td');
    emailCol.textContent = `${calling.email ? calling.email : ''}`
    row.append(emailCol);

    tbody.appendChild(row);
  });

  // Update the row count
  updateVisibleRowCount();

  // 4. Append the fully built table to the document body
  console.log('Table successfully appended to the DOM.');
}

/**
 * Centralized function to update row visibility based on CURRENT state.
 * Iterates all rows and checks both selection and vacancy status.
 */
function updateTableVisibility() {
  const onlyShowSelected = settings.currentState.onlyShowSelected;
  const hideVacant = settings.currentState.hideVacantCallings;
  const tbody = document.getElementById('callings-table-body');
  const trElements = tbody.getElementsByTagName('tr');

  Array.from(trElements).forEach(tr => {
    const inputChild = tr.querySelector('input.row-selector');
    const isSelected = inputChild.checked;
    const isVacant = tr.classList.contains('vacant-row');

    // Logic: Hide if (OnlyShow is ON AND Not Selected) OR (HideVacant is ON AND Is Vacant)
    const shouldHide = (onlyShowSelected && !isSelected) || (hideVacant && isVacant);

    tr.classList.toggle('hidden-row', shouldHide);
  });

  updateVisibleRowCount();
}

/**
 * Handler for "Show Only Selected" Checkbox
 */
function handleOnlyShowSelectedColumns(event) {
  const checkbox = document.getElementById('only-show-selected-columns');
  settings.currentState.onlyShowSelected = checkbox.checked;
  saveSettingsToStorage();
  updateTableVisibility();
}

/**
 * Handler for "Hide Vacant Callings" Checkbox
 */
function handleHideVacantCallings(event) {
  const checkbox = document.getElementById('hide-vacant-callings');
  settings.currentState.hideVacantCallings = checkbox.checked;
  saveSettingsToStorage();
  updateTableVisibility();
}

/**
 * Handles the change event for an individual row-selector checkbox, controlling 
 * the visibility of its parent table row and persistently saving the state.
 * * This function is designed to be attached as an event listener (e.g., using 
 * addEventListener('change', toggleSelected)) to the checkbox within each table row.
 * It also interacts with the global 'settings' object and Chrome's local storage 
 * to persist the selected status of the row.
 *
 * @this {HTMLInputElement} The checkbox element that triggered the change event.
 * @param {Event} event The DOM event object triggered by the checkbox state change.
 * @returns {void}
 * * @global {Object} settings - Must contain an array named 'selectedCallings' 
 * where the IDs of selected rows are stored.
 * @global {function} updateVisibleRowCount - Required to recalculate and 
 * display the total number of visible rows after visibility changes.
 * @fires {chrome.storage.local.set} Writes the updated 'settings' object to 
 * Chrome local storage.
 */
function toggleSelected(event) {
  console.log('toggleSelected');
  console.log(event);
  const onlyShowSelected = document.getElementById('only-show-selected-columns');

  // 'this' refers to the checkbox that was clicked
  // Find the nearest parent <tr> element
  const tableRow = this.closest('tr');
  const callingId = tableRow.id;

  // Toggle the CSS class based on the checked state
  // If the checkbox is checked (true), the class is removed.
  // If the checkbox is unchecked (false), the class is added.
  tableRow.classList.toggle('hidden-row', !this.checked && onlyShowSelected.checked);

  // Update the row count
  updateVisibleRowCount();

  // Write changes to storage
  let index = settings.currentState.selectedCallings.indexOf(callingId);
  if (this.checked && index == -1) {
    settings.currentState.selectedCallings.push(callingId);
  }
  else {
    if (index !== -1) {
      settings.currentState.selectedCallings.splice(index, 1); // Removes 1 element starting from the found index
    }
  }
  chrome.storage.local.set({ settings: settings });
}

/**
 * Handles the change event for the 'Collapse Callings' checkbox, toggling 
 * the data displayed in the callings table between the full list and a 
 * predefined collapsed list.
 *
 * This function is responsible for the following sequence:
 * 1. Clears all existing rows from the table display.
 * 2. Determines whether to use the global 'collapsedCallings' array or the 
 * global 'callings' array based on the checked state of the 'collapse-callings' checkbox.
 * 3. Appends the selected array of callings to the display table.
 *
 * @param {Event} event The DOM event object triggered by the checkbox state change.
 * @returns {void}
 * @global {function(): void} clearCallingsTable - Required function to remove all <tr> elements from the display.
 * @global {function(Array<Object>): void} appendCallingsTable - Required function to generate and insert new <tr> elements.
 * @global {Array<Object>} collapsedCallings - The predefined array of callings to show when the checkbox is checked.
 * @global {Array<Object>} callings - The original, full array of callings to show when the checkbox is unchecked.
 */
function handleCollapseCallings(event) {
  clearCallingsTable();

  const showCollapsedCallings = document.getElementById('collapse-callings');
  appendCallingsTable(showCollapsedCallings.checked ? collapsedCallings : callings);
}

/**
 * Counts the number of <tr> elements within the <tbody> of the table with the ID 'callings-table'
 * that do NOT have the 'hidden-row' class. 
 * The resulting count is then displayed in the span element with the ID 'calling-count'.
 */
function updateVisibleRowCount() {
  // The CSS selector to find visible rows
  // Targets <tr> elements inside the table with the specific ID, excluding those with the 'hidden-row' class.
  const selector = `#callings-table tbody tr:not(.hidden-row)`;

  // Select all matching elements and get the count
  const visibleRows = document.querySelectorAll(selector);

  // Update the text content of the span
  const countSpan = document.getElementById('calling-count');
  if (countSpan) {
    countSpan.textContent = visibleRows.length;
  } else {
    console.error("Error: Could not find element with ID 'calling-count' to display the row count.");
  }
}

/**
 * UI AND LOGIC FOR SAVED FILTERS
 */

// Helper to check if a name belongs to a system filter
function isSystemFilter(name) {
  return SYSTEM_FILTERS.some(f => f.name === name);
}

function refreshFilterDropdown() {
  const select = document.getElementById('saved-filters-select');
  select.innerHTML = '<option value="">-- Select a Filter --</option>';

  // 1. Add System Filters Group
  if (SYSTEM_FILTERS.length > 0) {
    const optGroup = document.createElement('optgroup');
    optGroup.label = "System Filters";
    SYSTEM_FILTERS.forEach(filter => {
      const option = document.createElement('option');
      option.value = filter.name;
      option.textContent = filter.name;
      if (settings.currentState.loadedFilterName === filter.name) {
        option.selected = true;
      }
      optGroup.appendChild(option);
    });
    select.appendChild(optGroup);
  }

  // 2. Add User Filters Group
  if (settings.savedFilters.length > 0) {
    const optGroup = document.createElement('optgroup');
    optGroup.label = "My Saved Filters";
    settings.savedFilters.forEach(filter => {
      const option = document.createElement('option');
      option.value = filter.name;
      option.textContent = filter.name;
      if (settings.currentState.loadedFilterName === filter.name) {
        option.selected = true;
      }
      optGroup.appendChild(option);
    });
    select.appendChild(optGroup);
  } else {
    // Just for consistency if no user filters exist yet
    // (Optional: You can remove the optgroup logic if you prefer a flat list)
  }

  updateFilterButtons();
}

function updateFilterButtons() {
  const select = document.getElementById('saved-filters-select');
  const deleteBtn = document.getElementById('btn-delete-filter');
  const updateBtn = document.getElementById('btn-update-filter');
  const nameInput = document.getElementById('filter-name-input');
  const selectedName = select.value;

  const isSystem = isSystemFilter(selectedName);

  if (selectedName) {
    // If it's a System Filter, disable modification buttons
    deleteBtn.disabled = isSystem;
    updateBtn.style.display = isSystem ? 'none' : 'inline-block';

    // Prevent editing the name of system filters in the input box
    nameInput.value = isSystem ? '' : selectedName;
    if (isSystem) nameInput.placeholder = "System Filter (Read Only)";

  } else {
    deleteBtn.disabled = true;
    updateBtn.style.display = 'none';
    nameInput.value = '';
    nameInput.placeholder = "Name this filter...";
  }
}

function loadFilter(filterName) {
  // Check System Filters first, then User Filters
  let filter = SYSTEM_FILTERS.find(f => f.name === filterName);
  if (!filter) {
    filter = settings.savedFilters.find(f => f.name === filterName);
  }

  if (!filter) return;

  settings.currentState = {
    collapseCallings: filter.collapseCallings,
    onlyShowSelected: filter.onlyShowSelected,
    hideVacantCallings: filter.hideVacantCallings || false, // Load new property
    selectedCallings: [...filter.selectedCallings], // Deep copy or executed getter
    loadedFilterName: filter.name
  };

  saveSettingsToStorage();
  applySettingsToUI();
}

function saveNewFilter() {
  const nameInput = document.getElementById('filter-name-input');
  const name = nameInput.value.trim();

  if (!name) {
    alert("Please enter a filter name.");
    return;
  }

  if (isSystemFilter(name)) {
    alert("You cannot overwrite a System Filter. Please choose a different name.");
    return;
  }

  const existingIndex = settings.savedFilters.findIndex(f => f.name === name);
  const newFilter = {
    name: name,
    collapseCallings: settings.currentState.collapseCallings,
    onlyShowSelected: settings.currentState.onlyShowSelected,
    hideVacantCallings: settings.currentState.hideVacantCallings,
    selectedCallings: [...settings.currentState.selectedCallings]
  };

  if (existingIndex !== -1) {
    if (!confirm(`Filter "${name}" already exists. Overwrite?`)) return;
    settings.savedFilters[existingIndex] = newFilter;
  } else {
    settings.savedFilters.push(newFilter);
  }

  settings.currentState.loadedFilterName = name;
  saveSettingsToStorage();
  refreshFilterDropdown();
}

function updateCurrentFilter() {
  const select = document.getElementById('saved-filters-select');
  const name = select.value;
  if (!name) return;

  if (isSystemFilter(name)) {
    alert("System filters cannot be updated.");
    return;
  }

  const index = settings.savedFilters.findIndex(f => f.name === name);
  if (index !== -1) {
    settings.savedFilters[index] = {
      name: name,
      collapseCallings: settings.currentState.collapseCallings,
      onlyShowSelected: settings.currentState.onlyShowSelected,
      hideVacantCallings: settings.currentState.hideVacantCallings,
      selectedCallings: [...settings.currentState.selectedCallings]
    };
    saveSettingsToStorage();
  }
}

function deleteFilter() {
  const select = document.getElementById('saved-filters-select');
  const name = select.value;

  if (!name) return;

  if (isSystemFilter(name)) {
    alert("System filters cannot be deleted.");
    return;
  }

  if (!confirm(`Are you sure you want to delete filter "${name}"?`)) return;

  settings.savedFilters = settings.savedFilters.filter(f => f.name !== name);

  if (settings.currentState.loadedFilterName === name) {
    settings.currentState.loadedFilterName = null;
  }

  saveSettingsToStorage();
  refreshFilterDropdown();
}

function applySettingsToUI() {
  const collapseCb = document.getElementById('collapse-callings');
  const onlyShowCb = document.getElementById('only-show-selected-columns');

  collapseCb.checked = settings.currentState.collapseCallings;
  onlyShowCb.checked = settings.currentState.onlyShowSelected;

  clearCallingsTable();
  const dataToLoad = settings.currentState.collapseCallings ? collapsedCallings : callings;
  appendCallingsTable(dataToLoad);

  refreshFilterDropdown();
}

function saveSettingsToStorage() {
  chrome.storage.local.set({ settings: settings });
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('only-show-selected-columns').addEventListener('change', handleOnlyShowSelectedColumns);
  document.getElementById('collapse-callings').addEventListener('change', handleCollapseCallings);
  document.getElementById('hide-vacant-callings').addEventListener('change', handleHideVacantCallings);

  document.getElementById('saved-filters-select').addEventListener('change', (e) => {
    if (e.target.value) {
      loadFilter(e.target.value);
    } else {
      settings.currentState.loadedFilterName = null;
      updateFilterButtons();
    }
  });


  document.getElementById('btn-save-filter').addEventListener('click', saveNewFilter);
  document.getElementById('btn-update-filter').addEventListener('click', updateCurrentFilter);
  document.getElementById('btn-delete-filter').addEventListener('click', deleteFilter);
  document.getElementById('btn-copy-table').addEventListener('click', copyTableToClipboard);

  // Read settings from storage
  chrome.storage.local.get(['settings'], function (result) {
    console.log('Value currently is:');
    console.log(result.settings);
    if (result.settings) {
      if (!result.settings.currentState) {
        const oldSelected = result.settings.selectedCallings || [];
        settings.currentState.selectedCallings = oldSelected;
        settings.savedFilters = [];
      } else {
        settings = result.settings;
      }
    }
    applySettingsToUI();
    applyWard(ward);
  });
});


/**
 * Copies the visible table data to the clipboard in TSV format.
 * Excludes the "Select" column (first column).
 */
function copyTableToClipboard() {
  const table = document.getElementById('callings-table');
  if (!table) return;

  let clipboardText = '';

  // 1. Process Header
  const headers = Array.from(table.querySelectorAll('thead th'));
  // Skip the first column (Select)
  const headerTexts = headers.slice(1).map(th => th.textContent.trim());
  clipboardText += headerTexts.join('\t') + '\n';

  // 2. Process Body Rows
  const rows = Array.from(table.querySelectorAll('tbody tr:not(.hidden-row)'));

  rows.forEach(row => {
    const cells = Array.from(row.querySelectorAll('td'));
    // Skip the first column (Select)
    const rowData = cells.slice(1).map(td => td.textContent.trim());
    clipboardText += rowData.join('\t') + '\n';
  });

  // 3. Write to Clipboard
  navigator.clipboard.writeText(clipboardText).then(() => {
    // Optional: Visual feedback
    const btn = document.getElementById('btn-copy-table');
    const originalText = btn.textContent;
    btn.textContent = 'Copied!';
    setTimeout(() => {
      btn.textContent = originalText;
    }, 2000);
  }).catch(err => {
    console.error('Failed to copy text: ', err);
    alert('Failed to copy table to clipboard.');
  });
}

