

/**
 * Dynamically creates a <style> element and injects a string of CSS rules
 * into the document's <head> section.
 * * This method supports both modern browsers (using appendChild with TextNode)
 * and older versions of Internet Explorer (using styleSheet.cssText).
 *
 * @param {string} cssRules A string containing the CSS rules to be applied
 * to the document (e.g., "body { margin: 0; }").
 * @returns {void}
 */
function addInlineStyles(cssRules) {
  const styleElement = document.createElement('style');
  // Set the type attribute for best compatibility
  styleElement.type = 'text/css';

  // Add the CSS rules as text content
  if (styleElement.styleSheet) {
    // For Internet Explorer (older versions)
    styleElement.styleSheet.cssText = cssRules;
  } else {
    // For modern browsers
    styleElement.appendChild(document.createTextNode(cssRules));
  }

  // Append the <style> element to the <head> of the document
  document.head.appendChild(styleElement);
}

/**
 * Defines a set of CSS rules specifically for the extension's UI components
 * (like the 'Extract Callings' button) and injects them into the document's head.
 *
 * This function utilizes the external utility function `addInlineStyles` to
 * dynamically apply styles, ensuring custom elements look correct on the host
 * webpage.
 *
 * @returns {void}
 * @global {function(string): void} addInlineStyles - Required function to create
 * and append a <style> element containing the CSS rules to the document head.
 */
function addExtensionStyles() {
  const dynamicStyles = `
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
        background: linear-gradient(150deg, rgba(255, 255, 255, 0) 75%, rgba(0, 97, 132, 0.13));
        color: rgb(0, 97, 132);
        border: 1px solid rgb(0, 97, 132);
        height: 33px;
    }
  `;
  addInlineStyles(dynamicStyles);
}

