/**
 * Settings modal for the calling-sheet import.
 *
 * Persists the web app URL and shared secret to chrome.storage.local under
 * the key defined by SETTINGS_STORAGE_KEY (in constants.js). Exposes a
 * minimal API on window.LCRHelperSettings for callings-sheet-import.js.
 */

/**
 * Read settings from chrome.storage.local.
 * @returns {Promise<{webAppUrl: string, sharedSecret: string}|null>}
 */
function loadSettings() {
  return new Promise((resolve) => {
    chrome.storage.local.get([SETTINGS_STORAGE_KEY], (result) => {
      resolve(result[SETTINGS_STORAGE_KEY] || null);
    });
  });
}

/**
 * Persist settings to chrome.storage.local.
 * @param {{webAppUrl: string, sharedSecret: string}} settings
 * @returns {Promise<void>}
 */
function saveSettings(settings) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [SETTINGS_STORAGE_KEY]: settings }, resolve);
  });
}

/** Minimal validation — must be an https://script.google.com/... URL. */
function isValidWebAppUrl(url) {
  return typeof url === 'string' && /^https:\/\/script\.google\.com\//.test(url.trim());
}

/** Open the settings modal. `requireConfig=true` shows a first-use banner. */
function openSettingsModal({ requireConfig = false } = {}) {
  const modal = document.getElementById('sheet-settings-modal');
  if (!modal) return;

  modal.innerHTML = `
    <div class="modal-backdrop"></div>
    <div class="modal-dialog" role="dialog" aria-labelledby="sheet-settings-title">
      <div class="modal-header">
        <h2 id="sheet-settings-title">Calling Sheet Settings</h2>
        <button type="button" class="modal-close" aria-label="Close">×</button>
      </div>
      <div class="modal-body">
        ${requireConfig ? '<div class="modal-banner">Configure before first use.</div>' : ''}
        <div class="form-row">
          <label for="sheet-web-app-url">Web App URL</label>
          <input type="url" id="sheet-web-app-url"
                 placeholder="https://script.google.com/macros/s/.../exec" />
          <small class="hint">
            From <code>clasp deploy</code>. Must start with
            <code>https://script.google.com/</code>.
          </small>
        </div>
        <div class="form-row">
          <label for="sheet-shared-secret">Shared Secret</label>
          <div class="secret-row">
            <input type="password" id="sheet-shared-secret" />
            <button type="button" id="sheet-secret-toggle"
                    class="icon-button" title="Show / hide">👁</button>
          </div>
          <small class="hint">
            Matches <code>SHARED_SECRET</code> in the Apps Script project
            settings.
          </small>
        </div>
        <div class="modal-error" id="sheet-settings-error" style="display:none"></div>
      </div>
      <div class="modal-footer">
        <button type="button" id="sheet-settings-cancel" class="secondary-button">Cancel</button>
        <button type="button" id="sheet-settings-save" class="action-button">Save</button>
      </div>
    </div>
  `;

  const urlInput = modal.querySelector('#sheet-web-app-url');
  const secretInput = modal.querySelector('#sheet-shared-secret');
  const errBox = modal.querySelector('#sheet-settings-error');

  loadSettings().then((settings) => {
    if (settings) {
      urlInput.value = settings.webAppUrl || '';
      secretInput.value = settings.sharedSecret || '';
    }
  });

  modal.querySelector('.modal-close').addEventListener('click', closeSettingsModal);
  modal.querySelector('#sheet-settings-cancel').addEventListener('click', closeSettingsModal);
  modal.querySelector('.modal-backdrop').addEventListener('click', closeSettingsModal);

  modal.querySelector('#sheet-secret-toggle').addEventListener('click', () => {
    secretInput.type = secretInput.type === 'password' ? 'text' : 'password';
  });

  modal.querySelector('#sheet-settings-save').addEventListener('click', async () => {
    const url = urlInput.value.trim();
    const secret = secretInput.value.trim();
    errBox.style.display = 'none';
    if (!isValidWebAppUrl(url)) {
      errBox.textContent = 'URL must start with https://script.google.com/';
      errBox.style.display = 'block';
      return;
    }
    if (!secret) {
      errBox.textContent = 'Shared secret is required.';
      errBox.style.display = 'block';
      return;
    }
    await saveSettings({ webAppUrl: url, sharedSecret: secret });
    closeSettingsModal();
  });

  modal.classList.remove('hidden');
}

function closeSettingsModal() {
  const modal = document.getElementById('sheet-settings-modal');
  if (!modal) return;
  modal.classList.add('hidden');
  modal.innerHTML = '';
}

window.LCRHelperSettings = {
  load: loadSettings,
  save: saveSettings,
  open: openSettingsModal,
  close: closeSettingsModal,
  isValidWebAppUrl,
};

document.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('btn-sheet-settings');
  if (btn) {
    btn.addEventListener('click', () => openSettingsModal({ requireConfig: false }));
  }
});
