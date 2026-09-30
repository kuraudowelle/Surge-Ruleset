import { newQueue } from '@henrygd/queue';
import { extractErrorMessage } from 'foxts/extract-error-message';

import { DomainListCommunityResolver } from './domain-list-community';
import type { DomainListLoader, DomainListResolveOptions } from './domain-list-community';
import { DOMAIN_LIST_COMMUNITY_BUNDLE_URL, parseDomainListCommunityBundle } from './domain-list-community-bundle';
import { fetchRemoteTextLines } from './fetch-text-by-line';
import { SpanCategory } from '../trace';
import type { Span } from '../trace';

/** v2fly's community lists: `geosite:<list>` of the community tools, and the rulesets that are made of them, come from these files */
export const DOMAIN_LIST_COMMUNITY_DATA_URL = 'https://raw.githubusercontent.com/v2fly/domain-list-community/master/data/';

/**
 * The lists are asked for one by one only when the bundle cannot be had, and a list like `geolocation-!cn` includes
 * over a thousand of them. That is politeness to the host, and to the runner: it is a burst of requests otherwise.
 */
const LIST_REQUEST_CONCURRENCY = 16;

export interface CommunitySelection extends DomainListResolveOptions {
  /** The name of the list, which is the name of its file */
  list: string,
  /**
   * Leaves out what these lists hold, which is for an umbrella list that holds a service that has a ruleset of its
   * own (the list of Microsoft holds GitHub). It is what those lists have, not the way to them: what the
   * list itself has as well is left out with it.
   */
  skip?: readonly string[],
  /** Keeps the hostnames that this says yes to, and only those */
  select?: (hostname: string) => boolean
}

export interface CommunityRules {
  /** What a list holds as `domain:`: the domain and every subdomain (DOMAIN-SUFFIX) */
  suffixes: string[],
  /** What a list holds as `full:`: exactly this hostname (DOMAIN) */
  hostnames: string[],
  /** What the lists have that a ruleset cannot take (`regexp:` and the like), without the entries that are ads */
  unsupported: string[],
  /** Where the data is downloaded from: the lists that were asked for, which say themselves what they include */
  sources: string[]
}

/** Runs a step of the work, which is timed as one when there is a span to say so */
export type TraceStep = <T>(name: string, step: () => Promise<T>) => Promise<T>;

export interface CommunityListsSources {
  /** Every list in one download, resolved, or null if there is none: see {@link parseDomainListCommunityBundle} */
  loadBundle: () => Promise<ReadonlyMap<string, readonly string[]> | null>,
  /** One list on its own, for the ones that the bundle does not have (it may be a little behind), and for when there is no bundle */
  loadList: DomainListLoader
}

const rAdsLine = /\s@ads(?:\s|$)/i;

const noTrace: TraceStep = (_name, step) => step();

function unique<T>(values: Iterable<T>): T[] {
  return Array.from(new Set(values));
}

/**
 * Resolves lists of the community and puts what they hold together. The lists are taken the way the build of the
 * community takes them (`include:` lines, attributes), see {@link DomainListCommunityResolver}.
 *
 * Entries that a list marks as ads (@ads) are never part of it, a service is not its ads.
 *
 * One resolver keeps every list it has asked for, so that a list is asked for once, however many rulesets
 * are made of it: Google includes YouTube and Gemini, the AI lists include Gemini, and so on.
 */
export function createCommunityLists({ loadBundle, loadList }: CommunityListsSources) {
  const resolver = new DomainListCommunityResolver(async (list) => {
    const bundled = (await loadBundle())?.get(list);
    return bundled ?? loadList(list);
  });

  return async function resolveCommunityLists(selections: ReadonlyArray<string | CommunitySelection>, trace: TraceStep = noTrace): Promise<CommunityRules> {
    const resolved = await Promise.all(selections.map(async (selection) => {
      const { list, select, skip = [], ...options }: CommunitySelection = typeof selection === 'string' ? { list: selection } : selection;

      const one = await trace(`get ${list}`, () => resolver.resolve(list, options));
      if (skip.length === 0) {
        return { select, ...one, left: null };
      }

      // What the list holds of the skipped lists is what they hold. Their attributes are theirs, not the ones asked for
      const left = await Promise.all(skip.map(name => trace(`get ${name}`, () => resolver.resolve(name))));
      return { select, ...one, left };
    }));

    const suffixes = new Set<string>();
    const hostnames = new Set<string>();
    const unsupported = new Set<string>();

    for (let i = 0, len = resolved.length; i < len; i++) {
      const { select, left, suffixes: oneSuffixes, full: oneFull, skipped } = resolved[i];

      const leftSuffixes = new Set(left?.flatMap(one => one.suffixes));
      const leftFull = new Set(left?.flatMap(one => one.full));

      for (let j = 0, suffixLen = oneSuffixes.length; j < suffixLen; j++) {
        if (!leftSuffixes.has(oneSuffixes[j]) && (!select || select(oneSuffixes[j]))) {
          suffixes.add(oneSuffixes[j]);
        }
      }
      for (let j = 0, fullLen = oneFull.length; j < fullLen; j++) {
        if (!leftFull.has(oneFull[j]) && (!select || select(oneFull[j]))) {
          hostnames.add(oneFull[j]);
        }
      }
      for (let j = 0, skippedLen = skipped.length; j < skippedLen; j++) {
        if (!rAdsLine.test(skipped[j])) {
          unsupported.add(skipped[j]);
        }
      }
    }

    return {
      suffixes: Array.from(suffixes),
      hostnames: Array.from(hostnames),
      unsupported: Array.from(unsupported),
      sources: unique(selections.map(selection => DOMAIN_LIST_COMMUNITY_DATA_URL + (typeof selection === 'string' ? selection : selection.list).toLowerCase()))
    };
  };
}

// The state stays above what uses it: run as a script, a task starts the moment it is defined.
let bundlePromise: Promise<Map<string, string[]> | null> | undefined;

/**
 * The bundle is asked for once for the process. One that cannot be had, or is not what it should be, is not the
 * end of the rulesets: the lists are asked for one by one then, which is slower and is many requests.
 */
function loadBundle() {
  bundlePromise ??= (async () => {
    try {
      return parseDomainListCommunityBundle(await fetchRemoteTextLines(DOMAIN_LIST_COMMUNITY_BUNDLE_URL));
    } catch (error) {
      console.warn(
        '[domain list community]',
        `can not use ${DOMAIN_LIST_COMMUNITY_BUNDLE_URL}, so the lists are asked for one by one:`,
        extractErrorMessage(error)
      );
      return null;
    }
  })();
  return bundlePromise;
}

const listQueue = newQueue(LIST_REQUEST_CONCURRENCY);
const resolveWithSharedLists = createCommunityLists({
  loadBundle,
  loadList: list => listQueue.add(() => fetchRemoteTextLines(DOMAIN_LIST_COMMUNITY_DATA_URL + list))
});

export function resolveCommunityLists(span: Span, selections: ReadonlyArray<string | CommunitySelection>): Promise<CommunityRules> {
  return resolveWithSharedLists(selections, (name, step) => span.traceChildAsync(name, step, SpanCategory.Network));
}
