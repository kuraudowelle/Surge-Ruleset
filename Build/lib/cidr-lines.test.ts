import { describe, it } from 'mocha';
import { expect } from 'earl';

import { getCidrVersion, getPrefixedCidrVersion, parseCidrLines } from './cidr-lines';

describe('getCidrVersion', () => {
  it('knows IPv4 and IPv6 addresses and ranges', () => {
    expect(getCidrVersion('10.0.0.0/8')).toEqual(4);
    expect(getCidrVersion('255.255.255.255/32')).toEqual(4);
    expect(getCidrVersion('127.0.0.1')).toEqual(4);
    expect(getCidrVersion('fc00::/7')).toEqual(6);
    expect(getCidrVersion('2620:149:a33::/48')).toEqual(6);
    expect(getCidrVersion('::1')).toEqual(6);
    expect(getCidrVersion('::/0')).toEqual(6);
  });

  it('says 0 for what is not an address or range, however much it looks like one', () => {
    const values = ['', 'AS714', '404: Not Found', '<html>', '999.1.1.1', '10.0.0', '10.0.0.0/33', 'fc00::/129', '10.0.0.0/', '10.0.0.0/a', '10.0.0.0/8/8', '/8', 'fc00:::/7'];
    for (let i = 0, len = values.length; i < len; i++) {
      expect({ value: values[i], version: getCidrVersion(values[i]) }).toEqual({ value: values[i], version: 0 });
    }
  });
});

describe('getPrefixedCidrVersion', () => {
  it('knows the ranges of an API, that have an address, a slash and a prefix length', () => {
    expect(getPrefixedCidrVersion('192.30.252.0/22')).toEqual(4);
    expect(getPrefixedCidrVersion('8.8.8.8/32')).toEqual(4);
    expect(getPrefixedCidrVersion('2a0a:a440::/29')).toEqual(6);
    expect(getPrefixedCidrVersion('::/0')).toEqual(6);
  });

  it('says 0 for a bare address, which is not the notation of these APIs', () => {
    expect(getPrefixedCidrVersion('192.30.252.0')).toEqual(0);
    expect(getPrefixedCidrVersion('::1')).toEqual(0);
  });

  it('says 0 for what only looks like a range, which is what a classifier of dots and colons takes for one', () => {
    const values = ['999.1.1.1/24', '1:2:3', '1:2:3/64', '10.0.0/8', '10.0.0.0/33', 'fc00::/129', '10.0.0.0/', '/8', 'not an address', ''];
    for (let i = 0, len = values.length; i < len; i++) {
      expect({ value: values[i], version: getPrefixedCidrVersion(values[i]) }).toEqual({ value: values[i], version: 0 });
    }
  });
});

describe('parseCidrLines', () => {
  it('reads what https://raw.githubusercontent.com/v2fly/geoip/release/text/private.txt looks like', () => {
    expect(parseCidrLines([
      '0.0.0.0/8',
      '10.0.0.0/8',
      '100.64.0.0/10',
      '::/127',
      'fc00::/7',
      'fe80::/10',
      'ff00::/8'
    ])).toEqual({
      cidr4: ['0.0.0.0/8', '10.0.0.0/8', '100.64.0.0/10'],
      cidr6: ['::/127', 'fc00::/7', 'fe80::/10', 'ff00::/8']
    });
  });

  it('ignores comments and blank lines, including a comment after a range', () => {
    expect(parseCidrLines([
      '# private networks',
      '',
      '   ',
      '10.0.0.0/8 # RFC 1918',
      '  192.168.0.0/16  '
    ])).toEqual({ cidr4: ['10.0.0.0/8', '192.168.0.0/16'], cidr6: [] });
  });

  it('takes a single address as it is, writes IPv6 in lower case and deduplicates', () => {
    expect(parseCidrLines(['127.0.0.1', '127.0.0.1', 'FC00::/7', 'fc00::/7'])).toEqual({
      cidr4: ['127.0.0.1'],
      cidr6: ['fc00::/7']
    });
  });

  it('gives empty lists for an empty list', () => {
    expect(parseCidrLines([])).toEqual({ cidr4: [], cidr6: [] });
  });

  it('refuses a line that is not an address, instead of publishing the lines around it', () => {
    expect(() => parseCidrLines(['10.0.0.0/8', '<html>'])).toThrow('Not an IP address or range: <html>');
    expect(() => parseCidrLines(['404: Not Found'])).toThrow('Not an IP address or range: 404: Not Found');
  });
});
