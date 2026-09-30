import { describe, it } from 'mocha';
import { expect } from 'earl';
import { ip2bigint } from 'fast-cidr-tools';

import {
  discoverTelegramAsns,
  getOriginLookupAddresses,
  getOriginQueryName,
  isTelegramAsnName,
  parseAsnNameRecord,
  parseOriginRecord,
  resolveTelegramAsns
} from './telegram-asn';
import type { TxtResolver } from './telegram-asn';

function v4Name(ip: string) {
  return getOriginQueryName(ip2bigint(ip, 4), 4);
}

function lookupNames(cidr: string, maxAddresses?: number) {
  return getOriginLookupAddresses(cidr, maxAddresses)
    .map(([address, version]) => getOriginQueryName(address, version));
}

function dnsOf(data: Record<string, string[]>): TxtResolver {
  return name => Promise.resolve(data[name] ?? []);
}

describe('getOriginQueryName', () => {
  it('reverses the octets of an IPv4 address', () => {
    expect(v4Name('149.154.160.0')).toEqual('0.160.154.149.origin.asn.cymru.com');
  });

  it('reverses the 32 hex digits of an IPv6 address', () => {
    expect(getOriginQueryName(ip2bigint('2001:b28:f23d::', 6), 6)).toEqual(
      '0.'.repeat(20) + 'd.3.2.f.8.2.b.0.1.0.0.2.origin6.asn.cymru.com'
    );
  });
});

describe('getOriginLookupAddresses', () => {
  it('asks about every /24 of a wider IPv4 prefix', () => {
    expect(lookupNames('91.108.56.0/22')).toEqual([
      v4Name('91.108.56.0'),
      v4Name('91.108.57.0'),
      v4Name('91.108.58.0'),
      v4Name('91.108.59.0')
    ]);
    expect(lookupNames('149.154.160.0/20').length).toEqual(16);
  });

  it('asks once about a prefix that is not wider than a /24', () => {
    expect(lookupNames('185.76.151.0/24')).toEqual([v4Name('185.76.151.0')]);
    expect(lookupNames('95.161.76.100/32')).toEqual([v4Name('95.161.76.100')]);
  });

  it('asks once about an IPv6 prefix, however wide', () => {
    expect(lookupNames('2001:b28:f23d::/48').length).toEqual(1);
    expect(lookupNames('2a0a:f280::/32').length).toEqual(1);
  });

  it('stops at the limit', () => {
    expect(lookupNames('10.0.0.0/8', 3).length).toEqual(3);
  });
});

describe('parseOriginRecord', () => {
  it('reads the origin ASN', () => {
    expect(parseOriginRecord('62041 | 149.154.160.0/22 | AG | ripencc | 2011-08-10')).toEqual(['62041']);
  });

  it('reads every origin of a multi-origin route', () => {
    expect(parseOriginRecord('13335 15169 | 1.1.1.0/24 | AU | apnic | 2011-08-11')).toEqual(['13335', '15169']);
  });

  it('reads nothing from a record that has no ASN', () => {
    expect(parseOriginRecord('NA | 1.1.1.0/24')).toEqual([]);
    expect(parseOriginRecord('')).toEqual([]);
  });
});

describe('parseAsnNameRecord', () => {
  it('reads the name the AS is registered under', () => {
    expect(parseAsnNameRecord('62041 | VG | ripencc | 2014-03-07 | Telegram - Telegram Messenger Inc, VG'))
      .toEqual('Telegram - Telegram Messenger Inc, VG');
  });

  it('rejects a record of another shape', () => {
    expect(parseAsnNameRecord('62041 | 149.154.160.0/22 | AG | ripencc')).toEqual(null);
    expect(parseAsnNameRecord('NA | VG | ripencc | 2014-03-07 | Telegram')).toEqual(null);
  });
});

describe('isTelegramAsnName', () => {
  it('matches the names Telegram registered its ASNs under', () => {
    expect([
      'Telegram - Telegram Messenger Inc, VG',
      'Telegram_Messenger - Telegram Messenger Inc, VG',
      'Telegram_Messenger_CDN - Telegram Messenger Inc, VG',
      'Telegram-AS - Telegram Messenger Inc, VG'
    ].every(name => isTelegramAsnName(name))).toEqual(true);
  });

  it('does not match other holders', () => {
    expect(isTelegramAsnName('CW - Vodafone Group PLC, GB')).toEqual(false);
    expect(isTelegramAsnName('CLOUDFLARENET - Cloudflare, Inc., US')).toEqual(false);
  });
});

describe('discoverTelegramAsns', () => {
  const dnsData: Record<string, string[]> = {
    [v4Name('91.108.56.0')]: [
      '62041 | 91.108.56.0/22 | AG | ripencc | 2012-06-15',
      '62014 | 91.108.56.0/24 | AG | ripencc | 2012-06-15'
    ],
    [v4Name('91.108.57.0')]: ['62041 | 91.108.56.0/22 | AG | ripencc | 2012-06-15'],
    [v4Name('91.108.58.0')]: ['62041 | 91.108.56.0/22 | AG | ripencc | 2012-06-15'],
    [v4Name('91.108.59.0')]: ['62041 | 91.108.56.0/22 | AG | ripencc | 2012-06-15'],
    // a Telegram endpoint that sits in the address space of somebody else
    [v4Name('194.221.250.50')]: ['1273 | 194.221.0.0/16 | GB | ripencc | 1995-12-21'],
    'AS62041.asn.cymru.com': ['62041 | VG | ripencc | 2014-03-07 | Telegram - Telegram Messenger Inc, VG'],
    'AS62014.asn.cymru.com': ['62014 | VG | ripencc | 2014-03-24 | Telegram - Telegram Messenger Inc, VG'],
    'AS59930.asn.cymru.com': ['59930 | VG | ripencc | 2014-08-05 | Telegram_Messenger - Telegram Messenger Inc, VG'],
    'AS1273.asn.cymru.com': ['1273 | GB | ripencc | 1993-09-01 | CW - Vodafone Group PLC, GB'],
    'AS64500.asn.cymru.com': ['64500 | ZZ | arin | 2010-01-01 | SOMEONE-ELSE - Someone Else, ZZ']
  };

  it('finds the Telegram ASNs behind the prefixes and leaves the others out', async () => {
    const result = await discoverTelegramAsns(
      ['91.108.56.0/22', '194.221.250.50/32', '2a0a:f280::/32'],
      [],
      dnsOf(dnsData)
    );

    expect(result.asns).toEqual(['62014', '62041']);
    expect(result.origins).toEqual(['62014', '62041']);
    expect(result.names.get('1273')).toEqual('CW - Vodafone Group PLC, GB');
  });

  it('keeps the known ASNs when no prefix leads to them', async () => {
    const result = await discoverTelegramAsns(['91.108.56.0/22'], ['59930'], dnsOf(dnsData));

    expect(result.asns).toEqual(['59930', '62014', '62041']);
    expect(result.origins).toEqual(['62014', '62041']);
  });

  it('drops a known ASN whose holder is not Telegram (any more)', async () => {
    const result = await discoverTelegramAsns(['91.108.56.0/22'], ['64500', '65000'], dnsOf(dnsData));

    // 64500 changed hands, 65000 is not registered at all
    expect(result.asns).toEqual(['62014', '62041']);
    expect(result.names.get('64500')).toEqual('SOMEONE-ELSE - Someone Else, ZZ');
    expect(result.names.get('65000')).toEqual(null);
  });

  it('looks every name up once', async () => {
    const asked: string[] = [];
    await discoverTelegramAsns(['91.108.56.0/22', '91.108.56.0/24'], ['62041'], (name) => {
      asked.push(name);
      return Promise.resolve(dnsData[name] ?? []);
    });

    expect(asked.length).toEqual(new Set(asked).size);
  });

  it('fails when the DNS lookup fails, so that the caller can fall back', async () => {
    await expect(discoverTelegramAsns(
      ['91.108.56.0/22'],
      [],
      () => Promise.reject(new Error('queryTxt ETIMEOUT'))
    )).toBeRejectedWith('queryTxt ETIMEOUT');
  });
});

describe('resolveTelegramAsns', () => {
  const dnsData: Record<string, string[]> = {
    [v4Name('91.108.56.0')]: ['62041 | 91.108.56.0/22 | AG | ripencc | 2012-06-15'],
    [v4Name('194.221.250.50')]: ['1273 | 194.221.0.0/16 | GB | ripencc | 1995-12-21'],
    'AS62041.asn.cymru.com': ['62041 | VG | ripencc | 2014-03-07 | Telegram - Telegram Messenger Inc, VG'],
    'AS62014.asn.cymru.com': ['62014 | VG | ripencc | 2014-03-24 | Telegram - Telegram Messenger Inc, VG'],
    'AS1273.asn.cymru.com': ['1273 | GB | ripencc | 1993-09-01 | CW - Vodafone Group PLC, GB']
  };

  const resolver = dnsOf(dnsData);

  it('gives what the lookup found', async () => {
    const result = await resolveTelegramAsns(['91.108.56.0/22'], ['62014'], resolver);

    expect(result.asns).toEqual(['62014', '62041']);
    expect(result.discovery?.origins).toEqual(['62041']);
    expect(result.error).toEqual(undefined);
  });

  it('gives the known ASNs when the lookup fails', async () => {
    const error = new Error('queryTxt ETIMEOUT');
    const result = await resolveTelegramAsns(['91.108.56.0/22'], ['62041', '62014'], () => Promise.reject(error));

    expect(result.asns).toEqual(['62014', '62041']);
    expect(result.discovery).toEqual(undefined);
    expect(result.error).toEqual(error);
  });

  it('gives the known ASNs when not one prefix leads to an ASN of Telegram', async () => {
    const result = await resolveTelegramAsns(['194.221.250.50/32'], ['62041', '62014'], resolver);

    expect(result.asns).toEqual(['62014', '62041']);
    expect(result.discovery).toEqual(undefined);
    expect(result.error).toBeA(Error);
  });
});
