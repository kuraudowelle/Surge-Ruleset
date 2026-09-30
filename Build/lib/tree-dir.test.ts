import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { mock } from 'node:test';
import { afterEach, beforeEach, describe, it } from 'mocha';
import { expect } from 'earl';
import { extractErrorMessage } from 'foxts/extract-error-message';
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

const realOpendir = fsp.opendir.bind(fsp);

/**
 * The read of a real directory, slowed down: it pauses after every entry, so that the caller is still reading when what
 * it has started fails, and it can fail itself after the first directory that the caller walks (not a hidden one, which
 * treeDir leaves out, and which the file system may give first).
 */
async function slowOpendir(dir: string, options: { pause: number, failAfterDirectory?: Error }): Promise<fs.Dir> {
  const real = await realOpendir(dir);
  const entries = real[Symbol.asyncIterator].bind(real);

  real[Symbol.asyncIterator] = async function *(): AsyncGenerator<fs.Dirent, undefined> {
    for await (const entry of entries()) {
      yield entry;
      await wait(options.pause);
      if (options.failAfterDirectory !== undefined && entry.isDirectory() && entry.name[0] !== '.') {
        throw options.failAfterDirectory;
      }
    }
    return undefined;
  };
  return real;
}

/**
 * Runs `work` and gives the rejections that no handler was attached to. Node reports one when the turn of the event loop
 * that it was made in ends, so the test waits a little after the work: the handler of mocha, which fails whatever test
 * is running, is out of the way for the time of it.
 */
async function unhandledRejectionsOf(work: () => Promise<unknown>): Promise<unknown[]> {
  const unhandled: unknown[] = [];
  const listeners = process.listeners('unhandledRejection');
  process.removeAllListeners('unhandledRejection');
  process.on('unhandledRejection', reason => unhandled.push(reason));
  try {
    await work();
    await wait(50);
  } finally {
    process.removeAllListeners('unhandledRejection');
    for (let i = 0, len = listeners.length; i < len; i++) {
      process.on('unhandledRejection', listeners[i]);
    }
  }
  return unhandled;
}

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

  describe('when a directory below the root fails', () => {
    it('rejects with its error, and leaves no unhandled rejection, when it fails before the root is read to its end', async () => {
      mock.method(fsp, 'opendir', (dir: string) => (dir === root
        // the root is read slowly, and every directory in it fails at once
        ? slowOpendir(dir, { pause: 20 })
        : Promise.reject(new Error(`EACCES: ${path.basename(dir)}`))));

      let rejection: unknown;
      const unhandled = await unhandledRejectionsOf(() => treeDir(root).catch((error: unknown) => {
        rejection = error;
      }));

      // whichever of the two fails first is the error of treeDir
      expect(['EACCES: List', 'EACCES: Modules']).toInclude(extractErrorMessage(rejection, false) ?? '');
      expect(unhandled).toEqual([]);
    });

    it('rejects with the error of the root, and leaves no unhandled rejection, when the read of the root fails after a directory was found', async () => {
      mock.method(fsp, 'opendir', (dir: string) => (dir === root
        ? slowOpendir(dir, { pause: 20, failAfterDirectory: new Error('EIO: root') })
        : Promise.reject(new Error(`EACCES: ${path.basename(dir)}`))));

      let rejection: unknown;
      const unhandled = await unhandledRejectionsOf(() => treeDir(root).catch((error: unknown) => {
        rejection = error;
      }));

      expect(rejection).toEqual(new Error('EIO: root'));
      expect(unhandled).toEqual([]);
    });

    it('rejects once, and leaves no unhandled rejection, when more than one of them fails', async () => {
      mock.method(fsp, 'opendir', async (dir: string) => {
        if (dir === root) {
          return realOpendir(dir);
        }
        // Modules fails later than List, when treeDir has rejected already
        await wait(dir.endsWith('Modules') ? 40 : 0);
        throw new Error(`EACCES: ${path.basename(dir)}`);
      });

      let rejection: unknown;
      const unhandled = await unhandledRejectionsOf(() => treeDir(root).catch((error: unknown) => {
        rejection = error;
      }));

      expect(rejection).toEqual(new Error('EACCES: List'));
      expect(unhandled).toEqual([]);
    });

    it('still reads the whole tree when nothing fails, with the directories found while the root is being read', async () => {
      mock.method(fsp, 'opendir', async (dir: string) => slowOpendir(dir, { pause: 5 }));

      expect(paths(await treeDir(root))).toEqual(EXPECTED);
    });
  });
});
