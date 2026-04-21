/**
 * Import flow for syncing scraped callings into the "Email Forwarding
 * Addresses" Google Sheet. Stub — snapshot/diff in a subsequent commit,
 * full review modal in the one after.
 *
 * Entry point: click handler on #btn-import-sheet. On first use, opens
 * the settings modal with a "Configure before first use" banner.
 */

async function handleImportClick() {
  const settings = await window.LCRHelperSettings.load();
  if (!settings || !settings.webAppUrl || !settings.sharedSecret) {
    window.LCRHelperSettings.open({ requireConfig: true });
    return;
  }
  // Snapshot fetch + diff + review modal arrive in subsequent commits.
  console.log('[LCR Helper] Import clicked; settings present.', {
    webAppUrl: settings.webAppUrl,
    // Never log the secret.
  });
}

document.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('btn-import-sheet');
  if (btn) btn.addEventListener('click', handleImportClick);
});
