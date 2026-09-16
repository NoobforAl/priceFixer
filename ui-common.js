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

// ─── Theme ────────────────────────────────────────────────────────────
// storage.sync.theme is 'system' (default), 'light' or 'dark'. The last
// value is mirrored in localStorage so the page opens in the right theme
// before storage answers.

const THEME_CACHE_KEY = 'pf-theme';

function themePreference(value) {
  return value === 'light' || value === 'dark' ? value : 'system';
}

/** The theme actually shown for a preference ('light' | 'dark'). */
function effectiveTheme(pref) {
  if (pref === 'light' || pref === 'dark') {
    return pref;
  }
  const media = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)');
  return media && media.matches ? 'dark' : 'light';
}

function applyTheme(value) {
  const pref = themePreference(value);
  const root = document.documentElement;
  if (effectiveTheme(pref) !== effectiveTheme(root.dataset.theme)) {
    // Swap every colour at once instead of fading each control separately
    root.classList.add('theme-switching');
    requestAnimationFrame(() =>
      requestAnimationFrame(() => root.classList.remove('theme-switching'))
    );
  }
  if (pref === 'system') {
    delete root.dataset.theme;
  } else {
    root.dataset.theme = pref;
  }
  try {
    localStorage.setItem(THEME_CACHE_KEY, pref);
  } catch {
    // localStorage unavailable
  }
  document.dispatchEvent(
    new CustomEvent('pf-theme', { detail: { pref, effective: effectiveTheme(pref) } })
  );
}

(function initTheme() {
  try {
    applyTheme(localStorage.getItem(THEME_CACHE_KEY));
  } catch {
    // localStorage unavailable
  }
  try {
    api.storage.sync.get(['theme']).then(
      result => applyTheme(result.theme),
      () => {}
    );
    api.storage.onChanged.addListener((changes, area) => {
      if (area === 'sync' && changes.theme) {
        applyTheme(changes.theme.newValue);
      }
    });
    window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener('change', () => {
      applyTheme(document.documentElement.dataset.theme);
    });
  } catch {
    // storage unavailable
  }
})();
