import fs from 'node:fs';
import path from 'node:path';
import { before, describe, it } from 'mocha';
import { expect } from 'earl';
import { nullthrow } from 'foxts/guard';
import { split0th } from 'foxts/split-nth';

import { ROOT_DIR } from '../constants/dir';
import { KNOWN_UNSUPPORTED_RULE_TYPES, LIST_DIR, readList } from './published-lists';
import { RuleSet, SUPPORTED_RULE_TYPES, allMatches, firstMatch } from './surge-rules';
import type { OrderedRuleSet, Request } from './surge-rules';
import { parseCheckTable, parsePolicies, parseProxyGroups, parseRuleSection } from './readme-rule-section';
import type { RuleSection, RuleSectionEntry } from './readme-rule-section';

const BUILT_IN_POLICIES = new Set(['DIRECT', 'REJECT', 'REJECT-DROP', 'REJECT-NO-DROP']);

const rAddressRule = /^IP-CIDR6?,/;

interface Probe {
  request: Request,
  /** The ruleset that matches first */
  first: string,
  /** Rulesets that match this request as well, and stand behind the first: without them the probe would prove nothing */
  also?: string[]
}

function label(request: Request) {
  const parts = [request.hostname ?? '(no hostname)'];
  if (request.process !== undefined) {
    parts.push(`from ${request.process}`);
  }
  if (request.userAgent !== undefined) {
    parts.push(`with the User-Agent ${request.userAgent}`);
  }
  if (request.protocol !== undefined) {
    parts.push(`over ${request.protocol}`);
  }
  if (request.destIp !== undefined) {
    parts.push(`to ${request.destIp}`);
  }
  return parts.join(' ');
}

/** The address that a ruleset of IP-CIDR rules starts with: an address that the ruleset has */
function firstAddressOf(name: string) {
  const line = nullthrow(readList(name).split('\n').find(text => text.startsWith('IP-CIDR,')), `${name} has no IP-CIDR`);
  return split0th(line.slice('IP-CIDR,'.length), '/');
}

/** A copy of the entries with one ruleset moved in front of, or behind, another */
function moved(entries: readonly RuleSectionEntry[], name: string, where: 'before' | 'after', target: string) {
  const moving = nullthrow(entries.find(entry => entry.ruleset === name), `${name} is not in the Rule section`);
  const rest = entries.filter(entry => entry.ruleset !== name);
  const at = rest.findIndex(entry => entry.ruleset === target);
  expect(at).not.toEqual(-1);
  return [...rest.slice(0, at + (where === 'after' ? 1 : 0)), moving, ...rest.slice(at + (where === 'after' ? 1 : 0))];
}

/**
 * The Rule section of the README, run against the rulesets that this project publishes: which ruleset does a request
 * match first? It asserts the ruleset, not the policy: with every ruleset on `Proxy`, a wrong order gives the same
 * policy and no error in Surge, and it is the order that decides which policy the day one ruleset gets another.
 *
 * The rulesets are read from `List/`, or from the directory that SURGE_LIST_DIR names (see published-lists.ts): the CI
 * of this repository points it at `public/List` after a build and before the deployment, because an upstream list can
 * bring an overlap that no source changed.
 *
 * The simulation is `surge-rules.ts`, and its header says what it evaluates and what it does not. In short, it
 * evaluates DOMAIN, DOMAIN-SUFFIX, DOMAIN-KEYWORD, DOMAIN-WILDCARD (and DOMAIN-SET lines), PROCESS-NAME, USER-AGENT,
 * PROTOCOL, DEST-PORT, SRC-IP, IP-CIDR, IP-CIDR6 and AND, OR, NOT. It does not evaluate URL-REGEX and IP-ASN, which the
 * lists use, and it does not resolve DNS or look at the TLS SNI: a request only has what a probe below gives it.
 */
describe('the Rule section of the README', () => {
  let readme: string;
  let section: RuleSection;
  const rulesets = new Map<string, RuleSet>();

  before(function () {
    this.timeout(60000);
    readme = fs.readFileSync(path.join(ROOT_DIR, 'README.md'), 'utf8');
    section = parseRuleSection(readme);
    for (let i = 0, len = section.entries.length; i < len; i++) {
      const entry = section.entries[i];
      rulesets.set(entry.ruleset, new RuleSet(entry.ruleset, readList(entry.ruleset), { domainSet: entry.kind === 'DOMAIN-SET' }));
    }
  });

  const active = () => section.entries.filter(entry => !entry.optional);
  const order = (entries: readonly RuleSectionEntry[] = active()): OrderedRuleSet[] => entries.map(entry => ({
    ruleSet: nullthrow(rulesets.get(entry.ruleset), entry.ruleset),
    preMatching: entry.options.includes('pre-matching')
  }));
  const first = (request: Request, entries?: readonly RuleSectionEntry[]) => firstMatch(order(entries), request)?.ruleset ?? null;

  function probes(list: Probe[]) {
    for (let i = 0, len = list.length; i < len; i++) {
      const probe = list[i];
      it(`${label(probe.request)} matches ${probe.first} first`, () => {
        const matched = allMatches(order(), probe.request).map(match => match.ruleset);
        expect({ request: label(probe.request), first: matched[0] ?? null }).toEqual({ request: label(probe.request), first: probe.first });
        // the rulesets behind the first that the request is in as well: without them, the probe proves nothing
        const missing = (probe.also ?? []).filter(name => !matched.slice(1).includes(name));
        expect({ request: label(probe.request), notBehind: missing }).toEqual({ request: label(probe.request), notBehind: [] });
      });
    }
  }

  describe('is a Rule section that can be pasted into a profile', () => {
    it('is the whole section, from [Rule] to FINAL, and every line of it is a comment, a ruleset or FINAL', () => {
      expect(section.lines[0]).toEqual('[Rule]');
      expect(section.unknown).toEqual([]);
      expect(section.final).toEqual({ policy: 'Proxy', options: ['dns-failed'] });
      expect(section.lines.at(-1)?.startsWith('FINAL,')).toEqual(true);
    });

    it('names a ruleset once, and a file of List/ that exists, in the directory that the kind of the line needs', () => {
      const names = section.entries.map(entry => entry.ruleset);
      expect(new Set(names).size).toEqual(names.length);
      for (let i = 0, len = section.entries.length; i < len; i++) {
        const entry = section.entries[i];
        expect({ ruleset: entry.ruleset, exists: fs.existsSync(path.join(LIST_DIR, entry.ruleset)) }).toEqual({ ruleset: entry.ruleset, exists: true });
        expect({ ruleset: entry.ruleset, domainSet: entry.kind === 'DOMAIN-SET' }).toEqual({ ruleset: entry.ruleset, domainSet: entry.ruleset.startsWith('domainset/') });
      }
    });

    it('reads no ruleset that is empty: the service that it stands for would fall to FINAL, and Surge says nothing', () => {
      const empty: string[] = [];
      rulesets.forEach((ruleSet, name) => {
        if (ruleSet.size === 0) {
          empty.push(name);
        }
      });
      expect(empty).toEqual([]);
    });

    it('keeps every ruleset for hostnames in front of every IP ruleset, so that Surge resolves DNS only when it has to', () => {
      const entries = active();
      const firstIp = entries.findIndex(entry => entry.ruleset.startsWith('ip/'));
      expect(firstIp).not.toEqual(-1);
      // the entries in front of the first IP ruleset are no IP ruleset, and the ones behind it are all IP rulesets
      const misplaced: string[] = [];
      for (let i = 0, len = entries.length; i < len; i++) {
        if (entries[i].ruleset.startsWith('ip/') === (i < firstIp)) {
          misplaced.push(entries[i].ruleset);
        }
      }
      expect(misplaced).toEqual([]);
    });

    it('does not let a ruleset for hostnames resolve DNS: its rules for addresses say no-resolve', () => {
      const offenders: string[] = [];
      rulesets.forEach((ruleSet, name) => {
        if (name.startsWith('ip/')) {
          return;
        }
        const lines = readList(name).split('\n');
        for (let i = 0, len = lines.length; i < len; i++) {
          if (rAddressRule.test(lines[i]) && !lines[i].endsWith(',no-resolve')) {
            offenders.push(`${name}:${i + 1}: ${lines[i]}`);
          }
        }
      });
      expect(offenders).toEqual([]);
    });

    it('has pre-matching only on REJECT policies, and first, as Surge matches it before all the others', () => {
      const entries = active();
      expect(entries[0]).toHaveSubset({ ruleset: 'non_ip/reject-drop.conf', policy: 'REJECT-DROP', options: ['pre-matching'] });
      for (let i = 0, len = entries.length; i < len; i++) {
        if (entries[i].options.includes('pre-matching')) {
          expect(entries[i].policy.startsWith('REJECT')).toEqual(true);
        }
      }
    });

    it('uses policies that its table lists, and has a [Proxy Group] for every one that is neither built in nor Proxy', () => {
      const used = new Set(section.entries.map(entry => entry.policy));
      used.add(nullthrow(section.final, 'FINAL').policy);

      expect(new Set(parsePolicies(readme))).toEqual(used);

      const needed = [...used].filter(policy => !BUILT_IN_POLICIES.has(policy) && policy !== 'Proxy').sort();
      const groups = parseProxyGroups(readme);
      expect(groups.map(group => group.name).sort()).toEqual(needed);
      for (let i = 0, len = groups.length; i < len; i++) {
        expect(groups[i]).toEqual({ name: groups[i].name, type: 'select', members: ['Proxy', 'DIRECT'] });
      }
    });

    it('lists only rulesets whose rule types the simulation evaluates, or knows that it does not', () => {
      const unknown: string[] = [];
      rulesets.forEach((ruleSet, name) => {
        ruleSet.types.forEach((type) => {
          if (!(SUPPORTED_RULE_TYPES as readonly string[]).includes(type) && !KNOWN_UNSUPPORTED_RULE_TYPES.has(type)) {
            unknown.push(`${name}: ${type}`);
          }
        });
        ruleSet.unsupported.forEach((count, type) => {
          if (type !== 'AND' && !KNOWN_UNSUPPORTED_RULE_TYPES.has(type)) {
            unknown.push(`${name}: ${count} of ${type}`);
          }
        });
      });
      expect(unknown).toEqual([]);
    });
  });

  describe('Direct: never proxied, in front of the services', () => {
    probes([
      // a hostname that is an exception inside a bigger ruleset
      { request: { hostname: 'captive.apple.com' }, first: 'non_ip/direct.conf', also: ['non_ip/apple_services.conf'] },
      { request: { hostname: 'scholar.google.com' }, first: 'non_ip/direct.conf', also: ['non_ip/google.conf'] },
      { request: { hostname: 'www.google.com' }, first: 'non_ip/google.conf' },
      { request: { hostname: 'router.asus.com' }, first: 'non_ip/lan.conf' },
      // a university mirror that Download lists too is inside an academic domain that Direct lists
      { request: { hostname: 'mirror.ox.ac.uk' }, first: 'non_ip/direct.conf', also: ['domainset/download.conf'] }
    ]);

    describe('a process that must never be proxied goes to Direct whatever the hostname, and the same hostname from another process does not', () => {
      probes([
        { request: { hostname: 'api.github.com', process: 'Safari' }, first: 'non_ip/github.conf', also: ['non_ip/ai.conf'] },
        { request: { hostname: 'api.github.com', process: 'aria2c' }, first: 'non_ip/direct.conf', also: ['non_ip/github.conf', 'non_ip/ai.conf'] },
        { request: { hostname: 'api.github.com', process: 'qbittorrent-nox' }, first: 'non_ip/direct.conf' },
        { request: { hostname: 'github.com', process: 'Transmission' }, first: 'non_ip/direct.conf' },
        { request: { hostname: 'chatgpt.com', process: 'tailscaled' }, first: 'non_ip/direct.conf', also: ['non_ip/ai.conf'] },
        { request: { hostname: 'chatgpt.com', process: 'Safari' }, first: 'non_ip/ai.conf' },
        // and a request that has no hostname at all
        { request: { process: 'aria2c' }, first: 'non_ip/direct.conf' }
      ]);
    });

    describe('the rules for processes and apps of the other rulesets have the priority of their ruleset', () => {
      probes([
        // the app of a service is taken by a ruleset that stands in front of the ruleset of the service
        { request: { hostname: 'example.com', userAgent: 'YouTubeMusic/7.0 (iPhone)' }, first: 'non_ip/youtubemusic.conf' },
        { request: { hostname: 'i.ytimg.com', userAgent: 'YouTubeMusic/7.0 (iPhone)' }, first: 'domainset/cdn.conf', also: ['non_ip/youtubemusic.conf', 'non_ip/youtube.conf'] },
        // a system process of Apple loses to a rule for a hostname in front of its ruleset, and wins over the ones behind it
        { request: { hostname: 'www.baidu.com', process: 'apsd' }, first: 'non_ip/apple_services.conf', also: ['non_ip/domestic.conf'] },
        { request: { hostname: 'www.baidu.com', process: 'Safari' }, first: 'non_ip/domestic.conf' },
        // and what comes in through the MTProto server of Surge has no hostname
        { request: { protocol: 'MTProto' }, first: 'non_ip/telegram.conf' }
      ]);
    });
  });

  describe('Speedtest and CDN stand in front of the services, which is a choice', () => {
    probes([
      // a CloudFront host that DAZN lists in stream.conf: cdn.conf has the whole of cloudfront.net
      { request: { hostname: 'd151l6v8er5bdm.cloudfront.net' }, first: 'domainset/cdn.conf', also: ['non_ip/stream.conf'] },
      { request: { hostname: 'd1sgwhnao7452x.cloudfront.net' }, first: 'domainset/cdn.conf', also: ['non_ip/stream.conf'] },
      // the static hosts of a service
      { request: { hostname: 'i.ytimg.com' }, first: 'domainset/cdn.conf', also: ['non_ip/youtube.conf', 'non_ip/google.conf'] },
      { request: { hostname: 'raw.githubusercontent.com' }, first: 'domainset/cdn.conf', also: ['non_ip/github.conf'] },
      { request: { hostname: 'www.speedtest.net' }, first: 'domainset/speedtest.conf' }
    ]);
  });

  describe('one service, one ruleset: in front of the bigger rulesets that contain it', () => {
    probes([
      { request: { hostname: 'music.youtube.com' }, first: 'non_ip/youtubemusic.conf', also: ['non_ip/youtube.conf', 'non_ip/stream.conf', 'non_ip/google.conf'] },
      { request: { hostname: 'www.youtube.com' }, first: 'non_ip/youtube.conf', also: ['non_ip/stream.conf', 'non_ip/google.conf'] },
      { request: { hostname: 'www.tiktok.com' }, first: 'non_ip/tiktok.conf', also: ['non_ip/stream.conf'] },
      { request: { hostname: 'muscdn.com' }, first: 'non_ip/tiktok.conf', also: ['non_ip/stream.conf'] },
      { request: { hostname: 'www.reddit.com' }, first: 'non_ip/reddit.conf' },
      { request: { hostname: 'gemini.google.com' }, first: 'non_ip/gemini.conf', also: ['non_ip/ai.conf', 'non_ip/google.conf'] },
      { request: { hostname: 'aistudio.google.com' }, first: 'non_ip/gemini.conf', also: ['non_ip/google.conf'] },
      { request: { hostname: 'antigravity.google' }, first: 'non_ip/antigravity.conf', also: ['non_ip/gemini.conf', 'non_ip/ai.conf'] },
      { request: { hostname: 'chatgpt.com' }, first: 'non_ip/ai.conf' },
      { request: { hostname: 'web.telegram.org' }, first: 'non_ip/telegram.conf' }
    ]);

    describe('GitHub stands in front of AI and Homebrew, and Homebrew keeps what only it has', () => {
      probes([
        { request: { hostname: 'api.github.com' }, first: 'non_ip/github.conf', also: ['non_ip/ai.conf'] },
        { request: { hostname: 'api.githubcopilot.com' }, first: 'non_ip/github.conf', also: ['non_ip/ai.conf'] },
        { request: { hostname: 'github.com' }, first: 'non_ip/github.conf', also: ['non_ip/homebrew.conf'] },
        { request: { hostname: 'ghcr.io' }, first: 'non_ip/github.conf', also: ['non_ip/homebrew.conf', 'domainset/download.conf'] },
        { request: { hostname: 'formulae.brew.sh' }, first: 'non_ip/homebrew.conf', also: ['domainset/download.conf'] }
      ]);
    });
  });

  describe('Streaming: the regions in front of the list of all services', () => {
    probes([
      { request: { hostname: 'hulu.jp' }, first: 'non_ip/stream_jp.conf', also: ['non_ip/stream.conf'] },
      { request: { hostname: 'happyon.jp' }, first: 'non_ip/stream_jp.conf', also: ['non_ip/stream.conf'] },
      { request: { hostname: 'www.hulu.com' }, first: 'non_ip/stream_us.conf', also: ['non_ip/stream.conf'] },
      // HBO GO Asia is in Hong Kong and in Taiwan, and Hong Kong is first
      { request: { hostname: 'www.hbogoasia.com' }, first: 'non_ip/stream_hk.conf', also: ['non_ip/stream_tw.conf', 'non_ip/stream.conf'] },
      { request: { hostname: 'video.friday.tw' }, first: 'non_ip/stream_tw.conf', also: ['non_ip/stream.conf'] },
      // a service that has no region is in the list of all of them
      { request: { hostname: 'www.netflix.com' }, first: 'non_ip/stream.conf' },
      // Apple TV is in Streaming, and in front of Apple Service
      { request: { hostname: 'tv.apple.com' }, first: 'non_ip/stream.conf', also: ['non_ip/apple_services.conf'] }
    ]);
  });

  describe('Apple, Microsoft, and Download behind the services', () => {
    probes([
      { request: { hostname: 'cn.ls.apple.com' }, first: 'non_ip/apple_cn.conf', also: ['non_ip/apple_services.conf'] },
      { request: { hostname: 'maps.apple.com' }, first: 'non_ip/apple_cn.conf', also: ['non_ip/apple_services.conf'] },
      { request: { hostname: 'www.icloud.com' }, first: 'non_ip/apple_services.conf' },
      { request: { hostname: 'teams.microsoft.com' }, first: 'non_ip/teams.conf', also: ['non_ip/microsoft.conf'] },
      { request: { hostname: 'copilot.microsoft.com' }, first: 'non_ip/ai.conf', also: ['non_ip/microsoft.conf'] },
      { request: { hostname: 'www.microsoft.com' }, first: 'non_ip/microsoft.conf' },
      // a service claims its own downloads, Download takes the rest
      { request: { hostname: 'dl.google.com' }, first: 'non_ip/google.conf', also: ['domainset/download.conf'] },
      { request: { hostname: 'download.xbox.com' }, first: 'non_ip/microsoft.conf', also: ['domainset/download.conf'] },
      { request: { hostname: 'codeload.github.com' }, first: 'non_ip/github.conf', also: ['domainset/download.conf'] },
      { request: { hostname: 'mirrors.aliyun.com' }, first: 'domainset/download.conf', also: ['non_ip/domestic.conf'] },
      { request: { hostname: 'www.baidu.com' }, first: 'non_ip/domestic.conf' },
      { request: { hostname: 'www.facebook.com' }, first: 'non_ip/global.conf' }
    ]);
  });

  describe('IP rulesets: last, so a request by name never gets to them', () => {
    it('gives a connection to an address the ruleset of the address', () => {
      expect(first({ destIp: '149.154.167.50' })).toEqual('ip/telegram.conf');
      expect(first({ destIp: '192.168.1.1' })).toEqual('ip/lan.conf');
      expect(first({ destIp: firstAddressOf('ip/google.conf') })).toEqual('ip/google.conf');
    });

    it('gives a request that has a hostname the ruleset of the hostname, whatever address it resolves to', () => {
      expect(first({ hostname: 'gemini.google.com', destIp: firstAddressOf('ip/google.conf') })).toEqual('non_ip/gemini.conf');
      expect(first({ hostname: 'www.youtube.com', destIp: firstAddressOf('ip/google.conf') })).toEqual('non_ip/youtube.conf');
    });

    it('lets GitHub Pages, which CDN lists as well, stay with GitHub when the optional CDN addresses are switched on', () => {
      const withCdn = section.entries.filter(entry => !entry.optional || entry.ruleset === 'ip/cdn.conf');
      expect(withCdn.some(entry => entry.ruleset === 'ip/cdn.conf')).toEqual(true);
      expect(first({ destIp: '185.199.108.153' }, withCdn)).toEqual('ip/github.conf');
      expect(allMatches(order(withCdn), { destIp: '185.199.108.153' }).map(match => match.ruleset)).toEqual(['ip/github.conf', 'ip/cdn.conf']);
    });
  });

  describe('the order is what decides: the same requests go elsewhere when a ruleset stands somewhere else', () => {
    it('sends YouTube to Streaming, if Streaming stands in front of YouTube', () => {
      const entries = moved(active(), 'non_ip/stream.conf', 'before', 'non_ip/youtubemusic.conf');
      expect(first({ hostname: 'www.youtube.com' }, entries)).toEqual('non_ip/stream.conf');
      expect(first({ hostname: 'music.youtube.com' }, entries)).toEqual('non_ip/stream.conf');
    });

    it('sends TikTok to Streaming, if Streaming stands in front of TikTok', () => {
      expect(first({ hostname: 'www.tiktok.com' }, moved(active(), 'non_ip/stream.conf', 'before', 'non_ip/tiktok.conf'))).toEqual('non_ip/stream.conf');
    });

    it('sends Gemini to AI, if AI stands in front of Gemini', () => {
      expect(first({ hostname: 'gemini.google.com' }, moved(active(), 'non_ip/ai.conf', 'before', 'non_ip/gemini.conf'))).toEqual('non_ip/ai.conf');
    });

    it('sends the GitHub API to AI, if AI stands in front of GitHub', () => {
      expect(first({ hostname: 'api.github.com', process: 'Safari' }, moved(active(), 'non_ip/github.conf', 'after', 'non_ip/ai.conf'))).toEqual('non_ip/ai.conf');
    });

    it('sends Apple CN to Apple Service, if Apple Service stands in front of Apple CN', () => {
      expect(first({ hostname: 'cn.ls.apple.com' }, moved(active(), 'non_ip/apple_services.conf', 'before', 'non_ip/apple_cn.conf'))).toEqual('non_ip/apple_services.conf');
    });

    it('sends Hong Kong HBO GO Asia to Taiwan, if Taiwan stands in front of Hong Kong', () => {
      expect(first({ hostname: 'www.hbogoasia.com' }, moved(active(), 'non_ip/stream_tw.conf', 'before', 'non_ip/stream_hk.conf'))).toEqual('non_ip/stream_tw.conf');
    });

    it('sends a process of Direct to GitHub, if GitHub stands in front of Direct', () => {
      const entries = moved(active(), 'non_ip/direct.conf', 'after', 'non_ip/github.conf');
      expect(first({ hostname: 'api.github.com', process: 'aria2c' }, entries)).toEqual('non_ip/github.conf');
    });

    it('sends the CloudFront host of DAZN to Streaming, if Streaming stands in front of CDN, and that is the other order that could be chosen', () => {
      const entries = moved(active(), 'domainset/cdn.conf', 'after', 'non_ip/stream.conf');
      expect(first({ hostname: 'd151l6v8er5bdm.cloudfront.net' }, entries)).toEqual('non_ip/stream.conf');
    });

    it('sends all of github.com to Homebrew, if Homebrew stands in front of GitHub, which is why it does not', () => {
      const entries = moved(active(), 'non_ip/homebrew.conf', 'before', 'non_ip/github.conf');
      expect(first({ hostname: 'github.com' }, entries)).toEqual('non_ip/homebrew.conf');
      expect(first({ hostname: 'ghcr.io' }, entries)).toEqual('non_ip/homebrew.conf');
      expect(first({ hostname: 'api.github.com' }, entries)).toEqual('non_ip/github.conf');
    });

    it('sends ghcr.io to Download, if the DOMAIN-SETs stand in front of the other rulesets, which is why they do not', () => {
      const entries = [...active().filter(entry => entry.kind === 'DOMAIN-SET'), ...active().filter(entry => entry.kind === 'RULE-SET')];
      expect(first({ hostname: 'ghcr.io' }, entries)).toEqual('domainset/download.conf');
    });
  });

  describe('the table under "Check It"', () => {
    it('is true of every row', () => {
      const rows = parseCheckTable(readme);
      expect(rows.length).toBeGreaterThan(10);
      for (let i = 0, len = rows.length; i < len; i++) {
        const request: Request = { hostname: rows[i].host, process: rows[i].from ?? undefined };
        const matched = first(request);
        const name = label(request);
        expect({ row: name, first: matched === null ? null : path.posix.basename(matched) }).toEqual({ row: name, first: rows[i].ruleset });
      }
    });

    it('names the process of a request where the process decides', () => {
      const rows = parseCheckTable(readme);
      expect(rows.filter(row => row.from !== null).length).toBeGreaterThan(0);
      const githubRows = rows.filter(row => row.host === 'api.github.com');
      expect(githubRows.map(row => row.ruleset)).toEqualUnsorted(['github.conf', 'direct.conf']);
    });
  });
});
