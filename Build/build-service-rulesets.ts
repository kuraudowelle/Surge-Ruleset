import process from 'node:process';
import { extractErrorMessage } from 'foxts/extract-error-message';

import { SHARED_DESCRIPTION } from './constants/description';
import { DomainListCommunityResolver } from './lib/domain-list-community';
import type { ResolvedDomainList } from './lib/domain-list-community';
import { fetchRemoteTextLines } from './lib/fetch-text-by-line';
import { RulesetOutput } from './lib/rules/ruleset';
import { SpanCategory, task } from './trace';
import type { Span } from './trace';

/** v2fly's community lists: geosite:<list>, and the rulesets derived from it, are generated from these files (see also Build/build-telegram.ts) */
const DOMAIN_LIST_COMMUNITY_DATA_URL = 'https://raw.githubusercontent.com/v2fly/domain-list-community/master/data/';

interface ServiceDefinition {
  /** The ruleset is written to `List/non_ip/<id>.conf` */
  id: string,
  name: string,
  /** The list of domain-list-community that the ruleset is made of */
  list: string,
  /** Keeps the hostnames it says yes to. For a service that has no list of its own, only a part of one. */
  select?: (hostname: string) => boolean,
  description: string[]
}

const rAdsLine = /\s@ads(?:\s|$)/i;

const SERVICES: readonly ServiceDefinition[] = [
  {
    id: 'reddit',
    name: 'Reddit',
    list: 'reddit',
    description: ['This file contains domains used by Reddit.']
  },
  {
    id: 'homebrew',
    name: 'Homebrew',
    list: 'homebrew',
    description: [
      'This file contains domains used by Homebrew, the package manager.',
      'Its bottles come from GitHub Packages (ghcr.io), which the ruleset of GitHub takes care of.'
    ]
  },
  {
    id: 'github',
    name: 'GitHub',
    list: 'github',
    description: ['This file contains domains used by GitHub.']
  },
  {
    id: 'tiktok',
    name: 'TikTok',
    list: 'tiktok',
    description: ['This file contains domains used by TikTok.']
  },
  {
    id: 'youtube',
    name: 'YouTube',
    list: 'youtube',
    description: ['This file contains domains used by YouTube.']
  },
  {
    id: 'google',
    name: 'Google',
    list: 'google',
    description: [
      'This file contains domains used by Google.',
      'It overlaps with the rulesets of other Google services, such as youtube and gemini. A connection follows the first ruleset that has a rule for it, so put those above this one.'
    ]
  },
  {
    id: 'gemini',
    name: 'Google Gemini',
    list: 'google-gemini',
    description: [
      'This file contains domains used by Google Gemini, and by the other Google AI products that its list groups with it, such as AI Studio, NotebookLM and Antigravity.'
    ]
  },
  {
    // The community has no list for Antigravity: it is one of the sections of the list of Gemini
    id: 'antigravity',
    name: 'Google Antigravity',
    list: 'google-gemini',
    select: hostname => hostname.includes('antigravity'),
    description: [
      'This file contains domains used by Google Antigravity.',
      'The community has no list for Antigravity, so this file is taken from the list of Gemini: it keeps the hostnames that contain "antigravity".',
      'The hosts that Antigravity shares with the other Google AI products are not in this file, they are in the gemini ruleset.'
    ]
  }
];

// The state stays above the task: run as a script, a task starts the moment it is defined.
// The lists are downloaded once for all services, which overlap (google includes youtube and gemini, and so on).
const resolver = new DomainListCommunityResolver(list => fetchRemoteTextLines(DOMAIN_LIST_COMMUNITY_DATA_URL + list));

function createDescription(service: ServiceDefinition, resolved: ResolvedDomainList) {
  const description = [
    ...SHARED_DESCRIPTION,
    '',
    ...service.description,
    'Entries that the list marks as ads (@ads) are left out.'
  ];

  // the first one is the list itself
  if (service.select === undefined && resolved.lists.length > 1) {
    description.push('', `The list includes other lists, which are part of this file: ${resolved.lists.slice(1).join(', ')}.`);
  }

  return description;
}

async function buildServiceRuleset(span: Span, service: ServiceDefinition) {
  const url = DOMAIN_LIST_COMMUNITY_DATA_URL + service.list;

  const resolved = await span.traceChildAsync(
    `get ${service.list} for ${service.id}`,
    () => resolver.resolve(service.list),
    SpanCategory.Network
  );

  const { select } = service;
  const suffixes = select ? resolved.suffixes.filter(select) : resolved.suffixes;
  const full = select ? resolved.full.filter(select) : resolved.full;

  // what is not an ad, and could not be taken (`keyword:`, `regexp:`), is worth knowing
  const unsupported = resolved.skipped.filter(line => !rAdsLine.test(line));
  console.log(
    '[service rulesets]',
    `${service.id}: ${suffixes.length} domains and ${full.length} hostnames from ${resolved.lists.length} list(s) of domain-list-community`,
    unsupported.length > 0 ? { skipped: unsupported } : ''
  );

  if (suffixes.length + full.length === 0) {
    throw new Error(`${url} has no domain for ${service.name} in it!`);
  }

  return new RulesetOutput(span, service.id, 'non_ip')
    .withTitle(`Surge Ruleset - ${service.name}`)
    .withDescription(createDescription(service, resolved))
    .appendDataSource(url)
    .bulkAddDomainSuffix(suffixes)
    .bulkAddDomain(full)
    .write();
}

function reportFailure(service: ServiceDefinition, error: unknown) {
  console.error(
    '[service rulesets]',
    `${service.id} was not written this time, a file of an earlier build is left as it is`,
    error
  );

  if (process.env.GITHUB_ACTIONS === 'true') {
    // A build that stays green gets no other mark on the page of the run. https://docs.github.com/en/actions/reference/workflow-commands-for-github-actions
    const message = (extractErrorMessage(error, false) ?? 'unknown error').replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A');
    console.log(`::warning title=The ruleset of ${service.name} was not updated::${message}`);
  }
}

/**
 * The services whose domains the community maintains a list for. They are rebuilt on every
 * run from the lists as they are then, so they follow what the community adds and removes.
 *
 * One service whose list is gone or empty must not hold back the other rulesets, and the
 * blocklists among them (the whole run fails, and nothing is published, when a task throws):
 * it keeps the file of the last build that could write it, and says so.
 */
export const buildServiceRulesets = task(require.main === module, __filename)(async (span) => {
  const results = await Promise.allSettled(SERVICES.map(service => buildServiceRuleset(span, service)));

  const errors: unknown[] = [];
  for (let i = 0, len = results.length; i < len; i++) {
    const result = results[i];
    if (result.status === 'rejected') {
      errors.push(result.reason);
      reportFailure(SERVICES[i], result.reason);
    }
  }

  // Not one of them is no longer a list gone missing here and there: the download, or this code, is broken
  if (errors.length === SERVICES.length) {
    throw new AggregateError(errors, 'Failed to build any of the service rulesets!');
  }
});
