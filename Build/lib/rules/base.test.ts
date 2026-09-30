import { describe, it } from 'mocha';
import { expect } from 'earl';

import { dummySpan } from '../../trace';
import { FileOutput } from './base';

/** What has been put into the lists of addresses, which a FileOutput keeps to itself until it writes */
class ExposedOutput extends FileOutput {
  get cidr4() {
    return [...this.ipcidr];
  }

  get cidr4NoResolve() {
    return [...this.ipcidrNoResolve];
  }

  get cidr6() {
    return [...this.ipcidr6];
  }

  get cidr6NoResolve() {
    return [...this.ipcidr6NoResolve];
  }
}

const output = () => new ExposedOutput(dummySpan, 'test');

describe('FileOutput: ranges of a family that the caller has sorted them into', () => {
  it('takes IPv4 and IPv6 ranges, and a single address as a range of one', () => {
    const file = output()
      .bulkAddCIDR4(['192.30.252.0/22', '203.0.113.7'])
      .bulkAddCIDR4NoResolve(['198.51.100.0/24'])
      .bulkAddCIDR6(['2a0a:a440::/29', '::1'])
      .bulkAddCIDR6NoResolve(['2001:4860::/32']);

    expect(file.cidr4).toEqual(['192.30.252.0/22', '203.0.113.7/32']);
    expect(file.cidr4NoResolve).toEqual(['198.51.100.0/24']);
    expect(file.cidr6).toEqual(['2a0a:a440::/29', '::1/128']);
    expect(file.cidr6NoResolve).toEqual(['2001:4860::/32']);
  });

  it('refuses a value that is not an address or a range of that family, and writes nothing of it', () => {
    // what the classifier of dots and colons used to let through
    expect(() => output().bulkAddCIDR4(['999.1.1.1/24'])).toThrow('test: not an IPv4 address or range: 999.1.1.1/24');
    expect(() => output().bulkAddCIDR4NoResolve(['10.0.0.0/33'])).toThrow('not an IPv4 address or range: 10.0.0.0/33');
    expect(() => output().bulkAddCIDR6(['1:2:3'])).toThrow('test: not an IPv6 address or range: 1:2:3');
    expect(() => output().bulkAddCIDR6NoResolve(['fc00::/129'])).toThrow('not an IPv6 address or range: fc00::/129');
    // and the other family, which is not what the caller says it is
    expect(() => output().bulkAddCIDR4(['2001:4860::/32'])).toThrow('not an IPv4 address or range');
    expect(() => output().bulkAddCIDR6(['8.8.8.0/24'])).toThrow('not an IPv6 address or range');
    expect(() => output().bulkAddCIDR4(['not an address'])).toThrow('not an IPv4 address or range: not an address');
  });

  it('refuses the whole call when one value is wrong, and says which', () => {
    const file = output();
    expect(() => file.bulkAddCIDR4(['192.30.252.0/22', '999.1.1.1/24', '203.0.113.0/24'])).toThrow('999.1.1.1/24');
  });
});

describe('FileOutput: ranges of any family', () => {
  it('sorts them into their family, and skips what is not an address or a range, however it looks', () => {
    const file = output();
    file.bulkAddAnyCIDR(['192.30.252.0/22', '2a0a:a440::/29', '999.1.1.1/24', '1:2:3', 'not an address', '203.0.113.7']);
    file.addAnyCIDR('198.51.100.0/24', true);
    file.addAnyCIDR('999.1.1.1/24', true);

    expect(file.cidr4).toEqual(['192.30.252.0/22', '203.0.113.7/32']);
    expect(file.cidr6).toEqual(['2a0a:a440::/29']);
    expect(file.cidr4NoResolve).toEqual(['198.51.100.0/24']);
    expect(file.cidr6NoResolve).toEqual([]);
  });
});
