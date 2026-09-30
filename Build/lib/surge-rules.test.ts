import { describe, it } from 'mocha';
import { expect } from 'earl';

import { RuleSet, SUPPORTED_RULE_TYPES, allMatches, firstMatch } from './surge-rules';
import type { OrderedRuleSet, Request } from './surge-rules';

const ruleSet = (content: string[], name = 'test.conf') => new RuleSet(name, content.join('\n'));
const matches = (content: string[], request: Request) => ruleSet(content).match(request)?.rule ?? null;
function order(...sets: Array<[name: string, content: string[], preMatching?: boolean]>): OrderedRuleSet[] {
  return sets.map(([name, content, preMatching]) => ({ ruleSet: ruleSet(content, name), preMatching }));
}

describe('RuleSet: hostnames', () => {
  it('matches a DOMAIN on the hostname and on nothing else, whatever the case', () => {
    const rules = ['DOMAIN,music.youtube.com'];
    expect(matches(rules, { hostname: 'music.youtube.com' })).toEqual('DOMAIN,music.youtube.com');
    expect(matches(rules, { hostname: 'Music.YouTube.com' })).toEqual('DOMAIN,music.youtube.com');
    expect(matches(rules, { hostname: 'www.music.youtube.com' })).toEqual(null);
    expect(matches(rules, { hostname: 'youtube.com' })).toEqual(null);
  });

  it('matches a DOMAIN-SUFFIX on the domain and its subdomains, not on a name that only ends the same way', () => {
    const rules = ['DOMAIN-SUFFIX,github.com'];
    expect(matches(rules, { hostname: 'github.com' })).toEqual('DOMAIN-SUFFIX,github.com');
    expect(matches(rules, { hostname: 'api.github.com' })).toEqual('DOMAIN-SUFFIX,github.com');
    expect(matches(rules, { hostname: 'a.b.c.github.com' })).toEqual('DOMAIN-SUFFIX,github.com');
    expect(matches(rules, { hostname: 'notgithub.com' })).toEqual(null);
    expect(matches(rules, { hostname: 'github.com.evil.example' })).toEqual(null);
  });

  it('matches a DOMAIN-SUFFIX with several labels, and a top-level domain', () => {
    expect(matches(['DOMAIN-SUFFIX,cn.ls.apple.com'], { hostname: 'x.cn.ls.apple.com' })).toEqual('DOMAIN-SUFFIX,cn.ls.apple.com');
    expect(matches(['DOMAIN-SUFFIX,cn.ls.apple.com'], { hostname: 'ls.apple.com' })).toEqual(null);
    expect(matches(['DOMAIN-SUFFIX,cn'], { hostname: 'www.baidu.cn' })).toEqual('DOMAIN-SUFFIX,cn');
  });

  it('matches a DOMAIN-KEYWORD on a part of the hostname, and reads it literally', () => {
    expect(matches(['DOMAIN-KEYWORD,-tiktokcdn-com'], { hostname: 'p16-tiktokcdn-com.akamaized.net' })).toEqual('DOMAIN-KEYWORD,-tiktokcdn-com');
    expect(matches(['DOMAIN-KEYWORD,a*b'], { hostname: 'axxb.example' })).toEqual(null);
    expect(matches(['DOMAIN-KEYWORD,a*b'], { hostname: 'a*b.example' })).toEqual('DOMAIN-KEYWORD,a*b');
  });

  it('matches a DOMAIN-WILDCARD with `*` for any number of characters (dots too) and `?` for exactly one', () => {
    const rules = ['DOMAIN-WILDCARD,*.lz-cdn?.com', 'DOMAIN-WILDCARD,cdn.*.microsoft.com'];
    expect(matches(rules, { hostname: 'a.lz-cdn1.com' })).toEqual('DOMAIN-WILDCARD,*.lz-cdn?.com');
    expect(matches(rules, { hostname: 'a.b.lz-cdn1.com' })).toEqual('DOMAIN-WILDCARD,*.lz-cdn?.com');
    expect(matches(rules, { hostname: 'a.lz-cdn.com' })).toEqual(null);
    expect(matches(rules, { hostname: 'a.lz-cdn12.com' })).toEqual(null);
    expect(matches(rules, { hostname: 'cdn.winget.microsoft.com' })).toEqual('DOMAIN-WILDCARD,cdn.*.microsoft.com');
    expect(matches(rules, { hostname: 'cdn.a.b.microsoft.com' })).toEqual('DOMAIN-WILDCARD,cdn.*.microsoft.com');
    expect(matches(['DOMAIN-WILDCARD,a*'], { hostname: 'a' })).toEqual('DOMAIN-WILDCARD,a*');
  });

  it('reads a DOMAIN-SET as a hostname on every line, and a dot in front of it as a suffix', () => {
    const domainSet = new RuleSet('cdn.conf', ['# a comment', '', '.ytimg.com', 'img.youtube.com'].join('\n'), { domainSet: true });
    expect(domainSet.match({ hostname: 'ytimg.com' })?.rule).toEqual('.ytimg.com');
    expect(domainSet.match({ hostname: 'i.ytimg.com' })?.rule).toEqual('.ytimg.com');
    expect(domainSet.match({ hostname: 'img.youtube.com' })?.rule).toEqual('img.youtube.com');
    expect(domainSet.match({ hostname: 'www.img.youtube.com' })).toEqual(null);
    expect(domainSet.match({ hostname: 'notytimg.com' })).toEqual(null);
  });

  it('gives the first rule of the file when several match, with its line', () => {
    const rules = ruleSet(['# header', 'DOMAIN-SUFFIX,youtube.com', 'DOMAIN,music.youtube.com', 'DOMAIN-KEYWORD,youtube']);
    expect(rules.match({ hostname: 'music.youtube.com' })).toEqual({ line: 2, rule: 'DOMAIN-SUFFIX,youtube.com' });
    expect(ruleSet(['DOMAIN-KEYWORD,youtube', 'DOMAIN,music.youtube.com']).match({ hostname: 'music.youtube.com' })).toEqual({ line: 1, rule: 'DOMAIN-KEYWORD,youtube' });
  });

  it('does not match a request without a hostname on a rule for hostnames', () => {
    expect(matches(['DOMAIN-SUFFIX,github.com', 'DOMAIN-KEYWORD,git'], { process: 'aria2c' })).toEqual(null);
  });
});

describe('RuleSet: processes, apps and connections', () => {
  it('matches a PROCESS-NAME on the name of the process, case-sensitively, with `*` and `?`', () => {
    const rules = ['PROCESS-NAME,aria2c', 'PROCESS-NAME,qbittorrent*', 'PROCESS-NAME,*CloudMounter', 'PROCESS-NAME,uTorren?'];
    expect(matches(rules, { process: 'aria2c' })).toEqual('PROCESS-NAME,aria2c');
    expect(matches(rules, { process: 'Aria2c' })).toEqual(null);
    expect(matches(rules, { process: 'aria2c-helper' })).toEqual(null);
    expect(matches(rules, { process: 'qbittorrent-nox' })).toEqual('PROCESS-NAME,qbittorrent*');
    expect(matches(rules, { process: 'qbittorrent' })).toEqual('PROCESS-NAME,qbittorrent*');
    expect(matches(rules, { process: 'Setapp CloudMounter' })).toEqual('PROCESS-NAME,*CloudMounter');
    expect(matches(rules, { process: 'uTorrent' })).toEqual('PROCESS-NAME,uTorren?');
    expect(matches(rules, { process: 'Safari' })).toEqual(null);
    expect(matches(rules, { hostname: 'example.com' })).toEqual(null);
  });

  it('matches a process whatever the hostname is, and also a request that has none', () => {
    const rules = ['PROCESS-NAME,aria2c'];
    expect(matches(rules, { process: 'aria2c', hostname: 'api.github.com' })).toEqual('PROCESS-NAME,aria2c');
    expect(matches(rules, { process: 'aria2c' })).toEqual('PROCESS-NAME,aria2c');
  });

  it('does not evaluate a PROCESS-NAME with a path, and counts it', () => {
    const rules = ruleSet(['PROCESS-NAME,/usr/bin/ssh', 'PROCESS-NAME,/Applications/Foo.app/']);
    expect(rules.match({ process: '/usr/bin/ssh' })).toEqual(null);
    expect(rules.unsupported).toEqual(new Map([['PROCESS-NAME', 2]]));
  });

  it('matches a USER-AGENT on the whole header, case-sensitively, with `*` and `?`', () => {
    const rules = ['USER-AGENT,YouTubeMusic*', 'USER-AGENT,com.google.ios.youtubemusic*', 'USER-AGENT,Hulu?'];
    expect(matches(rules, { userAgent: 'YouTubeMusic/7.0 (iPhone)' })).toEqual('USER-AGENT,YouTubeMusic*');
    expect(matches(rules, { userAgent: 'com.google.ios.youtubemusic/7.0' })).toEqual('USER-AGENT,com.google.ios.youtubemusic*');
    expect(matches(rules, { userAgent: 'youtubemusic/7.0' })).toEqual(null);
    expect(matches(rules, { userAgent: 'Mozilla YouTubeMusic/7.0' })).toEqual(null);
    expect(matches(rules, { userAgent: 'Hulu1' })).toEqual('USER-AGENT,Hulu?');
    expect(matches(rules, { hostname: 'example.com' })).toEqual(null);
  });

  it('matches a PROTOCOL as it is written, and lets TCP and UDP take their protocols', () => {
    expect(matches(['PROTOCOL,MTProto'], { protocol: 'MTProto' })).toEqual('PROTOCOL,MTProto');
    expect(matches(['PROTOCOL,MTProto'], { protocol: 'MTPROTO' })).toEqual(null);
    expect(matches(['PROTOCOL,HTTPS'], { protocol: 'HTTP' })).toEqual(null);
    expect(matches(['PROTOCOL,TCP'], { protocol: 'MTProto' })).toEqual('PROTOCOL,TCP');
    expect(matches(['PROTOCOL,TCP'], { protocol: 'HTTPS' })).toEqual('PROTOCOL,TCP');
    expect(matches(['PROTOCOL,TCP'], { protocol: 'QUIC' })).toEqual(null);
    expect(matches(['PROTOCOL,UDP'], { protocol: 'QUIC' })).toEqual('PROTOCOL,UDP');
    expect(matches(['PROTOCOL,UDP'], { protocol: 'STUN' })).toEqual('PROTOCOL,UDP');
    expect(matches(['PROTOCOL,UDP'], { protocol: 'HTTP' })).toEqual(null);
  });

  it('matches a DEST-PORT that is a port, a range or a comparison', () => {
    expect(matches(['DEST-PORT,7680'], { destPort: 7680 })).toEqual('DEST-PORT,7680');
    expect(matches(['DEST-PORT,7680'], { destPort: 7681 })).toEqual(null);
    expect(matches(['DEST-PORT,10000-20000'], { destPort: 10000 })).toEqual('DEST-PORT,10000-20000');
    expect(matches(['DEST-PORT,10000-20000'], { destPort: 20001 })).toEqual(null);
    expect(matches(['DEST-PORT,>=50000'], { destPort: 50000 })).toEqual('DEST-PORT,>=50000');
    expect(matches(['DEST-PORT,>50000'], { destPort: 50000 })).toEqual(null);
    expect(matches(['DEST-PORT,<1024'], { destPort: 443 })).toEqual('DEST-PORT,<1024');
    expect(matches(['DEST-PORT,<=1024'], { destPort: 1025 })).toEqual(null);
    expect(matches(['DEST-PORT,443'], { hostname: 'example.com' })).toEqual(null);
  });

  it('matches an SRC-IP that is an address or a range', () => {
    expect(matches(['SRC-IP,192.168.20.100'], { srcIp: '192.168.20.100' })).toEqual('SRC-IP,192.168.20.100');
    expect(matches(['SRC-IP,192.168.20.100'], { srcIp: '192.168.20.101' })).toEqual(null);
    expect(matches(['SRC-IP,192.168.20.0/24'], { srcIp: '192.168.20.7' })).toEqual('SRC-IP,192.168.20.0/24');
    expect(matches(['SRC-IP,fd00::/8'], { srcIp: 'fd12::1' })).toEqual('SRC-IP,fd00::/8');
    expect(matches(['SRC-IP,192.168.20.0/24'], { srcIp: 'fd12::1' })).toEqual(null);
  });
});

describe('RuleSet: addresses', () => {
  it('matches an IP-CIDR and an IP-CIDR6 on the address of the destination', () => {
    const rules = ['IP-CIDR,149.154.160.0/20,no-resolve', 'IP-CIDR,8.8.8.8/32', 'IP-CIDR6,2001:b28:f23d::/48'];
    expect(matches(rules, { destIp: '149.154.167.50' })).toEqual('IP-CIDR,149.154.160.0/20,no-resolve');
    expect(matches(rules, { destIp: '149.154.176.1' })).toEqual(null);
    expect(matches(rules, { destIp: '8.8.8.8' })).toEqual('IP-CIDR,8.8.8.8/32');
    expect(matches(rules, { destIp: '2001:b28:f23d:f001::a' })).toEqual('IP-CIDR6,2001:b28:f23d::/48');
    expect(matches(rules, { destIp: '2001:b28:f23e::1' })).toEqual(null);
  });

  it('does not resolve a hostname: an IP rule needs the address that the request brings', () => {
    expect(matches(['IP-CIDR,8.8.8.8/32'], { hostname: 'dns.google' })).toEqual(null);
    expect(matches(['IP-CIDR,8.8.8.8/32'], { hostname: 'dns.google', destIp: '8.8.8.8' })).toEqual('IP-CIDR,8.8.8.8/32');
  });
});

describe('RuleSet: logical rules', () => {
  it('matches an AND when every sub-rule does', () => {
    const rules = ['AND,((DOMAIN-SUFFIX,sharepoint.com),(PROCESS-NAME,*CloudMounter))'];
    expect(matches(rules, { hostname: 'x.sharepoint.com', process: 'CloudMounter' })).toEqual(rules[0]);
    expect(matches(rules, { hostname: 'x.sharepoint.com', process: 'Safari' })).toEqual(null);
    expect(matches(rules, { hostname: 'x.sharepoint.com' })).toEqual(null);
    expect(matches(rules, { process: 'CloudMounter' })).toEqual(null);
  });

  it('matches an AND of a hostname and a source range, as the CloudMounter list writes it', () => {
    const rules = ['AND,((DOMAIN-SUFFIX,sharepoint.com),(SRC-IP,10.0.0.0/8))'];
    expect(matches(rules, { hostname: 'a.sharepoint.com', srcIp: '10.1.2.3' })).toEqual(rules[0]);
    expect(matches(rules, { hostname: 'a.sharepoint.com', srcIp: '11.1.2.3' })).toEqual(null);
  });

  it('matches an OR when one sub-rule does, and a NOT when its sub-rule does not', () => {
    const or = ['OR,((DOMAIN,a.example.com),(PROCESS-NAME,tool))'];
    expect(matches(or, { hostname: 'a.example.com' })).toEqual(or[0]);
    expect(matches(or, { process: 'tool' })).toEqual(or[0]);
    expect(matches(or, { hostname: 'b.example.com' })).toEqual(null);

    const not = ['NOT,((DOMAIN-SUFFIX,example.com))'];
    expect(matches(not, { hostname: 'a.example.com' })).toEqual(null);
    expect(matches(not, { hostname: 'a.example.org' })).toEqual(not[0]);
  });

  it('nests logical rules', () => {
    const rules = ['AND,((OR,((DOMAIN,a.example.com),(DOMAIN,b.example.com))),(NOT,((PROCESS-NAME,tool))))'];
    expect(matches(rules, { hostname: 'b.example.com', process: 'other' })).toEqual(rules[0]);
    expect(matches(rules, { hostname: 'b.example.com', process: 'tool' })).toEqual(null);
    expect(matches(rules, { hostname: 'c.example.com', process: 'other' })).toEqual(null);
  });

  it('never matches a logical rule that holds a type it cannot evaluate, and counts it', () => {
    const rules = ruleSet([String.raw`AND,((DOMAIN-SUFFIX,example.com),(URL-REGEX,^https://example\.com/))`]);
    expect(rules.match({ hostname: 'example.com', destIp: '1.1.1.1' })).toEqual(null);
    expect(rules.unsupported).toEqual(new Map([['AND', 1]]));
  });
});

describe('RuleSet: what it cannot evaluate', () => {
  it('does not match URL-REGEX, IP-ASN and GEOIP, and says how many of each there are', () => {
    const rules = ruleSet([String.raw`URL-REGEX,^https://a\.example\.com/`, String.raw`URL-REGEX,^https://b\.example\.com/`, 'IP-ASN,714', 'GEOIP,CN', 'DOMAIN,a.example.com']);
    expect(rules.unsupported).toEqual(new Map([['URL-REGEX', 2], ['IP-ASN', 1], ['GEOIP', 1]]));
    expect([...rules.types].sort()).toEqual(['DOMAIN', 'GEOIP', 'IP-ASN', 'URL-REGEX']);
    expect(rules.match({ hostname: 'a.example.com' })).toEqual({ line: 5, rule: 'DOMAIN,a.example.com' });
    expect(rules.match({ hostname: 'b.example.com', destIp: '17.0.0.1' })).toEqual(null);
  });

  it('knows which types it evaluates', () => {
    expect([...SUPPORTED_RULE_TYPES]).toEqual([
      'DOMAIN', 'DOMAIN-SUFFIX', 'DOMAIN-KEYWORD', 'DOMAIN-WILDCARD',
      'PROCESS-NAME', 'USER-AGENT',
      'PROTOCOL', 'DEST-PORT', 'SRC-IP',
      'IP-CIDR', 'IP-CIDR6',
      'AND', 'OR', 'NOT'
    ]);
  });
});

describe('RuleSet: lines that are not rules', () => {
  it('names the file and the line of a rule that it cannot read', () => {
    expect(() => ruleSet(['DOMAIN,a.example.com', 'DOMAIN']).match({})).toThrow('test.conf:2: not a rule: DOMAIN');
    expect(() => ruleSet(['DOMAIN,']).match({})).toThrow('test.conf:1: no value: DOMAIN,');
    expect(() => ruleSet(['DEST-PORT,http']).match({})).toThrow('not a port, a range or a comparison');
    expect(() => ruleSet(['IP-CIDR,300.1.1.1/8']).match({})).toThrow('not an address or a range');
    expect(() => ruleSet(['SRC-IP,not-an-address']).match({})).toThrow('not an address or a range');
    expect(() => ruleSet(['AND,(DOMAIN,a.example.com)']).match({})).toThrow('the parentheses of a logical rule do not match');
    expect(() => ruleSet(['AND,DOMAIN,a.example.com']).match({})).toThrow('a logical rule needs its sub-rules in parentheses');
    expect(() => ruleSet(['NOT,((DOMAIN,a.example.com),(DOMAIN,b.example.com))']).match({})).toThrow('NOT takes exactly one sub-rule');
  });

  it('skips comments and empty lines, and counts the lines from 1', () => {
    expect(ruleSet(['#########', '# header', '', '   ', 'DOMAIN,a.example.com']).match({ hostname: 'a.example.com' })).toEqual({ line: 5, rule: 'DOMAIN,a.example.com' });
  });

  it('counts the rules of the file, and not its comments and blank lines, in a ruleset, in a DOMAIN-SET, and when it cannot evaluate them', () => {
    expect(ruleSet([]).size).toEqual(0);
    expect(ruleSet(['#########', '# Size: 0', '#########', '################## EOF ##################']).size).toEqual(0);
    expect(ruleSet(['# header', 'DOMAIN,a.example.com', '', 'DOMAIN-SUFFIX,b.example.com', '# a comment', 'IP-ASN,44907']).size).toEqual(3);
    expect(new RuleSet('set.conf', ['# header', 'a.example.com', '.b.example.com', ''].join('\n'), { domainSet: true }).size).toEqual(2);
  });
});

describe('firstMatch and allMatches', () => {
  it('gives the first ruleset in the order of the section, and every one that matches, in order', () => {
    const section = order(
      ['stream.conf', ['DOMAIN-SUFFIX,youtube.com']],
      ['youtube.conf', ['DOMAIN-SUFFIX,youtube.com']],
      ['google.conf', ['DOMAIN-SUFFIX,google.com', 'DOMAIN-SUFFIX,youtube.com']]
    );
    expect(firstMatch(section, { hostname: 'www.youtube.com' })).toEqual({ ruleset: 'stream.conf', line: 1, rule: 'DOMAIN-SUFFIX,youtube.com' });
    expect(allMatches(section, { hostname: 'www.youtube.com' }).map(match => match.ruleset)).toEqual(['stream.conf', 'youtube.conf', 'google.conf']);
    expect(firstMatch([section[2], section[1], section[0]], { hostname: 'www.youtube.com' })?.ruleset).toEqual('google.conf');
    expect(firstMatch(section, { hostname: 'www.google.com' })?.ruleset).toEqual('google.conf');
  });

  it('gives null when no ruleset matches, and FINAL decides', () => {
    expect(firstMatch(order(['a.conf', ['DOMAIN,a.example.com']]), { hostname: 'b.example.com' })).toEqual(null);
    expect(allMatches(order(['a.conf', ['DOMAIN,a.example.com']]), { hostname: 'b.example.com' })).toEqual([]);
  });

  it('puts a ruleset with pre-matching in front of the others, wherever it stands', () => {
    const section = order(
      ['direct.conf', ['DOMAIN-SUFFIX,example.com']],
      ['reject-drop.conf', ['DOMAIN,ads.example.com'], true]
    );
    expect(firstMatch(section, { hostname: 'ads.example.com' })?.ruleset).toEqual('reject-drop.conf');
    expect(allMatches(section, { hostname: 'ads.example.com' }).map(match => match.ruleset)).toEqual(['reject-drop.conf', 'direct.conf']);
  });

  it('gives another ruleset for the same hostname from another process, because a rule for a process stands where its ruleset stands', () => {
    const section = order(
      ['direct.conf', ['PROCESS-NAME,aria2c']],
      ['github.conf', ['DOMAIN-SUFFIX,github.com']],
      ['apple_services.conf', ['PROCESS-NAME,apsd']]
    );
    expect(firstMatch(section, { hostname: 'api.github.com', process: 'Safari' })?.ruleset).toEqual('github.conf');
    expect(firstMatch(section, { hostname: 'api.github.com', process: 'aria2c' })?.ruleset).toEqual('direct.conf');
    // the process rule of a ruleset that stands behind github.conf loses to a rule for the hostname in front of it
    expect(firstMatch(section, { hostname: 'api.github.com', process: 'apsd' })?.ruleset).toEqual('github.conf');
    expect(firstMatch(section, { hostname: 'example.org', process: 'apsd' })?.ruleset).toEqual('apple_services.conf');
    expect(firstMatch([section[1], section[0]], { hostname: 'api.github.com', process: 'aria2c' })?.ruleset).toEqual('github.conf');
  });
});
