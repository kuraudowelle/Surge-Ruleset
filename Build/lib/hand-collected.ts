import fsp from 'node:fs/promises';
import path from 'node:path';
import { isErrorLikeObject } from 'foxts/extract-error-message';

import { SOURCE_DIR } from '../constants/dir';
import { splitTextIntoLines } from './fetch-text-by-line';

/**
 * A file of `Source/` that says this at the start of a line is not published as a ruleset of its own by build-common:
 * some builder takes what is in it.
 */
const CUSTOM_BUILD_SCRIPT = '# $ custom_build_script';

export type HandCollectedKind = 'domainset' | 'non_ip' | 'ip';

/** What a person collected for a ruleset, and keeps in `Source/<kind>/<id>.conf`: the automatic update never touches it */
export interface HandCollected {
  /** Where the entries are, for the file that is built to say so: `Source/non_ip/ai.conf` */
  file: string,
  /** The entries as a ruleset (or a domainset) has them, without the comments and the empty lines */
  lines: string[]
}

export interface HandCollectedOptions {
  /**
   * The file is a ruleset of its own as well (it has no `# $ custom_build_script`, so build-common publishes it),
   * and the builder of another ruleset takes its entries too.
   */
  publishedOnItsOwn?: boolean
}

function isKeptFromPublishing(text: string) {
  return text.startsWith(CUSTOM_BUILD_SCRIPT) || text.includes('\n' + CUSTOM_BUILD_SCRIPT);
}

export function parseHandCollected(file: string, text: string, { publishedOnItsOwn = false }: HandCollectedOptions = {}): HandCollected {
  // The builder writes the ruleset of this name, and so does build-common, if it is let to: the one that is written last wins
  if (!publishedOnItsOwn && !isKeptFromPublishing(text)) {
    throw new Error(`${file} is taken into a ruleset by its builder, so it has to say "${CUSTOM_BUILD_SCRIPT}" at the start of a line: without it, build-common publishes it as a ruleset of its own, over the one that is generated.`);
  }

  return { file, lines: splitTextIntoLines(text, true) };
}

/**
 * The entries that a person collected for the ruleset `<kind>/<id>`, which are merged into what the builder
 * generates on every build. A ruleset that has none has no file, and that is not an error.
 */
export async function readHandCollected(
  kind: HandCollectedKind,
  id: string,
  options: HandCollectedOptions = {},
  sourceDir = SOURCE_DIR
): Promise<HandCollected> {
  const file = `Source/${kind}/${id}.conf`;

  let text: string;
  try {
    text = await fsp.readFile(path.join(sourceDir, kind, `${id}.conf`), 'utf8');
  } catch (error) {
    if (isErrorLikeObject(error) && 'code' in error && error.code === 'ENOENT') {
      return { file, lines: [] };
    }
    throw error;
  }

  return parseHandCollected(file, text, options);
}

/** What the file that is built says about them: where they are, and that the update keeps them */
export function describeHandCollected({ file, lines }: HandCollected): string[] {
  if (lines.length === 0) {
    return [];
  }

  const count = lines.length === 1 ? 'One entry is' : `${lines.length} entries are`;
  return ['', `${count} collected by hand (${file}), and merged in on every build: the automatic update keeps ${lines.length === 1 ? 'it' : 'them'}.`];
}
