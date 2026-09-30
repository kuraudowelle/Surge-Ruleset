import { getDomain } from 'tldts';
import { fastIpVersion } from 'foxts/fast-ip-version';
import { appendArrayInPlace } from 'foxts/append-array-in-place';

import { looseTldtsOpt } from '../constants/loose-tldts-opt';
import { normalizeDomain } from './normalize-domain';

export interface GitHubMetaRules {
  /**
   * `*.github.com` of the API: the domain and every subdomain (DOMAIN-SUFFIX). It takes `github.com` itself as well, which the
   * wildcard of GitHub does not. Only the domains of GitHub, see {@link isOwnedByGitHub}
   */
  suffixes: string[],
  /** `example.com` of the API: exactly this hostname (DOMAIN), whose it is */
  hostnames: string[],
  cidr4: string[],
  cidr6: string[],
  /** What a ruleset cannot take, kept for the build log */
  skipped: string[]
}

/**
 * The lists of `domains` in https://api.github.com/meta that a ruleset takes. `actions_inbound` and the trust domain of
 * `artifact_attestations` are left out: nothing in the documentation of GitHub says what either of them is for.
 */
const DOMAIN_KEYS = ['website', 'codespaces', 'copilot', 'packages', 'storage', 'actions'] as const;

/**
 * The lists of IP ranges in https://api.github.com/meta that serve GitHub's content, which is what people and their tools
 * connect to. GitHub says its addresses "are used to serve our content, deliver webhooks, and perform hosted GitHub Actions
 * builds", the lists of the last two (`hooks`, `actions`, ...) are not among them. Nor are `codespaces` and `copilot`, which
 * GitHub does not say anything about that this can rely on.
 */
const IP_KEYS = ['web', 'api', 'git', 'pages', 'packages'] as const;

/**
 * The domains that GitHub owns: the ones that are named after it (github.com, githubusercontent.com, githubassets.com,
 * github.io, ...) and its container registry. What is not one of those is somebody else's, however much of it GitHub needs.
 *
 * GitHub lists what its services need, for the networks that have to allow them, and that is more than what
 * is GitHub's: it has wildcards on domains of Microsoft and of Azure (*.visualstudio.com, which GitHub's documentation of
 * Codespaces says to allow, is one of them). Allowing *.windows.net is what a firewall does. A ruleset that sends everything
 * below it to the policy of GitHub would take every storage account, virtual machine and database that anybody has on
 * Azure with it. This is on the safe side: a domain of GitHub that has another name is left out, and is said so, until
 * it is added here.
 */
function isOwnedByGitHub(domain: string) {
  const registrable = getDomain(domain, looseTldtsOpt);
  return registrable !== null && (registrable.startsWith('github') || registrable === 'ghcr.io');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function readStrings(value: unknown, path: string): string[] {
  // A key that GitHub has not added yet, or has dropped, is no reason to give up on the others
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value) || value.some(item => typeof item !== 'string')) {
    throw new TypeError(`Invalid GitHub meta response: ${path} is not an array of strings`);
  }
  return value;
}

/**
 * Reads the response of https://api.github.com/meta, which is what GitHub publishes for its domains
 * and its IP addresses. GitHub says about both that they are not meant to be exhaustive.
 * https://docs.github.com/en/rest/meta/meta
 *
 *     "domains": { "website": ["*.github.com", ...], "actions": ["github.com", ...], ... }
 *     "web": ["192.30.252.0/22", "2a0a:a440::/29", ...]
 *
 * A wildcard takes everything below a domain, so only the ones on the domains of GitHub are taken, see {@link isOwnedByGitHub}.
 * A hostname takes nothing but itself and is taken, whichever domain it is on: GitHub has storage accounts of its own on Azure.
 */
export function parseGitHubMeta(data: unknown): GitHubMetaRules {
  if (!isRecord(data)) {
    throw new TypeError('Invalid GitHub meta response: not an object');
  }
  if (!isRecord(data.domains)) {
    throw new TypeError('Invalid GitHub meta response: no domains');
  }

  const domains = data.domains;
  const patterns: string[] = [];
  for (let i = 0, len = DOMAIN_KEYS.length; i < len; i++) {
    appendArrayInPlace(patterns, readStrings(domains[DOMAIN_KEYS[i]], `domains.${DOMAIN_KEYS[i]}`));
  }
  if (domains.artifact_attestations !== undefined) {
    if (!isRecord(domains.artifact_attestations)) {
      throw new TypeError('Invalid GitHub meta response: domains.artifact_attestations is not an object');
    }
    appendArrayInPlace(patterns, readStrings(domains.artifact_attestations.services, 'domains.artifact_attestations.services'));
  }

  const suffixes = new Set<string>();
  const hostnames = new Set<string>();
  const skipped = new Set<string>();

  for (let i = 0, len = patterns.length; i < len; i++) {
    const pattern = patterns[i].trim().toLowerCase();

    if (pattern.startsWith('*.') && !pattern.includes('*', 2)) {
      const domain = normalizeDomain(pattern.slice(2));
      // `*.com` and `*.co.uk` would take everything below a public suffix, and `*.microsoft.com` everything of another company
      if (domain === null || !isOwnedByGitHub(domain)) {
        skipped.add(pattern);
      } else {
        suffixes.add(domain);
      }
    } else if (pattern.includes('*')) {
      // a pattern that is not "everything below this domain" is not a DOMAIN-SUFFIX, and is not guessed at
      skipped.add(pattern);
    } else {
      const hostname = normalizeDomain(pattern);
      if (hostname === null) {
        skipped.add(pattern);
      } else {
        hostnames.add(hostname);
      }
    }
  }

  const cidr4 = new Set<string>();
  const cidr6 = new Set<string>();
  for (let k = 0, keyLen = IP_KEYS.length; k < keyLen; k++) {
    const ranges = readStrings(data[IP_KEYS[k]], IP_KEYS[k]);
    for (let i = 0, len = ranges.length; i < len; i++) {
      const range = ranges[i].trim();
      const version = fastIpVersion(range);
      if (version === 4) {
        cidr4.add(range);
      } else if (version === 6) {
        cidr6.add(range);
      } else {
        skipped.add(range);
      }
    }
  }

  return {
    suffixes: Array.from(suffixes),
    hostnames: Array.from(hostnames),
    cidr4: Array.from(cidr4),
    cidr6: Array.from(cidr6),
    skipped: Array.from(skipped)
  };
}
