/**
 * Dynamically creates a <style> element and injects a string of CSS rules
 * into the document's <head> section.
 *
 * @param {string} cssRules CSS rules to inject, e.g. "body { margin: 0; }".
 * @returns {void}
 */
function addInlineStyles(cssRules) {
  const styleElement = document.createElement('style');
  styleElement.appendChild(document.createTextNode(cssRules));
  document.head.appendChild(styleElement);
}

const EXTENSION_STYLE_ID = 'lcr-helper-extension-styles';

/**
 * Injects the extension's UI styles (currently only the Extract Callings
 * button) into the host page. Idempotent — guarded by a sentinel id so
 * repeated calls during SPA remounts don't duplicate <style> nodes.
 *
 * @returns {void}
 */
function addExtensionStyles() {
  if (document.getElementById(EXTENSION_STYLE_ID)) return;

  const styleElement = document.createElement('style');
  styleElement.id = EXTENSION_STYLE_ID;
  styleElement.appendChild(document.createTextNode(`
      .extract-callings-button {
        text-transform: none;
        overflow: visible;
        display: inline-flex;
        -webkit-box-align: center;
        align-items: center;
        -webkit-box-pack: center;
        justify-content: center;
        margin: 0px;
        border-radius: 0.125rem;
        cursor: pointer;
        font-weight: 400;
        max-width: 18rem;
        vertical-align: top;
        text-decoration: none;
        font-family: "Ensign:Sans", Arial, "noto sans", sans-serif;
        line-height: 1.2;
        font-size: .85rem;
        padding: 0 calc(-1px + 15px);
        background: rgb(178, 0, 0);
        color: #fff;
        border: 1px solid rgb(178, 0, 0);
        height: 33px;
    }
      .extract-callings-button:hover { background: rgb(153, 0, 0); border-color: rgb(153, 0, 0); }
      .extract-callings-button:disabled { opacity: 0.6; cursor: default; }
  `));
  document.head.appendChild(styleElement);
}
