import dns from 'node:dns';
import { newQueue } from '@henrygd/queue';
import { parse } from 'fast-cidr-tools';

/**
 * Resolves the TXT records of a name to their text. A name that does not exist
 * resolves to an empty array; every other failure (timeout, SERVFAIL, ...) rejects.
 */
export type TxtResolver = (name: string) => Promise<string[]>;

const rDigits = /^\d+$/;
const rWhitespace = /\s+/;
const rTelegram = /telegram/i;

/**
 * Team Cymru's IP-to-ASN mapping is published in DNS, so no API key and no
 * rate limit are involved: https://team-cymru.com/community-services/ip-asn-mapping/
 *
 *     <reversed ip>.origin.asn.cymru.com      TXT "62041 | 149.154.160.0/22 | AG | ripencc | 2011-08-10"
 *     <reversed nibbles>.origin6.asn.cymru.com
 *     AS62041.asn.cymru.com                   TXT "62041 | VG | ripencc | 2014-03-07 | Telegram - Telegram Messenger Inc, VG"
 */
export function createCymruResolver(): TxtResolver {
  const resolver = new dns.promises.Resolver({ timeout: 5000, tries: 3 });

  return async (name) => {
    try {
      const records = await resolver.resolveTxt(name);
      return records.map(chunks => chunks.join(''));
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === dns.NOTFOUND || code === dns.NODATA) {
        return [];
      }
      throw error;
    }
  };
}

/**
 * The addresses to ask for the origin of a prefix. The prefix itself is announced
 * as a whole or as several more specific parts, each of which may have another
 * origin: an IPv4 prefix is sampled once per /24, the smallest a route can be,
 * an IPv6 prefix at its first address only (a /32 alone holds 65,536 /48s).
 */
export function getOriginLookupAddresses(cidr: string, maxAddresses = 1024): Array<[address: bigint, version: 4 | 6]> {
  const [start, end, version] = parse(cidr);

  if (version === 6) {
    return [[start, 6]];
  }

  const count = Math.min(Number((end - start) / 256n) + 1, maxAddresses);
  const addresses: Array<[bigint, 4]> = [];
  for (let i = 0; i < count; i++) {
    addresses.push([start + BigInt(i) * 256n, 4]);
  }
  return addresses;
}

export function getOriginQueryName(address: bigint, version: 4 | 6): string {
  if (version === 4) {
    return [address & 255n, (address >> 8n) & 255n, (address >> 16n) & 255n, address >> 24n].join('.')
      + '.origin.asn.cymru.com';
  }

  // one label per hex digit of the fully expanded address, last digit first
  return address.toString(16).padStart(32, '0').split('').reverse().join('.')
    + '.origin6.asn.cymru.com';
}

/** The origin ASNs of one record. There are several when a route is announced by more than one AS. */
export function parseOriginRecord(record: string): string[] {
  const [asns] = record.split('|', 1);
  return asns.trim().split(rWhitespace).filter(asn => rDigits.test(asn));
}

export function parseAsnNameRecord(record: string): string | null {
  const fields = record.split('|').map(field => field.trim());
  if (fields.length < 5 || !rDigits.test(fields[0])) {
    return null;
  }
  return fields.slice(4).join(' | ');
}

export function isTelegramAsnName(name: string): boolean {
  return rTelegram.test(name);
}

function compareAsn(a: string, b: string) {
  return Number(a) - Number(b);
}

export interface TelegramAsnDiscovery {
  /** What goes into the ruleset, ascending */
  asns: string[],
  /** Telegram-held ASNs that originate one of the prefixes, whether they were known or not */
  origins: string[],
  /** The AS names that were checked, by ASN */
  names: Map<string, string | null>
}

/**
 * The ASNs that belong to Telegram: the ones that announce the prefixes it publishes
 * plus the ASNs known already. Both are kept only while the AS name (which is what the
 * RIR registered the AS under) still says Telegram, so a stray origin for a Telegram
 * prefix (a DDoS scrubbing service, a leak) or a number that was handed to someone else
 * never gets in.
 *
 * A known ASN stays whether or not a prefix leads to it: a prefix can be gone from BGP
 * for a while, and one quiet day must not drop an ASN from the list.
 */
export async function discoverTelegramAsns(
  prefixes: readonly string[],
  knownAsns: readonly string[],
  resolveTxt: TxtResolver,
  concurrency = 8
): Promise<TelegramAsnDiscovery> {
  const queue = newQueue(concurrency);

  const queryNames = new Set<string>();
  for (let i = 0, len = prefixes.length; i < len; i++) {
    const addresses = getOriginLookupAddresses(prefixes[i]);
    for (let j = 0, jLen = addresses.length; j < jLen; j++) {
      queryNames.add(getOriginQueryName(addresses[j][0], addresses[j][1]));
    }
  }

  const originRecords = await queue.all(
    Array.from(queryNames, name => () => resolveTxt(name))
  );

  const originAsns = new Set<string>();
  for (let i = 0, len = originRecords.length; i < len; i++) {
    const records = originRecords[i];
    for (let j = 0, jLen = records.length; j < jLen; j++) {
      const asns = parseOriginRecord(records[j]);
      for (let k = 0, kLen = asns.length; k < kLen; k++) {
        originAsns.add(asns[k]);
      }
    }
  }

  const candidates = Array.from(new Set([...knownAsns, ...originAsns]));
  const nameRecords = await queue.all(
    candidates.map(asn => () => resolveTxt(`AS${asn}.asn.cymru.com`))
  );

  const names = new Map<string, string | null>();
  const origins: string[] = [];
  const asns: string[] = [];

  for (let i = 0, len = candidates.length; i < len; i++) {
    const asn = candidates[i];
    const name = nameRecords[i].map(record => parseAsnNameRecord(record)).find(n => n !== null) ?? null;
    names.set(asn, name);

    if (name !== null && isTelegramAsnName(name)) {
      asns.push(asn);
      if (originAsns.has(asn)) {
        origins.push(asn);
      }
    }
  }

  return {
    asns: asns.sort(compareAsn),
    origins: origins.sort(compareAsn),
    names
  };
}

export interface TelegramAsnResolution {
  /** What goes into the ruleset, ascending */
  asns: string[],
  /** What the lookup found, or nothing if it had to be given up */
  discovery?: TelegramAsnDiscovery,
  /** Why the lookup was given up */
  error?: unknown
}

/**
 * {@link discoverTelegramAsns}, but the ruleset must not be left without ASNs (or with a
 * fraction of them) because a resolver timed out or a record changed its shape: then it
 * gets the known ASNs, unchecked, and the caller learns why.
 */
export async function resolveTelegramAsns(
  prefixes: readonly string[],
  knownAsns: readonly string[],
  resolveTxt: TxtResolver
): Promise<TelegramAsnResolution> {
  try {
    const discovery = await discoverTelegramAsns(prefixes, knownAsns, resolveTxt);

    // Not one ASN of Telegram behind the prefixes Telegram publishes is more likely a
    // lookup that went wrong (another record format, a resolver that answers everything)
    // than the truth.
    if (discovery.origins.length === 0) {
      throw new Error('None of the prefixes is announced by an ASN of Telegram');
    }

    return { asns: discovery.asns, discovery };
  } catch (error) {
    return { asns: Array.from(knownAsns).sort(compareAsn), error };
  }
}
