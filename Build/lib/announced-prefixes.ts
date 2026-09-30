import { merge } from 'fast-cidr-tools';

import { getCidrVersion } from './cidr-lines';
import type { Cidrs } from './cidr-lines';
import { $$fetch } from './fetch-retry';

/**
 * What RIPEstat (https://stat.ripe.net/docs/02.data-api/announced-prefixes.html) knows about the prefixes
 * that an autonomous system announces on the internet: the address space that its owner routes to itself.
 * `sourceapp` is how RIPEstat asks the callers of its API to introduce themselves.
 */
export const RIPESTAT_ANNOUNCED_PREFIXES_URL = 'https://stat.ripe.net/data/announced-prefixes/data.json';

/**
 * Reads the answer of RIPEstat for one AS:
 *
 *     { "status": "ok", "data": {
 *       "resource": "6185", "query_starttime": "2026-09-16T00:00:00", "query_endtime": "2026-09-30T00:00:00",
 *       "prefixes": [ { "prefix": "17.253.8.0/23", "timelines": [ { "starttime": "2026-09-16T00:00:00", "endtime": "2026-09-30T00:00:00" } ] } ]
 *     } }
 *
 * The answer covers the last two weeks, and holds every prefix that was announced at some point of them. What is
 * kept is what was still announced when the window ends: a prefix that was given up is not an address of the owner
 * any more. RIPEstat leaves out the routes that very few of its peers see by itself.
 */
export function parseAnnouncedPrefixes(response: unknown): string[] {
  if (response === null || typeof response !== 'object' || !('data' in response) || response.data === null || typeof response.data !== 'object') {
    throw new TypeError('Invalid RIPEstat announced prefixes: missing data');
  }
  if ('status' in response && response.status !== 'ok') {
    throw new Error(`RIPEstat did not answer the question: status ${String(response.status)}`);
  }

  const { data } = response;
  if (!('prefixes' in data) || !Array.isArray(data.prefixes)) {
    throw new TypeError('Invalid RIPEstat announced prefixes: missing prefixes array');
  }

  const windowEnd = 'query_endtime' in data && typeof data.query_endtime === 'string' ? Date.parse(data.query_endtime) : Number.NaN;
  const prefixes = new Set<string>();

  for (let i = 0, len = data.prefixes.length; i < len; i++) {
    const entry: unknown = data.prefixes[i];
    if (entry === null || typeof entry !== 'object' || !('prefix' in entry) || typeof entry.prefix !== 'string' || getCidrVersion(entry.prefix) === 0) {
      throw new TypeError(`Invalid RIPEstat announced prefixes entry at prefixes[${i}]`);
    }

    if (!Number.isNaN(windowEnd) && 'timelines' in entry && Array.isArray(entry.timelines) && entry.timelines.length > 0) {
      const stillAnnounced = (entry.timelines as unknown[]).some((timeline) => {
        const end = timeline !== null && typeof timeline === 'object' && 'endtime' in timeline && typeof timeline.endtime === 'string'
          ? Date.parse(timeline.endtime)
          : Number.NaN;
        // what cannot be read is not a reason to drop the prefix
        return Number.isNaN(end) || end >= windowEnd;
      });
      if (!stillAnnounced) {
        continue;
      }
    }

    prefixes.add(entry.prefix);
  }

  return Array.from(prefixes);
}

/** Puts the prefixes of one or more AS together the way a ruleset wants them: by version, and as few as there can be */
export function mergePrefixes(prefixes: readonly string[]): Cidrs {
  const cidr4: string[] = [];
  const cidr6: string[] = [];

  for (let i = 0, len = prefixes.length; i < len; i++) {
    const version = getCidrVersion(prefixes[i]);
    if (version === 4) {
      cidr4.push(prefixes[i]);
    } else if (version === 6) {
      cidr6.push(prefixes[i]);
    }
  }

  return { cidr4: merge(cidr4, true), cidr6: merge(cidr6, true) };
}

/** The addresses that these autonomous systems announce */
export async function fetchAnnouncedPrefixes(asns: readonly number[]): Promise<Cidrs> {
  const answers = await Promise.all(asns.map(async (asn) => {
    if (!Number.isSafeInteger(asn) || asn <= 0) {
      throw new TypeError(`Invalid AS number: ${asn}`);
    }

    const resp = await $$fetch(`${RIPESTAT_ANNOUNCED_PREFIXES_URL}?resource=AS${asn}&sourceapp=surge-ruleset`);
    const prefixes = parseAnnouncedPrefixes(await resp.json());
    if (prefixes.length === 0) {
      // An AS that announces nothing is an AS that is gone or a broken answer, and a ruleset made of it would be empty
      throw new Error(`RIPEstat knows no announced prefixes of AS${asn}`);
    }
    return prefixes;
  }));

  return mergePrefixes(answers.flat());
}
