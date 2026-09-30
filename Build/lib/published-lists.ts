import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import { ROOT_DIR } from '../constants/dir';

/**
 * The rulesets that the tests read: `List/` of the repository, which is what raw.githubusercontent.com serves to the
 * profiles that use this project, or the directory that SURGE_LIST_DIR names. The CI of this repository points it at
 * `public/List` after a build and before the deployment, because an upstream list can bring an overlap, or a line
 * that Surge does not take, without any change of the source.
 */
export const LIST_DIR = process.env.SURGE_LIST_DIR ? path.resolve(process.env.SURGE_LIST_DIR) : path.join(ROOT_DIR, 'List');

/** `Internal/` stands next to `List/`, in the repository and in `public/`: the build writes the DC mapping of Telegram there */
export const INTERNAL_DIR = path.join(path.dirname(LIST_DIR), 'Internal');

/** Rule types that the lists use and that `surge-rules.ts` does not evaluate: a request cannot be probed against them */
export const KNOWN_UNSUPPORTED_RULE_TYPES: ReadonlySet<string> = new Set(['URL-REGEX', 'IP-ASN']);

export function readList(name: string) {
  return fs.readFileSync(path.join(LIST_DIR, name), 'utf8');
}

/** The rulesets of the list directory, like `non_ip/direct.conf`, in the order of their names */
export function listNames(): string[] {
  const names: string[] = [];
  const found = fs.readdirSync(LIST_DIR, { recursive: true, encoding: 'utf8' });
  for (let i = 0, len = found.length; i < len; i++) {
    if (found[i].endsWith('.conf')) {
      // the separator of a path is the one of the system, and the names of a Rule section are not
      names.push(found[i].split(path.sep).join('/'));
    }
  }
  return names.sort();
}
