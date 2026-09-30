import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { mock } from 'node:test';
import { afterEach, beforeEach, describe, it } from 'mocha';
import { expect } from 'earl';
import { wait } from 'foxts/wait';
import { appendArrayInPlace } from 'foxts/append-array-in-place';

import { treeDir, TreeFileType } from './tree-dir';
import type { TreeTypeArray } from './tree-dir';

const FILES = [
  'top.txt',
  'List/ip/y.conf',
  'List/non_ip/x.conf',
  'Modules/a.sgmodule',
  'Modules/Rules/deep/c.conf',
  'Modules/Rules/deep/deeper/d.conf',
  'Modules/Rules/deep/deeper/deepest/e.conf',
  // what the index leaves out
  'CNAME',
  '.hidden/secret.txt'
];

/** Every file and directory of a tree, as the path from its root, in order */
function paths(tree: TreeTypeArray): string[] {
  const found: string[] = [];
  for (let i = 0, len = tree.length; i < len; i++) {
    const entry = tree[i];
    found.push(entry.type === TreeFileType.DIRECTORY ? `${entry.path}/` : entry.path);
    if (entry.type === TreeFileType.DIRECTORY) {
      appendArrayInPlace(found, paths(entry.children));
    }
  }
  return found.sort();
}

const EXPECTED = [
  '/List/', '/List/ip/', '/List/ip/y.conf', '/List/non_ip/', '/List/non_ip/x.conf',
  '/Modules/', '/Modules/Rules/', '/Modules/Rules/deep/', '/Modules/Rules/deep/c.conf', '/Modules/Rules/deep/deeper/',
  '/Modules/Rules/deep/deeper/d.conf', '/Modules/Rules/deep/deeper/deepest/', '/Modules/Rules/deep/deeper/deepest/e.conf',
  '/Modules/a.sgmodule',
  '/top.txt'
];

describe('treeDir', () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'tree-dir-'));
    for (let i = 0, len = FILES.length; i < len; i++) {
      fs.mkdirSync(path.dirname(path.join(root, FILES[i])), { recursive: true });
      fs.writeFileSync(path.join(root, FILES[i]), '');
    }
  });

  afterEach(() => {
    mock.restoreAll();
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('reads every file and directory below the root, however deep, and leaves out the hidden ones and CNAME', async () => {
    expect(paths(await treeDir(root))).toEqual(EXPECTED);
  });

  it('has read the whole tree when it resolves, however long it takes to open a directory', async () => {
    const opendir = fsp.opendir.bind(fsp);
    mock.method(fsp, 'opendir', async (...args: Parameters<typeof fsp.opendir>) => {
      await wait(25);
      return opendir(...args);
    });

    const tree = await treeDir(root);

    // a directory whose walk was not waited for is one that has no children yet
    expect(paths(tree)).toEqual(EXPECTED);
  });

  it('gives the children of a directory that is nested three levels down', async () => {
    const opendir = fsp.opendir.bind(fsp);
    mock.method(fsp, 'opendir', async (...args: Parameters<typeof fsp.opendir>) => {
      await wait(10);
      return opendir(...args);
    });

    const tree = await treeDir(root);
    const modules = tree.find(entry => entry.name === 'Modules');
    const rules = modules?.type === TreeFileType.DIRECTORY ? modules.children.find(entry => entry.name === 'Rules') : undefined;
    const deep = rules?.type === TreeFileType.DIRECTORY ? rules.children.find(entry => entry.name === 'deep') : undefined;

    expect(deep?.type === TreeFileType.DIRECTORY ? deep.children.map(entry => entry.name).sort() : null).toEqual(['c.conf', 'deeper']);
  });

  it('rejects when a directory cannot be read', async () => {
    mock.method(fsp, 'opendir', () => Promise.reject(new Error('EACCES')));
    await expect(treeDir(root)).toBeRejectedWith('EACCES');
  });
});
