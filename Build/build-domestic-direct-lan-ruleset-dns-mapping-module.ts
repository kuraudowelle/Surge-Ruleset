// @ts-check
import path from 'node:path';
import { DOMESTICS, DOH_BOOTSTRAP, AdGuardHomeDNSMapping } from '../Source/non_ip/domestic';
import { DIRECTS, HOSTS, LAN } from '../Source/non_ip/direct';
import type { DNSMapping } from '../Source/non_ip/direct';
import { fetchRemoteTextLines } from './lib/fetch-text-by-line';
import { compareAndWriteFile } from './lib/create-file';
import { SpanCategory, task } from './trace';
import type { Span } from './trace';
import { SHARED_DESCRIPTION } from './constants/description';
import { appendArrayInPlace } from 'foxts/append-array-in-place';
import { resolveCommunityLists } from './lib/community-lists';
import { createGetDnsMappingRule } from './lib/dns-mapping-rule';
import { describeHandCollected, readHandCollected } from './lib/hand-collected';
import type { HandCollected } from './lib/hand-collected';
import { reportRulesetFailure } from './lib/report-failure';
import { OUTPUT_INTERNAL_DIR, OUTPUT_MODULES_DIR, OUTPUT_MODULES_RULES_DIR } from './constants/dir';
import { RulesetOutput, SurgeOnlyRulesetOutput } from './lib/rules/ruleset';
import { $$fetch } from './lib/fetch-retry';

/**
 * What the community keeps for the domains of mainland China: the list that the tools of the community go direct
 * with (`geolocation-cn`, the `.cn` domains, and what the lists of foreign companies mark @cn: the part of them
 * that is hosted there).
 */
const DOMESTIC_SELECTIONS = ['cn'];

/**
 * What the community keeps for what should not be proxied: the PT sites (the trackers of a PT site ban an account
 * that shows up from two IPs), the academic publishers and databases (a campus gives access by its IP), and Xunlei.
 */
const DIRECT_SELECTIONS = ['category-pt', 'category-scholar-!cn', 'category-scholar-cn', 'xunlei'];

interface DomainsRuleset {
  /** The lines of a ruleset */
  lines: string[],
  /** Where the lists that make it are downloaded from */
  sources: string[],
  /** What a person collected for it: in the lines already, and the file says where it is */
  handCollected: HandCollected
}

async function getCommunityDomains(span: Span, selections: string[], handCollected: HandCollected): Promise<DomainsRuleset> {
  const { suffixes, hostnames, unsupported, sources } = await resolveCommunityLists(span, selections);

  if (unsupported.length > 0) {
    console.log('[domestic & direct]', `${selections.join(', ')}: skipped ${unsupported.length} entries that a ruleset cannot take (regexp: and the like)`);
  }

  const lines: string[] = [];
  for (let i = 0, len = suffixes.length; i < len; i++) {
    lines.push('DOMAIN-SUFFIX,' + suffixes[i]);
  }
  for (let i = 0, len = hostnames.length; i < len; i++) {
    lines.push('DOMAIN,' + hostnames[i]);
  }
  appendArrayInPlace(lines, handCollected.lines);

  return { lines, sources, handCollected };
}

/**
 * The domains of mainland China: the list of the community, the domains that the Local DNS Mapping module
 * gives a DNS of the service to (they have to go direct as well, and the list of the community has most of them),
 * and what a person collected (Source/non_ip/domestic.conf).
 */
async function getDomestics(span: Span, handCollected: HandCollected): Promise<DomainsRuleset> {
  const ruleset = await getCommunityDomains(span, DOMESTIC_SELECTIONS, handCollected);
  const getDnsMappingRuleWithWildcard = createGetDnsMappingRule(true);

  [DOH_BOOTSTRAP, DOMESTICS].forEach((item) => {
    Object.values(item).forEach(({ domains }) => {
      appendArrayInPlace(ruleset.lines, domains.flatMap(getDnsMappingRuleWithWildcard));
    });
  });

  return ruleset;
}

/**
 * What should not be proxied: the lists of the community, the captive portals and the pages of the routers that
 * the Local DNS Mapping module knows, and what a person collected (Source/non_ip/direct.conf): the domains, and the
 * processes that no list of domains can carry (proxy tools, downloaders).
 */
async function getDirects(span: Span, handCollected: HandCollected): Promise<DomainsRuleset> {
  const ruleset = await getCommunityDomains(span, DIRECT_SELECTIONS, handCollected);
  const getDnsMappingRuleWithWildcard = createGetDnsMappingRule(true);

  Object.values(DIRECTS).forEach(({ domains }) => {
    appendArrayInPlace(ruleset.lines, domains.flatMap(getDnsMappingRuleWithWildcard));
  });

  Object.values(LAN).forEach(({ domains }) => {
    appendArrayInPlace(ruleset.lines, domains.flatMap(getDnsMappingRuleWithWildcard));
  });

  return ruleset;
}

/** One of the rulesets that cannot get its data keeps its file of the last build, and the files made of what is here are still written */
async function settle<T>(file: string, title: string, promise: Promise<T>): Promise<T | null> {
  try {
    return await promise;
  } catch (error) {
    reportRulesetFailure('domestic & direct', file, title, error);
    return null;
  }
}

export const buildDomesticRuleset = task(require.main === module, __filename)(async (span) => {
  // A file of the sources that is wrong is a mistake of whoever keeps them, and not a source that is down: it fails the build
  const [domesticHandCollected, directHandCollected] = await Promise.all([
    readHandCollected('non_ip', 'domestic'),
    readHandCollected('non_ip', 'direct')
  ]);

  const [domestics, directs] = await Promise.all([
    settle('non_ip/domestic', 'The ruleset of the domestic domains was not updated', getDomestics(span, domesticHandCollected)),
    settle('non_ip/direct', 'The ruleset of what goes direct was not updated', getDirects(span, directHandCollected))
  ]);

  const dataset: Array<[name: string, mapping: DNSMapping]> = ([DOH_BOOTSTRAP, DOMESTICS, DIRECTS, LAN, HOSTS] as const).flatMap(Object.entries);

  return Promise.all([
    domestics && new RulesetOutput(span, 'domestic', 'non_ip')
      .withTitle('Surge Ruleset - Domestic Domains')
      .appendDescription(
        SHARED_DESCRIPTION,
        '',
        'This file contains known addresses that are available in the Mainland China.',
        '',
        `It is made of the list that the community keeps for them (${DOMESTIC_SELECTIONS.join(', ')}: the domains of mainland China, the .cn domains, and what the lists of foreign companies mark as hosted there), and of the domains that the Local DNS Mapping module of this project gives a DNS to.`,
        ...describeHandCollected(domestics.handCollected)
      )
      .appendDataSource(domestics.sources)
      .addFromRuleset(domestics.lines)
      .write(),
    directs && new RulesetOutput(span, 'direct', 'non_ip')
      .withTitle('Surge Ruleset - Direct Rules')
      .appendDescription(
        SHARED_DESCRIPTION,
        '',
        'This file contains domains and process that should not be proxied.',
        '',
        `The domains are made of the lists that the community keeps for PT sites, for academic publishers and databases and for Xunlei (${DIRECT_SELECTIONS.join(', ')}), and of the captive portals and the pages of routers that the Local DNS Mapping module of this project knows.`,
        'The processes and apps of the tools that must not be proxied (proxy tools, downloaders, ...) are not in any list of domains, they are collected by hand.',
        ...describeHandCollected(directs.handCollected)
      )
      .appendDataSource(directs.sources)
      .addFromRuleset(directs.lines)
      .write(),
    buildLANCacheRuleset(span),
    ...dataset.map(([name, { ruleset, domains }]) => {
      if (!ruleset) {
        return;
      }

      const surgeOutput = new SurgeOnlyRulesetOutput(
        span,
        name.toLowerCase(),
        'sukka_local_dns_mapping',
        OUTPUT_MODULES_RULES_DIR
      )
        .withTitle(`Surge Ruleset - Local DNS Mapping (${name})`)
        .appendDescription(
          SHARED_DESCRIPTION,
          '',
          'This is an internal rule that is only referenced by sukka_local_dns_mapping.sgmodule',
          'Do not use this file in your Rule section, all entries are included in non_ip/domestic.conf already.'
        );

      domains.forEach((domain) => {
        const isWildcard = domain.includes('*') || domain.includes('?');
        switch (domain[0]) {
          case '$': {
            const d = domain.slice(1);
            if (isWildcard) {
              surgeOutput.addDomainWildcard(d);
            } else {
              surgeOutput.addDomain(d);
            }
            break;
          }
          case '+': {
            const d = domain.slice(1);
            if (isWildcard) {
              surgeOutput.addDomainWildcard(`*.${d}`);
            } else {
              surgeOutput.addDomainSuffix(d);
            }
            break;
          }
          default:
            if (isWildcard) {
              surgeOutput.addDomainWildcard(domain);
              surgeOutput.addDomainWildcard(`*.${domain}`);
            } else {
              surgeOutput.addDomainSuffix(domain);
            }
            break;
        }
      });

      return surgeOutput.write();
    }),

    compareAndWriteFile(
      span,
      [
        '#!name=[Surge Ruleset] Local DNS Mapping',
        `#!desc=Last Updated: ${new Date().toISOString()}`,
        '',
        '[Host]',
        ...Object.entries(
          // I use an object to deduplicate the domains
          // Otherwise I could just construct an array directly
          dataset.reduce<Record<string, string>>((acc, cur) => {
            const ruleset_name = cur[0].toLowerCase();
            const { domains, dns, hosts, ruleset } = cur[1];

            if (dns == null) {
              return acc;
            }

            Object.entries(hosts).forEach(([dns, ips]) => {
              acc[dns] ||= ips.join(', ');
            });

            if (ruleset) {
              acc[`RULE-SET:https://raw.githubusercontent.com/kuraudowelle/Surge-Ruleset/master/Modules/Rules/sukka_local_dns_mapping/${ruleset_name}.conf`] ||= `server:${dns}`;
            } else {
              domains.forEach((domain) => {
                switch (domain[0]) {
                  case '$':
                    acc[domain.slice(1)] ||= `server:${dns}`;
                    break;
                  case '+':
                    acc[`*.${domain.slice(1)}`] ||= `server:${dns}`;
                    break;
                  default:
                    acc[domain] ||= `server:${dns}`;
                    acc[`*.${domain}`] ||= `server:${dns}`;
                    break;
                }
              });
            }

            return acc;
          }, {})
        ).map(([dns, ips]) => `${dns} = ${ips}`)
      ],
      path.resolve(OUTPUT_MODULES_DIR, 'sukka_local_dns_mapping.sgmodule')
    ),
    compareAndWriteFile(
      span,
      [
        '# Local DNS Mapping for AdGuard Home',
        'https://doh.pub/dns-query',
        'https://dns.alidns.com/dns-query',
        '[//]udp://10.10.1.1:53',
        ...(([DOMESTICS, DIRECTS, LAN, HOSTS] as const).flatMap(Object.values) as DNSMapping[]).flatMap(({ domains, dns: _dns }) => domains.flatMap((domain) => {
          if (!_dns) {
            return [];
          }

          let dns;
          if (_dns in AdGuardHomeDNSMapping) {
            dns = AdGuardHomeDNSMapping[_dns as keyof typeof AdGuardHomeDNSMapping].join(' ');
          } else {
            console.warn(`Unknown DNS "${_dns}" not in AdGuardHomeDNSMapping`);
            dns = _dns;
          }

          // if (
          //   // AdGuard Home has built-in AS112 / private PTR handling
          //   domain.endsWith('.arpa')
          //   // Ignore simple hostname
          //   || !domain.includes('.')
          // ) {
          //   return [];
          // }
          if (domain[0] === '$') {
            return [
              `[/${domain.slice(1)}/]${dns}`
            ];
          }
          if (domain[0] === '+') {
            return [
              `[/${domain.slice(1)}/]${dns}`
            ];
          }
          return [
            `[/${domain}/]${dns}`
          ];
        }))
      ],
      path.resolve(OUTPUT_INTERNAL_DIR, 'dns_mapping_adguardhome.conf')
    )
  ]);
});

async function buildLANCacheRuleset(span: Span) {
  const childSpan = span.traceChild('build LAN cache ruleset');

  const cacheDomainsData = await childSpan.traceChildAsync('fetch cache_domains.json', async () => (await $$fetch('https://cdn.jsdelivr.net/gh/uklans/cache-domains@master/cache_domains.json')).json(), SpanCategory.Network);
  if (!cacheDomainsData || typeof cacheDomainsData !== 'object' || !('cache_domains' in cacheDomainsData) || !Array.isArray(cacheDomainsData.cache_domains)) {
    throw new TypeError('Invalid cache domains data');
  }
  const allDomainFiles = cacheDomainsData.cache_domains.reduce<string[]>((acc, { domain_files }) => {
    if (Array.isArray(domain_files)) {
      appendArrayInPlace(acc, domain_files);
    }
    return acc;
  }, []);

  const allDomains = (
    await Promise.all(
      allDomainFiles.map(
        (file) => childSpan.traceChildAsync(
          'download ' + file,
          () => fetchRemoteTextLines('https://cdn.jsdelivr.net/gh/uklans/cache-domains@master/' + file, true),
          SpanCategory.Network
        )
      )
    )
  ).flat();

  const surgeOutput = new SurgeOnlyRulesetOutput(
    span,
    'lancache',
    'sukka_local_dns_mapping',
    OUTPUT_MODULES_RULES_DIR
  )
    .withTitle('Surge Ruleset - Local DNS Mapping (lancache)')
    .appendDescription(
      SHARED_DESCRIPTION,
      '',
      'This is an internal rule that is only referenced by sukka_local_dns_mapping.sgmodule',
      'Do not use this file in your Rule section.'
    );

  for (let i = 0, len = allDomains.length; i < len; i++) {
    const domain = allDomains[i];

    if (domain.includes('*')) {
      // If only *. prefix is used, we can convert it to DOMAIN-SUFFIX
      if (domain.startsWith('*.') && !domain.slice(2).includes('*')) {
        const domainSuffix = domain.slice(2);
        surgeOutput.addDomainSuffix(domainSuffix);
        continue;
      }

      surgeOutput.addDomainWildcard(domain);
      continue;
    }

    surgeOutput.addDomain(domain);
  }

  childSpan.stop();

  return surgeOutput.write();
}
