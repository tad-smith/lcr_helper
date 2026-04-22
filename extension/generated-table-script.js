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
    selectedCallings: [
      "Bishopric:Bishop",
      "Bishopric:Bishopric-First-Counselor",
      "Bishopric:Bishopric-Second-Counselor",
      "Bishopric:Ward-Executive-Secretary",
      "Bishopric:Ward-Assistant-Executive-Secretary",
      "Bishopric:Ward-Clerk",
      "Bishopric:Ward-Assistant-Clerk",
      "Bishopric:Ward-Assistant-Clerk--Membership",
      "Bishopric:Ward-Assistant-Clerk--Finance",
      "Elders Quorum Presidency:Elders-Quorum-President",
      "Elders Quorum Presidency:Elders-Quorum-First-Counselor",
      "Elders Quorum Presidency:Elders-Quorum-Second-Counselor",
      "Elders Quorum Presidency:Elders-Quorum-Secretary",
      "Relief Society Presidency:Relief-Society-President",
      "Relief Society Presidency:Relief-Society-First-Counselor",
      "Relief Society Presidency:Relief-Society-Second-Counselor",
      "Relief Society Presidency:Relief-Society-Secretary",
      "Aaronic Priesthood:Aaronic-Priesthood-Advisors",
      "Aaronic Priesthood:Aaronic-Priesthood-Specialist",
      "Young Women Presidency:Young-Women-President",
      "Young Women Presidency:Young-Women-First-Counselor",
      "Young Women Presidency:Young-Women-Second-Counselor",
      "Young Women Presidency:Young-Women-Secretary",
      "Young Women:Young-Women-Specialist",
      "Young Women:Young-Women-Class-Adviser",
      "Sunday School Presidency:Sunday-School-President",
      "Sunday School Presidency:Sunday-School-First-Counselor",
      "Sunday School Presidency:Sunday-School-Second-Counselor",
      "Sunday School Presidency:Sunday-School-Secretary",
      "Primary Presidency:Primary-President",
      "Primary Presidency:Primary-First-Counselor",
      "Primary Presidency:Primary-Second-Counselor",
      "Primary Presidency:Primary-Secretary",
      "Ward Missionaries:Ward-Mission-Leader",
      "Ward Missionaries:Assistant-Ward-Mission-Leader",
      "Temple and Family History:Ward-Temple-and-Family-History-Leader",
      "Young Single Adult:Young-Single-Adult-Adviser",
      "History:History-Specialist",
      "Technology:Email-Communication-Specialist",
      "Technology:Technology-Specialist"
    ]
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
const callings = readUrlJson('callings');
const collapsedCallings = mergeCallings(callings);
const ward = readUrlString('ward');

// Expose page context for sibling scripts (callings-sheet-import.js).
// `const` at script top-level is not automatically attached to `window`.
window.LCRHelper = { callings, collapsedCallings, ward };

/**
 * Reads a URL query parameter and returns its decoded string value, or
 * null if the parameter is absent. URLSearchParams already handles the
 * percent-decoding.
 */
function readUrlString(paramName) {
  const raw = new URLSearchParams(window.location.search).get(paramName);
  return raw == null ? null : raw;
}

/**
 * Reads a URL query parameter whose value is a JSON-encoded array. Returns
 * null if the parameter is missing, unparseable, or not an array.
 */
function readUrlJson(paramName) {
  const raw = readUrlString(paramName);
  if (raw == null) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      console.error('Decoded parameter is not an array:', parsed);
      return null;
    }
    return parsed;
  } catch (error) {
    console.error('Error parsing URL parameter', paramName, error);
    return null;
  }
}

/**
 * Updates the web page's title and the text content of all elements
 * with the class 'ward-name' to the provided organizational unit name.
 */
function applyWard(ward) {
  document.title = ward;

  const elements = document.querySelectorAll('.ward-name');
  elements.forEach(element => {
    element.textContent = ward;
  });
}

/**
 * Clears all rendered <tr> rows from the callings table body.
 */
function clearCallingsTable() {
  const tbody = document.getElementById('callings-table-body');
  if (tbody) {
    tbody.innerHTML = '';
  } else {
    console.warn("Could not find table body element with ID 'callings-table-body'.");
  }
}

/**
 * Renders each calling as a <tr> and appends it to 'callings-table-body'.
 * Initial row visibility follows the current settings (onlyShowSelected,
 * hideVacantCallings). Each row's checkbox is wired up to toggleSelected
 * so the user can include/exclude it interactively.
 *
 * @param {Array<Object>} callings Merged/fixed calling objects to render.
 */
function appendCallingsTable(callings) {
  const tbody = document.getElementById('callings-table-body');
  const onlyShowSelected = settings.currentState.onlyShowSelected;
  const hideVacant = settings.currentState.hideVacantCallings;
  const selectedSet = new Set(settings.currentState.selectedCallings);

  callings.forEach(calling => {
    const row = document.createElement('tr');
    row.id = calling.id;

    if (calling.isVacant) {
      row.classList.add('vacant-row');
    }

    const isSelected = selectedSet.has(row.id);
    let shouldHide = false;
    if (onlyShowSelected && !isSelected) shouldHide = true;
    if (hideVacant && calling.isVacant) shouldHide = true;
    if (shouldHide) row.classList.add('hidden-row');

    const selectedCol = document.createElement('td');
    const checkbox = document.createElement('input');
    checkbox.className = 'row-selector';
    checkbox.type = 'checkbox';
    checkbox.checked = isSelected;
    checkbox.addEventListener('change', toggleSelected);
    selectedCol.append(checkbox);
    row.append(selectedCol);

    const orgCol = document.createElement('td');
    orgCol.textContent = calling.organization;
    row.append(orgCol);

    const callingCol = document.createElement('td');
    callingCol.textContent = calling.calling;
    row.append(callingCol);

    const personCol = document.createElement('td');
    if (calling.isVacant) {
      personCol.textContent = '';
    } else if (calling.multiplePeople) {
      const italic = document.createElement('i');
      italic.textContent = `Multiple Individuals Called (${calling.numberOfPeople})`;
      personCol.append(italic);
    } else {
      const link = document.createElement('a');
      link.href = calling.profileLink || '#';
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.className = 'calling-link';
      link.textContent = calling.person || '';
      personCol.append(link);
    }
    row.append(personCol);

    const emailCol = document.createElement('td');
    emailCol.textContent = calling.email ? calling.email : '';
    row.append(emailCol);

    tbody.appendChild(row);
  });

  updateVisibleRowCount();
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

    // Hide if (OnlyShow is ON AND Not Selected) OR (HideVacant is ON AND Is Vacant)
    const shouldHide = (onlyShowSelected && !isSelected) || (hideVacant && isVacant);
    tr.classList.toggle('hidden-row', shouldHide);
  });

  updateVisibleRowCount();
}

function handleOnlyShowSelectedColumns() {
  const checkbox = document.getElementById('only-show-selected-columns');
  settings.currentState.onlyShowSelected = checkbox.checked;
  saveSettingsToStorage();
  updateTableVisibility();
}

function handleHideVacantCallings() {
  const checkbox = document.getElementById('hide-vacant-callings');
  settings.currentState.hideVacantCallings = checkbox.checked;
  saveSettingsToStorage();
  updateTableVisibility();
}

/**
 * Handles an individual row checkbox toggle: updates row visibility,
 * mirrors the change into settings.currentState.selectedCallings, and
 * persists.
 */
function toggleSelected() {
  const onlyShowSelected = document.getElementById('only-show-selected-columns');
  const tableRow = this.closest('tr');
  const callingId = tableRow.id;

  tableRow.classList.toggle('hidden-row', !this.checked && onlyShowSelected.checked);
  updateVisibleRowCount();

  const index = settings.currentState.selectedCallings.indexOf(callingId);
  if (this.checked && index === -1) {
    settings.currentState.selectedCallings.push(callingId);
  } else if (!this.checked && index !== -1) {
    settings.currentState.selectedCallings.splice(index, 1);
  }
  saveSettingsToStorage();
}

/**
 * Handles the Collapse Callings checkbox. Swaps the rendered dataset
 * between the full and collapsed lists, updates the persisted state,
 * and saves.
 */
function handleCollapseCallings() {
  const checkbox = document.getElementById('collapse-callings');
  settings.currentState.collapseCallings = checkbox.checked;
  saveSettingsToStorage();
  clearCallingsTable();
  appendCallingsTable(checkbox.checked ? collapsedCallings : callings);
}

/**
 * Counts the number of <tr> elements within the <tbody> of the table with the ID 'callings-table'
 * that do NOT have the 'hidden-row' class.
 * The resulting count is then displayed in the span element with the ID 'calling-count'.
 */
function updateVisibleRowCount() {
  const selector = `#callings-table tbody tr:not(.hidden-row)`;
  const visibleRows = document.querySelectorAll(selector);
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

function isSystemFilter(name) {
  return SYSTEM_FILTERS.some(f => f.name === name);
}

function refreshFilterDropdown() {
  const select = document.getElementById('saved-filters-select');
  select.innerHTML = '<option value="">-- Select a Filter --</option>';

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
    deleteBtn.disabled = isSystem;
    updateBtn.style.display = isSystem ? 'none' : 'inline-block';

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
  let filter = SYSTEM_FILTERS.find(f => f.name === filterName);
  if (!filter) {
    filter = settings.savedFilters.find(f => f.name === filterName);
  }
  if (!filter) return;

  settings.currentState = {
    collapseCallings: filter.collapseCallings,
    onlyShowSelected: filter.onlyShowSelected,
    hideVacantCallings: filter.hideVacantCallings || false,
    selectedCallings: [...filter.selectedCallings],
    loadedFilterName: filter.name
  };

  saveSettingsToStorage();
  applySettingsToUI();
}

async function saveNewFilter() {
  const nameInput = document.getElementById('filter-name-input');
  const name = nameInput.value.trim();

  if (!name) {
    showToast('Please enter a filter name.', 'error');
    return;
  }
  if (isSystemFilter(name)) {
    showToast('Cannot overwrite a System Filter — choose a different name.', 'error');
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
    const ok = await confirmDialog(`Filter "${name}" already exists. Overwrite?`);
    if (!ok) return;
    settings.savedFilters[existingIndex] = newFilter;
  } else {
    settings.savedFilters.push(newFilter);
  }

  settings.currentState.loadedFilterName = name;
  saveSettingsToStorage();
  refreshFilterDropdown();
  showToast(existingIndex !== -1 ? `Filter "${name}" updated.` : `Filter "${name}" saved.`, 'success');
}

function updateCurrentFilter() {
  const select = document.getElementById('saved-filters-select');
  const name = select.value;
  if (!name) return;

  if (isSystemFilter(name)) {
    showToast('System filters cannot be updated.', 'error');
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
    refreshFilterDropdown();
    showToast(`Filter "${name}" updated.`, 'success');
  }
}

async function deleteFilter() {
  const select = document.getElementById('saved-filters-select');
  const name = select.value;
  if (!name) return;

  if (isSystemFilter(name)) {
    showToast('System filters cannot be deleted.', 'error');
    return;
  }

  const ok = await confirmDialog(`Delete filter "${name}"?`);
  if (!ok) return;

  settings.savedFilters = settings.savedFilters.filter(f => f.name !== name);
  if (settings.currentState.loadedFilterName === name) {
    settings.currentState.loadedFilterName = null;
  }

  saveSettingsToStorage();
  refreshFilterDropdown();
  showToast(`Filter "${name}" deleted.`, 'success');
}


function applySettingsToUI() {
  const collapseCb = document.getElementById('collapse-callings');
  const onlyShowCb = document.getElementById('only-show-selected-columns');
  const hideVacantCb = document.getElementById('hide-vacant-callings');

  collapseCb.checked = settings.currentState.collapseCallings;
  onlyShowCb.checked = settings.currentState.onlyShowSelected;
  hideVacantCb.checked = settings.currentState.hideVacantCallings;

  clearCallingsTable();
  const dataToLoad = settings.currentState.collapseCallings ? [...collapsedCallings] : [...callings];

  // Creates map of 'id' -> 'index' from settings.currentState.selectedCallings for O(1) lookup
  const indexMap = new Map();
  settings.currentState.selectedCallings.forEach((id, index) => {
    indexMap.set(id, index);
  });

  // Sort selected rows to the top, preserving their order in selectedCallings.
  dataToLoad.sort((a, b) => {
    const indexA = indexMap.has(a.id) ? indexMap.get(a.id) : -1;
    const indexB = indexMap.has(b.id) ? indexMap.get(b.id) : -1;

    if (indexA !== -1 && indexB !== -1) return indexA - indexB;
    if (indexA !== -1) return -1;
    if (indexB !== -1) return 1;
    return 0;
  });

  appendCallingsTable(dataToLoad);
  refreshFilterDropdown();
}


function saveSettingsToStorage() {
  chrome.storage.local.set({ [TABLE_SETTINGS_STORAGE_KEY]: settings });
}

/**
 * Promise-returning confirm dialog. Renders inside #sheet-confirm-modal so
 * it inherits the existing modal styling instead of using the native
 * window.confirm, which is blocking and visually out-of-place.
 */
function confirmDialog(message) {
  return new Promise((resolve) => {
    const modal = document.getElementById('sheet-confirm-modal');
    if (!modal) {
      // Fall back to native in the unlikely event the scaffold is missing.
      resolve(window.confirm(message));
      return;
    }
    modal.innerHTML = '';

    const close = (answer) => {
      modal.classList.add('hidden');
      modal.innerHTML = '';
      resolve(answer);
    };

    const dialog = document.createElement('div');
    dialog.className = 'modal-dialog';
    dialog.setAttribute('role', 'dialog');

    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    backdrop.addEventListener('click', () => close(false));
    modal.appendChild(backdrop);

    const header = document.createElement('div');
    header.className = 'modal-header';
    const h2 = document.createElement('h2');
    h2.textContent = 'Confirm';
    header.appendChild(h2);
    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'modal-close';
    closeBtn.setAttribute('aria-label', 'Close');
    closeBtn.textContent = '×';
    closeBtn.addEventListener('click', () => close(false));
    header.appendChild(closeBtn);
    dialog.appendChild(header);

    const body = document.createElement('div');
    body.className = 'modal-body';
    const p = document.createElement('p');
    p.textContent = message;
    body.appendChild(p);
    dialog.appendChild(body);

    const footer = document.createElement('div');
    footer.className = 'modal-footer';
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'secondary-button';
    cancel.textContent = 'Cancel';
    cancel.addEventListener('click', () => close(false));
    const ok = document.createElement('button');
    ok.type = 'button';
    ok.className = 'action-button';
    ok.textContent = 'OK';
    ok.addEventListener('click', () => close(true));
    footer.appendChild(cancel);
    footer.appendChild(ok);
    dialog.appendChild(footer);

    modal.appendChild(dialog);
    modal.classList.remove('hidden');
    ok.focus();
  });
}

/**
 * Render a toast. Reuses callings-sheet-import.js's showToast if loaded;
 * otherwise falls back to a minimal inline implementation. Kept independent
 * so this file doesn't hard-depend on the import module.
 */
function showToast(message, kind = 'info') {
  if (window.LCRHelperImport && typeof window.LCRHelperImport.showToast === 'function') {
    window.LCRHelperImport.showToast(message, kind);
    return;
  }
  const el = document.getElementById('sheet-toast');
  if (!el) return;
  el.textContent = message;
  el.className = 'toast';
  if (kind === 'error') el.classList.add('toast-error');
  if (kind === 'success') el.classList.add('toast-success');
  el.classList.remove('hidden');
  setTimeout(() => el.classList.add('hidden'), 3500);
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

  chrome.storage.local.get([TABLE_SETTINGS_STORAGE_KEY], function (result) {
    const stored = result[TABLE_SETTINGS_STORAGE_KEY];
    if (stored) {
      if (!stored.currentState) {
        const oldSelected = stored.selectedCallings || [];
        settings.currentState.selectedCallings = oldSelected;
        settings.savedFilters = [];
      } else {
        settings = stored;

        // If a system filter is loaded, sync its settings from the code
        // definition. This ensures updates to SYSTEM_FILTERS (like
        // reordering) propagate to users on their next load.
        if (settings.currentState.loadedFilterName && isSystemFilter(settings.currentState.loadedFilterName)) {
          const sysFilter = SYSTEM_FILTERS.find(f => f.name === settings.currentState.loadedFilterName);
          if (sysFilter) {
            settings.currentState.selectedCallings = [...sysFilter.selectedCallings];
            settings.currentState.collapseCallings = sysFilter.collapseCallings;
            settings.currentState.onlyShowSelected = sysFilter.onlyShowSelected;
            settings.currentState.hideVacantCallings = sysFilter.hideVacantCallings || false;
            saveSettingsToStorage();
          }
        }
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
  const headers = Array.from(table.querySelectorAll('thead th'));
  const headerTexts = headers.slice(1).map(th => th.textContent.trim());
  clipboardText += headerTexts.join('\t') + '\n';

  const rows = Array.from(table.querySelectorAll('tbody tr:not(.hidden-row)'));
  rows.forEach(row => {
    const cells = Array.from(row.querySelectorAll('td'));
    const rowData = cells.slice(1).map(td => td.textContent.trim());
    clipboardText += rowData.join('\t') + '\n';
  });

  navigator.clipboard.writeText(clipboardText).then(() => {
    const btn = document.getElementById('btn-copy-table');
    const originalText = btn.textContent;
    btn.textContent = 'Copied!';
    setTimeout(() => { btn.textContent = originalText; }, 2000);
  }).catch(err => {
    console.error('Failed to copy text: ', err);
    showToast('Failed to copy table to clipboard.', 'error');
  });
}
