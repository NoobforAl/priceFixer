/**
 * Domain helpers shared by the shop list, the payment guard and the user
 * blocklist.
 */

/** Normalise user input ("https://www.Shop.com/x", "shop.com") to a bare domain. */
export function normalizeDomain(input: string): string {
  let value = String(input || '')
    .trim()
    .toLowerCase();

  if (!value) {
    return '';
  }

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

/** True when `hostname` is `domain` or a subdomain of it. */
export function domainMatches(hostname: string, domain: string): boolean {
  const host = hostname.toLowerCase().replace(/^www\./, '');

  return host === domain || host.endsWith(`.${domain}`);
}

/**
 * Like `domainMatches`, plus `name.*` patterns: the label `name` followed by
 * a one- or two-label country suffix, on any subdomain. `amazon.*` matches
 * amazon.de, amazon.co.uk and smile.amazon.com, but not
 * amazon.attacker.example.com or notamazon.com.
 */
export function hostMatchesPattern(hostname: string, pattern: string): boolean {
  if (!pattern.endsWith('.*')) {
    return domainMatches(hostname, pattern);
  }

  const name = pattern.slice(0, -2);
  const labels = hostname.toLowerCase().split('.');
  const index = labels.lastIndexOf(name);
  const suffixLabels = labels.length - index - 1;

  return index >= 0 && suffixLabels >= 1 && suffixLabels <= 2;
}
