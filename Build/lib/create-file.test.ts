import { describe, it } from 'mocha';
import { expect } from 'earl';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { compareAndWriteFile, isSameFileLine } from './create-file';
import { dummySpan } from '../trace';

function tmpFile(name: string) {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'create-file-')), name);
}

function moduleLines(name: string, date: string, hostnames = 'example.com') {
  return [
    `#!name=${name}`,
    `#!desc=Last Updated: ${date}`,
    '',
    '[General]',
    `always-real-ip = %APPEND% ${hostnames}`
  ];
}

function stubLines(title: string) {
  return [
    '#########################################',
    `# ${title}`,
    '# This file has been merged with non_ip/global',
    '################## EOF ##################'
  ];
}

function read(file: string) {
  return fs.readFileSync(file, 'utf8').split('\n');
}

describe('isSameFileLine', () => {
  it('takes a line as the same as itself', () => {
    expect(isSameFileLine('DOMAIN,example.com', 'DOMAIN,example.com')).toEqual(true);
    expect(isSameFileLine('', '')).toEqual(true);
  });

  it('takes another rule as another', () => {
    expect(isSameFileLine('DOMAIN,example.com', 'DOMAIN,example.org')).toEqual(false);
  });

  it('takes another comment as another, so a renamed module reaches the file', () => {
    expect(isSameFileLine('#!name=[Sukka] URL Redirect', '#!name=[Surge Ruleset] URL Redirect')).toEqual(false);
    expect(isSameFileLine(
      '# uBO/AdGuard filter can be found at https://ruleset.skk.moe/Internal/sukka_ubo_url_redirect_filters.txt',
      '# uBO/AdGuard filter can be found at https://raw.githubusercontent.com/kuraudowelle/Surge-Ruleset/master/Internal/sukka_ubo_url_redirect_filters.txt'
    )).toEqual(false);
  });

  it('overlooks the date of a module', () => {
    expect(isSameFileLine(
      '#!desc=Last Updated: 2026-09-29T07:05:49.126Z Size: 92',
      '#!desc=Last Updated: 2026-09-30T03:19:05.506Z Size: 92'
    )).toEqual(true);
    expect(isSameFileLine(
      '#!desc=Last Updated: 2026-09-29T07:05:49.127Z',
      '#!desc=Last Updated: 2026-09-30T03:19:05.506Z'
    )).toEqual(true);
  });

  it('overlooks the date of a filter', () => {
    expect(isSameFileLine(
      '! Last modified: Tue, 29 Sep 2026 07:05:49 GMT',
      '! Last modified: Wed, 30 Sep 2026 03:19:05 GMT'
    )).toEqual(true);
  });

  it('does not overlook what surrounds the date', () => {
    expect(isSameFileLine(
      '#!desc=Last Updated: 2026-09-29T07:05:49.126Z Size: 92',
      '#!desc=Last Updated: 2026-09-30T03:19:05.506Z Size: 93'
    )).toEqual(false);
    expect(isSameFileLine(
      '#!desc=Last Updated: 2026-09-29T07:05:49.126Z',
      '#!desc=Changed: 2026-09-29T07:05:49.126Z'
    )).toEqual(false);
  });
});

describe('compareAndWriteFile', () => {
  it('writes a file that does not exist yet', async () => {
    const file = tmpFile('module.sgmodule');
    const lines = moduleLines('[Surge Ruleset] Example', '2026-09-30T03:00:00.000Z');

    await compareAndWriteFile(dummySpan, lines, file);

    expect(read(file)).toEqual([...lines, '']);
  });

  it('leaves the file alone when only the date moved', async () => {
    const file = tmpFile('module.sgmodule');

    await compareAndWriteFile(dummySpan, moduleLines('[Surge Ruleset] Example', '2026-09-30T03:00:00.000Z'), file);
    await compareAndWriteFile(dummySpan, moduleLines('[Surge Ruleset] Example', '2026-10-01T04:00:00.000Z'), file);

    expect(read(file)[1]).toEqual('#!desc=Last Updated: 2026-09-30T03:00:00.000Z');
  });

  it('writes the file again when the module was renamed', async () => {
    const file = tmpFile('module.sgmodule');

    await compareAndWriteFile(dummySpan, moduleLines('[Sukka] Example', '2026-09-30T03:00:00.000Z'), file);
    await compareAndWriteFile(dummySpan, moduleLines('[Surge Ruleset] Example', '2026-10-01T04:00:00.000Z'), file);

    expect(read(file).slice(0, 2)).toEqual([
      '#!name=[Surge Ruleset] Example',
      '#!desc=Last Updated: 2026-10-01T04:00:00.000Z'
    ]);
  });

  it('writes the file again when a rule changed', async () => {
    const file = tmpFile('module.sgmodule');

    await compareAndWriteFile(dummySpan, moduleLines('[Surge Ruleset] Example', '2026-09-30T03:00:00.000Z'), file);
    await compareAndWriteFile(dummySpan, moduleLines('[Surge Ruleset] Example', '2026-10-01T04:00:00.000Z', 'example.org'), file);

    expect(read(file).at(-2)).toEqual('always-real-ip = %APPEND% example.org');
  });

  it('writes a file made of comments again when a comment changed', async () => {
    const file = tmpFile('deprecated.conf');

    await compareAndWriteFile(dummySpan, stubLines('Sukka\'s Ruleset - Deprecated'), file);
    await compareAndWriteFile(dummySpan, stubLines('Surge Ruleset - Deprecated'), file);

    expect(read(file)[1]).toEqual('# Surge Ruleset - Deprecated');
  });
});
