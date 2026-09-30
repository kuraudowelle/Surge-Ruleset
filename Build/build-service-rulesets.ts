import path from 'node:path';
import process from 'node:process';
import { exclude, merge } from 'fast-cidr-tools';

import { SHARED_DESCRIPTION } from './constants/description';
import { SOURCE_DIR } from './constants/dir';
import { fetchAnnouncedPrefixes, RIPESTAT_ANNOUNCED_PREFIXES_URL } from './lib/announced-prefixes';
import { parseCidrLines } from './lib/cidr-lines';
import { resolveCommunityLists } from './lib/community-lists';
import type { CommunitySelection } from './lib/community-lists';
import { $$fetch, ResponseError } from './lib/fetch-retry';
import { fetchRemoteTextLines, readFileIntoProcessedArray } from './lib/fetch-text-by-line';
import { parseGitHubMeta } from './lib/github-meta';
import type { GitHubMetaRules } from './lib/github-meta';
import { parseGoogleIpRanges, subtractGoogleCloudRanges } from './lib/google-ip-ranges';
import { parseHomebrewDefaultEndpoints } from './lib/homebrew-endpoints';
import { reportRulesetFailure } from './lib/report-failure';
import { RulesetOutput } from './lib/rules/ruleset';
import { SpanCategory, task } from './trace';
import type { Span } from './trace';

/** What GitHub publishes for its domains and its IP addresses: https://docs.github.com/en/rest/meta/meta */
const GITHUB_META_URL = 'https://api.github.com/meta';
/** Homebrew defines the hosts that it connects to in its own source code */
const HOMEBREW_SOURCE_URL = 'https://raw.githubusercontent.com/Homebrew/brew/HEAD/Library/Homebrew/brew.sh';
/** What Google publishes for its IP ranges: https://support.google.com/a/answer/10026322 */
const GOOGLE_IP_RANGES_URL = 'https://www.gstatic.com/ipranges/goog.json';
const GOOGLE_CLOUD_IP_RANGES_URL = 'https://www.gstatic.com/ipranges/cloud.json';
/** The two that a build must not be without: Homebrew does not work without its API and its bottles */
const REQUIRED_HOMEBREW_ENDPOINTS = ['HOMEBREW_API_DEFAULT_DOMAIN', 'HOMEBREW_BOTTLE_DEFAULT_DOMAIN'];
/** The autonomous systems of Apple, which announce all of its address space: Apple Engineering, and Apple Austin */
const APPLE_ASNS = [714, 6185];
/** The IP ranges that the community keeps for addresses that are not on the internet, next to its list of domains for them */
const PRIVATE_IP_RANGES_URL = 'https://raw.githubusercontent.com/v2fly/geoip/release/text/private.txt';
/** Surge and the other tools of this kind give their virtual IPs out of it (Surge's own is 198.18.0.1/16), and no list of a ruleset held it before */
const VIRTUAL_IP_RANGE = '198.18.0.0/15';

/** What a ruleset is made of, and what the file says about where that comes from */
interface ServiceRules {
  suffixes: string[],
  hostnames: string[],
  cidr4: string[],
  cidr6: string[],
  /**
   * Whether the ranges are written with `no-resolve`, which is what a service wants: its domains are the rules
   * that catch it, and the ranges only catch what connects by IP. The ranges of a LAN are the opposite, they are
   * there to catch a name that the rules did not know and that turns out to be one of the LAN.
   */
  noResolve?: boolean,
  /** Rules that a list of domains or of ranges cannot carry (a process, a URL), as a ruleset has them: the lines of a file that is kept by hand */
  lines?: string[],
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

function createRules(rules: Partial<ServiceRules> & Pick<ServiceRules, 'sources' | 'notes'>): ServiceRules {
  return { suffixes: [], hostnames: [], cidr4: [], cidr6: [], ...rules };
}

// The state stays above the task: run as a script, a task starts the moment it is defined.
// The lists of the community are downloaded once for all rulesets, which overlap (google includes youtube and
// gemini, the AI lists include gemini, and so on): see resolveCommunityLists.
// Both the domains and the IP addresses of GitHub are made from the same response
let gitHubMetaPromise: Promise<GitHubMetaRules> | undefined;

/**
 * Makes rules of what the community keeps in its lists: what a service does not publish in a form that a build
 * can read (its owner has a list of hostnames for admins to read at best), and what groups many services (AI, ...).
 *
 * `notes` say why this file is made of them. The rest of what the file says about the lists is the same for all.
 */
async function getCommunityRules(span: Span, selections: ReadonlyArray<string | CommunitySelection>, notes: string[]): Promise<ServiceRules> {
  const resolved = await resolveCommunityLists(span, selections);

  // what is not an ad, and could not be taken (`regexp:`), is worth knowing
  if (resolved.unsupported.length > 0) {
    console.log('[service rulesets]', `${resolved.sources.map(source => source.slice(source.lastIndexOf('/') + 1)).join(', ')}: skipped`, resolved.unsupported);
  }

  return createRules({
    suffixes: resolved.suffixes,
    hostnames: resolved.hostnames,
    sources: resolved.sources,
    notes: [
      ...notes,
      'Entries that the list marks as ads (@ads) are left out.'
    ]
  });
}

/**
 * The list of the community, for a service that publishes none: its owner has a list of hostnames
 * for admins to read at best, and no list that a build could.
 */
function loadCommunityList(list: string, select?: (hostname: string) => boolean): ServiceRuleset['load'] {
  return span => getCommunityRules(span, [{ list, select }], [
    'The service publishes no list of its domains that a build could read, so this file is made from the list that the community keeps.'
  ]);
}

/**
 * What stays written by hand, in a file next to the sources, because no list carries it: a process is not
 * a domain, nor is a URL. A file of this kind says `# $ custom_build_script`, which keeps it from being a ruleset of its own.
 */
function readSupplement(file: string): Promise<string[]> {
  return readFileIntoProcessedArray(path.join(SOURCE_DIR, file));
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
      'The list has domains of other companies too, which the services of GitHub need (Microsoft\'s and Azure\'s). A wildcard on those would send everything of theirs to the policy of GitHub, so only the wildcards on the domains of GitHub are kept: the ones named after it, and ghcr.io. The hostnames are kept as they are listed.'
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

/** What is written by hand next to what is generated, and the file says so: where, and why no list of domains could carry it */
function withSupplement(rules: ServiceRules, lines: string[], file: string, what: string): ServiceRules {
  if (lines.length === 0) {
    return rules;
  }

  const count = lines.length === 1 ? 'One rule is' : `${lines.length} rules are`;
  return { ...rules, lines, notes: [...rules.notes, '', `${count} written by hand (${file}), because no list of domains can carry ${what}.`] };
}

async function loadAi(span: Span) {
  const [rules, lines] = await Promise.all([
    getCommunityRules(span, ['category-ai-!cn'], [
      'There are many AI services and none of them publishes a list of its domains that a build could read, so this file is made from the list that the community keeps for the AI services that are not in mainland China.'
    ]),
    readSupplement('non_ip/ai.conf')
  ]);

  return withSupplement(rules, lines, 'Source/non_ip/ai.conf', 'a URL: the page that the site of Gemini sends a client to when it does not like its IP address, which only matches with MITM on www.google.com');
}

// Both the domains and the addresses of Apple are made from the same answer
let applePrefixesPromise: ReturnType<typeof fetchAnnouncedPrefixes> | undefined;

function getApplePrefixes(span: Span) {
  applePrefixesPromise ??= span.traceChildAsync('get the prefixes of Apple', () => fetchAnnouncedPrefixes(APPLE_ASNS), SpanCategory.Network);
  return applePrefixesPromise;
}

const APPLE_PREFIXES_NOTES = [
  `The address space is what Apple announces itself, from its autonomous systems (${APPLE_ASNS.map(asn => `AS${asn}`).join(' and ')}), as RIPEstat sees it: ${RIPESTAT_ANNOUNCED_PREFIXES_URL}. The prefixes are merged, so a range that another one covers is not listed.`
];

async function loadAppleServices(span: Span) {
  const [community, { cidr4, cidr6 }, lines] = await Promise.all([
    getCommunityRules(span, [{ list: 'apple', ban: ['cn'] }], [
      'Apple publishes no list of its domains that a build can read (what it documents is for admins to read), so the domains are made from the list that the community keeps.',
      'The entries that the list marks as hosted in mainland China (@cn) are not in this file, they are in apple_cn.'
    ]),
    getApplePrefixes(span),
    readSupplement('non_ip/apple_services.conf')
  ]);

  return withSupplement({
    ...community,
    cidr4,
    cidr6,
    sources: [...community.sources, RIPESTAT_ANNOUNCED_PREFIXES_URL],
    notes: [...community.notes, '', ...APPLE_PREFIXES_NOTES, 'The ranges have no-resolve: they catch what connects by IP, and they never cause a lookup.']
  }, lines, 'Source/non_ip/apple_services.conf', 'a process: the system processes of Apple that connect without a domain that the rules could know');
}

async function loadAppleIps(span: Span) {
  const { cidr4, cidr6 } = await getApplePrefixes(span);

  return createRules({ cidr4, cidr6, sources: [RIPESTAT_ANNOUNCED_PREFIXES_URL], notes: APPLE_PREFIXES_NOTES });
}

function loadAppleCn(span: Span) {
  return getCommunityRules(span, [{ list: 'apple', must: ['cn'] }], [
    'Apple publishes no list of its domains that a build can read, so this file is made from the list that the community keeps. It is the part of it that the list marks as hosted in mainland China (@cn): the services that Apple runs there for its users there.'
  ]);
}

function loadAppleIntelligence(span: Span) {
  return getCommunityRules(span, ['apple-intelligence'], [
    'Apple publishes no list of the domains of Apple Intelligence that a build can read, so this file is made from the list that the community keeps.'
  ]);
}

function loadMicrosoft(span: Span) {
  return getCommunityRules(span, [{ list: 'microsoft', ban: ['cn'], skip: ['github'] }], [
    'Microsoft publishes lists of the endpoints of its services for admins (https://learn.microsoft.com/en-us/microsoft-365/enterprise/microsoft-365-ip-web-service), but they only hold Microsoft 365 and they add the domains of the certificate authorities that it needs, which are not Microsoft\'s to route. So this file is made from the list that the community keeps for all of Microsoft. The domains of Microsoft Teams, which Microsoft does publish, are in the teams ruleset.',
    'Two parts of that list are not in this file: the entries that it marks as hosted in mainland China (@cn), and the list of GitHub, which has a ruleset of its own (github).'
  ]);
}

function loadLanDomains(span: Span) {
  return getCommunityRules(span, ['private'], [
    'The registries of IANA (special-use domain names, locally-served DNS zones) have the reserved names, but not the names that routers and local tools answer for. The list that the community keeps follows the registries, and adds those.'
  ]);
}

async function loadLanIps(span: Span) {
  const lines = await span.traceChildAsync('get the private IP ranges', () => fetchRemoteTextLines(PRIVATE_IP_RANGES_URL), SpanCategory.Network);
  const { cidr4, cidr6 } = parseCidrLines(lines);

  return createRules({
    // the ranges are merged, and then the one that is not wanted is taken out of them
    cidr4: merge(exclude(merge(cidr4), [VIRTUAL_IP_RANGE]), true),
    cidr6: merge(cidr6, true),
    noResolve: false,
    sources: [PRIVATE_IP_RANGES_URL],
    notes: [
      'These are the ranges that the community keeps for the addresses that are not on the internet: private networks, loopback, link-local, multicast, documentation.',
      `${VIRTUAL_IP_RANGE} is not in this file, although the list has it: Surge and other tools use it for virtual IPs.`,
      'The ranges have no no-resolve: they are there for the name that the rules did not know, and that a lookup shows to be one of the LAN.'
    ]
  });
}

const RULESETS: readonly ServiceRuleset[] = [
  {
    id: 'ai',
    type: 'non_ip',
    name: 'AI',
    description: ['This file contains domains used by AI services: OpenAI, Claude, Gemini, Perplexity, Grok, Copilot and more.'],
    load: loadAi
  },
  {
    id: 'apple_services',
    type: 'non_ip',
    name: 'Apple',
    description: ['This file contains domains and addresses of Apple, Inc.'],
    load: loadAppleServices
  },
  {
    id: 'apple_services',
    type: 'ip',
    name: 'Apple',
    description: ['This file contains IP ranges owned by Apple, Inc.'],
    load: loadAppleIps
  },
  {
    id: 'apple_cn',
    type: 'non_ip',
    name: 'Apple China',
    description: ['This file contains domains of Apple, Inc that have host service specific for the Mainland China.'],
    load: loadAppleCn
  },
  {
    id: 'apple_intelligence',
    type: 'non_ip',
    name: 'Apple Intelligence',
    description: ['This file contains domains that Apple Intelligence depends on.'],
    load: loadAppleIntelligence
  },
  {
    id: 'microsoft',
    type: 'non_ip',
    name: 'Microsoft',
    description: ['This file contains domains of Microsoft.'],
    load: loadMicrosoft
  },
  {
    id: 'lan',
    type: 'non_ip',
    name: 'LAN',
    description: ['This file contains the domains of the LAN: reserved TLDs, the reverse zones of the private addresses (AS112) and the names of routers.'],
    load: loadLanDomains
  },
  {
    id: 'lan',
    type: 'ip',
    name: 'LAN',
    description: ['This file contains the IP ranges of the LAN and of the other addresses that are not on the internet.'],
    load: loadLanIps
  },
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

  output
    .bulkAddDomainSuffix(rules.suffixes)
    .bulkAddDomain(rules.hostnames);

  if (rules.noResolve === false) {
    output.bulkAddCIDR4(rules.cidr4).bulkAddCIDR6(rules.cidr6);
  } else {
    output.bulkAddCIDR4NoResolve(rules.cidr4).bulkAddCIDR6NoResolve(rules.cidr6);
  }

  if (rules.lines) {
    output.addFromRuleset(rules.lines);
  }

  return output.write();
}

function reportFailure(ruleset: ServiceRuleset, error: unknown) {
  reportRulesetFailure(
    'service rulesets',
    `${ruleset.type}/${ruleset.id}`,
    `The ${ruleset.type === 'ip' ? 'IP ' : ''}ruleset of ${ruleset.name} was not updated`,
    error
  );
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
