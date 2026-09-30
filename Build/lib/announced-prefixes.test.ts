import { describe, it } from 'mocha';
import { expect } from 'earl';

import { mergePrefixes, parseAnnouncedPrefixes } from './announced-prefixes';

const windowEnd = '2026-09-30T00:00:00';

function answer(prefixes: unknown[], queryEnd: string | null = windowEnd) {
  return {
    status: 'ok',
    status_code: 200,
    data: {
      resource: '6185',
      query_starttime: '2026-09-16T00:00:00',
      ...(queryEnd !== null && { query_endtime: queryEnd }),
      prefixes
    }
  };
}

function announced(prefix: string, end = windowEnd) {
  return {
    prefix,
    timelines: [{ starttime: '2026-09-16T00:00:00', endtime: end }]
  };
}

describe('parseAnnouncedPrefixes', () => {
  it('reads what https://stat.ripe.net/data/announced-prefixes/data.json?resource=AS6185 looks like', () => {
    expect(parseAnnouncedPrefixes(answer([
      announced('17.253.116.0/23'),
      announced('17.253.8.0/23'),
      announced('2620:149:a33::/48')
    ]))).toEqual(['17.253.116.0/23', '17.253.8.0/23', '2620:149:a33::/48']);
  });

  it('leaves out a prefix that was given up before the window ends, and keeps one that is announced again', () => {
    expect(parseAnnouncedPrefixes(answer([
      announced('192.0.2.0/24'),
      announced('198.51.100.0/24', '2026-09-20T00:00:00'),
      {
        prefix: '203.0.113.0/24',
        timelines: [
          { starttime: '2026-09-16T00:00:00', endtime: '2026-09-18T00:00:00' },
          { starttime: '2026-09-25T00:00:00', endtime: windowEnd }
        ]
      }
    ]))).toEqual(['192.0.2.0/24', '203.0.113.0/24']);
  });

  it('keeps a prefix when the answer does not say what it needs to tell if it was given up', () => {
    // no end of the window
    expect(parseAnnouncedPrefixes(answer([announced('198.51.100.0/24', '2026-09-20T00:00:00')], null))).toEqual(['198.51.100.0/24']);
    // no timelines, or ones that cannot be read
    expect(parseAnnouncedPrefixes(answer([
      { prefix: '192.0.2.0/24' },
      { prefix: '198.51.100.0/24', timelines: [] },
      { prefix: '203.0.113.0/24', timelines: [{ starttime: 'x', endtime: 'yesterday' }, null] }
    ]))).toEqual(['192.0.2.0/24', '198.51.100.0/24', '203.0.113.0/24']);
  });

  it('deduplicates', () => {
    expect(parseAnnouncedPrefixes(answer([announced('192.0.2.0/24'), announced('192.0.2.0/24')]))).toEqual(['192.0.2.0/24']);
  });

  it('gives nothing for an AS that announces nothing, which the caller has to tell from a failure', () => {
    expect(parseAnnouncedPrefixes(answer([]))).toEqual([]);
  });

  it('refuses an answer of another shape, instead of publishing part of it', () => {
    expect(() => parseAnnouncedPrefixes(null)).toThrow('missing data');
    expect(() => parseAnnouncedPrefixes({})).toThrow('missing data');
    expect(() => parseAnnouncedPrefixes({ data: null })).toThrow('missing data');
    expect(() => parseAnnouncedPrefixes({ data: {} })).toThrow('missing prefixes array');
    expect(() => parseAnnouncedPrefixes({ data: { prefixes: {} } })).toThrow('missing prefixes array');
    expect(() => parseAnnouncedPrefixes(answer([null]))).toThrow('prefixes[0]');
    expect(() => parseAnnouncedPrefixes(answer([{ timelines: [] }]))).toThrow('prefixes[0]');
    expect(() => parseAnnouncedPrefixes(answer([announced('192.0.2.0/24'), { prefix: 'AS6185' }]))).toThrow('prefixes[1]');
  });

  it('refuses an answer that says it is not ok', () => {
    expect(() => parseAnnouncedPrefixes({ status: 'error', data: { prefixes: [] } })).toThrow('status error');
  });
});

describe('mergePrefixes', () => {
  it('drops the prefixes that another one covers and joins the ones that are next to each other, by version and sorted', () => {
    expect(mergePrefixes([
      '17.253.8.0/23',
      '17.0.0.0/9',
      '17.128.0.0/9',
      '192.0.2.0/25',
      '192.0.2.128/25',
      '2620:149:a33::/48',
      '2620:149::/32'
    ])).toEqual({
      cidr4: ['17.0.0.0/8', '192.0.2.0/24'],
      cidr6: ['2620:149::/32']
    });
  });

  it('gives empty lists for no prefixes, and leaves out what is not an address', () => {
    expect(mergePrefixes([])).toEqual({ cidr4: [], cidr6: [] });
    expect(mergePrefixes(['not-a-prefix', '192.0.2.0/24'])).toEqual({ cidr4: ['192.0.2.0/24'], cidr6: [] });
  });
});
