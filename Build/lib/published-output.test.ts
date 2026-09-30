import fs from 'node:fs';
import path from 'node:path';
import { before, describe, it } from 'mocha';
import { expect } from 'earl';
import { extractErrorMessage } from 'foxts/extract-error-message';
import { split0th } from 'foxts/split-nth';

import { getCidrVersion } from './cidr-lines';
import type { MTProtoDCConfig } from './mtproto-dc-config';
import { INTERNAL_DIR, KNOWN_UNSUPPORTED_RULE_TYPES, listNames, readList } from './published-lists';
import { RuleSet, SUPPORTED_RULE_TYPES } from './surge-rules';

const BANNER = '#########################################';
const END_OF_FILE = '################## EOF ##################';
const DEPRECATED_TITLE = '# Surge Ruleset - Deprecated';

const rSizeHeader = /^# Size: (\d+)$/;
/** Lowercase letters, digits, hyphens and underscores, in labels that neither start nor end with a hyphen */
const rHostname = /^[\da-z_](?:[\da-z_-]*[\da-z_])?(?:\.[\da-z_](?:[\da-z_-]*[\da-z_])?)*$/;

/**
 * What the ruleset of a region has to say for the README: they are published, they hold no address today, and the Rule
 * section leaves them out (see "Files that are published but not in the Rule section"). One that gets an address
 * has to go into the Rule section, in front of `ip/stream.conf`.
 */
const REGIONAL_IP_RULESETS = ['ip/stream_us.conf', 'ip/stream_eu.conf', 'ip/stream_jp.conf', 'ip/stream_kr.conf', 'ip/stream_hk.conf', 'ip/stream_tw.conf'];

interface ListFile {
  name: string,
  text: string,
  /** The lines of the file, without the line break that ends it */
  lines: string[],
  isDomainSet: boolean
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

  it('is made of lines that a Surge ruleset can hold, of rule types that the simulation evaluates, or knows that it does not', () => {
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
      // a logical rule that holds a type it cannot evaluate is counted under AND, OR or NOT
      ruleSet.unsupported.forEach((count, type) => {
        if (type !== 'AND' && type !== 'OR' && type !== 'NOT' && !KNOWN_UNSUPPORTED_RULE_TYPES.has(type)) {
          unknown.push(`${files[i].name}: ${count} of ${type}`);
        }
      });
    }
    expect(unreadable).toEqual([]);
    expect(unknown).toEqual([]);
  });

  it('has a hostname where a hostname goes: lowercase, with no wildcard, no scheme, no port and no dot at the end', () => {
    const offenders: string[] = [];
    for (let i = 0, len = files.length; i < len; i++) {
      const { lines, name, isDomainSet } = files[i];
      for (let j = 0, lineCount = lines.length; j < lineCount; j++) {
        const text = lines[j];
        let value: string | null = null;
        if (isDomainSet) {
          if (text.length > 0 && text[0] !== '#') {
            // a dot in front of the hostname makes it a suffix
            value = text[0] === '.' ? text.slice(1) : text;
          }
        } else if (text.startsWith('DOMAIN,')) {
          value = text.slice('DOMAIN,'.length);
        } else if (text.startsWith('DOMAIN-SUFFIX,')) {
          value = text.slice('DOMAIN-SUFFIX,'.length);
        }

        if (value !== null && !rHostname.test(value)) {
          offenders.push(`${name}:${j + 1}: ${text}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('has IP rules that are addresses or ranges of the family that their type says, and no option but no-resolve', () => {
    const offenders: string[] = [];
    for (let i = 0, len = files.length; i < len; i++) {
      const { lines, name } = files[i];
      for (let j = 0, lineCount = lines.length; j < lineCount; j++) {
        const text = lines[j];
        if (!text.startsWith('IP-CIDR,') && !text.startsWith('IP-CIDR6,')) {
          continue;
        }
        const parts = text.split(',');
        const family = parts[0] === 'IP-CIDR' ? 4 : 6;
        const optionsAreValid = parts.length === 2 || (parts.length === 3 && parts[2] === 'no-resolve');
        if (!optionsAreValid || getCidrVersion(parts[1]) !== family) {
          offenders.push(`${name}:${j + 1}: ${text}`);
        }
      }
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

  it('has no address in the rulesets of the regions, which the Rule section leaves out: one that has addresses belongs in front of ip/stream.conf', () => {
    const withRules: string[] = [];
    for (let i = 0, len = REGIONAL_IP_RULESETS.length; i < len; i++) {
      const size = new RuleSet(REGIONAL_IP_RULESETS[i], readList(REGIONAL_IP_RULESETS[i])).size;
      if (size !== 0) {
        withRules.push(`${REGIONAL_IP_RULESETS[i]}: ${size}`);
      }
    }
    expect(withRules).toEqual([]);
  });
});
