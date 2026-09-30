import { exclude, merge } from 'fast-cidr-tools';
import { getPrefixedCidrVersion } from './cidr-lines';

export interface GoogleIpRanges {
  cidr4: string[],
  cidr6: string[],
  creationTime: Date
}

const rHasTimeZone = /(?:Z|[+-]\d\d:?\d\d)$/;

/**
 * Reads one of the lists that Google publishes (https://support.google.com/a/answer/10026322):
 *
 *     https://www.gstatic.com/ipranges/goog.json     IP ranges that Google makes available to users on the internet
 *     https://www.gstatic.com/ipranges/cloud.json    global and regional external IP address ranges for customers' Google Cloud resources
 *
 *     { "syncToken": "1790733903731", "creationTime": "2026-09-29T19:05:03.731656", "prefixes": [ { "ipv4Prefix": "8.8.4.0/24" }, { "ipv6Prefix": "2001:4860::/32" } ] }
 */
export function parseGoogleIpRanges(data: unknown): GoogleIpRanges {
  if (
    data === null
    || typeof data !== 'object'
    || !('prefixes' in data)
    || !Array.isArray(data.prefixes)
  ) {
    throw new TypeError('Invalid Google IP ranges: missing prefixes array');
  }

  if (!('creationTime' in data) || typeof data.creationTime !== 'string') {
    throw new TypeError('Invalid Google IP ranges: missing creationTime');
  }

  // Google's time has no time zone, and is UTC
  const creationTime = new Date(rHasTimeZone.test(data.creationTime) ? data.creationTime : data.creationTime + 'Z');
  if (Number.isNaN(creationTime.getTime())) {
    throw new TypeError('Invalid Google IP ranges: invalid creationTime');
  }

  const cidr4 = new Set<string>();
  const cidr6 = new Set<string>();

  for (let i = 0, len = data.prefixes.length; i < len; i++) {
    const entry: unknown = data.prefixes[i];
    if (entry === null || typeof entry !== 'object') {
      throw new TypeError(`Invalid Google IP ranges entry at prefixes[${i}]`);
    }

    if ('ipv4Prefix' in entry && typeof entry.ipv4Prefix === 'string' && getPrefixedCidrVersion(entry.ipv4Prefix) === 4) {
      cidr4.add(entry.ipv4Prefix);
    } else if ('ipv6Prefix' in entry && typeof entry.ipv6Prefix === 'string' && getPrefixedCidrVersion(entry.ipv6Prefix) === 6) {
      cidr6.add(entry.ipv6Prefix);
    } else {
      throw new TypeError(`Invalid Google IP ranges entry at prefixes[${i}]`);
    }
  }

  return { cidr4: Array.from(cidr4), cidr6: Array.from(cidr6), creationTime };
}

function familiesOf(ranges: Pick<GoogleIpRanges, 'cidr4' | 'cidr6'>) {
  if (ranges.cidr4.length === 0 && ranges.cidr6.length === 0) {
    return 'IPv4 and IPv6';
  }
  if (ranges.cidr4.length === 0) {
    return 'IPv4';
  }
  return ranges.cidr6.length === 0 ? 'IPv6' : null;
}

/**
 * What Google documents for the addresses that its own services use: the ranges of goog.json
 * that are not in cloud.json, since the latter are the ones that customers of Google Cloud get.
 *
 * Both files have both families, and the ruleset that is built from them replaces the one of the build before. A file
 * that lacks a family is a download that broke, and the ruleset that it would make has none of that family: the routes
 * that it had are gone, and nothing says so. So a source that lacks a family is refused, and so is a result that has
 * none, and the ruleset of the build before stays. A source of one family on purpose is not a case that this handles.
 */
export function subtractGoogleCloudRanges(goog: GoogleIpRanges, cloud: GoogleIpRanges) {
  // Nothing to subtract is a broken download, not Google without customers: what is left would still hold all of them
  if (cloud.cidr4.length === 0 || cloud.cidr6.length === 0) {
    throw new Error('The IP ranges of Google Cloud are empty, so the ranges of its customers cannot be told from those of Google itself');
  }

  const missing = familiesOf(goog);
  if (missing !== null) {
    throw new Error(`The IP ranges of Google (goog.json) have no ${missing} ranges: a ruleset made from them would replace the ${missing} ranges that were published with nothing`);
  }

  const ranges = {
    cidr4: merge(exclude(merge(goog.cidr4), merge(cloud.cidr4)), true),
    cidr6: merge(exclude(merge(goog.cidr6), merge(cloud.cidr6)), true)
  };

  const gone = familiesOf(ranges);
  if (gone !== null) {
    throw new Error(`Nothing is left of the ${gone} ranges of Google after the ranges of its customers are taken away: the download of one of the two files is not what it should be`);
  }

  return ranges;
}
