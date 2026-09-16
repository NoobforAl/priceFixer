/**
 * Full-page settings for Price Fixer (options.html).
 *
 * Everything here reads and writes extension storage directly: the content
 * script in every open tab listens to `storage.onChanged` and re-applies the
 * settings, so no tab messaging is needed. `api` and `normalizeDomain` come
 * from ui-common.js.
 */

const SYNC_KEYS = [
  'globalEnabled',
  'displayMode',
  'siteSettings',
  'customRules',
  'blockedSites',
  'pauseOnPayment',
];

class OptionsController {
  constructor() {
    this.settings = {};
    /** Draft per-site selector text keyed by domain (unsaved edits). */
    this.siteSelectors = {};
    this.currentRuleSite = '';
    this.rulesDirty = false;
    this.toastTimer = null;
    this.init();
  }

  async init() {
    this.bindEvents();
    this.showVersion();
    await this.load();
    this.render();
    this.renderStats();
    this.listenForChanges();
  }

  bindEvents() {
    const on = (id, handler) => document.getElementById(id).addEventListener('click', handler);
    const onEnter = (id, handler) =>
      document.getElementById(id).addEventListener('keydown', e => {
        if (e.key === 'Enter') {
          e.preventDefault();
          handler();
        }
      });

    on('globalSwitch', () => this.save({ globalEnabled: this.settings.globalEnabled === false }));
    on('modeHighlight', () => this.save({ displayMode: 'highlight' }));
    on('modeReplace', () => this.save({ displayMode: 'replace' }));
    on('paymentSwitch', () =>
      this.save({ pauseOnPayment: this.settings.pauseOnPayment === false })
    );

    on('blockAddBtn', () => this.addBlockedFromInput());
    onEnter('blockInput', () => this.addBlockedFromInput());
    on('siteAddBtn', () => this.addSiteFromInput());
    onEnter('siteInput', () => this.addSiteFromInput());

    on('ruleSiteAddBtn', () => this.addRuleSiteFromInput());
    onEnter('ruleSiteInput', () => this.addRuleSiteFromInput());
    document.getElementById('ruleSiteSelect').addEventListener('change', e => {
      this.selectRuleSite(e.target.value);
    });
    for (const id of ['ruleSelectorsAll', 'ruleSelectors', 'ruleExclude', 'ruleExtra']) {
      document.getElementById(id).addEventListener('input', () => this.markRulesDirty(true));
    }
    on('rulesSave', () => this.saveRules());

    on('resetStatsBtn', () => this.resetStats());
    on('resetAllBtn', () => this.resetAll());
  }

  showVersion() {
    try {
      const { name, version } = api.runtime.getManifest();
      document.getElementById('footer').textContent = `${name} ${version}`;
    } catch {
      // keep the static footer
    }
  }

  // ─── Storage ────────────────────────────────────────────────────────

  async load() {
    try {
      this.settings = (await api.storage.sync.get(SYNC_KEYS)) || {};
    } catch {
      this.settings = {};
    }
    this.siteSelectors = { ...this.rules().excludeSelectors };
    delete this.siteSelectors['*'];
    for (const domain of Object.keys(this.siteSelectors)) {
      this.siteSelectors[domain] = this.siteSelectors[domain].join('\n');
    }
    if (!(this.currentRuleSite in this.siteSelectors)) {
      this.currentRuleSite = Object.keys(this.siteSelectors).sort()[0] || '';
    }
  }

  /** Persist `values` to sync storage and reflect them in the UI. */
  async save(values) {
    Object.assign(this.settings, values);
    this.render();
    try {
      await api.storage.sync.set(values);
      this.toast('Saved');
    } catch {
      this.toast('Could not save — storage unavailable');
    }
  }

  listenForChanges() {
    if (!api.storage || !api.storage.onChanged) {
      return;
    }
    api.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && changes.stats) {
        this.renderStats();
        return;
      }
      if (area !== 'sync') {
        return;
      }
      let touched = false;
      for (const key of SYNC_KEYS) {
        if (key in changes) {
          this.settings[key] = changes[key].newValue;
          touched = true;
        }
      }
      if (!touched) {
        return;
      }
      if (changes.customRules && !this.rulesDirty) {
        // Another page changed the rules and we have no unsaved edits: reload the drafts
        this.load().then(() => this.render());
        return;
      }
      this.render();
    });
  }

  // ─── Derived state ──────────────────────────────────────────────────

  blockedSites() {
    const list = this.settings.blockedSites;
    return Array.isArray(list) ? list.filter(d => typeof d === 'string') : [];
  }

  siteSettings() {
    const s = this.settings.siteSettings;
    return s && typeof s === 'object' ? s : {};
  }

  rules() {
    const r = this.settings.customRules || {};
    const selectors = {};
    for (const [domain, list] of Object.entries(r.excludeSelectors || {})) {
      if (Array.isArray(list)) {
        selectors[domain] = list.filter(s => typeof s === 'string');
      }
    }
    return {
      excludeSelectors: selectors,
      excludePatterns: Array.isArray(r.excludePatterns) ? r.excludePatterns : [],
      extraPatterns: Array.isArray(r.extraPatterns) ? r.extraPatterns : [],
    };
  }

  // ─── Blocked sites ──────────────────────────────────────────────────

  addBlockedFromInput() {
    const input = document.getElementById('blockInput');
    const domain = normalizeDomain(input.value);
    if (!domain) {
      input.focus();
      return;
    }
    input.value = '';
    this.setBlocked(domain, true);
  }

  setBlocked(domain, blocked) {
    const list = this.blockedSites().filter(d => d !== domain);
    if (blocked) {
      list.push(domain);
    }
    return this.save({ blockedSites: list });
  }

  renderBlockedSites() {
    const list = this.blockedSites();
    const container = document.getElementById('blockList');
    container.textContent = '';
    document.getElementById('blockEmpty').hidden = list.length > 0;
    for (const domain of [...list].sort()) {
      const remove = this.linkButton('Remove', `Unblock ${domain}`, () =>
        this.setBlocked(domain, false)
      );
      container.appendChild(this.listItem(domain, [remove]));
    }
  }

  // ─── Per-site settings ──────────────────────────────────────────────

  addSiteFromInput() {
    const input = document.getElementById('siteInput');
    const domain = normalizeDomain(input.value);
    if (!domain) {
      input.focus();
      return;
    }
    input.value = '';
    this.setSiteEnabled(domain, false);
  }

  setSiteEnabled(domain, enabled) {
    const siteSettings = { ...this.siteSettings() };
    siteSettings[domain] = { ...(siteSettings[domain] || {}), enabled };
    return this.save({ siteSettings });
  }

  removeSite(domain) {
    const siteSettings = { ...this.siteSettings() };
    delete siteSettings[domain];
    return this.save({ siteSettings });
  }

  renderSites() {
    const sites = this.siteSettings();
    const domains = Object.keys(sites).sort();
    const container = document.getElementById('siteList');
    container.textContent = '';
    document.getElementById('siteEmpty').hidden = domains.length > 0;
    for (const domain of domains) {
      const enabled = !sites[domain] || sites[domain].enabled !== false;
      const state = document.createElement('span');
      state.className = 'state';
      state.textContent = enabled ? 'On' : 'Off';
      const toggle = document.createElement('button');
      toggle.className = `switch${enabled ? ' on' : ''}`;
      toggle.setAttribute('role', 'switch');
      toggle.setAttribute('aria-checked', String(enabled));
      toggle.setAttribute('aria-label', `Enable on ${domain}`);
      toggle.addEventListener('click', () => this.setSiteEnabled(domain, !enabled));
      const remove = this.linkButton('Remove', `Remove settings for ${domain}`, () =>
        this.removeSite(domain)
      );
      container.appendChild(this.listItem(domain, [state, toggle, remove]));
    }
  }

  // ─── Rules ──────────────────────────────────────────────────────────

  markRulesDirty(dirty) {
    this.rulesDirty = dirty;
    document.getElementById('rulesDirty').hidden = !dirty;
  }

  /** Keep the textarea for the selected site in the draft map. */
  stashCurrentSiteSelectors() {
    if (this.currentRuleSite) {
      this.siteSelectors[this.currentRuleSite] = document.getElementById('ruleSelectors').value;
    }
  }

  selectRuleSite(domain) {
    this.stashCurrentSiteSelectors();
    this.currentRuleSite = domain;
    this.renderRuleSitePicker();
  }

  addRuleSiteFromInput() {
    const input = document.getElementById('ruleSiteInput');
    const domain = normalizeDomain(input.value);
    if (!domain) {
      input.focus();
      return;
    }
    input.value = '';
    this.stashCurrentSiteSelectors();
    if (!(domain in this.siteSelectors)) {
      this.siteSelectors[domain] = '';
    }
    this.currentRuleSite = domain;
    this.renderRuleSitePicker();
    document.getElementById('ruleSelectors').focus();
  }

  renderRuleSitePicker() {
    const select = document.getElementById('ruleSiteSelect');
    const textarea = document.getElementById('ruleSelectors');
    select.textContent = '';
    const domains = Object.keys(this.siteSelectors).sort();
    if (domains.length === 0) {
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = 'No site yet — add one';
      select.appendChild(opt);
    }
    for (const domain of domains) {
      const opt = document.createElement('option');
      opt.value = domain;
      opt.textContent = domain;
      select.appendChild(opt);
    }
    select.value = this.currentRuleSite;
    select.disabled = domains.length === 0;
    textarea.disabled = !this.currentRuleSite;
    textarea.value = this.currentRuleSite ? this.siteSelectors[this.currentRuleSite] || '' : '';
  }

  renderRules() {
    const rules = this.rules();
    document.getElementById('ruleSelectorsAll').value = (rules.excludeSelectors['*'] || []).join(
      '\n'
    );
    document.getElementById('ruleExclude').value = rules.excludePatterns.join('\n');
    document.getElementById('ruleExtra').value = rules.extraPatterns.join('\n');
    this.renderRuleSitePicker();
    this.markRulesDirty(false);
  }

  /** Same checks as customRules.ts, so problems show up before the page is left. */
  validateRules(rules) {
    const errors = [];
    const checkSelector = selector => {
      try {
        document.querySelector(selector);
      } catch {
        errors.push(`${selector}: invalid selector`);
      }
    };
    const checkRegex = (source, flags) => {
      try {
        new RegExp(source, flags);
      } catch (e) {
        errors.push(`${source}: ${e.message}`);
      }
    };
    for (const list of Object.values(rules.excludeSelectors)) {
      list.forEach(checkSelector);
    }
    rules.excludePatterns.forEach(p => checkRegex(p, 'iu'));
    for (const source of rules.extraPatterns) {
      if (!source.includes('(?<amount>')) {
        errors.push(`${source}: needs an (?<amount>…) group`);
      } else {
        checkRegex(source, 'giu');
      }
    }
    return errors;
  }

  async saveRules() {
    const lines = text =>
      String(text)
        .split('\n')
        .map(l => l.trim())
        .filter(Boolean);
    this.stashCurrentSiteSelectors();

    const excludeSelectors = {};
    const allLines = lines(document.getElementById('ruleSelectorsAll').value);
    if (allLines.length) {
      excludeSelectors['*'] = allLines;
    }
    for (const [domain, text] of Object.entries(this.siteSelectors)) {
      const siteLines = lines(text);
      if (siteLines.length) {
        excludeSelectors[domain] = siteLines;
      }
    }
    const customRules = {
      excludeSelectors,
      excludePatterns: lines(document.getElementById('ruleExclude').value),
      extraPatterns: lines(document.getElementById('ruleExtra').value),
    };

    const errors = this.validateRules(customRules);
    document.getElementById('rulesErrors').textContent = errors.length
      ? `Ignored (invalid):\n${errors.join('\n')}`
      : '';

    this.settings.customRules = customRules;
    try {
      await api.storage.sync.set({ customRules });
      this.markRulesDirty(false);
      this.toast(errors.length ? 'Saved (some entries ignored)' : 'Rules saved');
    } catch {
      this.toast('Could not save — storage unavailable');
    }
  }

  // ─── Stats / reset ──────────────────────────────────────────────────

  async renderStats() {
    let stats = {};
    try {
      stats = (await api.storage.local.get(['stats'])).stats || {};
    } catch {
      // Stats not available
    }
    document.getElementById('totalRounded').textContent = stats.totalPricesRounded || 0;
    document.getElementById('hiddenAmount').textContent = (stats.totalHiddenAmount || 0).toFixed(2);
  }

  async resetStats() {
    try {
      await api.storage.local.remove(['stats']);
      this.toast('Statistics reset');
    } catch {
      this.toast('Could not reset statistics');
    }
    this.renderStats();
  }

  async resetAll() {
    if (!window.confirm('Reset every Price Fixer setting to its default?')) {
      return;
    }
    try {
      await api.storage.sync.remove(SYNC_KEYS);
      this.toast('Settings reset');
    } catch {
      this.toast('Could not reset settings');
    }
    this.currentRuleSite = '';
    await this.load();
    this.render();
  }

  // ─── Rendering ──────────────────────────────────────────────────────

  render() {
    const s = this.settings;
    const globalEnabled = s.globalEnabled !== false;
    this.setSwitch('globalSwitch', globalEnabled);
    document.getElementById('globalSub').textContent = globalEnabled
      ? 'On everywhere'
      : 'Off everywhere';

    const highlight = s.displayMode !== 'replace';
    this.setRadio('modeHighlight', highlight);
    this.setRadio('modeReplace', !highlight);
    document.getElementById('modeHint').textContent = highlight
      ? 'Highlights the real price; hover it to see the listed one.'
      : 'Silently swaps listed prices for the real ones.';

    this.setSwitch('paymentSwitch', s.pauseOnPayment !== false);
    this.renderBlockedSites();
    this.renderSites();
    if (!this.rulesDirty) {
      this.renderRules();
    }
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

  listItem(domain, controls) {
    const item = document.createElement('div');
    item.className = 'list-item';
    const name = document.createElement('span');
    name.className = 'domain';
    name.textContent = domain;
    item.append(name, ...controls);
    return item;
  }

  linkButton(label, ariaLabel, handler) {
    const button = document.createElement('button');
    button.className = 'link-btn';
    button.textContent = label;
    button.setAttribute('aria-label', ariaLabel);
    button.addEventListener('click', handler);
    return button;
  }

  toast(text) {
    const el = document.getElementById('toast');
    el.textContent = text;
    el.classList.add('visible');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => el.classList.remove('visible'), 1600);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  new OptionsController();
});
