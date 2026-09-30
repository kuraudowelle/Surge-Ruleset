import { domainToASCII } from 'node:url';

export interface DomainListCommunityRules {
  /** `domain:` and bare entries: the domain and every subdomain (DOMAIN-SUFFIX) */
  suffixes: string[],
  /** `full:` entries: exactly this hostname (DOMAIN) */
  full: string[],
  /** Entries a Surge ruleset cannot take (`keyword:`, `regexp:`, `include:`, `@ads`, malformed), kept for the build log */
  skipped: string[]
}

const rHostname = /^[\da-z_](?:[\da-z_-]*[\da-z_])?(?:\.[\da-z_](?:[\da-z_-]*[\da-z_])?)+$/;
const rTrailingDot = /\.$/;
const rWhitespace = /\s+/;

function normalizeHostname(value: string): string | null {
  const hostname = domainToASCII(value.replace(rTrailingDot, '').toLowerCase());
  return rHostname.test(hostname) ? hostname : null;
}

/**
 * Parse one file of https://github.com/v2fly/domain-list-community/tree/master/data
 *
 *     # comment
 *     example.com               (same as `domain:example.com`, the domain and its subdomains)
 *     full:www.example.com      (only this hostname)
 *     keyword:example           (not supported here)
 *     regexp:^example\.com$     (not supported here)
 *     include:other-list        (not supported here)
 *     example.com @attr @ads    (`@ads` marks an ad domain, which does not belong in a service list)
 */
export function parseDomainListCommunity(lines: Iterable<string>): DomainListCommunityRules {
  const suffixes = new Set<string>();
  const full = new Set<string>();
  const skipped = new Set<string>();

  for (const rawLine of lines) {
    const hash = rawLine.indexOf('#');
    const line = (hash === -1 ? rawLine : rawLine.slice(0, hash)).trim();
    if (line.length === 0) {
      continue;
    }

    const [rule, ...attributes] = line.split(rWhitespace);
    if (attributes.some(attribute => attribute.toLowerCase() === '@ads')) {
      skipped.add(line);
      continue;
    }

    const colon = rule.indexOf(':');
    const type = colon === -1 ? 'domain' : rule.slice(0, colon).toLowerCase();

    if (type !== 'domain' && type !== 'full') {
      skipped.add(line);
      continue;
    }

    const hostname = normalizeHostname(colon === -1 ? rule : rule.slice(colon + 1));
    if (hostname === null) {
      skipped.add(line);
      continue;
    }

    (type === 'full' ? full : suffixes).add(hostname);
  }

  return {
    suffixes: Array.from(suffixes),
    full: Array.from(full),
    skipped: Array.from(skipped)
  };
}
