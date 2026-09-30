import fs from 'node:fs';
import path from 'node:path';
import { before, describe, it } from 'mocha';
import { expect } from 'earl';
import { extractErrorMessage } from 'foxts/extract-error-message';
import { split0th } from 'foxts/split-nth';

import { getCidrVersion } from './cidr-lines';
import type { MTProtoDCConfig } from './mtproto-dc-config';
import { INTERNAL_DIR, KNOWN_UNSUPPORTED_RULE_TYPES, listNames, readList } from './published-lists';
import { RuleSet, SUPPORTED_RULE_TYPES, leavesOf } from './surge-rules';
import type { RuleLeaf } from './surge-rules';

const BANNER = '#########################################';
const END_OF_FILE = '################## EOF ##################';
const DEPRECATED_TITLE = '# Surge Ruleset - Deprecated';

const rSizeHeader = /^# Size: (\d+)$/;
/** Lowercase letters, digits, hyphens and underscores, in labels that neither start nor end with a hyphen */
const rHostname = /^[\da-z_](?:[\da-z_-]*[\da-z_])?(?:\.[\da-z_](?:[\da-z_-]*[\da-z_])?)*$/;

interface ListFile {
  name: string,
  text: string,
  /** The lines of the file, without the line break that ends it */
  lines: string[],
  isDomainSet: boolean
}

const LOGICAL_TYPES: ReadonlySet<string> = new Set(['AND', 'OR', 'NOT']);
const HOSTNAME_TYPES: ReadonlySet<string> = new Set(['DOMAIN', 'DOMAIN-SUFFIX']);
const ADDRESS_TYPES: ReadonlySet<string> = new Set(['IP-CIDR', 'IP-CIDR6', 'SRC-IP']);

/**
 * Calls `visit` for every rule of the types that a check is about, in a file: the rules that stand by themselves, and
 * the ones inside the logical rules, to any depth (a DOMAIN or an IP-CIDR that stands inside an AND is a rule of the
 * file). Only the lines that can have one are read, which are those of the types and the logical ones: the lists have
 * hundreds of thousands of lines. A line that cannot be read is left for the test of what can be read, which says
 * what is wrong with it.
 */
function forEachRule(file: ListFile, types: ReadonlySet<string>, visit: (rule: RuleLeaf, line: number, text: string) => void) {
  for (let i = 0, len = file.lines.length; i < len; i++) {
    const text = file.lines[i];
    const comma = text.indexOf(',');
    if (comma === -1) {
      continue;
    }
    const type = text.slice(0, comma);
    if (!types.has(type) && !LOGICAL_TYPES.has(type)) {
      continue;
    }

    let rules: RuleLeaf[];
    try {
      rules = leavesOf(text);
    } catch {
      continue;
    }
    for (let j = 0, ruleCount = rules.length; j < ruleCount; j++) {
      if (types.has(rules[j].type)) {
        visit(rules[j], i + 1, text);
      }
    }
  }
}

/** What is wrong with the way that a file is put together, or null: a write that was cut short leaves a file without its end */
function findFramingProblem(file: ListFile): string | null {
  const { lines } = file;
  if (lines[0] !== BANNER) {
    return 'does not start with the banner';
  }
  if (!file.text.endsWith(`\n${END_OF_FILE}\n`)) {
    return 'does not end with the end marker and a line break';
  }

  const close = lines.indexOf(BANNER, 1);
  if (close === -1) {
    // a file that says it was merged into another is a banner, a title, a line and the end
    return lines[1] === DEPRECATED_TITLE ? null : 'has no second banner line, and is not marked as deprecated';
  }

  let size: number | null = null;
  for (let i = 1; i < close; i++) {
    const match = rSizeHeader.exec(lines[i]);
    if (match) {
      size = Number(match[1]);
    }
  }
  if (size === null) {
    return 'has no Size in its header';
  }

  // the lines between the banner of the header and the end marker: the rules, and the comments that stand among them
  const body = lines.length - 1 - (close + 1);
  return size === body ? null : `says Size: ${size} and has ${body} lines`;
}

describe('the rulesets that the build published', () => {
  const files: ListFile[] = [];

  before(() => {
    const names = listNames();
    for (let i = 0, len = names.length; i < len; i++) {
      const text = readList(names[i]);
      files.push({
        name: names[i],
        text,
        lines: text.endsWith('\n') ? text.slice(0, -1).split('\n') : text.split('\n'),
        isDomainSet: names[i].startsWith('domainset/')
      });
    }
  });

  it('has lists of the three kinds that the Rule section reads: DOMAIN-SETs, rulesets of hostnames, rulesets of addresses', () => {
    const kinds = new Set<string>();
    for (let i = 0, len = files.length; i < len; i++) {
      kinds.add(split0th(files[i].name, '/'));
    }
    expect(kinds.has('domainset')).toEqual(true);
    expect(kinds.has('non_ip')).toEqual(true);
    expect(kinds.has('ip')).toEqual(true);
  });

  it('is made of whole files: the banner on top, the end marker at the bottom, and a Size that counts what stands between them', () => {
    const problems: string[] = [];
    for (let i = 0, len = files.length; i < len; i++) {
      const problem = findFramingProblem(files[i]);
      if (problem !== null) {
        problems.push(`${files[i].name} ${problem}`);
      }
    }
    expect(problems).toEqual([]);
  });

  it('is made of lines that a Surge ruleset can hold, of rule types that the simulation evaluates, or knows that it does not, inside a logical rule as well', () => {
    const unreadable: string[] = [];
    const unknown: string[] = [];
    for (let i = 0, len = files.length; i < len; i++) {
      let ruleSet: RuleSet;
      try {
        ruleSet = new RuleSet(files[i].name, files[i].text, { domainSet: files[i].isDomainSet });
      } catch (error) {
        unreadable.push(extractErrorMessage(error, false) ?? files[i].name);
        continue;
      }

      ruleSet.types.forEach((type) => {
        if (!(SUPPORTED_RULE_TYPES as readonly string[]).includes(type) && !KNOWN_UNSUPPORTED_RULE_TYPES.has(type)) {
          unknown.push(`${files[i].name}: ${type}`);
        }
      });
      // `types` has the ones inside a logical rule as well, and `unsupported` counts a type where it stands, inside or not
      ruleSet.unsupported.forEach((count, type) => {
        if (!KNOWN_UNSUPPORTED_RULE_TYPES.has(type)) {
          unknown.push(`${files[i].name}: ${count} of ${type}`);
        }
      });
    }
    expect(unreadable).toEqual([]);
    expect(unknown).toEqual([]);
  });

  it('has a hostname where a hostname goes: lowercase, with no wildcard, no scheme, no port and no dot at the end, inside a logical rule as well', () => {
    const offenders: string[] = [];
    for (let i = 0, len = files.length; i < len; i++) {
      const file = files[i];
      if (file.isDomainSet) {
        for (let j = 0, lineCount = file.lines.length; j < lineCount; j++) {
          const text = file.lines[j];
          // a dot in front of the hostname makes it a suffix
          if (text.length > 0 && text[0] !== '#' && !rHostname.test(text[0] === '.' ? text.slice(1) : text)) {
            offenders.push(`${file.name}:${j + 1}: ${text}`);
          }
        }
        continue;
      }

      forEachRule(file, HOSTNAME_TYPES, (rule, line, text) => {
        if (!rHostname.test(rule.value)) {
          offenders.push(`${file.name}:${line}: ${rule.type},${rule.value} (in ${text})`);
        }
      });
    }
    expect(offenders).toEqual([]);
  });

  it('has IP rules that are addresses or ranges of the family that their type says, and no option but no-resolve, inside a logical rule as well', () => {
    const offenders: string[] = [];
    for (let i = 0, len = files.length; i < len; i++) {
      const file = files[i];
      forEachRule(file, ADDRESS_TYPES, (rule, line, text) => {
        if (rule.type === 'SRC-IP') {
          if (getCidrVersion(rule.value) === 0) {
            offenders.push(`${file.name}:${line}: ${rule.type},${rule.value} (in ${text})`);
          }
          return;
        }

        const optionsAreValid = rule.options.length === 0 || (rule.options.length === 1 && rule.options[0] === 'no-resolve');
        if (!optionsAreValid || getCidrVersion(rule.value) !== (rule.type === 'IP-CIDR' ? 4 : 6)) {
          offenders.push(`${file.name}:${line}: ${[rule.type, rule.value, ...rule.options].join(',')} (in ${text})`);
        }
      });
    }
    expect(offenders).toEqual([]);
  });

  it('has every address of the MTProto DC mapping in the ruleset of Telegram, because Surge hands that rule an address and no hostname', () => {
    const config = JSON.parse(fs.readFileSync(path.join(INTERNAL_DIR, 'mtproto-dc-config.json'), 'utf8')) as MTProtoDCConfig;
    expect(config.options.length).toBeGreaterThan(0);

    const telegram = new RuleSet('ip/telegram.conf', readList('ip/telegram.conf'));
    const outside: string[] = [];
    for (let i = 0, len = config.options.length; i < len; i++) {
      if (telegram.match({ destIp: config.options[i].ip }) === null) {
        outside.push(config.options[i].ip);
      }
    }
    expect(outside).toEqual([]);
  });
});
