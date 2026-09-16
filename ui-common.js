/**
 * Shared helpers for the extension's plain-script pages (popup.html and
 * options.html). Loaded as globals via <script src="ui-common.js">.
 */

// Firefox exposes a promise-based `browser` namespace; Chrome uses callbacks
// on `chrome.tabs.sendMessage` (and rejects a function in the options slot).
const isPromiseApi = typeof browser !== 'undefined' && !!browser.runtime;
const api = isPromiseApi ? browser : chrome;

/** "https://www.Shop.com/x" or "shop.com" → "shop.com"; "" when invalid. */
function normalizeDomain(input) {
  let value = String(input || '')
    .trim()
    .toLowerCase();
  if (/^[a-z]+:\/\//.test(value)) {
    try {
      value = new URL(value).hostname;
    } catch {
      return '';
    }
  }
  value = value
    .split(/[/?#:]/)[0]
    .replace(/^www\./, '')
    .replace(/\.+$/, '');
  return /^[a-z0-9.-]+$/.test(value) ? value : '';
}
