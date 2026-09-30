import process from 'node:process';
import { extractErrorMessage } from 'foxts/extract-error-message';

import { SHARED_DESCRIPTION } from './constants/description';
import { DomainListCommunityResolver } from './lib/domain-list-community';
import { $$fetch, ResponseError } from './lib/fetch-retry';
import { fetchRemoteTextLines } from './lib/fetch-text-by-line';
import { parseGitHubMeta } from './lib/github-meta';
import type { GitHubMetaRules } from './lib/github-meta';
import { parseGoogleIpRanges, subtractGoogleCloudRanges } from './lib/google-ip-ranges';
import { parseHomebrewDefaultEndpoints } from './lib/homebrew-endpoints';
import { RulesetOutput } from './lib/rules/ruleset';
import { SpanCategory, task } from './trace';
import type { Span } from './trace';

/** v2fly's community lists: geosite:<list>, and the rulesets derived from it, are generated from these files (see also Build/build-telegram.ts) */
const DOMAIN_LIST_COMMUNITY_DATA_URL = 'https://raw.githubusercontent.com/v2fly/domain-list-community/master/data/';
/** What GitHub publishes for its domains and its IP addresses: https://docs.github.com/en/rest/meta/meta */
const GITHUB_META_URL = 'https://api.github.com/meta';
/** Homebrew defines the hosts that it connects to in its own source code */
const HOMEBREW_SOURCE_URL = 'https://raw.githubusercontent.com/Homebrew/brew/HEAD/Library/Homebrew/brew.sh';
/** What Google publishes for its IP ranges: https://support.google.com/a/answer/10026322 */
const GOOGLE_IP_RANGES_URL = 'https://www.gstatic.com/ipranges/goog.json';
const GOOGLE_CLOUD_IP_RANGES_URL = 'https://www.gstatic.com/ipranges/cloud.json';
/** The two that a build must not be without: Homebrew does not work without its API and its bottles */
const REQUIRED_HOMEBREW_ENDPOINTS = ['HOMEBREW_API_DEFAULT_DOMAIN', 'HOMEBREW_BOTTLE_DEFAULT_DOMAIN'];

/** What a ruleset is made of, and what the file says about where that comes from */
interface ServiceRules {
  suffixes: string[],
  hostnames: string[],
  cidr4: string[],
  cidr6: string[],
  /** Where the data is downloaded from */
  sources: string[],
  /** Said in the file, below what the ruleset is for: how the data was turned into rules, and what to know about it */
  notes: string[],
  /** When the data was published, if it tells */
  date?: Date
}

interface ServiceRuleset {
  /** The ruleset is written to `List/<type>/<id>.conf` */
  id: string,
  type: 'non_ip' | 'ip',
  name: string,
  description: string[],
  load: (span: Span) => Promise<ServiceRules>
}

const rAdsLine = /\s@ads(?:\s|$)/i;

function createRules(rules: Partial<ServiceRules> & Pick<ServiceRules, 'sources' | 'notes'>): ServiceRules {
  return { suffixes: [], hostnames: [], cidr4: [], cidr6: [], ...rules };
}

// The state stays above the task: run as a script, a task starts the moment it is defined.
// The lists are downloaded once for all services, which overlap (google includes youtube and gemini, and so on).
const resolver = new DomainListCommunityResolver(list => fetchRemoteTextLines(DOMAIN_LIST_COMMUNITY_DATA_URL + list));
// Both the domains and the IP addresses of GitHub are made from the same response
let gitHubMetaPromise: Promise<GitHubMetaRules> | undefined;

/**
 * The list of the community, for a service that publishes none: its owner has a list of hostnames
 * for admins to read at best, and no list that a build could.
 */
function loadCommunityList(list: string, select?: (hostname: string) => boolean): ServiceRuleset['load'] {
  return async (span) => {
    const resolved = await span.traceChildAsync(
      `get ${list}`,
      () => resolver.resolve(list),
      SpanCategory.Network
    );

    // what is not an ad, and could not be taken (`keyword:`, `regexp:`), is worth knowing
    const unsupported = resolved.skipped.filter(line => !rAdsLine.test(line));
    if (unsupported.length > 0) {
      console.log('[service rulesets]', `${list}: skipped`, unsupported);
    }

    const notes = [
      'The service publishes no list of its domains that a build could read, so this file is made from the list that the community keeps.',
      'Entries that the list marks as ads (@ads) are left out.'
    ];
    // the first one is the list itself
    if (select === undefined && resolved.lists.length > 1) {
      notes.push('', `The list includes other lists, which are part of this file: ${resolved.lists.slice(1).join(', ')}.`);
    }

    return createRules({
      suffixes: select ? resolved.suffixes.filter(select) : resolved.suffixes,
      hostnames: select ? resolved.full.filter(select) : resolved.full,
      sources: [DOMAIN_LIST_COMMUNITY_DATA_URL + list],
      notes
    });
  };
}

function requestGitHubMeta(token?: string) {
  return $$fetch(GITHUB_META_URL, {
    headers: {
      'User-Agent': 'node-fetch',
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(token && { Authorization: `Bearer ${token}` })
    }
  });
}

async function fetchGitHubMeta() {
  // The list is public. A token only gets more requests than the 60 an hour that an anonymous client has, and
  // the runners of GitHub Actions share their addresses. One that GitHub does not accept (a stale token in the
  // environment of a developer) must not stand in the way of a list that needs none.
  const token = process.env.GITHUB_TOKEN;
  if (token) {
    try {
      return await requestGitHubMeta(token);
    } catch (error) {
      if (!(error instanceof ResponseError) || error.statusCode !== 401) {
        throw error;
      }
      console.warn('[service rulesets]', 'GitHub does not accept GITHUB_TOKEN, asking without it');
    }
  }

  return requestGitHubMeta();
}

function getGitHubMeta(span: Span) {
  if (gitHubMetaPromise) {
    return span.traceChildPromise('reuse GitHub meta', gitHubMetaPromise, SpanCategory.Wait);
  }

  gitHubMetaPromise = span.traceChildAsync('get GitHub meta', async () => {
    const resp = await fetchGitHubMeta();

    const meta = parseGitHubMeta(await resp.json());
    if (meta.skipped.length > 0) {
      console.log('[service rulesets]', 'github: skipped', meta.skipped);
    }
    return meta;
  }, SpanCategory.Network);

  return gitHubMetaPromise;
}

async function loadGitHubDomains(span: Span) {
  const { suffixes, hostnames } = await getGitHubMeta(span);

  return createRules({
    suffixes,
    hostnames,
    sources: [GITHUB_META_URL],
    notes: [
      'GitHub publishes these domains itself, for the networks that have to allow its services. It says that the list is not meant to be exhaustive.',
      'Taken from it: the domains of website, codespaces, copilot, packages, storage and actions, and the services of artifact_attestations.',
      'A wildcard like *.github.com is a DOMAIN-SUFFIX here, so it takes github.com as well.',
      'The list has domains of other companies too, which the services of GitHub need (Microsoft\'s and Azure\'s, for Codespaces). A wildcard on those would send everything of theirs to the policy of GitHub, so only the wildcards on the domains of GitHub are kept: the ones named after it, and ghcr.io. The hostnames are kept as they are listed.'
    ]
  });
}

async function loadGitHubIps(span: Span) {
  const { cidr4, cidr6 } = await getGitHubMeta(span);

  return createRules({
    cidr4,
    cidr6,
    sources: [GITHUB_META_URL],
    notes: [
      'GitHub publishes these IP ranges itself. It says that the list is not meant to be exhaustive, and that it does not recommend to allow by IP address.',
      'Taken from it: the ranges of web, api, git, pages and packages, which serve the content of GitHub. The other lists (hooks, actions, importer, dependabot, codespaces, copilot, ...) are left out: GitHub uses its addresses to deliver webhooks and to run builds as well.'
    ]
  });
}

async function loadHomebrew(span: Span) {
  const lines = await span.traceChildAsync(
    'get Homebrew brew.sh',
    () => fetchRemoteTextLines(HOMEBREW_SOURCE_URL),
    SpanCategory.Network
  );

  const endpoints = parseHomebrewDefaultEndpoints(lines);
  for (let i = 0, len = REQUIRED_HOMEBREW_ENDPOINTS.length; i < len; i++) {
    if (!endpoints.has(REQUIRED_HOMEBREW_ENDPOINTS[i])) {
      throw new Error(`${HOMEBREW_SOURCE_URL} does not define ${REQUIRED_HOMEBREW_ENDPOINTS[i]} (any more)!`);
    }
  }

  return createRules({
    hostnames: Array.from(new Set(endpoints.values())),
    sources: [HOMEBREW_SOURCE_URL],
    notes: [
      'Homebrew defines these hosts itself, in its source code, as the defaults of the settings that a mirror would replace:',
      ...Array.from(endpoints, ([name, hostname]) => `  ${name} = ${hostname}`)
    ]
  });
}

async function loadGoogleIps(span: Span) {
  const [goog, cloud] = await Promise.all([GOOGLE_IP_RANGES_URL, GOOGLE_CLOUD_IP_RANGES_URL].map(
    url => span.traceChildAsync(`get ${url}`, async () => parseGoogleIpRanges(await (await $$fetch(url)).json()), SpanCategory.Network)
  ));

  const { cidr4, cidr6 } = subtractGoogleCloudRanges(goog, cloud);

  return createRules({
    cidr4,
    cidr6,
    sources: [GOOGLE_IP_RANGES_URL, GOOGLE_CLOUD_IP_RANGES_URL],
    date: goog.creationTime,
    notes: [
      'Google publishes these IP ranges itself: goog.json has the ranges that Google makes available to users on the internet, and cloud.json the ranges that go to the customers of Google Cloud.',
      'What Google keeps for itself is what is left of the first when the second is taken away, which is what Google documents to do (https://support.google.com/a/answer/10026322).',
      'All of Google is in it, YouTube and Gemini included, and they cannot be told apart by their addresses.'
    ]
  });
}

const RULESETS: readonly ServiceRuleset[] = [
  {
    id: 'reddit',
    type: 'non_ip',
    name: 'Reddit',
    description: ['This file contains domains used by Reddit.'],
    load: loadCommunityList('reddit')
  },
  {
    id: 'homebrew',
    type: 'non_ip',
    name: 'Homebrew',
    description: ['This file contains hosts used by Homebrew, the package manager.'],
    load: loadHomebrew
  },
  {
    id: 'github',
    type: 'non_ip',
    name: 'GitHub',
    description: ['This file contains domains used by GitHub.'],
    load: loadGitHubDomains
  },
  {
    id: 'github',
    type: 'ip',
    name: 'GitHub',
    description: ['This file contains IP ranges used by GitHub.'],
    load: loadGitHubIps
  },
  {
    id: 'tiktok',
    type: 'non_ip',
    name: 'TikTok',
    description: ['This file contains domains used by TikTok.'],
    load: loadCommunityList('tiktok')
  },
  {
    id: 'youtube',
    type: 'non_ip',
    name: 'YouTube',
    description: ['This file contains domains used by YouTube.'],
    load: loadCommunityList('youtube')
  },
  {
    id: 'google',
    type: 'non_ip',
    name: 'Google',
    description: [
      'This file contains domains used by Google.',
      'It overlaps with the rulesets of other Google services, such as youtube and gemini. A connection follows the first ruleset that has a rule for it, so put those above this one.'
    ],
    load: loadCommunityList('google')
  },
  {
    id: 'google',
    type: 'ip',
    name: 'Google',
    description: ['This file contains IP ranges used by Google.'],
    load: loadGoogleIps
  },
  {
    id: 'gemini',
    type: 'non_ip',
    name: 'Google Gemini',
    description: [
      'This file contains domains used by Google Gemini, and by the other Google AI products that its list groups with it, such as AI Studio, NotebookLM and Antigravity.'
    ],
    load: loadCommunityList('google-gemini')
  },
  {
    // The community has no list for Antigravity: it is one of the sections of the list of Gemini
    id: 'antigravity',
    type: 'non_ip',
    name: 'Google Antigravity',
    description: [
      'This file contains domains used by Google Antigravity.',
      'The community has no list for Antigravity, so this file is taken from the list of Gemini: it keeps the hostnames that contain "antigravity".',
      'The hosts that Antigravity shares with the other Google AI products are not in this file, they are in the gemini ruleset.'
    ],
    load: loadCommunityList('google-gemini', hostname => hostname.includes('antigravity'))
  }
];

async function buildServiceRuleset(span: Span, ruleset: ServiceRuleset) {
  const rules = await ruleset.load(span);

  const total = rules.suffixes.length + rules.hostnames.length + rules.cidr4.length + rules.cidr6.length;
  console.log(
    '[service rulesets]',
    `${ruleset.type}/${ruleset.id}: ${rules.suffixes.length} domains, ${rules.hostnames.length} hostnames, ${rules.cidr4.length} IPv4 and ${rules.cidr6.length} IPv6 ranges`
  );

  if (total === 0) {
    throw new Error(`${rules.sources.join(', ')} has nothing for ${ruleset.name} in it!`);
  }

  const output = new RulesetOutput(span, ruleset.id, ruleset.type)
    .withTitle(`Surge Ruleset - ${ruleset.name}${ruleset.type === 'ip' ? ' IP CIDR' : ''}`)
    .withDescription([...SHARED_DESCRIPTION, '', ...ruleset.description, ...rules.notes])
    .appendDataSource(rules.sources);

  if (rules.date) {
    output.withDate(rules.date);
  }

  return output
    .bulkAddDomainSuffix(rules.suffixes)
    .bulkAddDomain(rules.hostnames)
    .bulkAddCIDR4NoResolve(rules.cidr4)
    .bulkAddCIDR6NoResolve(rules.cidr6)
    .write();
}

function reportFailure(ruleset: ServiceRuleset, error: unknown) {
  console.error(
    '[service rulesets]',
    `${ruleset.type}/${ruleset.id} was not written this time, a file of an earlier build is left as it is`,
    error
  );

  if (process.env.GITHUB_ACTIONS === 'true') {
    // A build that stays green gets no other mark on the page of the run. https://docs.github.com/en/actions/reference/workflow-commands-for-github-actions
    const message = (extractErrorMessage(error, false) ?? 'unknown error').replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A');
    console.log(`::warning title=The ${ruleset.type === 'ip' ? 'IP ' : ''}ruleset of ${ruleset.name} was not updated::${message}`);
  }
}

/**
 * The rulesets of services, from what their owners publish where they do (GitHub, Google's
 * IP ranges, the source code of Homebrew), and from the lists that the community keeps where
 * they do not. They are rebuilt on every run from the data as it is then, so they follow it.
 *
 * One service whose data is gone or empty must not hold back the other rulesets, and the
 * blocklists among them (the whole run fails, and nothing is published, when a task throws):
 * it keeps the file of the last build that could write it, and says so.
 */
export const buildServiceRulesets = task(require.main === module, __filename)(async (span) => {
  const results = await Promise.allSettled(RULESETS.map(ruleset => buildServiceRuleset(span, ruleset)));

  const errors: unknown[] = [];
  for (let i = 0, len = results.length; i < len; i++) {
    const result = results[i];
    if (result.status === 'rejected') {
      errors.push(result.reason);
      reportFailure(RULESETS[i], result.reason);
    }
  }

  // Not one of them is no longer a list gone missing here and there: the download, or this code, is broken
  if (errors.length === RULESETS.length) {
    throw new AggregateError(errors, 'Failed to build any of the service rulesets!');
  }
});
