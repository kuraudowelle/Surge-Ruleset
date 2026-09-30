import { domainToASCII } from 'node:url';
import { extractErrorMessage } from 'foxts/extract-error-message';

export interface DomainListCommunityRules {
  /** `domain:` and bare entries: the domain and every subdomain (DOMAIN-SUFFIX) */
  suffixes: string[],
  /** `full:` entries: exactly this hostname (DOMAIN) */
  full: string[],
  /** Entries a Surge ruleset cannot take (`keyword:`, `regexp:`, `include:`, `@ads`, malformed), kept for the build log */
  skipped: string[]
}

// One label or more: a top-level domain on its own is a valid entry (`domain:youtube`, Google owns a few of them)
const rHostname = /^[\da-z_](?:[\da-z_-]*[\da-z_])?(?:\.[\da-z_](?:[\da-z_-]*[\da-z_])?)*$/;
const rTrailingDot = /\.$/;
const rWhitespace = /\s+/;
// What the domain-list-community build accepts as the name of an attribute and of a list (which is the name of its file)
const rAttribute = /^[\da-z!]+$/;
const rListName = /^[\da-z!-]+$/;

function normalizeHostname(value: string): string | null {
  const hostname = domainToASCII(value.replace(rTrailingDot, '').toLowerCase());
  return rHostname.test(hostname) ? hostname : null;
}

export interface DomainListEntry {
  /** `domain`: the hostname and every subdomain of it, `full`: the hostname only */
  type: 'domain' | 'full',
  hostname: string,
  /** Lower-cased and sorted, without the `@` */
  attributes: string[],
  /** The line as written in the list, without the comment */
  line: string
}

export interface DomainListInclusion {
  /** Lower-cased: the name of the list is the name of its file */
  list: string,
  /** `@attribute`: take only the entries that have it */
  must: string[],
  /** `@-attribute`: take only the entries that do not have it */
  ban: string[]
}

type ParsedLine =
  | { kind: 'entry', entry: DomainListEntry }
  | { kind: 'include', line: string, inclusion: DomainListInclusion }
  | { kind: 'unsupported', line: string };

function parseEntryAttributes(fields: string[]): string[] | null {
  const attributes = new Set<string>();

  for (let i = 0, len = fields.length; i < len; i++) {
    const field = fields[i];
    if (field[0] === '@') {
      const attribute = field.slice(1).toLowerCase();
      if (!rAttribute.test(attribute)) {
        return null;
      }
      attributes.add(attribute);
    } else if (field[0] !== '&') {
      // `&list` is an affiliation: it puts the entry into one more list, and does nothing to this one
      return null;
    }
  }

  return Array.from(attributes).sort();
}

function parseInclusion(value: string, fields: string[]): DomainListInclusion | null {
  const list = value.toLowerCase();
  if (!rListName.test(list)) {
    return null;
  }

  const must: string[] = [];
  const ban: string[] = [];

  for (let i = 0, len = fields.length; i < len; i++) {
    const field = fields[i];
    if (field[0] !== '@') {
      return null;
    }

    const attribute = field.slice(1).toLowerCase();
    const isBan = attribute[0] === '-';
    const name = isBan ? attribute.slice(1) : attribute;
    if (!rAttribute.test(name)) {
      return null;
    }
    (isBan ? ban : must).push(name);
  }

  return { list, must, ban };
}

function parseLine(rawLine: string): ParsedLine | null {
  const hash = rawLine.indexOf('#');
  const line = (hash === -1 ? rawLine : rawLine.slice(0, hash)).trim();
  if (line.length === 0) {
    return null;
  }

  // What comes before the first colon is the type of the rule, and a bare entry is a `domain:`
  const colon = line.indexOf(':');
  const type = colon === -1 ? 'domain' : line.slice(0, colon).toLowerCase();
  const [value, ...fields] = (colon === -1 ? line : line.slice(colon + 1)).trim().split(rWhitespace);

  if (type === 'include') {
    const inclusion = parseInclusion(value, fields);
    return inclusion === null ? { kind: 'unsupported', line } : { kind: 'include', line, inclusion };
  }

  if (type !== 'domain' && type !== 'full') {
    return { kind: 'unsupported', line };
  }

  const hostname = normalizeHostname(value);
  const attributes = parseEntryAttributes(fields);
  if (hostname === null || attributes === null) {
    return { kind: 'unsupported', line };
  }

  return { kind: 'entry', entry: { type, hostname, attributes, line } };
}

/** `@ads` marks an ad domain, which does not belong in a service list */
function isAdEntry(entry: DomainListEntry) {
  return entry.attributes.includes('ads');
}

/**
 * Parse one file of https://github.com/v2fly/domain-list-community/tree/master/data
 *
 *     # comment
 *     example.com               (same as `domain:example.com`, the domain and its subdomains)
 *     full:www.example.com      (only this hostname)
 *     keyword:example           (not supported here)
 *     regexp:^example\.com$     (not supported here)
 *     include:other-list        (not supported here, see DomainListCommunityResolver)
 *     example.com @attr @ads    (`@ads` marks an ad domain, which does not belong in a service list)
 */
export function parseDomainListCommunity(lines: Iterable<string>): DomainListCommunityRules {
  const suffixes = new Set<string>();
  const full = new Set<string>();
  const skipped = new Set<string>();

  for (const rawLine of lines) {
    const parsed = parseLine(rawLine);
    if (parsed === null) {
      continue;
    }

    if (parsed.kind !== 'entry') {
      skipped.add(parsed.line);
      continue;
    }

    const { entry } = parsed;
    if (isAdEntry(entry)) {
      skipped.add(entry.line);
      continue;
    }

    (entry.type === 'full' ? full : suffixes).add(entry.hostname);
  }

  return {
    suffixes: Array.from(suffixes),
    full: Array.from(full),
    skipped: Array.from(skipped)
  };
}

interface ParsedDomainList {
  entries: DomainListEntry[],
  inclusions: DomainListInclusion[],
  /** `keyword:`, `regexp:` and malformed lines */
  unsupported: string[]
}

function parseDomainList(lines: Iterable<string>): ParsedDomainList {
  const parsedList: ParsedDomainList = { entries: [], inclusions: [], unsupported: [] };

  for (const rawLine of lines) {
    const parsed = parseLine(rawLine);
    if (parsed === null) {
      continue;
    }

    if (parsed.kind === 'entry') {
      parsedList.entries.push(parsed.entry);
    } else if (parsed.kind === 'include') {
      parsedList.inclusions.push(parsed.inclusion);
    } else {
      parsedList.unsupported.push(parsed.line);
    }
  }

  return parsedList;
}

/** What the domain-list-community build calls the "plain" form of an entry, which is what tells two entries apart */
function getEntryKey(entry: DomainListEntry) {
  return entry.type + ':' + entry.hostname + ':' + entry.attributes.join(',');
}

function isIncluded(entry: DomainListEntry, inclusion: DomainListInclusion) {
  if (inclusion.must.length === 0 && inclusion.ban.length === 0) {
    return true;
  }

  // An entry with no attribute at all has none that could be asked for, and none that could be banned
  if (entry.attributes.length === 0) {
    return inclusion.must.length === 0;
  }

  return inclusion.must.every(attribute => entry.attributes.includes(attribute))
    && !inclusion.ban.some(attribute => entry.attributes.includes(attribute));
}

/** Gives the lines of the list with this name, which is the content of its file */
export type DomainListLoader = (list: string) => Iterable<string> | Promise<Iterable<string>>;

export interface ResolvedDomainList extends DomainListCommunityRules {
  /** The list, and the lists it includes, in the order the `include:` lines are read */
  lists: string[]
}

/** What to take from a list, the way the community tools let a config ask for `geosite:list@attribute` */
export interface DomainListResolveOptions {
  /** Take only the entries that have all of these attributes: `['cn']` is `list @cn` */
  must?: readonly string[],
  /** Leave out the entries that have one of these attributes: `['cn']` is `list @-cn` */
  ban?: readonly string[]
}

function normalizeOptionNames(names: readonly string[] | undefined, what: string, pattern: RegExp): string[] {
  const normalized: string[] = [];
  for (let i = 0, len = names?.length ?? 0; i < len; i++) {
    const name = names![i].toLowerCase();
    if (!pattern.test(name)) {
      throw new TypeError(`Invalid ${what}: ${names![i]}`);
    }
    normalized.push(name);
  }
  return normalized;
}

/**
 * Resolves a list of https://github.com/v2fly/domain-list-community the way its own build does
 * (https://github.com/v2fly/domain-list-community/blob/master/main.go), so that a list which
 * is made of other lists, like `google`, gives the domains of all of them:
 *
 *     include:youtube             everything in `youtube`, and in the lists it includes
 *     include:youtube @cn         only the entries that have the attribute `@cn`
 *     include:youtube @-ads       only the entries that do not have the attribute `@ads`
 *
 * What is asked for can be narrowed down the same way, see {@link DomainListResolveOptions}:
 * `must: ['cn']` is what a config of a community tool calls `geosite:apple@cn`, and `ban: ['cn']`
 * is the rest of the list.
 *
 * Entries marked `@ads`, `keyword:` and `regexp:` entries and malformed lines are left out, see
 * {@link parseDomainListCommunity}.
 *
 * `&list` affiliations, which let an entry of one file join another list, only work in the
 * build, because it reads every file. Here they are ignored: no file of the data directory
 * uses one at the moment, and following them would mean downloading the whole directory.
 *
 * Every list is asked for at most once, no matter how many lists include it or how many
 * times {@link resolve} is called.
 */
export class DomainListCommunityResolver {
  private readonly loading = new Map<string, Promise<void>>();
  private readonly parsed = new Map<string, ParsedDomainList>();
  private readonly resolved = new Map<string, Map<string, DomainListEntry>>();

  constructor(private readonly load: DomainListLoader) {}

  private loadList(list: string): Promise<void> {
    let loading = this.loading.get(list);
    if (loading === undefined) {
      loading = (async () => {
        this.parsed.set(list, parseDomainList(await this.load(list)));
      })();
      this.loading.set(list, loading);
    }
    return loading;
  }

  /**
   * Loads a list and every list that it includes. This is done before anything is resolved, on
   * purpose: lists waiting for each other's promises would never come back if the lists include
   * each other, whereas resolving the loaded lists finds that out and says so.
   */
  private async loadInclusions(list: string, seen: Set<string>, includedBy: string | null): Promise<void> {
    if (seen.has(list)) {
      return;
    }
    seen.add(list);

    try {
      await this.loadList(list);
    } catch (error) {
      // The reason is in the message as well, for whoever only prints the message
      throw new Error(
        `Failed to load the domain list "${list}"${includedBy === null ? '' : `, which "${includedBy}" includes`}: ${extractErrorMessage(error, false) ?? 'unknown error'}`,
        { cause: error }
      );
    }

    await Promise.all(this.parsed.get(list)!.inclusions.map(
      inclusion => this.loadInclusions(inclusion.list, seen, list)
    ));
  }

  /** Everything the list holds, with what it includes, that is not marked `@ads` yet */
  private resolveEntries(list: string, path: string[]): Map<string, DomainListEntry> {
    const resolved = this.resolved.get(list);
    if (resolved !== undefined) {
      return resolved;
    }

    if (path.includes(list)) {
      throw new Error(`Circular inclusion of domain lists: ${[...path, list].join(' > ')}`);
    }

    const { entries: own, inclusions } = this.parsed.get(list)!;
    const entries = new Map<string, DomainListEntry>();

    for (let i = 0, len = own.length; i < len; i++) {
      entries.set(getEntryKey(own[i]), own[i]);
    }

    path.push(list);
    for (let i = 0, len = inclusions.length; i < len; i++) {
      const inclusion = inclusions[i];
      for (const [key, entry] of this.resolveEntries(inclusion.list, path)) {
        if (isIncluded(entry, inclusion)) {
          entries.set(key, entry);
        }
      }
    }
    path.pop();

    this.resolved.set(list, entries);
    return entries;
  }

  private collectLists(list: string, lists: Set<string>): Set<string> {
    if (!lists.has(list)) {
      lists.add(list);

      const { inclusions } = this.parsed.get(list)!;
      for (let i = 0, len = inclusions.length; i < len; i++) {
        this.collectLists(inclusions[i].list, lists);
      }
    }
    return lists;
  }

  async resolve(list: string, options: DomainListResolveOptions = {}): Promise<ResolvedDomainList> {
    const name = list.toLowerCase();
    if (!rListName.test(name)) {
      throw new TypeError(`Invalid domain list name: ${list}`);
    }

    const must = normalizeOptionNames(options.must, 'attribute', rAttribute);
    const ban = normalizeOptionNames(options.ban, 'attribute', rAttribute);
    const filter: DomainListInclusion = { list: name, must, ban };

    await this.loadInclusions(name, new Set(), null);

    const lists = Array.from(this.collectLists(name, new Set()));
    const suffixes = new Set<string>();
    const full = new Set<string>();
    const skipped = new Set<string>();

    for (let i = 0, len = lists.length; i < len; i++) {
      const { unsupported } = this.parsed.get(lists[i])!;
      for (let j = 0, unsupportedLen = unsupported.length; j < unsupportedLen; j++) {
        skipped.add(unsupported[j]);
      }
    }

    for (const entry of this.resolveEntries(name, []).values()) {
      // left out by the options, so not something that was skipped
      if (!isIncluded(entry, filter)) {
        continue;
      }
      if (isAdEntry(entry)) {
        skipped.add(entry.line);
      } else {
        (entry.type === 'full' ? full : suffixes).add(entry.hostname);
      }
    }

    return {
      suffixes: Array.from(suffixes),
      full: Array.from(full),
      skipped: Array.from(skipped),
      lists
    };
  }
}
