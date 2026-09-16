/**
 * Price Fixer page engine: finds prices, rewrites them reversibly, and keeps
 * a per-page record of every change so they can be restored exactly.
 * Bootstrapped by content.ts.
 */

import { PricePatterns, PriceMatch } from './pricePatterns';
import { isKnownShoppingSite, isShopifyStore, getShoppingSiteName } from './shopping-sites';
import { getSitePattern, getPriceElements, SitePattern } from './site-patterns';
import { CompiledRules, compileRules, normalizeRules } from './customRules';

type DisplayMode = 'replace' | 'highlight';

/**
 * One reversible DOM change. `inserted` are the nodes we put into the page,
 * `originals` are the nodes they replaced. Restoring puts `originals` back in
 * front of the first still-connected inserted node and removes `inserted`.
 */
/** Where an original node lived, so it can go back to exactly that spot. */
interface Placement {
  node: Node;
  parent: Node;
  next: Node | null;
}

interface ProcessedRecord {
  originals: Placement[];
  inserted: Node[];
  /** Element whose children were swapped as a unit (split prices). */
  unitElement?: Element;
  /** Replace mode on a plain text node: no node swap, just text. */
  textNode?: Text;
  originalText?: string;
}

interface PriceChange {
  original: string;
  rounded: string;
  difference: string;
}

interface SiteSettings {
  enabled: boolean;
  mode?: DisplayMode;
}

interface GlobalStats {
  totalPricesFound: number;
  totalPricesRounded: number;
  totalHiddenAmount: number;
  siteStats: Record<string, { count: number; hiddenAmount: number }>;
}

const HIGHLIGHT_CLASS = 'pf-highlight';
const UNIT_ATTR = 'data-pf-unit';
const TOOLTIP_ID = 'pf-tooltip';

// Elements whose text must never be touched
const SKIP_TAGS = new Set([
  'script',
  'style',
  'noscript',
  'template',
  'textarea',
  'input',
  'select',
  'option',
  'optgroup',
  'svg',
  'math',
  'code',
  'pre',
  'kbd',
  'samp',
  'var',
  'iframe',
  'object',
  'embed',
  'canvas',
  'video',
  'audio',
  'head',
  'title',
]);

// A "compact" element is small enough to be a single price split over
// several child elements ("<span>$</span><span>5</span><sup>99</sup>").
const COMPACT_TEXT_LIMIT = 40;

/** A text node and the part of it [from, to) covered by a price match. */
interface CoveredNode {
  node: Text;
  from: number;
  to: number;
}

function getApi(): typeof chrome | null {
  if (typeof chrome !== 'undefined' && chrome.storage) {
    return chrome;
  }
  if (typeof browser !== 'undefined' && browser.storage) {
    return browser;
  }
  return null;
}

export class PriceFixerContent {
  private records: ProcessedRecord[] = [];
  private observer: MutationObserver | null = null;
  private globalEnabled = true;
  private siteEnabled = true;
  /** User pressed Restore on this site: stay hands-off for the rest of the browser session. */
  private sitePaused = false;
  private isProcessing = false;
  private displayMode: DisplayMode = 'highlight';
  private priceChanges: PriceChange[] = [];
  private pricesRounded = 0;
  private currentDomain = '';
  private stylesInjected = false;
  private tooltipBound = false;
  private isShoppingSite = false;
  private shoppingSiteName: string | null = null;
  private sitePattern: SitePattern | null = null;
  private touchedNodes = new WeakSet<Node>();
  private rules: CompiledRules = {
    excludeSelector: null,
    excludePatterns: [],
    extraPatterns: [],
    errors: [],
  };

  constructor() {
    this.currentDomain = window.location.hostname.replace(/^www\./, '');
    this.init();
  }

  private get isEnabled(): boolean {
    return this.globalEnabled && this.siteEnabled && !this.sitePaused;
  }

  private async init(): Promise<void> {
    this.detectShoppingSite();
    await this.loadSettings();

    if (this.isEnabled) {
      this.processPage(true);
    }

    this.setupMutationObserver();
    this.setupMessageListener();
    this.setupStorageListener();
  }

  private detectShoppingSite(): void {
    const hostname = window.location.hostname;
    this.isShoppingSite = isKnownShoppingSite(hostname) || isShopifyStore();
    this.shoppingSiteName = getShoppingSiteName(hostname);
    this.sitePattern = getSitePattern(hostname);
    if (!this.shoppingSiteName && isShopifyStore()) {
      this.shoppingSiteName = 'Shopify Store';
      this.isShoppingSite = true;
    }
  }

  // ─── Settings & stats ───────────────────────────────────────────────

  private async loadSettings(): Promise<void> {
    try {
      const api = getApi();
      if (!api) {
        return;
      }
      const result = await api.storage.sync.get([
        'globalEnabled',
        'displayMode',
        'siteSettings',
        'customRules',
      ]);
      this.applySettings(result);
      this.applyRules(result.customRules);
      this.sitePaused = await this.loadSitePaused();
    } catch {
      // Storage not available — use defaults
    }
  }

  private applySettings(result: Record<string, unknown>): void {
    this.globalEnabled = result.globalEnabled !== false;
    if (result.displayMode === 'replace' || result.displayMode === 'highlight') {
      this.displayMode = result.displayMode;
    }
    const siteSettings = result.siteSettings as Record<string, SiteSettings> | undefined;
    const site = siteSettings?.[this.currentDomain];
    this.siteEnabled = site ? site.enabled !== false : true;
    if (site?.mode) {
      this.displayMode = site.mode;
    }
  }

  public applyRules(raw: unknown): void {
    this.rules = compileRules(normalizeRules(raw), this.currentDomain);
    PricePatterns.setExtraPatterns(this.rules.extraPatterns);
  }

  private setupStorageListener(): void {
    const api = getApi();
    if (!api?.storage?.onChanged) {
      return;
    }
    api.storage.onChanged.addListener((changes, area) => {
      if (area !== 'sync') {
        return;
      }
      if (changes.customRules) {
        this.applyRules(changes.customRules.newValue);
        if (this.isEnabled) {
          this.reprocessPage();
        }
      }
      const wasEnabled = this.isEnabled;
      const oldMode = this.displayMode;
      const merged: Record<string, unknown> = {
        globalEnabled: this.globalEnabled,
        displayMode: this.displayMode,
        siteSettings: { [this.currentDomain]: { enabled: this.siteEnabled } },
      };
      for (const key of Object.keys(changes)) {
        merged[key] = changes[key].newValue;
      }
      this.applySettings(merged);

      if (this.isEnabled !== wasEnabled || this.displayMode !== oldMode) {
        if (this.isEnabled) {
          this.reprocessPage();
        } else {
          this.restoreOriginal();
        }
      }
    });
  }

  // ─── Per-site session pause ─────────────────────────────────────────
  // Kept in storage.session (cleared when the browser closes) so that after
  // the user restores original prices on a site, every page of that site
  // stays untouched until they rescan or re-enable it.

  private async loadSitePaused(): Promise<boolean> {
    try {
      const session = getApi()?.storage?.session;
      if (!session) {
        return false;
      }
      const result = await session.get(['pausedSites']);
      const paused = (result.pausedSites || {}) as Record<string, boolean>;
      return paused[this.currentDomain] === true;
    } catch {
      return false;
    }
  }

  private async saveSitePaused(paused: boolean): Promise<void> {
    try {
      const session = getApi()?.storage?.session;
      if (!session) {
        return;
      }
      const result = await session.get(['pausedSites']);
      const pausedSites = (result.pausedSites || {}) as Record<string, boolean>;
      if (paused) {
        pausedSites[this.currentDomain] = true;
      } else {
        delete pausedSites[this.currentDomain];
      }
      await session.set({ pausedSites });
    } catch {
      // Session storage not available
    }
  }

  private setSitePaused(paused: boolean): void {
    this.sitePaused = paused;
    this.saveSitePaused(paused);
  }

  private async saveSetting(values: Record<string, unknown>): Promise<void> {
    try {
      await getApi()?.storage.sync.set(values);
    } catch {
      // Storage not available
    }
  }

  private async saveSiteSetting(enabled: boolean): Promise<void> {
    try {
      const api = getApi();
      if (!api) {
        return;
      }
      const result = await api.storage.sync.get(['siteSettings']);
      const siteSettings = (result.siteSettings || {}) as Record<string, SiteSettings>;
      siteSettings[this.currentDomain] = { enabled };
      await api.storage.sync.set({ siteSettings });
    } catch {
      // Storage not available
    }
  }

  private async saveStats(changes: PriceChange[]): Promise<void> {
    if (changes.length === 0) {
      return;
    }
    try {
      const api = getApi();
      if (!api) {
        return;
      }
      const result = await api.storage.local.get(['stats']);
      const stats: GlobalStats = {
        ...this.emptyStats(),
        ...(result.stats as Partial<GlobalStats>),
      };

      let hidden = 0;
      for (const change of changes) {
        const diff = parseFloat(change.difference);
        if (!isNaN(diff)) {
          hidden += diff;
        }
      }
      hidden = Math.round(hidden * 100) / 100;

      stats.totalPricesFound += changes.length;
      stats.totalPricesRounded += changes.length;
      stats.totalHiddenAmount = Math.round((stats.totalHiddenAmount + hidden) * 100) / 100;

      const site = stats.siteStats[this.currentDomain] || { count: 0, hiddenAmount: 0 };
      site.count += changes.length;
      site.hiddenAmount = Math.round((site.hiddenAmount + hidden) * 100) / 100;
      stats.siteStats[this.currentDomain] = site;

      await api.storage.local.set({ stats });
    } catch {
      // Storage not available
    }
  }

  private async getStats(): Promise<GlobalStats> {
    try {
      const api = getApi();
      if (!api) {
        return this.emptyStats();
      }
      const result = await api.storage.local.get(['stats']);
      return { ...this.emptyStats(), ...(result.stats as Partial<GlobalStats>) };
    } catch {
      return this.emptyStats();
    }
  }

  private emptyStats(): GlobalStats {
    return { totalPricesFound: 0, totalPricesRounded: 0, totalHiddenAmount: 0, siteStats: {} };
  }

  // ─── Styles & tooltip ───────────────────────────────────────────────

  private injectStyles(): void {
    if (this.stylesInjected) {
      return;
    }
    this.stylesInjected = true;

    // Every declaration is !important so the host page's CSS for
    // ".price span" etc. cannot restyle our markup.
    const css = `
      .${HIGHLIGHT_CLASS} {
        all: unset !important;
        display: inline !important;
        font: inherit !important;
        color: inherit !important;
        white-space: nowrap !important;
        background: rgba(74, 222, 128, 0.2) !important;
        box-shadow: inset 0 -2px 0 rgba(22, 163, 74, 0.8) !important;
        border-radius: 3px !important;
        padding: 0 0.15em !important;
        cursor: help !important;
      }
      .${HIGHLIGHT_CLASS}:hover {
        background: rgba(74, 222, 128, 0.35) !important;
      }
      #${TOOLTIP_ID} {
        all: unset !important;
        position: fixed !important;
        z-index: 2147483647 !important;
        box-sizing: border-box !important;
        max-width: 280px !important;
        padding: 8px 10px !important;
        border-radius: 6px !important;
        background: #1a1a2e !important;
        color: #e8e8f0 !important;
        font: 12px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
        box-shadow: 0 4px 14px rgba(0, 0, 0, 0.35) !important;
        pointer-events: none !important;
        white-space: normal !important;
      }
      #${TOOLTIP_ID} b { font-weight: 700 !important; color: #86efac !important; }
    `;

    try {
      const sheet = new CSSStyleSheet();
      sheet.replaceSync(css);
      document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
      return;
    } catch {
      // Constructable stylesheets unsupported — fall back to a <style> element
    }
    const style = document.createElement('style');
    style.textContent = css;
    (document.head || document.documentElement).appendChild(style);
  }

  private bindTooltip(): void {
    if (this.tooltipBound) {
      return;
    }
    this.tooltipBound = true;

    document.addEventListener('mouseover', event => {
      const target = event.target as Element | null;
      const wrapper = target?.closest?.(`.${HIGHLIGHT_CLASS}`) as HTMLElement | null;
      if (wrapper) {
        this.showTooltip(wrapper);
      }
    });
    document.addEventListener('mouseout', event => {
      const target = event.target as Element | null;
      if (target?.closest?.(`.${HIGHLIGHT_CLASS}`)) {
        this.hideTooltip();
      }
    });
    document.addEventListener('scroll', () => this.hideTooltip(), { passive: true, capture: true });
  }

  private getTooltip(): HTMLElement {
    let tip = document.getElementById(TOOLTIP_ID);
    if (!tip || !tip.isConnected) {
      tip = document.createElement('div');
      tip.id = TOOLTIP_ID;
      tip.setAttribute('role', 'tooltip');
      tip.setAttribute('data-pf-skip', '');
      (document.body || document.documentElement).appendChild(tip);
    }
    return tip;
  }

  private showTooltip(wrapper: HTMLElement): void {
    const original = wrapper.getAttribute('data-pf-original') || '';
    const rounded = wrapper.textContent || '';
    const diff = wrapper.getAttribute('data-pf-diff') || '';

    const tip = this.getTooltip();
    tip.textContent = '';
    const line1 = document.createElement('div');
    line1.append('Listed as ');
    const b = document.createElement('b');
    b.textContent = original;
    line1.append(b);
    const line2 = document.createElement('div');
    line2.style.setProperty('opacity', '0.75', 'important');
    line2.textContent = `Only ${diff} less than ${rounded} — charm pricing.`;
    tip.append(line1, line2);

    const rect = wrapper.getBoundingClientRect();
    tip.style.setProperty('visibility', 'hidden', 'important');
    tip.style.setProperty('display', 'block', 'important');
    const tipRect = tip.getBoundingClientRect();

    let top = rect.top - tipRect.height - 8;
    if (top < 4) {
      top = rect.bottom + 8;
    }
    let left = rect.left + rect.width / 2 - tipRect.width / 2;
    left = Math.max(4, Math.min(left, window.innerWidth - tipRect.width - 4));

    tip.style.setProperty('top', `${top}px`, 'important');
    tip.style.setProperty('left', `${left}px`, 'important');
    tip.style.setProperty('visibility', 'visible', 'important');
  }

  private hideTooltip(): void {
    const tip = document.getElementById(TOOLTIP_ID);
    if (tip) {
      tip.style.setProperty('display', 'none', 'important');
    }
  }

  // ─── Scanning ───────────────────────────────────────────────────────

  private processPage(recordStats = false): void {
    if (!this.isEnabled || this.isProcessing) {
      return;
    }

    this.isProcessing = true;
    this.priceChanges = [];
    this.pricesRounded = 0;

    if (this.displayMode === 'highlight') {
      this.injectStyles();
      this.bindTooltip();
    }

    try {
      // On known shopping sites, scan targeted price elements first
      if (this.sitePattern) {
        for (const el of getPriceElements(this.sitePattern)) {
          this.scan(el);
        }
      }

      // Always do a full-page scan to catch prices outside known selectors
      if (document.body) {
        this.scan(document.body);
      }

      if (recordStats) {
        this.saveStats(this.priceChanges);
      }
    } finally {
      this.observer?.takeRecords();
      this.isProcessing = false;
    }
  }

  private isOurs(node: Node): boolean {
    const el = node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement;
    return !!el?.closest?.(`.${HIGHLIGHT_CLASS}, [${UNIT_ATTR}], [data-pf-skip]`);
  }

  private shouldSkipElement(el: Element): boolean {
    if (SKIP_TAGS.has(el.tagName.toLowerCase())) {
      return true;
    }
    if (this.rules.excludeSelector && el.matches(this.rules.excludeSelector)) {
      return true;
    }
    if (el.classList.contains(HIGHLIGHT_CLASS) || el.hasAttribute(UNIT_ATTR)) {
      return true;
    }
    if (el.hasAttribute('data-pf-skip')) {
      return true;
    }
    if ((el as HTMLElement).isContentEditable) {
      return true;
    }
    const editable = el.closest('[contenteditable]');
    if (editable && editable.getAttribute('contenteditable') !== 'false') {
      return true;
    }
    return false;
  }

  /** Walk a subtree, processing text nodes and split prices. */
  private scan(node: Node): void {
    if (node.nodeType === Node.TEXT_NODE) {
      this.processTextNode(node as Text);
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE && node.nodeType !== Node.DOCUMENT_FRAGMENT_NODE) {
      return;
    }
    const el = node as Element;
    if (node.nodeType === Node.ELEMENT_NODE && this.shouldSkipElement(el)) {
      return;
    }
    if (node.nodeType === Node.ELEMENT_NODE && this.isCompactCandidate(el)) {
      this.processCompactElement(el);
      return;
    }
    for (const child of Array.from(node.childNodes)) {
      this.scan(child);
    }
  }

  private isCompactCandidate(el: Element): boolean {
    if (el.childElementCount === 0) {
      return false;
    }
    const text = this.boundedText(el, COMPACT_TEXT_LIMIT);
    if (text === null) {
      return false;
    }
    return PricePatterns.mayContainPrice(text) || this.isIconPrice(el, text);
  }

  /**
   * Iranian shops (Digikala, Torob, Snapp...) render the currency as an SVG
   * icon: "<span>۹۸۵,۰۰۰</span><svg class="toman"/>". A bare grouped number
   * next to an icon is a price on those pages.
   */
  private isIconPrice(el: Element, text: string): boolean {
    return PricePatterns.isIconAmount(text, this.isRtlPage()) && !!el.querySelector('svg, img');
  }

  private isRtlPage(): boolean {
    const lang = (document.documentElement.lang || '').toLowerCase();
    return lang.startsWith('fa') || lang.startsWith('ar') || document.documentElement.dir === 'rtl';
  }

  /** Text of an element, or null as soon as it exceeds `limit` characters. */
  private boundedText(el: Element, limit: number): string | null {
    let text = '';
    const walk = (node: Node): boolean => {
      if (node.nodeType === Node.TEXT_NODE) {
        text += node.textContent || '';
        return text.length <= limit;
      }
      if (node.nodeType === Node.ELEMENT_NODE && this.shouldSkipElement(node as Element)) {
        return true;
      }
      for (const child of Array.from(node.childNodes)) {
        if (!walk(child)) {
          return false;
        }
      }
      return true;
    };
    return walk(el) ? text : null;
  }

  private collectTextNodes(el: Element): Text[] {
    const nodes: Text[] = [];
    const walk = (node: Node): void => {
      if (node.nodeType === Node.TEXT_NODE) {
        nodes.push(node as Text);
      } else if (node.nodeType === Node.ELEMENT_NODE && !this.shouldSkipElement(node as Element)) {
        for (const child of Array.from(node.childNodes)) {
          walk(child);
        }
      }
    };
    walk(el);
    return nodes;
  }

  /**
   * Handle an element small enough to hold a single price that may be split
   * across child elements. Prices contained in one text node are processed
   * normally; prices spanning several nodes are replaced as a unit.
   */
  /**
   * Screen-reader-only text (Amazon's `.a-offscreen`, Bootstrap `.sr-only`,
   * ...) sits next to the visible price and must not be merged with it.
   */
  private isVisuallyHidden(node: Text): boolean {
    const el = node.parentElement;
    if (!el) {
      return false;
    }
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
      return true;
    }
    if (style.position === 'absolute' && style.clip && style.clip !== 'auto') {
      return true;
    }
    if (style.clipPath && style.clipPath !== 'none') {
      return true;
    }
    const rect = el.getBoundingClientRect();
    if (rect.width > 0 && rect.width <= 1 && rect.height <= 1) {
      return true;
    }
    return rect.right < 0 || rect.bottom < 0;
  }

  private processCompactElement(el: Element): void {
    const all = this.collectTextNodes(el);
    if (all.length === 0) {
      return;
    }

    const hidden = all.filter(n => this.isVisuallyHidden(n));
    const nodes = all.filter(n => !hidden.includes(n));
    for (const node of hidden) {
      this.processTextNode(node);
    }
    if (nodes.length === 0) {
      return;
    }

    // Build the combined text with a map back to the nodes.
    // Nodes that look like pieces of one number ("$", "5", ".", "99") are
    // glued together; anything else ("Now", "57.8 ¢/ea") is kept apart by a
    // space so neighbouring prices and unit prices cannot fuse.
    const isFragment = (t: string): boolean =>
      /^\s*(?:[\d۰-۹٠-٩.,٬٫]+|[$€£¥￥₹₽₩₺₦₡₪₫₴₸₲₱₵₼₾₿﷼])\s*$/.test(t);
    let combined = '';
    const spans: Array<{ node: Text; start: number; end: number }> = [];
    let prevParent: Node | null = null;
    for (const node of nodes) {
      const data = node.data;
      const newParent = prevParent !== node.parentNode;
      // ".99 today" continues a number started in the previous node
      const continues = /^[.,٫٬][\d۰-۹٠-٩]/.test(data);
      if (
        combined &&
        newParent &&
        !isFragment(data) &&
        !continues &&
        !/\s$/.test(combined) &&
        !/^\s/.test(data)
      ) {
        combined += ' ';
      }
      // "<span>5</span><sup>99</sup>" → superscript cents without a separator
      if (/^\s*[\d۰-۹٠-٩]{2}\s*$/.test(data) && /[\d۰-۹٠-٩]$/.test(combined) && newParent) {
        combined += '.';
      }
      spans.push({ node, start: combined.length, end: combined.length + data.length });
      combined += data;
      prevParent = node.parentNode;
    }

    let matches = PricePatterns.findPrices(combined);
    let synthetic = false;

    // Bare grouped number next to a currency icon (Digikala & co.)
    if (matches.length === 0 && this.isIconPrice(el, combined)) {
      const iconMatch = PricePatterns.iconAmountMatch(combined);
      if (iconMatch) {
        synthetic = true;
        matches = [iconMatch];
      }
    }

    // Visible digits with no currency marker of their own, but a hidden
    // accessible price with the same digits ("$9.99" offscreen + "9.99"
    // visible): treat the visible text as that price.
    if (matches.length === 0 && hidden.length > 0) {
      const hiddenMatches = PricePatterns.findPrices(hidden.map(n => n.data).join(' '));
      const digits = (t: string): string => t.replace(/[^\d۰-۹٠-٩]/g, '');
      if (
        hiddenMatches.length === 1 &&
        digits(combined) === digits(hiddenMatches[0].originalText)
      ) {
        const trimmed = combined.trim();
        const start = combined.indexOf(trimmed);
        synthetic = true;
        matches = [
          {
            ...hiddenMatches[0],
            originalText: trimmed,
            startIndex: start,
            endIndex: start + trimmed.length,
          },
        ];
      }
    }

    for (const match of matches) {
      const covered = spans.filter(s => s.start < match.endIndex && s.end > match.startIndex);
      if (covered.length === 0) {
        continue;
      }
      if (covered.length === 1 && !synthetic) {
        this.processTextNode(covered[0].node);
        continue;
      }
      this.processSplitPrice(
        covered.map(s => ({
          node: s.node,
          from: Math.max(0, match.startIndex - s.start),
          to: Math.min(s.node.data.length, match.endIndex - s.start),
        })),
        match
      );
    }
  }

  /** Replace a price spread over several text nodes as one unit. */
  private processSplitPrice(nodes: CoveredNode[], match: PriceMatch): void {
    const roundedValue = PricePatterns.roundUpPrice(match.value);
    if (roundedValue === match.value) {
      return;
    }
    if (nodes.some(s => this.touchedNodes.has(s.node) || !s.node.isConnected)) {
      return;
    }

    const newPriceText = PricePatterns.formatPrice(roundedValue, match);
    const replacement = (): Node =>
      this.displayMode === 'highlight'
        ? this.createHighlight(match, newPriceText, roundedValue)
        : document.createTextNode(newPriceText);

    const lca = this.commonAncestor(nodes.map(s => s.node));
    const normalize = (s: string): string => s.replace(/[\s.,]/g, '');

    if (lca && normalize(lca.textContent || '') === normalize(match.originalText)) {
      // The element holds nothing but this price: swap its whole content so
      // the new text inherits the element's own styling (Amazon's symbol and
      // fraction spans are styled as superscripts — we must not land there).
      const originals = Array.from(lca.childNodes).map(n => this.placementOf(n));
      const inserted = replacement();
      for (const { node } of originals) {
        lca.removeChild(node);
      }
      lca.appendChild(inserted);
      lca.setAttribute(UNIT_ATTR, '');
      for (const { node } of nodes) {
        this.touchedNodes.add(node);
      }
      this.records.push({ originals, inserted: [inserted], unitElement: lca });
      this.recordChange(match, newPriceText, roundedValue);
      return;
    }

    // Shared container ("<span>Now</span><span>$</span><span>11</span><span>87</span>"):
    // the node carrying the digits hosts the new price, the other covered
    // nodes lose their covered text. Partially covered edge nodes keep the
    // rest of their text.
    const originals: Placement[] = [];
    const inserted: Node[] = [];
    const host = nodes.find(s => /[\d۰-۹٠-٩]/.test(s.node.data.slice(s.from, s.to))) || nodes[0];
    for (const span of nodes) {
      const { node, from, to } = span;
      const parent = node.parentNode;
      if (!parent) {
        continue;
      }
      const pieces: Node[] = [];
      if (from > 0) {
        pieces.push(document.createTextNode(node.data.slice(0, from)));
      }
      if (span === host) {
        pieces.push(replacement());
      }
      if (to < node.data.length) {
        pieces.push(document.createTextNode(node.data.slice(to)));
      }
      originals.push(this.placementOf(node));
      for (const piece of pieces) {
        parent.insertBefore(piece, node);
        inserted.push(piece);
      }
      parent.removeChild(node);
      this.touchedNodes.add(node);
    }
    this.records.push({ originals, inserted });
    this.recordChange(match, newPriceText, roundedValue);
  }

  private placementOf(node: Node): Placement {
    return { node, parent: node.parentNode as Node, next: node.nextSibling };
  }

  private commonAncestor(nodes: Node[]): Element | null {
    let ancestor: Node | null = nodes[0].parentNode;
    while (ancestor) {
      const a = ancestor;
      if (nodes.every(n => a.contains(n))) {
        return a.nodeType === Node.ELEMENT_NODE ? (a as Element) : null;
      }
      ancestor = ancestor.parentNode;
    }
    return null;
  }

  private processTextNode(node: Text): boolean {
    if (this.touchedNodes.has(node) || !node.isConnected) {
      return false;
    }
    const originalText = node.data;
    if (!originalText.trim() || !PricePatterns.mayContainPrice(originalText)) {
      return false;
    }
    if (this.isOurs(node)) {
      return false;
    }

    if (this.rules.excludePatterns.some(re => re.test(originalText))) {
      return false;
    }

    const priceMatches = PricePatterns.findPrices(originalText);
    if (priceMatches.length === 0) {
      return false;
    }

    if (this.displayMode === 'highlight') {
      return this.processHighlightMode(node, originalText, priceMatches);
    }
    return this.processReplaceMode(node, originalText, priceMatches);
  }

  private processReplaceMode(
    node: Text,
    originalText: string,
    priceMatches: PriceMatch[]
  ): boolean {
    let modifiedText = originalText;

    for (const match of [...priceMatches].reverse()) {
      const roundedValue = PricePatterns.roundUpPrice(match.value);
      if (roundedValue === match.value) {
        continue;
      }
      const newPriceText = PricePatterns.formatPrice(roundedValue, match);
      modifiedText =
        modifiedText.substring(0, match.startIndex) +
        newPriceText +
        modifiedText.substring(match.endIndex);
      this.recordChange(match, newPriceText, roundedValue);
    }

    if (modifiedText === originalText) {
      return false;
    }

    this.records.push({ originals: [], inserted: [], textNode: node, originalText });
    this.touchedNodes.add(node);
    node.data = modifiedText;
    return true;
  }

  private processHighlightMode(
    node: Text,
    originalText: string,
    priceMatches: PriceMatch[]
  ): boolean {
    const parent = node.parentNode;
    if (!parent) {
      return false;
    }

    const inserted: Node[] = [];
    let lastIndex = 0;

    for (const match of priceMatches) {
      const roundedValue = PricePatterns.roundUpPrice(match.value);
      if (roundedValue === match.value) {
        continue;
      }
      const newPriceText = PricePatterns.formatPrice(roundedValue, match);

      if (match.startIndex > lastIndex) {
        inserted.push(document.createTextNode(originalText.substring(lastIndex, match.startIndex)));
      }
      inserted.push(this.createHighlight(match, newPriceText, roundedValue));
      this.recordChange(match, newPriceText, roundedValue);
      lastIndex = match.endIndex;
    }

    if (inserted.length === 0) {
      return false;
    }
    if (lastIndex < originalText.length) {
      inserted.push(document.createTextNode(originalText.substring(lastIndex)));
    }

    const placement = this.placementOf(node);
    for (const n of inserted) {
      parent.insertBefore(n, node);
    }
    parent.removeChild(node);
    this.touchedNodes.add(node);

    this.records.push({ originals: [placement], inserted });
    return true;
  }

  /**
   * <span class="pf-highlight" data-pf-original="$5.99">$6</span>
   * Only the honest price is rendered; the listed price is shown in the hover
   * tooltip. textContent is just the honest price, so page scripts that read
   * price text keep working.
   */
  private createHighlight(
    match: PriceMatch,
    newPriceText: string,
    roundedValue: number
  ): HTMLElement {
    const diff = PricePatterns.priceDifference(match.value, roundedValue);
    const wrapper = document.createElement('span');
    wrapper.className = HIGHLIGHT_CLASS;
    wrapper.setAttribute('data-pf-original', match.originalText);
    wrapper.setAttribute('data-pf-diff', PricePatterns.formatPrice(diff, match));
    wrapper.textContent = newPriceText;
    return wrapper;
  }

  private recordChange(match: PriceMatch, newPriceText: string, roundedValue: number): void {
    this.pricesRounded++;
    this.priceChanges.push({
      original: match.originalText,
      rounded: newPriceText,
      difference: PricePatterns.priceDifference(match.value, roundedValue).toFixed(2),
    });
  }

  // ─── Dynamic content ────────────────────────────────────────────────

  private setupMutationObserver(): void {
    this.observer = new MutationObserver(mutations => {
      if (!this.isEnabled || this.isProcessing) {
        return;
      }

      this.isProcessing = true;
      const before = this.priceChanges.length;
      try {
        for (const mutation of mutations) {
          if (mutation.type === 'childList') {
            for (const node of Array.from(mutation.addedNodes)) {
              if (!this.isOurs(node)) {
                this.scan(node);
              }
            }
          } else if (mutation.type === 'characterData') {
            const target = mutation.target;
            if (target.nodeType === Node.TEXT_NODE && !this.isOurs(target)) {
              this.touchedNodes.delete(target);
              this.processTextNode(target as Text);
            }
          }
        }
        if (this.priceChanges.length > before) {
          this.saveStats(this.priceChanges.slice(before));
        }
      } finally {
        this.observer?.takeRecords();
        this.isProcessing = false;
      }
    });

    this.observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      characterData: true,
    });
  }

  // ─── Messaging ──────────────────────────────────────────────────────

  private setupMessageListener(): void {
    if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
      chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
        this.handleMessage(message, sendResponse);
        return true;
      });
    } else if (typeof browser !== 'undefined' && browser.runtime?.onMessage) {
      browser.runtime.onMessage.addListener((message: unknown) => {
        return new Promise(resolve => {
          this.handleMessage(message, resolve);
        });
      });
    }
  }

  private status(): Record<string, unknown> {
    return {
      enabled: this.isEnabled,
      globalEnabled: this.globalEnabled,
      siteEnabled: this.siteEnabled,
      sitePaused: this.sitePaused,
      processedCount: this.pricesRounded,
      displayMode: this.displayMode,
      changes: this.priceChanges,
      isShoppingSite: this.isShoppingSite,
      shoppingSiteName: this.shoppingSiteName,
      domain: this.currentDomain,
      ruleErrors: this.rules.errors,
    };
  }

  private handleMessage(rawMessage: unknown, sendResponse: (response: unknown) => void): void {
    const message = (rawMessage || {}) as {
      action?: string;
      mode?: DisplayMode;
      enabled?: boolean;
    };
    switch (message.action) {
      case 'toggle':
        this.setGlobalEnabled(!this.globalEnabled);
        sendResponse(this.status());
        break;

      case 'setGlobalEnabled':
        this.setGlobalEnabled(message.enabled !== false);
        sendResponse(this.status());
        break;

      case 'reprocess':
        this.setSitePaused(false);
        this.reprocessPage();
        sendResponse({ success: true, ...this.status() });
        break;

      case 'restore':
        this.setSitePaused(true);
        this.restoreOriginal();
        sendResponse({ success: true, ...this.status() });
        break;

      case 'getStatus':
        sendResponse(this.status());
        break;

      case 'setMode': {
        const mode: DisplayMode = message.mode === 'replace' ? 'replace' : 'highlight';
        this.displayMode = mode;
        this.saveSetting({ displayMode: mode });
        this.reprocessPage();
        sendResponse({ success: true, ...this.status() });
        break;
      }

      case 'setSiteEnabled': {
        const enabled = message.enabled !== false;
        this.siteEnabled = enabled;
        this.saveSiteSetting(enabled);
        if (enabled) {
          this.setSitePaused(false);
        }
        if (this.isEnabled) {
          this.reprocessPage();
        } else {
          this.restoreOriginal();
        }
        sendResponse({ success: true, ...this.status() });
        break;
      }

      case 'getStats':
        this.getStats().then(stats => sendResponse(stats));
        break;

      default:
        sendResponse({ error: 'Unknown action' });
    }
  }

  private setGlobalEnabled(enabled: boolean): void {
    this.globalEnabled = enabled;
    this.saveSetting({ globalEnabled: enabled });
    if (enabled) {
      this.setSitePaused(false);
    }
    if (this.isEnabled) {
      this.reprocessPage();
    } else {
      this.restoreOriginal();
    }
  }

  private reprocessPage(): void {
    this.restoreOriginal();
    PricePatterns.clearCache();
    this.processPage();
  }

  /**
   * Undo every change, newest first, touching only the nodes we inserted.
   */
  public restoreOriginal(): void {
    this.hideTooltip();
    for (const record of [...this.records].reverse()) {
      if (record.textNode) {
        if (record.textNode.isConnected) {
          record.textNode.data = record.originalText || '';
        }
        this.touchedNodes.delete(record.textNode);
        continue;
      }

      for (const { node, parent, next } of record.originals) {
        if (parent.isConnected) {
          parent.insertBefore(node, next && next.parentNode === parent ? next : null);
        }
        this.touchedNodes.delete(node);
      }
      for (const n of record.inserted) {
        n.parentNode?.removeChild(n);
      }
      record.unitElement?.removeAttribute(UNIT_ATTR);
    }
    this.records = [];
    this.priceChanges = [];
    this.pricesRounded = 0;
    this.observer?.takeRecords();
  }

  public destroy(): void {
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
    this.restoreOriginal();
  }
}
