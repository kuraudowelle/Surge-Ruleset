import { nullthrow } from 'foxts/guard';

/**
 * What the README says that a test can hold it to: the Rule section that is pasted into a Surge profile, the policies
 * that it uses and the `[Proxy Group]` that makes them, and the table of hosts that "Check It" shows.
 * These read the text of the README; they do not read the rulesets.
 */

/** Where the README has the published rulesets from: `List/<directory>/<file>` of the master branch */
export const LIST_URL_PREFIX = 'https://raw.githubusercontent.com/kuraudowelle/Surge-Ruleset/master/List/';

export interface RuleSectionEntry {
  kind: 'RULE-SET' | 'DOMAIN-SET',
  url: string,
  /** The file below `List/`, like `non_ip/github.conf` */
  ruleset: string,
  policy: string,
  options: string[],
  /** A line that the section shows as a comment, to be switched on by the person who pastes it */
  optional: boolean
}

export interface RuleSection {
  /** Every line of the section, as the README writes it */
  lines: string[],
  entries: RuleSectionEntry[],
  /** The FINAL rule, which stands last */
  final: { policy: string, options: string[] } | null,
  /** The lines that are not a comment, an empty line, the header, a ruleset or FINAL */
  unknown: string[]
}

export interface CheckRow {
  host: string,
  /** The process that the request comes from, or null for any */
  from: string | null,
  /** The file that the request matches first, like `github.conf` */
  ruleset: string
}

export interface ProxyGroup {
  name: string,
  type: string,
  members: string[]
}

const rIniBlock = /^```ini\n([\s\S]*?)^```$/gm;
const rOptionalRule = /^#\s*(?:RULE|DOMAIN)-SET,/;
const rCommentMark = /^#\s*/;
const rBackticked = /`([^`]+)`/g;
const rHeading = /^(#+) /;
const rTrailingNewline = /\n$/;

function iniBlocks(markdown: string) {
  const blocks: string[][] = [];
  for (const match of markdown.matchAll(rIniBlock)) {
    blocks.push(match[1].replace(rTrailingNewline, '').split('\n'));
  }
  return blocks;
}

/** The lines between a heading and the next heading of the same level or above it, or null when there is no such heading */
function sectionOf(markdown: string, heading: string) {
  const lines = markdown.split('\n');
  const start = lines.indexOf(heading);
  if (start === -1) {
    return null;
  }

  const level = heading.indexOf(' ');
  const section: string[] = [];
  for (let i = start + 1, len = lines.length; i < len; i++) {
    const hashes = rHeading.exec(lines[i]);
    if (hashes && hashes[1].length <= level) {
      break;
    }
    section.push(lines[i]);
  }
  return section;
}

/** The rows of the first table of a section, without the header and the line under it, as their cells */
function tableRows(section: string[]) {
  const rows: string[][] = [];
  let seen = 0;
  for (let i = 0, len = section.length; i < len; i++) {
    const line = section[i].trim();
    if (line[0] !== '|') {
      if (seen > 0) {
        break;
      }
      continue;
    }
    seen++;
    if (seen > 2) {
      rows.push(line.slice(1, line.endsWith('|') ? -1 : undefined).split('|').map(cell => cell.trim()));
    }
  }
  return rows;
}

export function parseRuleSection(markdown: string): RuleSection {
  const blocks = iniBlocks(markdown).filter(block => block[0] === '[Rule]');
  if (blocks.length !== 1) {
    throw new Error(`The README has ${blocks.length} Rule sections (an ini block that starts with [Rule]), it needs exactly one`);
  }

  const lines = blocks[0];
  const entries: RuleSectionEntry[] = [];
  const unknown: string[] = [];
  let final: RuleSection['final'] = null;

  for (let i = 1, len = lines.length; i < len; i++) {
    const line = lines[i].trim();
    const optional = rOptionalRule.test(line);
    if (line.length === 0 || (!optional && line[0] === '#')) {
      continue;
    }

    const parts = (optional ? line.replace(rCommentMark, '') : line).split(',');
    if (!optional && parts.length >= 2 && parts[0] === 'FINAL') {
      final = { policy: parts[1], options: parts.slice(2) };
    } else if (parts.length >= 3 && (parts[0] === 'RULE-SET' || parts[0] === 'DOMAIN-SET') && parts[1].startsWith(LIST_URL_PREFIX)) {
      entries.push({
        kind: parts[0],
        url: parts[1],
        ruleset: parts[1].slice(LIST_URL_PREFIX.length),
        policy: parts[2],
        options: parts.slice(3),
        optional
      });
    } else {
      unknown.push(line);
    }
  }

  return { lines, entries, final, unknown };
}

/** The policies of the table under "Policies", every name that is in backticks in its first column */
export function parsePolicies(markdown: string): string[] {
  const rows = tableRows(nullthrow(sectionOf(markdown, '### Policies'), 'The README has no "### Policies" section'));
  const policies: string[] = [];
  for (let i = 0, len = rows.length; i < len; i++) {
    for (const name of rows[i][0].matchAll(rBackticked)) {
      policies.push(name[1]);
    }
  }
  return policies;
}

/** The groups of the `[Proxy Group]` block, `Name = type, member, member` */
export function parseProxyGroups(markdown: string): ProxyGroup[] {
  const blocks = iniBlocks(markdown).filter(block => block[0] === '[Proxy Group]');
  if (blocks.length !== 1) {
    throw new Error(`The README has ${blocks.length} Proxy Group blocks (an ini block that starts with [Proxy Group]), it needs exactly one`);
  }
  const groups: ProxyGroup[] = [];
  for (let i = 1, len = blocks[0].length; i < len; i++) {
    const line = blocks[0][i].trim();
    if (line.length === 0 || line[0] === '#') {
      continue;
    }
    const equals = line.indexOf('=');
    if (equals === -1) {
      throw new Error(`Not a policy group: ${line}`);
    }
    const parts = line.slice(equals + 1).split(',').map(part => part.trim());
    groups.push({ name: line.slice(0, equals).trim(), type: parts[0], members: parts.slice(1) });
  }
  return groups;
}

/** The rows of the table under "Check It": host, the process it comes from (`any` for none) and the file that matches first */
export function parseCheckTable(markdown: string): CheckRow[] {
  return tableRows(nullthrow(sectionOf(markdown, '### Check It'), 'The README has no "### Check It" section')).map(([host, from, ruleset]) => {
    const process = from.replaceAll('`', '');
    return {
      host: host.replaceAll('`', ''),
      from: process === 'any' ? null : process,
      ruleset: ruleset.replaceAll('`', '')
    };
  });
}

/** A ruleset of addresses for one region, like `ip/stream_us.conf`: not `ip/stream.conf`, which has the addresses of all of them */
export const rRegionalIpRuleset = /^ip\/stream_[\w-]+\.conf$/;

/**
 * What the Rule section has to say about the rulesets of addresses of the regions that have addresses. A region that has
 * none is left out of the section, and that is right: there is nothing in it to route. A region that gets some is a
 * service that is reached by its address, and it goes into the section like the other rulesets of its region: active, in
 * front of `ip/stream.conf`, which has the addresses of all the services, and on the policy that its region has for
 * hostnames (the one of `non_ip/stream_<region>.conf`, or the one of `ip/stream.conf` when the section has no ruleset of
 * hostnames for it).
 *
 * `sizes` is the number of rules of each ruleset of addresses of a region that is published. It gives the problems, one
 * line for each, or nothing when there are none.
 */
export function regionalIpProblems(entries: readonly RuleSectionEntry[], sizes: ReadonlyMap<string, number>): string[] {
  const problems: string[] = [];
  const all = entries.find(entry => entry.ruleset === 'ip/stream.conf' && !entry.optional);

  sizes.forEach((size, name) => {
    if (size === 0) {
      return;
    }

    const entry = entries.find(candidate => candidate.ruleset === name && !candidate.optional);
    if (entry === undefined) {
      const optional = entries.some(candidate => candidate.ruleset === name);
      problems.push(`${name} has ${size} rules, and ${optional ? 'the Rule section has it as a comment' : 'is not in the Rule section'}: it goes in front of ip/stream.conf, switched on`);
      return;
    }

    if (all !== undefined && entries.indexOf(entry) > entries.indexOf(all)) {
      problems.push(`${name} has ${size} rules, and stands behind ip/stream.conf, which has its addresses as well: it goes in front of it`);
    }

    const hostnames = entries.find(candidate => candidate.ruleset === name.replace('ip/', 'non_ip/') && !candidate.optional);
    const expected = hostnames?.policy ?? all?.policy;
    if (expected !== undefined && entry.policy !== expected) {
      problems.push(`${name} has ${size} rules, and is on ${entry.policy}, and its region is on ${expected}${hostnames === undefined ? ' (the policy of ip/stream.conf)' : ` (the policy of ${hostnames.ruleset})`}`);
    }
  });

  return problems;
}
