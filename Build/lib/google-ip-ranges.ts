import { exclude, merge } from 'fast-cidr-tools';
import { fastIpVersion } from 'foxts/fast-ip-version';

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

    if ('ipv4Prefix' in entry && typeof entry.ipv4Prefix === 'string' && fastIpVersion(entry.ipv4Prefix) === 4) {
      cidr4.add(entry.ipv4Prefix);
    } else if ('ipv6Prefix' in entry && typeof entry.ipv6Prefix === 'string' && fastIpVersion(entry.ipv6Prefix) === 6) {
      cidr6.add(entry.ipv6Prefix);
    } else {
      throw new TypeError(`Invalid Google IP ranges entry at prefixes[${i}]`);
    }
  }

  return { cidr4: Array.from(cidr4), cidr6: Array.from(cidr6), creationTime };
}

/**
 * What Google documents for the addresses that its own services use: the ranges of goog.json
 * that are not in cloud.json, since the latter are the ones that customers of Google Cloud get.
 */
export function subtractGoogleCloudRanges(goog: GoogleIpRanges, cloud: GoogleIpRanges) {
  // Nothing to subtract is a broken download, not Google without customers: what is left would still hold all of them
  if (cloud.cidr4.length === 0 || cloud.cidr6.length === 0) {
    throw new Error('The IP ranges of Google Cloud are empty, so the ranges of its customers cannot be told from those of Google itself');
  }

  return {
    cidr4: merge(exclude(merge(goog.cidr4), merge(cloud.cidr4)), true),
    cidr6: merge(exclude(merge(goog.cidr6), merge(cloud.cidr6)), true)
  };
}
