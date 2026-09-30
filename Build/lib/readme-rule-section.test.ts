import { describe, it } from 'mocha';
import { expect } from 'earl';

import { LIST_URL_PREFIX, parseCheckTable, parsePolicies, parseProxyGroups, parseRuleSection, rRegionalIpRuleset, regionalIpProblems } from './readme-rule-section';
import type { RuleSectionEntry } from './readme-rule-section';

const README = [
  '# Surge Ruleset',
  '',
  '## Rule Section',
  '',
  '```ini',
  '[Rule]',
  '',
  '# ---- Blocking',
  `RULE-SET,${LIST_URL_PREFIX}non_ip/reject-drop.conf,REJECT-DROP,pre-matching`,
  `DOMAIN-SET,${LIST_URL_PREFIX}domainset/reject.conf,REJECT,extended-matching`,
  '# Phishing site blocklist, and a comment with a link https://example.com/List/x.conf',
  `# DOMAIN-SET,${LIST_URL_PREFIX}domainset/reject_phishing.conf,REJECT`,
  `RULE-SET,${LIST_URL_PREFIX}non_ip/github.conf,GitHub`,
  '',
  'FINAL,Proxy,dns-failed',
  '```',
  '',
  '### Policies',
  '',
  '| Policy | Used for |',
  '| --- | --- |',
  '| `Proxy` | The default |',
  '| `GitHub` | GitHub |',
  '| `REJECT`, `REJECT-DROP` | Blocking |',
  '',
  'If your profile does not have these groups yet:',
  '',
  '```ini',
  '[Proxy Group]',
  '# every group starts on Proxy',
  'GitHub = select, Proxy, DIRECT',
  '```',
  '',
  '### Check It',
  '',
  'Which ruleset a request matches first.',
  '',
  '| Host | From | Matches first | Why |',
  '| --- | --- | --- | --- |',
  '| `api.github.com` | Safari | `github.conf` | AI has it too |',
  '| `api.github.com` | `aria2c` | `direct.conf` | a process rule |',
  '| `music.youtube.com` | any | `youtubemusic.conf` | a part of YouTube |',
  '',
  '## Rulesets',
  '',
  '| Not | The table |',
  '| --- | --- |',
  '| `x` | y |'
].join('\n');

describe('parseRuleSection', () => {
  it('reads the rulesets in the order of the section, with their policy and options', () => {
    const section = parseRuleSection(README);
    expect(section.entries.map(entry => [entry.kind, entry.ruleset, entry.policy, entry.options, entry.optional])).toEqual([
      ['RULE-SET', 'non_ip/reject-drop.conf', 'REJECT-DROP', ['pre-matching'], false],
      ['DOMAIN-SET', 'domainset/reject.conf', 'REJECT', ['extended-matching'], false],
      ['DOMAIN-SET', 'domainset/reject_phishing.conf', 'REJECT', [], true],
      ['RULE-SET', 'non_ip/github.conf', 'GitHub', [], false]
    ]);
    expect(section.entries[0].url).toEqual(`${LIST_URL_PREFIX}non_ip/reject-drop.conf`);
  });

  it('reads FINAL, and has nothing left over', () => {
    const section = parseRuleSection(README);
    expect(section.final).toEqual({ policy: 'Proxy', options: ['dns-failed'] });
    expect(section.unknown).toEqual([]);
    expect(section.lines[0]).toEqual('[Rule]');
  });

  it('says what it cannot read, instead of leaving it out', () => {
    const readme = README.replace('FINAL,Proxy,dns-failed', 'RULE-SET,https://example.com/other.conf,Proxy\nSCRIPT,x.js\nFINAL,Proxy');
    const section = parseRuleSection(readme);
    expect(section.unknown).toEqual(['RULE-SET,https://example.com/other.conf,Proxy', 'SCRIPT,x.js']);
    expect(section.final).toEqual({ policy: 'Proxy', options: [] });
  });

  it('has no FINAL when the section has none', () => {
    expect(parseRuleSection(README.replace('FINAL,Proxy,dns-failed', '')).final).toEqual(null);
  });

  it('needs exactly one Rule section', () => {
    expect(() => parseRuleSection('# nothing here')).toThrow('has 0 Rule sections');
    expect(() => parseRuleSection(`${README}\n\`\`\`ini\n[Rule]\nFINAL,Proxy\n\`\`\`\n`)).toThrow('has 2 Rule sections');
  });
});

describe('parsePolicies', () => {
  it('reads every name in backticks in the first column of the table under "Policies"', () => {
    expect(parsePolicies(README)).toEqual(['Proxy', 'GitHub', 'REJECT', 'REJECT-DROP']);
  });

  it('says when there is no such section', () => {
    expect(() => parsePolicies('# nothing')).toThrow('no "### Policies" section');
  });
});

describe('parseProxyGroups', () => {
  it('reads the groups of the block', () => {
    expect(parseProxyGroups(README)).toEqual([{ name: 'GitHub', type: 'select', members: ['Proxy', 'DIRECT'] }]);
  });

  it('needs exactly one block, and a group on every line', () => {
    expect(() => parseProxyGroups('# nothing')).toThrow('has 0 Proxy Group blocks');
    expect(() => parseProxyGroups(README.replace('GitHub = select, Proxy, DIRECT', 'GitHub select'))).toThrow('Not a policy group: GitHub select');
  });
});

describe('parseCheckTable', () => {
  it('reads the host, the process (or none) and the file that matches first, and stops at the end of the table', () => {
    expect(parseCheckTable(README)).toEqual([
      { host: 'api.github.com', from: 'Safari', ruleset: 'github.conf' },
      { host: 'api.github.com', from: 'aria2c', ruleset: 'direct.conf' },
      { host: 'music.youtube.com', from: null, ruleset: 'youtubemusic.conf' }
    ]);
  });

  it('says when there is no such section', () => {
    expect(() => parseCheckTable('# nothing')).toThrow('no "### Check It" section');
  });
});

function entry(ruleset: string, policy = 'Streaming', optional = false): RuleSectionEntry {
  return {
    kind: 'RULE-SET',
    url: LIST_URL_PREFIX + ruleset,
    ruleset,
    policy,
    options: [],
    optional
  };
}

const sizes = (us = 0, jp = 0) => new Map([['ip/stream_us.conf', us], ['ip/stream_jp.conf', jp]]);

describe('regionalIpProblems', () => {
  /** The Rule section as the README has it: the regions for hostnames, then the addresses of all the services */
  const section = [
    entry('non_ip/stream_jp.conf'),
    entry('non_ip/stream_us.conf'),
    entry('non_ip/stream.conf'),
    entry('ip/github.conf', 'GitHub'),
    entry('ip/stream.conf')
  ];

  it('has nothing to say about the regions that have no address: the Rule section leaves them out', () => {
    expect(regionalIpProblems(section, sizes())).toEqual([]);
    expect(regionalIpProblems(section, new Map())).toEqual([]);
  });

  it('asks for a region that has addresses and is not in the Rule section, in front of ip/stream.conf', () => {
    expect(regionalIpProblems(section, sizes(3))).toEqual(['ip/stream_us.conf has 3 rules, and is not in the Rule section: it goes in front of ip/stream.conf, switched on']);
  });

  it('asks for a region that has addresses and is only a comment in the Rule section to be switched on', () => {
    const optional = [...section.slice(0, 4), entry('ip/stream_us.conf', 'Streaming', true), section[4]];
    expect(regionalIpProblems(optional, sizes(3))).toEqual(['ip/stream_us.conf has 3 rules, and the Rule section has it as a comment: it goes in front of ip/stream.conf, switched on']);
  });

  it('asks for a region that has addresses and stands behind ip/stream.conf to stand in front of it', () => {
    const behind = [...section, entry('ip/stream_us.conf')];
    expect(regionalIpProblems(behind, sizes(3))).toEqual(['ip/stream_us.conf has 3 rules, and stands behind ip/stream.conf, which has its addresses as well: it goes in front of it']);
  });

  it('has nothing to say about a region that has addresses and is in front of ip/stream.conf on the policy of its region', () => {
    const inFront = [...section.slice(0, 4), entry('ip/stream_us.conf'), section[4]];
    expect(regionalIpProblems(inFront, sizes(3))).toEqual([]);
    // the addresses of another region are not the concern of this one
    expect(regionalIpProblems(inFront, sizes(3, 0))).toEqual([]);
  });

  it('asks for the policy of the region for its hostnames, when the region has a policy of its own', () => {
    const own = [entry('non_ip/stream_us.conf', 'US Streaming'), entry('ip/stream_us.conf', 'Streaming'), entry('ip/stream.conf')];
    expect(regionalIpProblems(own, sizes(3))).toEqual(['ip/stream_us.conf has 3 rules, and is on Streaming, and its region is on US Streaming (the policy of non_ip/stream_us.conf)']);
    expect(regionalIpProblems([entry('non_ip/stream_us.conf', 'US Streaming'), entry('ip/stream_us.conf', 'US Streaming'), entry('ip/stream.conf')], sizes(3))).toEqual([]);
  });

  it('asks for the policy of ip/stream.conf when the Rule section has no ruleset of hostnames for the region', () => {
    const noHostnames = [entry('ip/stream_jp.conf', 'Japan Streaming'), entry('ip/stream.conf')];
    expect(regionalIpProblems(noHostnames, sizes(0, 2))).toEqual(['ip/stream_jp.conf has 2 rules, and is on Japan Streaming, and its region is on Streaming (the policy of ip/stream.conf)']);
  });

  it('reads every problem of every region that has addresses', () => {
    expect(regionalIpProblems(section, sizes(3, 2))).toEqual([
      'ip/stream_us.conf has 3 rules, and is not in the Rule section: it goes in front of ip/stream.conf, switched on',
      'ip/stream_jp.conf has 2 rules, and is not in the Rule section: it goes in front of ip/stream.conf, switched on'
    ]);
  });

  it('knows a ruleset of addresses of a region by its name, and not the one of all the services', () => {
    expect(['ip/stream_us.conf', 'ip/stream_south_east_asia.conf', 'ip/stream_kr.conf'].every(name => rRegionalIpRuleset.test(name))).toEqual(true);
    expect(['ip/stream.conf', 'non_ip/stream_us.conf', 'ip/telegram_asn.conf', 'ip/stream_us.conf.bak'].some(name => rRegionalIpRuleset.test(name))).toEqual(false);
  });
});
