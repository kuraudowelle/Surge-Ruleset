// @ts-check
import type { Span } from './trace';
import { SpanCategory, task } from './trace';

import { ALL, NORTH_AMERICA, EU, HK, TW, JP, KR } from '../Source/stream';
import type { StreamService } from '../Source/stream';
import { SHARED_DESCRIPTION } from './constants/description';
import { fetchAnnouncedPrefixes, RIPESTAT_ANNOUNCED_PREFIXES_URL } from './lib/announced-prefixes';
import type { Cidrs } from './lib/cidr-lines';
import { resolveCommunityLists } from './lib/community-lists';
import { describeHandCollected } from './lib/hand-collected';
import { reportRulesetFailure } from './lib/report-failure';
import { RulesetOutput } from './lib/rules/ruleset';

// The state stays above the task: run as a script, a task starts the moment it is defined.
// The groups overlap (all of them are in `stream`), and Netflix is asked about once.
const prefixesOfAsns = new Map<string, Promise<Cidrs>>();

function getPrefixes(span: Span, asns: number[]): Promise<Cidrs> {
  const key = asns.join(',');
  let prefixes = prefixesOfAsns.get(key);
  if (prefixes === undefined) {
    prefixes = span.traceChildAsync(`get the prefixes of AS${asns.join(', AS')}`, () => fetchAnnouncedPrefixes(asns), SpanCategory.Network);
    prefixesOfAsns.set(key, prefixes);
  }
  return prefixes;
}

async function buildRulesetsForStreamServices(span: Span, fileId: string, title: string, streamServices: StreamService[]) {
  const lists = streamServices.flatMap(service => service.lists ?? []);
  const asns = Array.from(new Set(streamServices.flatMap(service => service.asns ?? [])));
  // what a person collected: it is in the file whatever the lists and the owners say
  const handRules = streamServices.flatMap(service => service.rules ?? []);
  const handCidr4 = streamServices.flatMap(service => service.ip?.v4 ?? []);
  const handCidr6 = streamServices.flatMap(service => service.ip?.v6 ?? []);

  const [community, prefixes] = await Promise.all([
    resolveCommunityLists(span, lists),
    asns.length === 0 ? { cidr4: [], cidr6: [] } satisfies Cidrs : getPrefixes(span, asns)
  ]);

  if (community.unsupported.length > 0) {
    console.log('[stream services]', `${fileId}: skipped`, community.unsupported);
  }
  // Lists that have no domain are a download that is not what it should be, not a group without lists
  if (lists.length > 0 && community.suffixes.length + community.hostnames.length === 0) {
    throw new Error(`The lists of the community have no domain for the stream services of ${title}!`);
  }

  console.log(
    '[stream services]',
    `${fileId}: ${streamServices.length} services, ${community.suffixes.length} domains, ${community.hostnames.length} hostnames, ${prefixes.cidr4.length} IPv4 and ${prefixes.cidr6.length} IPv6 ranges, ${handRules.length} rules and ${handCidr4.length + handCidr6.length} ranges collected by hand`
  );

  const services = streamServices.map(service => `- ${service.name}`);
  const notes = [
    '',
    'A service is made of the list that the community keeps for it, where there is one, and of the rules that were collected by hand (Source/stream.ts): the domains that no list has, and the identifiers of apps (USER-AGENT, PROCESS-NAME), which no list carries.',
    'Entries that a list marks as ads (@ads) are left out.',
    ...describeHandCollected({ file: 'Source/stream.ts', lines: handRules })
  ];
  const ipNotes = [
    '',
    asns.length === 0
      ? 'None of the services has addresses that its owner announces.'
      : `The addresses are what the owner of the service announces itself, from its autonomous systems (${asns.map(asn => `AS${asn}`).join(', ')}), as RIPEstat sees it. The prefixes are merged, so a range that another one covers is not listed.`,
    ...describeHandCollected({ file: 'Source/stream.ts', lines: [...handCidr4, ...handCidr6] })
  ];

  return Promise.all([
    // Domains
    new RulesetOutput(span, fileId, 'non_ip')
      .withTitle(`Surge Ruleset - Stream Services: ${title}`)
      .appendDescription(SHARED_DESCRIPTION)
      .appendDescription('')
      .appendDescription(services)
      .appendDescription(notes)
      .appendDataSource(community.sources)
      .bulkAddDomainSuffix(community.suffixes)
      .bulkAddDomain(community.hostnames)
      .addFromRuleset(handRules)
      .write(),
    // IP
    new RulesetOutput(span, fileId, 'ip')
      .withTitle(`Surge Ruleset - Stream Services IPs: ${title}`)
      .appendDescription(SHARED_DESCRIPTION)
      .appendDescription('')
      .appendDescription(services)
      .appendDescription(ipNotes)
      .appendDataSource(asns.length === 0 ? [] : [RIPESTAT_ANNOUNCED_PREFIXES_URL])
      .bulkAddCIDR4NoResolve(prefixes.cidr4)
      .bulkAddCIDR6NoResolve(prefixes.cidr6)
      .bulkAddCIDR4NoResolve(handCidr4)
      .bulkAddCIDR6NoResolve(handCidr6)
      .write()
  ]);
}

const GROUPS: ReadonlyArray<readonly [fileId: string, title: string, services: StreamService[]]> = [
  ['stream', 'All', ALL],
  ['stream_us', 'North America', NORTH_AMERICA],
  ['stream_eu', 'Europe', EU],
  ['stream_hk', 'Hong Kong', HK],
  ['stream_tw', 'Taiwan', TW],
  ['stream_jp', 'Japan', JP],
  // createRulesetForStreamService('stream_au', 'Oceania', AU),
  ['stream_kr', 'Korean', KR]
  // createRulesetForStreamService('stream_south_east_asia', 'South East Asia', SOUTH_EAST_ASIA)
];

/**
 * One group that cannot get its data must not hold back the others, nor the rest of the build: it keeps the
 * files of the last build that could write them, and says so.
 */
export const buildStreamService = task(require.main === module, __filename)(async (span) => {
  const results = await Promise.allSettled(GROUPS.map(([fileId, title, services]) => buildRulesetsForStreamServices(span, fileId, title, services)));

  const errors: unknown[] = [];
  for (let i = 0, len = results.length; i < len; i++) {
    const result = results[i];
    if (result.status === 'rejected') {
      errors.push(result.reason);
      reportRulesetFailure('stream services', `non_ip/${GROUPS[i][0]} and ip/${GROUPS[i][0]}`, `The rulesets of the stream services of ${GROUPS[i][1]} were not updated`, result.reason);
    }
  }

  // Not one of them is no longer a list gone missing here and there: the download, or this code, is broken
  if (errors.length === GROUPS.length) {
    throw new AggregateError(errors, 'Failed to build any of the rulesets of the stream services!');
  }
});
