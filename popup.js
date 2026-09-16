/**
 * Popup script for Price Fixer extension
 */

// Firefox exposes a promise-based `browser` namespace; Chrome uses callbacks
// on `chrome.tabs.sendMessage` (and rejects a function in the options slot).
const isPromiseApi = typeof browser !== 'undefined' && !!browser.runtime;
const api = isPromiseApi ? browser : chrome;

class PopupController {
  constructor() {
    this.tab = null;
    this.status = null;
    this.reachable = false;
    this.init();
  }

  async init() {
    this.bindEvents();
    try {
      this.tab = await this.getCurrentTab();
      this.showUrl();
      await this.loadStatus();
    } catch {
      this.showNotice('Could not read the current tab.');
    }
    this.loadStats();
  }

  bindEvents() {
    const on = (id, handler) => document.getElementById(id).addEventListener('click', handler);
    on('globalSwitch', () =>
      this.setGlobalEnabled(!(this.status ? this.status.globalEnabled : true))
    );
    on('siteSwitch', () => this.setSiteEnabled(!(this.status ? this.status.siteEnabled : true)));
    on('modeHighlight', () => this.setMode('highlight'));
    on('modeReplace', () => this.setMode('replace'));
    on('reprocessBtn', () => this.send({ action: 'reprocess' }));
    on('restoreBtn', () => this.send({ action: 'restore' }));
    on('clearChangesBtn', () => {
      document.getElementById('changesSection').style.display = 'none';
    });
    on('noticeAction', () => this.enableOnThisSite());
    on('rulesToggle', () => this.toggleRules());
    on('rulesSave', () => this.saveRules());
  }

  // ─── Custom rules ───────────────────────────────────────────────────

  domain() {
    try {
      return new URL(this.tab.url).hostname.replace(/^www\./, '');
    } catch {
      return '';
    }
  }

  async toggleRules() {
    const toggle = document.getElementById('rulesToggle');
    const panel = document.getElementById('rulesPanel');
    const open = panel.hidden;
    panel.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
    if (open) {
      await this.loadRules();
    }
  }

  async loadRules() {
    const domain = this.domain();
    document.getElementById('rulesDomain').textContent = domain || 'this site';
    try {
      const result = await api.storage.sync.get(['customRules']);
      const rules = result.customRules || {};
      const selectors = rules.excludeSelectors || {};
      document.getElementById('ruleSelectors').value = (selectors[domain] || []).join('\n');
      document.getElementById('ruleSelectorsAll').value = (selectors['*'] || []).join('\n');
      document.getElementById('ruleExclude').value = (rules.excludePatterns || []).join('\n');
      document.getElementById('ruleExtra').value = (rules.extraPatterns || []).join('\n');
    } catch {
      // Storage not available
    }
    this.renderRuleErrors();
  }

  async saveRules() {
    const lines = id =>
      document
        .getElementById(id)
        .value.split('\n')
        .map(l => l.trim())
        .filter(Boolean);
    const domain = this.domain();
    let rules = {};
    try {
      rules = (await api.storage.sync.get(['customRules'])).customRules || {};
    } catch {
      // fall through with empty rules
    }
    const excludeSelectors = { ...(rules.excludeSelectors || {}) };
    const siteLines = lines('ruleSelectors');
    if (siteLines.length) {
      excludeSelectors[domain] = siteLines;
    } else {
      delete excludeSelectors[domain];
    }
    const allLines = lines('ruleSelectorsAll');
    if (allLines.length) {
      excludeSelectors['*'] = allLines;
    } else {
      delete excludeSelectors['*'];
    }
    const customRules = {
      excludeSelectors,
      excludePatterns: lines('ruleExclude'),
      extraPatterns: lines('ruleExtra'),
    };
    await api.storage.sync.set({ customRules });
    // The content script re-applies on storage change; fetch its verdict
    await new Promise(r => setTimeout(r, 250));
    await this.loadStatus();
    this.renderRuleErrors();
  }

  renderRuleErrors() {
    const errors = (this.status && this.status.ruleErrors) || [];
    document.getElementById('rulesErrors').textContent = errors.length
      ? 'Ignored (invalid):\n' + errors.join('\n')
      : '';
  }

  // ─── Tab / messaging ────────────────────────────────────────────────

  async getCurrentTab() {
    const tabs = await api.tabs.query({ active: true, currentWindow: true });
    if (!tabs || !tabs[0]) {
      throw new Error('No active tab');
    }
    return tabs[0];
  }

  sendMessageToTab(message) {
    if (isPromiseApi) {
      return api.tabs.sendMessage(this.tab.id, message);
    }
    return new Promise((resolve, reject) => {
      chrome.tabs.sendMessage(this.tab.id, message, response => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve(response);
        }
      });
    });
  }

  /** Send an action to the content script and refresh the UI from its reply. */
  async send(message) {
    if (!this.tab) {
      return null;
    }
    this.setLoading(true);
    try {
      const response = await this.sendMessageToTab(message);
      if (response && typeof response.enabled === 'boolean') {
        this.status = response;
        this.reachable = true;
        this.render();
      }
      return response;
    } catch {
      this.reachable = false;
      this.showUnreachable();
      return null;
    } finally {
      this.setLoading(false);
    }
  }

  async loadStatus() {
    await this.send({ action: 'getStatus' });
  }

  async loadStats() {
    try {
      const result = await api.storage.local.get(['stats']);
      const stats = result.stats || {};
      document.getElementById('totalRounded').textContent = stats.totalPricesRounded || 0;
      document.getElementById('hiddenAmount').textContent = (stats.totalHiddenAmount || 0).toFixed(
        2
      );
    } catch {
      // Stats not available
    }
  }

  // ─── Actions ────────────────────────────────────────────────────────

  async setGlobalEnabled(enabled) {
    const response = await this.send({ action: 'setGlobalEnabled', enabled });
    if (!response) {
      // Content script unreachable: still persist so other tabs pick it up
      api.storage.sync.set({ globalEnabled: enabled });
    }
  }

  setSiteEnabled(enabled) {
    return this.send({ action: 'setSiteEnabled', enabled });
  }

  async setMode(mode) {
    const response = await this.send({ action: 'setMode', mode });
    if (!response) {
      api.storage.sync.set({ displayMode: mode });
    }
  }

  /**
   * Firefox MV3 does not grant host permissions until the user allows them,
   * and a tab open before install has no content script. Ask for the
   * permission for this origin and inject the script.
   */
  async enableOnThisSite() {
    if (!this.tab || !this.tab.url) {
      return;
    }
    let origin;
    try {
      origin = new URL(this.tab.url).origin + '/*';
    } catch {
      return;
    }
    try {
      if (api.permissions && api.permissions.request) {
        const granted = await api.permissions.request({ origins: [origin] });
        if (!granted) {
          this.showNotice('Permission for this site was not granted.');
          return;
        }
      }
      await api.scripting.executeScript({ target: { tabId: this.tab.id }, files: ['content.js'] });
      await new Promise(r => setTimeout(r, 150));
      this.hideNotice();
      await this.loadStatus();
    } catch {
      this.showNotice('Could not activate on this page. Reload the page and try again.');
    }
  }

  // ─── Rendering ──────────────────────────────────────────────────────

  showUrl() {
    const el = document.getElementById('currentUrl');
    let host = 'Unknown site';
    try {
      host = new URL(this.tab.url).hostname.replace(/^www\./, '');
    } catch {
      // chrome://, about:, file: etc.
    }
    el.firstChild.textContent = host;
  }

  showUnreachable() {
    this.status = null;
    document.getElementById('priceCount').textContent = '–';
    let text = 'Price Fixer is not active on this page.';
    let action = null;
    if (this.tab && /^https?:/.test(this.tab.url || '')) {
      text += ' It only runs on pages loaded after it was installed, or on sites you have allowed.';
      action = 'Enable on this site';
    } else {
      text += ' It works on regular http(s) web pages only.';
    }
    this.showNotice(text, action);
  }

  showNotice(text, actionLabel) {
    const notice = document.getElementById('notice');
    const button = document.getElementById('noticeAction');
    document.getElementById('noticeText').textContent = text;
    button.hidden = !actionLabel;
    if (actionLabel) {
      button.textContent = actionLabel;
    }
    notice.classList.add('visible');
  }

  hideNotice() {
    document.getElementById('notice').classList.remove('visible');
  }

  render() {
    const s = this.status;
    if (!s) {
      return;
    }
    this.hideNotice();

    this.setSwitch('globalSwitch', s.globalEnabled);
    document.getElementById('globalSub').textContent = s.globalEnabled
      ? 'On everywhere'
      : 'Off everywhere';

    this.setSwitch('siteSwitch', s.siteEnabled);
    const siteSub = document.getElementById('siteSub');
    if (!s.siteEnabled) {
      siteSub.textContent = 'Disabled on this site';
    } else if (s.sitePaused) {
      siteSub.textContent = 'Showing original prices until you rescan';
    } else if (s.globalEnabled) {
      siteSub.textContent = 'Active on this site';
    } else {
      siteSub.textContent = 'Extension is off';
    }

    const badge = document.getElementById('shopBadge');
    if (s.isShoppingSite) {
      badge.textContent = s.shoppingSiteName || 'Shop';
      badge.style.display = 'inline-block';
    } else {
      badge.style.display = 'none';
    }

    document.getElementById('priceCount').textContent = s.processedCount || 0;

    const highlight = s.displayMode !== 'replace';
    this.setRadio('modeHighlight', highlight);
    this.setRadio('modeReplace', !highlight);
    document.getElementById('modeHint').textContent = highlight
      ? 'Highlights the real price; hover it to see the listed one.'
      : 'Silently swaps listed prices for the real ones.';

    document.getElementById('restoreBtn').disabled = !s.enabled || !(s.processedCount > 0);
    this.renderChanges(s.changes || []);
  }

  setSwitch(id, on) {
    const el = document.getElementById(id);
    el.classList.toggle('on', !!on);
    el.setAttribute('aria-checked', on ? 'true' : 'false');
  }

  setRadio(id, on) {
    const el = document.getElementById(id);
    el.classList.toggle('active', !!on);
    el.setAttribute('aria-checked', on ? 'true' : 'false');
  }

  renderChanges(changes) {
    const section = document.getElementById('changesSection');
    const list = document.getElementById('changesList');
    list.textContent = '';

    if (changes.length === 0) {
      section.style.display = 'none';
      return;
    }
    section.style.display = 'block';

    // Collapse duplicates (the same price appears many times in a listing)
    const counts = new Map();
    for (const change of changes) {
      const key = `${change.original}→${change.rounded}`;
      const entry = counts.get(key) || { ...change, count: 0 };
      entry.count++;
      counts.set(key, entry);
    }

    for (const change of counts.values()) {
      const item = document.createElement('div');
      item.className = 'change-item';
      const original = document.createElement('span');
      original.className = 'original';
      original.textContent = change.original;
      const arrow = document.createElement('span');
      arrow.className = 'arrow';
      arrow.textContent = '→';
      const next = document.createElement('span');
      next.className = 'new';
      next.textContent = change.rounded;
      const diff = document.createElement('span');
      diff.className = 'diff';
      diff.textContent = (change.count > 1 ? `×${change.count} · ` : '') + `+${change.difference}`;
      item.append(original, arrow, next, diff);
      list.appendChild(item);
    }
  }

  setLoading(loading) {
    document.body.classList.toggle('loading', loading);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  new PopupController();
});
