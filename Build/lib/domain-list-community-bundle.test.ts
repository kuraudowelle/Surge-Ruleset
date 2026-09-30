import { describe, it } from 'mocha';
import { expect } from 'earl';

import { parseDomainListCommunityBundle } from './domain-list-community-bundle';
import { DomainListCommunityResolver } from './domain-list-community';

const sorted = (values: string[]) => values.slice().sort();

describe('parseDomainListCommunityBundle', () => {
  it('reads what https://raw.githubusercontent.com/v2fly/domain-list-community/release/dlc.dat_plain.yml looks like', () => {
    const lists = parseDomainListCommunityBundle([
      'lists:',
      '  - name: "0x0"',
      '    length: 1',
      '    rules:',
      '      - "domain:0x0.st"',
      '  - name: "category-speedtest"',
      '    length: 3',
      '    rules:',
      '      - "domain:cdnst.net"',
      '      - "domain:cnspeedtest.cn:@cn"',
      '      - "full:www.speedtest.net.cdn.cloudflare.net"'
    ]);

    expect(Array.from(lists.keys())).toEqual(['0x0', 'category-speedtest']);
    expect(lists.get('0x0')).toEqual(['domain:0x0.st']);
    // the attribute is written the way the file of a list writes it
    expect(lists.get('category-speedtest')).toEqual([
      'domain:cdnst.net',
      'domain:cnspeedtest.cn @cn',
      'full:www.speedtest.net.cdn.cloudflare.net'
    ]);
  });

  it('keeps a name with a ! in it, like the lists for what is meant for abroad', () => {
    const lists = parseDomainListCommunityBundle([
      'lists:',
      '  - name: "geolocation-!cn"',
      '    length: 2',
      '    rules:',
      '      - "domain:bilibili.tv:@!cn"',
      '      - "domain:example.com:@ads"'
    ]);

    expect(lists.get('geolocation-!cn')).toEqual(['domain:bilibili.tv @!cn', 'domain:example.com @ads']);
  });

  it('reads a regexp with the backslashes that the file doubles, as the rule says it', () => {
    const lists = parseDomainListCommunityBundle([
      'lists:',
      '  - name: "google"',
      '    length: 2',
      '    rules:',
      String.raw`      - "regexp:^r+[0-9]+(---|\\.)sn-(2x3|ni5)\\w{5}\\.googlevideo\\.com$:@cn"`,
      String.raw`      - "regexp:.+\\.awsdns-cn-[0-9][0-9]\\.(biz|com|net|top)$"`
    ]);

    expect(lists.get('google')).toEqual([
      String.raw`regexp:^r+[0-9]+(---|\.)sn-(2x3|ni5)\w{5}\.googlevideo\.com$ @cn`,
      String.raw`regexp:.+\.awsdns-cn-[0-9][0-9]\.(biz|com|net|top)$`
    ]);
  });

  it('takes a list with no rules, however the file writes it', () => {
    const lists = parseDomainListCommunityBundle([
      'lists:',
      '  - name: "a"',
      '    length: 0',
      '    rules: []',
      '  - name: "b"',
      '    length: 0',
      '    rules:',
      '  - name: "c"',
      '    length: 1',
      '    rules:',
      '      - "domain:c.example.com"'
    ]);

    expect(lists.get('a')).toEqual([]);
    expect(lists.get('b')).toEqual([]);
    expect(lists.get('c')).toEqual(['domain:c.example.com']);
  });

  it('ignores blank lines, and the lists that no file could have the name of', () => {
    const lists = parseDomainListCommunityBundle([
      '',
      'lists:',
      '',
      '  - name: "Not A List Name"',
      '    length: 1',
      '    rules:',
      '      - "domain:skipped.example.com"',
      '  - name: "kept"',
      '    length: 1',
      '    rules:',
      '      - "domain:kept.example.com"',
      ''
    ]);

    expect(Array.from(lists.keys())).toEqual(['kept']);
  });

  it('refuses a list that has other rules than it says, which is what a download that stopped halfway looks like', () => {
    expect(() => parseDomainListCommunityBundle([
      'lists:',
      '  - name: "apple"',
      '    length: 3',
      '    rules:',
      '      - "domain:apple.com"',
      '      - "domain:icloud.com"'
    ])).toThrow('"apple" says that it has 3 rules, and has 2');

    expect(() => parseDomainListCommunityBundle([
      'lists:',
      '  - name: "apple"',
      '    length: 1',
      '    rules:',
      '      - "domain:apple.com"',
      '      - "domain:icloud.com"',
      '  - name: "next"',
      '    length: 0',
      '    rules: []'
    ])).toThrow('"apple" says that it has 1 rules, and has 2');
  });

  it('refuses a file of another shape, instead of publishing part of it', () => {
    expect(() => parseDomainListCommunityBundle([])).toThrow('it is empty');
    expect(() => parseDomainListCommunityBundle(['<html>'])).toThrow('does not start with "lists:"');
    expect(() => parseDomainListCommunityBundle(['lists:', '      - "domain:a.example.com"'])).toThrow('before the first list');
    expect(() => parseDomainListCommunityBundle([
      'lists:',
      '  - name: "a"',
      '    length: 1',
      '    rules:',
      '      - "domain:a.example.com"',
      '    something: new'
    ])).toThrow('unexpected line in "a"');
    // a rule before `rules:` is not a rule of the list
    expect(() => parseDomainListCommunityBundle([
      'lists:',
      '  - name: "a"',
      '      - "domain:a.example.com"'
    ])).toThrow('unexpected line in "a"');
  });

  it('gives lists that the resolver reads like the lists of the community, attributes and ads included', async () => {
    const lists = parseDomainListCommunityBundle([
      'lists:',
      '  - name: "apple"',
      '    length: 5',
      '    rules:',
      '      - "domain:apple.com"',
      '      - "domain:apple.com.cn:@cn"',
      '      - "full:gspe-cn.apple.com:@cn"',
      '      - "domain:ads.apple.com:@ads"',
      String.raw`      - "regexp:^a+\\.apple\\.com$"`
    ]);
    const resolver = new DomainListCommunityResolver(list => lists.get(list)!);

    const all = await resolver.resolve('apple');
    expect(sorted(all.suffixes)).toEqual(['apple.com', 'apple.com.cn']);
    expect(all.full).toEqual(['gspe-cn.apple.com']);
    expect(sorted(all.skipped)).toEqual(sorted(['domain:ads.apple.com @ads', String.raw`regexp:^a+\.apple\.com$`]));

    const mainland = await resolver.resolve('apple', { must: ['cn'] });
    expect(sorted(mainland.suffixes)).toEqual(['apple.com.cn']);
    expect(mainland.full).toEqual(['gspe-cn.apple.com']);

    const rest = await resolver.resolve('apple', { ban: ['cn'] });
    expect(rest.suffixes).toEqual(['apple.com']);
    expect(rest.full).toEqual([]);
  });
});
