import { describe, it } from 'mocha';
import { expect } from 'earl';

import { LIST_URL_PREFIX, parseCheckTable, parsePolicies, parseProxyGroups, parseRuleSection } from './readme-rule-section';

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
