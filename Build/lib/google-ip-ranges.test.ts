import { describe, it } from 'mocha';
import { expect } from 'earl';

import { parseGoogleIpRanges, subtractGoogleCloudRanges } from './google-ip-ranges';

describe('parseGoogleIpRanges', () => {
  it('reads what https://www.gstatic.com/ipranges/goog.json looks like', () => {
    expect(parseGoogleIpRanges({
      syncToken: '1790733903731',
      creationTime: '2026-09-29T19:05:03.731656',
      prefixes: [
        { ipv4Prefix: '8.8.4.0/24' },
        { ipv6Prefix: '2001:4860::/32' },
        { ipv4Prefix: '8.8.8.0/24' }
      ]
    })).toEqual({
      cidr4: ['8.8.4.0/24', '8.8.8.0/24'],
      cidr6: ['2001:4860::/32'],
      creationTime: new Date('2026-09-29T19:05:03.731Z')
    });
  });

  it('reads what https://www.gstatic.com/ipranges/cloud.json looks like, where every range says which service and scope it is for', () => {
    const { cidr4, cidr6 } = parseGoogleIpRanges({
      syncToken: '1790733903731',
      creationTime: '2026-09-29T19:05:03.731656',
      prefixes: [
        { ipv4Prefix: '34.1.208.0/20', service: 'Google Cloud', scope: 'africa-south1' },
        { ipv6Prefix: '2600:1900:4000::/44', service: 'Google Cloud', scope: 'africa-south1' }
      ]
    });

    expect(cidr4).toEqual(['34.1.208.0/20']);
    expect(cidr6).toEqual(['2600:1900:4000::/44']);
  });

  it('takes a time without a time zone as UTC, and keeps one that has a zone', () => {
    const prefixes = [{ ipv4Prefix: '8.8.8.0/24' }];

    expect(parseGoogleIpRanges({ creationTime: '2026-09-29T19:05:03', prefixes }).creationTime.toISOString()).toEqual('2026-09-29T19:05:03.000Z');
    expect(parseGoogleIpRanges({ creationTime: '2026-09-29T19:05:03Z', prefixes }).creationTime.toISOString()).toEqual('2026-09-29T19:05:03.000Z');
    expect(parseGoogleIpRanges({ creationTime: '2026-09-29T21:05:03+02:00', prefixes }).creationTime.toISOString()).toEqual('2026-09-29T19:05:03.000Z');
  });

  it('deduplicates', () => {
    const { cidr4 } = parseGoogleIpRanges({
      creationTime: '2026-09-29T19:05:03',
      prefixes: [{ ipv4Prefix: '8.8.8.0/24' }, { ipv4Prefix: '8.8.8.0/24' }]
    });

    expect(cidr4).toEqual(['8.8.8.0/24']);
  });

  it('refuses a file of another shape, instead of publishing part of it', () => {
    const creationTime = '2026-09-29T19:05:03';

    expect(() => parseGoogleIpRanges(null)).toThrow('missing prefixes array');
    expect(() => parseGoogleIpRanges({ creationTime })).toThrow('missing prefixes array');
    expect(() => parseGoogleIpRanges({ prefixes: [] })).toThrow('missing creationTime');
    expect(() => parseGoogleIpRanges({ creationTime: 'yesterday', prefixes: [] })).toThrow('invalid creationTime');
    expect(() => parseGoogleIpRanges({ creationTime, prefixes: [null] })).toThrow('prefixes[0]');
    expect(() => parseGoogleIpRanges({ creationTime, prefixes: [{ ipv4Prefix: '8.8.8.0/24' }, { service: 'Google Cloud' }] })).toThrow('prefixes[1]');
    // an IPv6 range under the IPv4 key, or the other way around
    expect(() => parseGoogleIpRanges({ creationTime, prefixes: [{ ipv4Prefix: '2001:4860::/32' }] })).toThrow('prefixes[0]');
    expect(() => parseGoogleIpRanges({ creationTime, prefixes: [{ ipv6Prefix: '8.8.8.0/24' }] })).toThrow('prefixes[0]');
  });
});

describe('subtractGoogleCloudRanges', () => {
  const creationTime = new Date('2026-09-29T19:05:03Z');
  const ranges = (cidr4: string[], cidr6: string[]) => ({ cidr4, cidr6, creationTime });

  it('leaves what Google keeps for itself: the ranges without the ones of its customers', () => {
    expect(subtractGoogleCloudRanges(
      ranges(['8.8.8.0/24', '34.0.0.0/16'], ['2001:4860::/32', '2600:1900::/32']),
      ranges(['34.0.128.0/17'], ['2600:1900:4000::/36'])
    )).toEqual({
      // 34.0.0.0 - 34.0.127.255 is left of the /16
      cidr4: ['8.8.8.0/24', '34.0.0.0/17'],
      // the /32 without 2600:1900:4000:: - 2600:1900:4fff::
      cidr6: ['2001:4860::/32', '2600:1900::/34', '2600:1900:5000::/36', '2600:1900:6000::/35', '2600:1900:8000::/33']
    });
  });

  it('drops a range that a customer range covers completely, and keeps a range that no customer range touches', () => {
    const { cidr4, cidr6 } = subtractGoogleCloudRanges(
      ranges(['8.8.8.0/24', '34.1.208.0/20'], ['2001:4860::/32', '2600:1900:4000::/44']),
      ranges(['34.0.0.0/8'], ['2600:1900::/32'])
    );

    expect(cidr4).toEqual(['8.8.8.0/24']);
    expect(cidr6).toEqual(['2001:4860::/32']);
  });

  it('cuts a range exactly where a customer range starts and ends', () => {
    const { cidr4 } = subtractGoogleCloudRanges(
      ranges(['10.0.0.0/24'], ['2001:4860::/32']),
      ranges(['10.0.0.64/26'], ['2600:1900::/32'])
    );

    // 10.0.0.0 - 10.0.0.63 and 10.0.0.128 - 10.0.0.255 are left
    expect(cidr4).toEqual(['10.0.0.0/26', '10.0.0.128/25']);
  });

  it('gives up when it has nothing to subtract, since a download that failed would leave the ranges of all customers in', () => {
    expect(() => subtractGoogleCloudRanges(ranges(['8.8.8.0/24'], ['2001:4860::/32']), ranges([], ['2600:1900::/32'])))
      .toThrow('The IP ranges of Google Cloud are empty');
    expect(() => subtractGoogleCloudRanges(ranges(['8.8.8.0/24'], ['2001:4860::/32']), ranges(['34.0.0.0/8'], [])))
      .toThrow('The IP ranges of Google Cloud are empty');
  });
});
