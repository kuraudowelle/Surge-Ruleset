import { after, before, describe, it } from 'mocha';
import { expect } from 'earl';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describeHandCollected, parseHandCollected, readHandCollected } from './hand-collected';
import type { HandCollectedKind, HandCollectedOptions } from './hand-collected';

const FILE = 'Source/non_ip/ai.conf';

const MARKED = [
  '# $ custom_build_script',
  '# Collected by hand.',
  '',
  '# >> OpenAI',
  'DOMAIN-SUFFIX,openai.com',
  'DOMAIN,api.example.com',
  ''
].join('\n');

describe('parseHandCollected', () => {
  it('takes the entries, and leaves the comments and the empty lines', () => {
    expect(parseHandCollected(FILE, MARKED)).toEqual({
      file: FILE,
      lines: ['DOMAIN-SUFFIX,openai.com', 'DOMAIN,api.example.com']
    });
  });

  it('takes the entries of a file with the line ends of Windows', () => {
    expect(parseHandCollected(FILE, MARKED.replaceAll('\n', '\r\n')).lines).toEqual(['DOMAIN-SUFFIX,openai.com', 'DOMAIN,api.example.com']);
  });

  it('takes the domains of a domainset as they are written', () => {
    expect(parseHandCollected('Source/domainset/cdn.conf', ['# $ custom_build_script', '.cdn.example.com', 'img.example.com'].join('\n')).lines)
      .toEqual(['.cdn.example.com', 'img.example.com']);
  });

  it('knows that the file is not published on its own by a line anywhere in it, at its start', () => {
    expect(parseHandCollected(FILE, 'DOMAIN,a.example.com\n# $ custom_build_script\nDOMAIN,b.example.com').lines)
      .toEqual(['DOMAIN,a.example.com', 'DOMAIN,b.example.com']);
  });

  it('refuses a file that build-common would publish as a ruleset of its own, over the one that is generated', () => {
    expect(() => parseHandCollected(FILE, 'DOMAIN-SUFFIX,openai.com\n')).toThrow('Source/non_ip/ai.conf is taken into a ruleset by its builder');
  });

  it('does not take the words of a comment, or of a rule, for the line that says it', () => {
    expect(() => parseHandCollected(FILE, '# this is not the line: # $ custom_build_script\nDOMAIN,a.example.com')).toThrow();
    expect(() => parseHandCollected(FILE, '  # $ custom_build_script\nDOMAIN,a.example.com')).toThrow();
    expect(() => parseHandCollected(FILE, 'DOMAIN,a.example.com # $ custom_build_script')).toThrow();
  });

  it('takes the entries of a file that is published on its own too, when it is said that it is', () => {
    expect(parseHandCollected('Source/domainset/game-download.conf', '.steamcontent.com\n', { publishedOnItsOwn: true }).lines)
      .toEqual(['.steamcontent.com']);
  });
});

describe('readHandCollected', () => {
  let sourceDir: string;

  before(async () => {
    sourceDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'hand-collected-'));
    await fsp.mkdir(path.join(sourceDir, 'non_ip'));
    await fsp.mkdir(path.join(sourceDir, 'domainset'));
    await fsp.writeFile(path.join(sourceDir, 'non_ip/ai.conf'), MARKED);
    await fsp.writeFile(path.join(sourceDir, 'non_ip/unmarked.conf'), 'DOMAIN,a.example.com\n');
    await fsp.writeFile(path.join(sourceDir, 'domainset/game-download.conf'), '.steamcontent.com\n');
    // something that is there and cannot be read as a file
    await fsp.mkdir(path.join(sourceDir, 'non_ip/directory.conf'));
  });

  after(() => fsp.rm(sourceDir, { recursive: true, force: true }));

  it('reads the file of the ruleset from the directory of the sources, and says where it is', async () => {
    expect(await readHandCollected('non_ip', 'ai', {}, sourceDir)).toEqual({
      file: 'Source/non_ip/ai.conf',
      lines: ['DOMAIN-SUFFIX,openai.com', 'DOMAIN,api.example.com']
    });
  });

  it('gives nothing for a ruleset that has no file: not every ruleset has entries that are collected by hand', async () => {
    expect(await readHandCollected('ip', 'lan', {}, sourceDir)).toEqual({ file: 'Source/ip/lan.conf', lines: [] });
  });

  it('refuses the file that would be published as a ruleset of its own', async () => {
    await expect(readHandCollected('non_ip', 'unmarked', {}, sourceDir)).toBeRejectedWith('has to say "# $ custom_build_script"');
  });

  it('takes a file that is published as well when it is said that it is', async () => {
    expect((await readHandCollected('domainset', 'game-download', { publishedOnItsOwn: true }, sourceDir)).lines).toEqual(['.steamcontent.com']);
  });

  it('does not take a file that cannot be read for one that is not there', async () => {
    await expect(readHandCollected('non_ip', 'directory', {}, sourceDir)).toBeRejected();
  });
});

describe('describeHandCollected', () => {
  it('says nothing when nothing is collected by hand', () => {
    expect(describeHandCollected({ file: FILE, lines: [] })).toEqual([]);
  });

  it('says where the entries are, and that the update keeps them', () => {
    expect(describeHandCollected({ file: FILE, lines: ['DOMAIN,a.example.com', 'DOMAIN,b.example.com'] })).toEqual([
      '',
      '2 entries are collected by hand (Source/non_ip/ai.conf), and merged in on every build: the automatic update keeps them.'
    ]);
    expect(describeHandCollected({ file: FILE, lines: ['DOMAIN,a.example.com'] })).toEqual([
      '',
      'One entry is collected by hand (Source/non_ip/ai.conf), and merged in on every build: the automatic update keeps it.'
    ]);
  });
});

/**
 * The rulesets whose builder merges the file of the same name in `Source/` into what it generates. A file that is
 * not kept from being published would be a ruleset of its own, written over the generated one.
 */
const MERGED: ReadonlyArray<readonly [kind: HandCollectedKind, id: string, options?: HandCollectedOptions]> = [
  ['domainset', 'cdn'],
  ['domainset', 'download'],
  ['domainset', 'game-download', { publishedOnItsOwn: true }],
  ['domainset', 'speedtest'],
  ['non_ip', 'ai'],
  ['non_ip', 'apple_cn'],
  ['non_ip', 'apple_intelligence'],
  ['non_ip', 'apple_services'],
  ['non_ip', 'microsoft'],
  ['non_ip', 'direct'],
  ['non_ip', 'domestic'],
  ['non_ip', 'global'],
  ['ip', 'apple_services'],
  ['ip', 'lan']
];

describe('the files of Source/ that are merged into a generated ruleset', () => {
  MERGED.forEach(([kind, id, options]) => {
    it(`${kind}/${id} has its entries, and is not published as a ruleset of its own`, async () => {
      const { lines } = await readHandCollected(kind, id, options);

      expect({ file: `${kind}/${id}`, collected: lines.length > 0 }).toEqual({ file: `${kind}/${id}`, collected: true });
    });
  });
});
