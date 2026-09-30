import { isIP } from 'node:net';

export interface Cidrs {
  cidr4: string[],
  cidr6: string[]
}

const rPrefixLength = /^\d{1,3}$/;

/**
 * The version of the address or range (`10.0.0.0/8`, `fc00::/7`), 0 when it is not one. The data of other
 * parties passes through here, so this is a check of the whole text and not a guess from a colon or a dot.
 */
export function getCidrVersion(value: string): 0 | 4 | 6 {
  const slash = value.indexOf('/');
  // isIP says 4, 6 or 0, and is typed as a number
  const version = isIP(slash === -1 ? value : value.slice(0, slash)) as 0 | 4 | 6;

  if (version === 0 || slash === -1) {
    return version;
  }

  const length = value.slice(slash + 1);
  return rPrefixLength.test(length) && Number(length) <= (version === 4 ? 32 : 128) ? version : 0;
}

/**
 * {@link getCidrVersion} for a range that an API publishes: an address, a slash and a prefix length (`10.0.0.0/8`). A bare
 * address is 0 here: a list that does not write its ranges this way is not the list that the caller was written for, and
 * `1:2:3` or `999.1.1.1/24` are not addresses whatever the punctuation looks like.
 */
export function getPrefixedCidrVersion(value: string): 0 | 4 | 6 {
  return value.includes('/') ? getCidrVersion(value) : 0;
}

/**
 * Reads a list with an IP range on every line, like the ones of https://github.com/v2fly/geoip/tree/release/text
 *
 *     # comment
 *     10.0.0.0/8
 *     fc00::/7     # a comment after a range
 *
 * A line that is not an address is not skipped: a download that is not a list of addresses must not become
 * a ruleset with some of them.
 */
export function parseCidrLines(lines: Iterable<string>): Cidrs {
  const cidr4 = new Set<string>();
  const cidr6 = new Set<string>();

  for (const rawLine of lines) {
    const hash = rawLine.indexOf('#');
    const line = (hash === -1 ? rawLine : rawLine.slice(0, hash)).trim();
    if (line.length === 0) {
      continue;
    }

    const version = getCidrVersion(line);
    if (version === 4) {
      cidr4.add(line);
    } else if (version === 6) {
      cidr6.add(line.toLowerCase());
    } else {
      throw new TypeError(`Not an IP address or range: ${line}`);
    }
  }

  return { cidr4: Array.from(cidr4), cidr6: Array.from(cidr6) };
}
