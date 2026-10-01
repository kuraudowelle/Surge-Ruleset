import fs from 'node:fs';
import path from 'node:path';
import { before, describe, it } from 'mocha';
import { expect } from 'earl';
import { nullthrow } from 'foxts/guard';
import { split0th } from 'foxts/split-nth';

import { ROOT_DIR } from '../constants/dir';
import { warn } from './ci-warning';
import { KNOWN_UNSUPPORTED_RULE_TYPES, LIST_DIR, listNames, readList } from './published-lists';
import { RuleSet, SUPPORTED_RULE_TYPES, allMatches, firstMatch, leavesOf } from './surge-rules';
import type { OrderedRuleSet, Request } from './surge-rules';
import { parseCheckTable, parsePolicies, parseProxyGroups, parseRuleSection, rRegionalIpRuleset, regionalIpProblems } from './readme-rule-section';
import type { RuleSection, RuleSectionEntry } from './readme-rule-section';

const BUILT_IN_POLICIES = new Set(['DIRECT', 'REJECT', 'REJECT-DROP', 'REJECT-NO-DROP']);

/** A line that can have a rule for an address: one that is such a rule, or a logical rule, which can hold one */
const rAddressOrLogicalRule = /^(?:IP-CIDR6?|AND|OR|NOT),/;

interface Probe {
  request: Request,
  /** The ruleset that matches first: a request that goes to another one is a failure */
  first: string,
  /**
   * Rulesets that match this request as well, and stand behind the first, so that the probe shows that the order decides.
   * A list that drops one of them has not changed the routing, and the probe has stopped showing what it was for: that
   * is a warning of the run, and not a failure.
   */
  also?: string[],
  /** Rulesets that do not have this request at all, in whatever order: a service that is not theirs, and must not be taken by them. A failure */
  not?: string[]
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
        // the rulesets that must not have it: the first one has to be right, and so does the whole of the list
        const intruders = (probe.not ?? []).filter(name => matched.includes(name));
        expect({ request: label(probe.request), notInThem: intruders }).toEqual({ request: label(probe.request), notInThem: [] });
        // the rulesets behind the first that the request is in as well: without them the routing is what it was, and the probe
        // no longer shows that the order decides, which is worth a look and is not a reason to stop a build
        const missing = (probe.also ?? []).filter(name => !matched.slice(1).includes(name));
        if (missing.length > 0) {
          warn('A probe of the routing lost an overlap', `${label(probe.request)} matches ${probe.first} first, as it should, and ${missing.join(' and ')} no longer has it: the order does not decide this any more, and the probe can be updated or dropped`);
        }
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

    it('does not let a ruleset for hostnames resolve DNS: its rules for addresses say no-resolve, inside a logical rule as well', () => {
      const offenders: string[] = [];
      rulesets.forEach((ruleSet, name) => {
        if (name.startsWith('ip/')) {
          return;
        }
        const lines = readList(name).split('\n');
        for (let i = 0, len = lines.length; i < len; i++) {
          if (!rAddressOrLogicalRule.test(lines[i])) {
            continue;
          }
          const rules = leavesOf(lines[i]);
          for (let j = 0, ruleCount = rules.length; j < ruleCount; j++) {
            if ((rules[j].type === 'IP-CIDR' || rules[j].type === 'IP-CIDR6') && !rules[j].options.includes('no-resolve')) {
              offenders.push(`${name}:${i + 1}: ${lines[i]}`);
            }
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

    it('lists only rulesets whose rule types the simulation evaluates, or knows that it does not, inside a logical rule as well', () => {
      const unknown: string[] = [];
      rulesets.forEach((ruleSet, name) => {
        ruleSet.types.forEach((type) => {
          if (!(SUPPORTED_RULE_TYPES as readonly string[]).includes(type) && !KNOWN_UNSUPPORTED_RULE_TYPES.has(type)) {
            unknown.push(`${name}: ${type}`);
          }
        });
        ruleSet.unsupported.forEach((count, type) => {
          if (!KNOWN_UNSUPPORTED_RULE_TYPES.has(type)) {
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
      { request: { hostname: 'www.google.com' }, first: 'non_ip/google.conf' },
      { request: { hostname: 'router.asus.com' }, first: 'non_ip/lan.conf' },
      // a university mirror that Download lists too is inside an academic domain that Direct lists
      { request: { hostname: 'mirror.ox.ac.uk' }, first: 'non_ip/direct.conf', also: ['domainset/download.conf'] },
      // the academic list of the community: a publisher and Sci-Hub go direct, and Google Scholar and Z-Library, which it
      // has as well, are left out of Direct (mainland China blocks them) and go to Google and to Global
      { request: { hostname: 'www.sciencedirect.com' }, first: 'non_ip/direct.conf', also: ['non_ip/global.conf'] },
      { request: { hostname: 'sci-hub.st' }, first: 'non_ip/direct.conf', also: ['non_ip/global.conf'] },
      { request: { hostname: 'scholar.google.com' }, first: 'non_ip/google.conf', not: ['non_ip/direct.conf'] },
      { request: { hostname: 'z-library.sk' }, first: 'non_ip/global.conf', not: ['non_ip/direct.conf'] }
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
        { request: { hostname: 'googleads.g.doubleclick.net', userAgent: 'YouTubeMusic/7.0 (iPhone)' }, first: 'non_ip/reject.conf', also: ['non_ip/youtubemusic.conf'] },
        // a system process of Apple loses to a rule for a hostname in front of its ruleset, and wins over the ones behind it
        { request: { hostname: 'www.baidu.com', process: 'apsd' }, first: 'non_ip/apple_services.conf', also: ['non_ip/domestic.conf'] },
        { request: { hostname: 'www.baidu.com', process: 'Safari' }, first: 'non_ip/domestic.conf' },
        // and what comes in through the MTProto server of Surge has no hostname
        { request: { protocol: 'MTProto' }, first: 'non_ip/telegram.conf' }
      ]);
    });
  });

  describe('Speedtest stands in front of the services', () => {
    probes([
      { request: { hostname: 'www.speedtest.net' }, first: 'domainset/speedtest.conf' },
      // the speed test of Netflix, which the list of all streaming services has as well
      { request: { hostname: 'fast.com' }, first: 'domainset/speedtest.conf', also: ['non_ip/stream.conf'] }
    ]);
  });

  describe('CDN stands behind the services, and in front of the lists of whole companies, which is a choice', () => {
    probes([
      // a CloudFront host that DAZN lists in stream.conf: cdn.conf has the whole of cloudfront.net
      { request: { hostname: 'd151l6v8er5bdm.cloudfront.net' }, first: 'non_ip/stream.conf', also: ['domainset/cdn.conf'] },
      { request: { hostname: 'd1sgwhnao7452x.cloudfront.net' }, first: 'non_ip/stream.conf', also: ['domainset/cdn.conf'] },
      // the static hosts of a service, and hosts of a service that CDN lists and that are more than static files
      { request: { hostname: 'i.ytimg.com' }, first: 'non_ip/youtube.conf', also: ['domainset/cdn.conf', 'non_ip/google.conf'] },
      { request: { hostname: 'raw.githubusercontent.com' }, first: 'non_ip/github.conf', also: ['domainset/cdn.conf'] },
      { request: { hostname: 'copilot-proxy.githubusercontent.com' }, first: 'non_ip/github.conf', also: ['non_ip/ai.conf', 'domainset/cdn.conf'] },
      { request: { hostname: 'files.oaiusercontent.com' }, first: 'non_ip/ai.conf', also: ['domainset/cdn.conf'] },
      { request: { hostname: 'fino.svc.litv.tv' }, first: 'non_ip/stream_tw.conf', also: ['non_ip/stream.conf', 'domainset/cdn.conf'] },
      // the files of other sites, on the domains of a company
      { request: { hostname: '1.bp.blogspot.com' }, first: 'domainset/cdn.conf', also: ['non_ip/google.conf'] },
      { request: { hostname: 'ajax.aspnetcdn.com' }, first: 'domainset/cdn.conf', also: ['non_ip/microsoft.conf'] }
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
      // Hulu Japan is a service of Japan, and no ruleset of North America has it, in front of Japan or behind it
      { request: { hostname: 'hulu.jp' }, first: 'non_ip/stream_jp.conf', also: ['non_ip/stream.conf'], not: ['non_ip/stream_us.conf'] },
      { request: { hostname: 'happyon.jp' }, first: 'non_ip/stream_jp.conf', also: ['non_ip/stream.conf'], not: ['non_ip/stream_us.conf'] },
      { request: { hostname: 'hjholdings.jp' }, first: 'non_ip/stream_jp.conf', also: ['non_ip/stream.conf'], not: ['non_ip/stream_us.conf'] },
      // and Hulu is one of the US, and Japan does not have it
      { request: { hostname: 'www.hulu.com' }, first: 'non_ip/stream_us.conf', also: ['non_ip/stream.conf'], not: ['non_ip/stream_jp.conf'] },
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

    it('has the rulesets of the regions that have addresses in the Rule section, in front of ip/stream.conf, on the policy of their region', () => {
      // the regions that have no address are left out of the section, and a region that gets some has to be put in it
      const sizes = new Map<string, number>();
      const names = listNames();
      for (let i = 0, len = names.length; i < len; i++) {
        if (rRegionalIpRuleset.test(names[i])) {
          sizes.set(names[i], new RuleSet(names[i], readList(names[i])).size);
        }
      }
      expect(sizes.size).toBeGreaterThan(0);
      expect(regionalIpProblems(section.entries, sizes)).toEqual([]);
    });

    it('gives GitHub Pages to GitHub when the optional CDN addresses are switched on', () => {
      const withCdn = section.entries.filter(entry => !entry.optional || entry.ruleset === 'ip/cdn.conf');
      expect(withCdn.some(entry => entry.ruleset === 'ip/cdn.conf')).toEqual(true);
      expect(first({ destIp: '185.199.108.153' }, withCdn)).toEqual('ip/github.conf');

      // CDN lists the addresses of GitHub Pages as well, because Fastly announces them. That is what makes the order matter
      // for them, and a CDN list that drops them leaves the routing as it is
      const behind = allMatches(order(withCdn), { destIp: '185.199.108.153' }).slice(1).map(match => match.ruleset);
      if (!behind.includes('ip/cdn.conf')) {
        warn('A probe of the routing lost an overlap', '185.199.108.153 matches ip/github.conf first, as it should, and ip/cdn.conf no longer has it: the order does not decide this any more');
      }
    });
  });

  describe('the order is what decides: the same requests go elsewhere when a ruleset stands somewhere else', () => {
    /**
     * These controls are run on rulesets that are fixed: a few lines each, with the overlap that a control is about written
     * into them. The order is the one of the README, and the content is not the one of the lists, so that a control shows
     * that the order decides and does not depend on what a list has today: an upstream list that drops an overlap (the AI
     * list without `api.github.com`) leaves the routing as it is, and must not fail a control, or stop a build. A ruleset
     * of the Rule section that has no lines here is empty, and stands where the README puts it.
     */
    const FIXTURES: Record<string, string[]> = {
      'non_ip/youtubemusic.conf': ['DOMAIN,music.youtube.com'],
      'non_ip/youtube.conf': ['DOMAIN-SUFFIX,youtube.com'],
      'non_ip/tiktok.conf': ['DOMAIN-SUFFIX,tiktok.com'],
      // the list of all the services has every host that a control needs, DAZN's CloudFront host among them
      'non_ip/stream.conf': ['DOMAIN-SUFFIX,youtube.com', 'DOMAIN-SUFFIX,tiktok.com', 'DOMAIN-SUFFIX,hbogoasia.com', 'DOMAIN,d151l6v8er5bdm.cloudfront.net'],
      'non_ip/stream_hk.conf': ['DOMAIN-SUFFIX,hbogoasia.com'],
      'non_ip/stream_tw.conf': ['DOMAIN-SUFFIX,hbogoasia.com'],
      'non_ip/gemini.conf': ['DOMAIN,gemini.google.com'],
      'non_ip/ai.conf': ['DOMAIN,gemini.google.com', 'DOMAIN,api.github.com'],
      'non_ip/github.conf': ['DOMAIN-SUFFIX,github.com', 'DOMAIN-SUFFIX,ghcr.io'],
      'non_ip/homebrew.conf': ['DOMAIN,github.com', 'DOMAIN,ghcr.io', 'DOMAIN,formulae.brew.sh'],
      'non_ip/apple_services.conf': ['DOMAIN-SUFFIX,apple.com'],
      'non_ip/apple_cn.conf': ['DOMAIN,cn.ls.apple.com'],
      'non_ip/direct.conf': ['PROCESS-NAME,aria2c'],
      // the files of other sites on blogspot.com, which the list of Google has as a whole
      'non_ip/google.conf': ['DOMAIN-SUFFIX,blogspot.com'],
      'domainset/cdn.conf': ['.cloudfront.net', '.bp.blogspot.com'],
      'domainset/download.conf': ['ghcr.io'],
      // GitHub Pages: the addresses that both of them list
      'ip/github.conf': ['IP-CIDR,185.199.108.0/22,no-resolve'],
      'ip/cdn.conf': ['IP-CIDR,185.199.108.0/22,no-resolve']
    };

    const fixtures = new Map<string, RuleSet>();
    Object.entries(FIXTURES).forEach(([name, lines]) => {
      fixtures.set(name, new RuleSet(name, lines.join('\n'), { domainSet: name.startsWith('domainset/') }));
    });

    const inFixtures = (entries: readonly RuleSectionEntry[]): OrderedRuleSet[] => entries.map(entry => ({
      ruleSet: fixtures.get(entry.ruleset) ?? new RuleSet(entry.ruleset, '', { domainSet: entry.kind === 'DOMAIN-SET' }),
      preMatching: entry.options.includes('pre-matching')
    }));
    /** The ruleset that a request matches first, in the order of `entries` (the README's by default), with the content of the fixtures */
    const firstOfFixtures = (request: Request, entries: readonly RuleSectionEntry[] = active()) => firstMatch(inFixtures(entries), request)?.ruleset ?? null;

    it('has an overlap in every fixture that a control is about, so that the order is what decides, and not the fixture', () => {
      // a fixture whose hosts are in one ruleset only would pass whatever the order is: the hosts of the controls are in two or more
      const requests: Array<[request: Request, rulesets: string[]]> = [
        [{ hostname: 'www.youtube.com' }, ['non_ip/youtube.conf', 'non_ip/stream.conf']],
        [{ hostname: 'music.youtube.com' }, ['non_ip/youtubemusic.conf', 'non_ip/youtube.conf', 'non_ip/stream.conf']],
        [{ hostname: 'www.tiktok.com' }, ['non_ip/tiktok.conf', 'non_ip/stream.conf']],
        [{ hostname: 'gemini.google.com' }, ['non_ip/gemini.conf', 'non_ip/ai.conf']],
        [{ hostname: 'api.github.com', process: 'Safari' }, ['non_ip/ai.conf', 'non_ip/github.conf']],
        [{ hostname: 'api.github.com', process: 'aria2c' }, ['non_ip/direct.conf', 'non_ip/ai.conf', 'non_ip/github.conf']],
        [{ hostname: 'cn.ls.apple.com' }, ['non_ip/apple_cn.conf', 'non_ip/apple_services.conf']],
        [{ hostname: 'www.hbogoasia.com' }, ['non_ip/stream_hk.conf', 'non_ip/stream_tw.conf', 'non_ip/stream.conf']],
        [{ hostname: 'd151l6v8er5bdm.cloudfront.net' }, ['domainset/cdn.conf', 'non_ip/stream.conf']],
        [{ hostname: '1.bp.blogspot.com' }, ['domainset/cdn.conf', 'non_ip/google.conf']],
        [{ hostname: 'github.com' }, ['non_ip/github.conf', 'non_ip/homebrew.conf']],
        [{ hostname: 'ghcr.io' }, ['non_ip/github.conf', 'non_ip/homebrew.conf', 'domainset/download.conf']],
        [{ destIp: '185.199.108.153' }, ['ip/github.conf', 'ip/cdn.conf']]
      ];
      for (let i = 0, len = requests.length; i < len; i++) {
        const [request, rulesets] = requests[i];
        const matching = Array.from(fixtures.values(), ruleSet => (ruleSet.match(request) === null ? null : ruleSet.name)).filter(name => name !== null);
        expect({ request: label(request), rulesets: matching.sort() }).toEqual({ request: label(request), rulesets: rulesets.slice().sort() });
      }
    });

    it('sends YouTube to Streaming, if Streaming stands in front of YouTube', () => {
      expect(firstOfFixtures({ hostname: 'www.youtube.com' })).toEqual('non_ip/youtube.conf');
      expect(firstOfFixtures({ hostname: 'music.youtube.com' })).toEqual('non_ip/youtubemusic.conf');

      const entries = moved(active(), 'non_ip/stream.conf', 'before', 'non_ip/youtubemusic.conf');
      expect(firstOfFixtures({ hostname: 'www.youtube.com' }, entries)).toEqual('non_ip/stream.conf');
      expect(firstOfFixtures({ hostname: 'music.youtube.com' }, entries)).toEqual('non_ip/stream.conf');
    });

    it('sends TikTok to Streaming, if Streaming stands in front of TikTok', () => {
      expect(firstOfFixtures({ hostname: 'www.tiktok.com' })).toEqual('non_ip/tiktok.conf');
      expect(firstOfFixtures({ hostname: 'www.tiktok.com' }, moved(active(), 'non_ip/stream.conf', 'before', 'non_ip/tiktok.conf'))).toEqual('non_ip/stream.conf');
    });

    it('sends Gemini to AI, if AI stands in front of Gemini', () => {
      expect(firstOfFixtures({ hostname: 'gemini.google.com' })).toEqual('non_ip/gemini.conf');
      expect(firstOfFixtures({ hostname: 'gemini.google.com' }, moved(active(), 'non_ip/ai.conf', 'before', 'non_ip/gemini.conf'))).toEqual('non_ip/ai.conf');
    });

    it('sends the GitHub API to AI, if AI stands in front of GitHub', () => {
      expect(firstOfFixtures({ hostname: 'api.github.com', process: 'Safari' })).toEqual('non_ip/github.conf');
      expect(firstOfFixtures({ hostname: 'api.github.com', process: 'Safari' }, moved(active(), 'non_ip/github.conf', 'after', 'non_ip/ai.conf'))).toEqual('non_ip/ai.conf');
    });

    it('sends Apple CN to Apple Service, if Apple Service stands in front of Apple CN', () => {
      expect(firstOfFixtures({ hostname: 'cn.ls.apple.com' })).toEqual('non_ip/apple_cn.conf');
      expect(firstOfFixtures({ hostname: 'cn.ls.apple.com' }, moved(active(), 'non_ip/apple_services.conf', 'before', 'non_ip/apple_cn.conf'))).toEqual('non_ip/apple_services.conf');
    });

    it('sends Hong Kong HBO GO Asia to Taiwan, if Taiwan stands in front of Hong Kong', () => {
      expect(firstOfFixtures({ hostname: 'www.hbogoasia.com' })).toEqual('non_ip/stream_hk.conf');
      expect(firstOfFixtures({ hostname: 'www.hbogoasia.com' }, moved(active(), 'non_ip/stream_tw.conf', 'before', 'non_ip/stream_hk.conf'))).toEqual('non_ip/stream_tw.conf');
    });

    it('sends a process of Direct to GitHub, if GitHub stands in front of Direct', () => {
      expect(firstOfFixtures({ hostname: 'api.github.com', process: 'aria2c' })).toEqual('non_ip/direct.conf');
      const entries = moved(active(), 'non_ip/direct.conf', 'after', 'non_ip/github.conf');
      expect(firstOfFixtures({ hostname: 'api.github.com', process: 'aria2c' }, entries)).toEqual('non_ip/github.conf');
    });

    it('sends the CloudFront host of DAZN to CDN, if CDN stands in front of Streaming, which is why it does not', () => {
      expect(firstOfFixtures({ hostname: 'd151l6v8er5bdm.cloudfront.net' })).toEqual('non_ip/stream.conf');
      const entries = moved(active(), 'domainset/cdn.conf', 'before', 'non_ip/stream.conf');
      expect(firstOfFixtures({ hostname: 'd151l6v8er5bdm.cloudfront.net' }, entries)).toEqual('domainset/cdn.conf');
    });

    it('sends the files of other sites on blogspot.com to Google, if Google stands in front of CDN, which is why it does not', () => {
      expect(firstOfFixtures({ hostname: '1.bp.blogspot.com' })).toEqual('domainset/cdn.conf');
      const entries = moved(active(), 'non_ip/google.conf', 'before', 'domainset/cdn.conf');
      expect(firstOfFixtures({ hostname: '1.bp.blogspot.com' }, entries)).toEqual('non_ip/google.conf');
    });

    it('sends all of github.com to Homebrew, if Homebrew stands in front of GitHub, which is why it does not', () => {
      expect(firstOfFixtures({ hostname: 'github.com' })).toEqual('non_ip/github.conf');
      expect(firstOfFixtures({ hostname: 'ghcr.io' })).toEqual('non_ip/github.conf');
      expect(firstOfFixtures({ hostname: 'formulae.brew.sh' })).toEqual('non_ip/homebrew.conf');

      const entries = moved(active(), 'non_ip/homebrew.conf', 'before', 'non_ip/github.conf');
      expect(firstOfFixtures({ hostname: 'github.com' }, entries)).toEqual('non_ip/homebrew.conf');
      expect(firstOfFixtures({ hostname: 'ghcr.io' }, entries)).toEqual('non_ip/homebrew.conf');
      expect(firstOfFixtures({ hostname: 'api.github.com' }, entries)).toEqual('non_ip/github.conf');
    });

    it('sends ghcr.io to Download, if the DOMAIN-SETs stand in front of the other rulesets, which is why they do not', () => {
      expect(firstOfFixtures({ hostname: 'ghcr.io' })).toEqual('non_ip/github.conf');
      const entries = [...active().filter(entry => entry.kind === 'DOMAIN-SET'), ...active().filter(entry => entry.kind === 'RULE-SET')];
      expect(firstOfFixtures({ hostname: 'ghcr.io' }, entries)).toEqual('domainset/download.conf');
    });

    it('sends GitHub Pages to CDN, if CDN stands in front of GitHub, with the optional CDN addresses switched on', () => {
      const withCdn = section.entries.filter(entry => !entry.optional || entry.ruleset === 'ip/cdn.conf');
      expect(firstOfFixtures({ destIp: '185.199.108.153' }, withCdn)).toEqual('ip/github.conf');
      expect(firstOfFixtures({ destIp: '185.199.108.153' }, moved(withCdn, 'ip/cdn.conf', 'before', 'ip/github.conf'))).toEqual('ip/cdn.conf');
      // and without them, which is what the Rule section has by default, there is nothing to decide
      expect(firstOfFixtures({ destIp: '185.199.108.153' })).toEqual('ip/github.conf');
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
