/**
 * Site guard: user blocklist and payment-page detection.
 *
 * Both keep the extension away from pages where rewriting prices is unwanted
 * or risky. The blocklist (`storage.sync.blockedSites`) is a list of domains
 * the user added from the popup; a domain blocks itself and every subdomain.
 * Payment pages (checkout, card forms, payment gateways) are detected from the
 * URL, the host and the presence of card-entry fields, and are left untouched
 * when `pauseOnPayment` is on (the default) so the amount a person is about to
 * pay is always shown exactly as the site states it.
 *
 * The same guard covers other pages where the exact figure matters: banks,
 * brokers, crypto exchanges, accounting and tax sites, invoices and receipts.
 *
 * Every list lives in `src/config/protected-sites.json` (schema:
 * `src/config/schema/protected-sites.schema.json`). Each group carries the
 * reason the popup shows ("Paused on this bank site for safety").
 */

import protectedFile from '../config/protected-sites.json';
import { canonicalHost, domainMatches, normalizeDomain } from './domains';

export interface HostGroup {
  id: string;
  reason: string;
  hosts: string[];
}

export interface PathSegmentGroup {
  reason: string;
  segments: string[];
}

export interface ProtectedSitesConfig {
  hostGroups: HostGroup[];
  pathSegmentGroups: PathSegmentGroup[];
  cardFieldSelectors: string[];
}

// Typed assignment: tsc fails the build if the JSON stops matching the interface.
const config: ProtectedSitesConfig = protectedFile;

/** Path segment → reason; the first group listing a segment wins. */
const SEGMENT_REASONS: ReadonlyMap<string, string> = new Map(
  config.pathSegmentGroups
    .flatMap(group => group.segments.map(segment => [segment, group.reason] as const))
    .reverse()
);
const CARD_FIELD_SELECTOR = config.cardFieldSelectors.join(',');

export function normalizeBlockedSites(raw: unknown): string[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  const seen = new Set<string>();

  for (const entry of raw) {
    const domain = normalizeDomain(String(entry));

    if (domain) {
      seen.add(domain);
    }
  }

  return [...seen];
}

export function isBlockedSite(hostname: string, blockedSites: string[]): boolean {
  return blockedSites.some(domain => domainMatches(hostname, domain));
}

export interface PaymentSignal {
  payment: boolean;
  /** what triggered it, for the popup ("payment gateway", "checkout URL", "card form") */
  reason: string | null;
}

/** Reason for a protected host ("payment gateway", "bank site", ...), or null. */
export function protectedHostReason(hostname: string): string | null {
  const group = config.hostGroups.find(g =>
    g.hosts.some(domain => domainMatches(hostname, domain))
  );

  return group ? group.reason : null;
}

export function isPaymentHost(hostname: string): boolean {
  return protectedHostReason(hostname) !== null;
}

/** Reason for a protected URL path ("checkout page", "invoice page"), or null. */
export function protectedPathReason(url: URL | Location): string | null {
  const segments = url.pathname
    .toLowerCase()
    .split('/')
    .map(seg => seg.replace(/\.(html?|php|aspx?|jsp)$/, ''));
  // Subdomain labels only: "pay.shop.com" yes, "pay.com" itself no.
  const labels = canonicalHost(url.hostname).split('.').slice(0, -2);

  const part = [...segments, ...labels].find(p => SEGMENT_REASONS.has(p));

  return part === undefined ? null : (SEGMENT_REASONS.get(part) ?? null);
}

export function isPaymentUrl(url: URL | Location): boolean {
  return protectedPathReason(url) !== null;
}

export function hasCardForm(root: ParentNode): boolean {
  try {
    return root.querySelector(CARD_FIELD_SELECTOR) !== null;
  } catch {
    return false;
  }
}

export function detectPaymentPage(
  location: URL | Location = window.location,
  root: ParentNode = document
): PaymentSignal {
  const hostReason = protectedHostReason(location.hostname);

  if (hostReason) {
    return { payment: true, reason: hostReason };
  }

  const pathReason = protectedPathReason(location);

  if (pathReason) {
    return { payment: true, reason: pathReason };
  }

  if (hasCardForm(root)) {
    return { payment: true, reason: 'card form' };
  }

  return { payment: false, reason: null };
}
