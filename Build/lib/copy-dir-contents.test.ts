import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { mock } from 'node:test';
import { afterEach, beforeEach, describe, it } from 'mocha';
import { expect } from 'earl';
import { noop } from 'foxts/noop';
import { wait } from 'foxts/wait';

import { copyDirContents } from './copy-dir-contents';

describe('copyDirContents', () => {
  let src: string;
  let dest: string;

  beforeEach(() => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'copy-dir-contents-'));
    src = path.join(root, 'src');
    dest = path.join(root, 'dest');
    fs.mkdirSync(path.join(src, 'Rules'), { recursive: true });
    fs.mkdirSync(dest);
    fs.writeFileSync(path.join(src, 'a.sgmodule'), 'a from the repository');
    fs.writeFileSync(path.join(src, 'b.sgmodule'), 'b from the repository');
    fs.writeFileSync(path.join(src, 'c.js'), 'c from the repository');
    fs.writeFileSync(path.join(src, 'Rules', 'inside.conf'), 'not copied');
  });

  afterEach(() => {
    mock.restoreAll();
    fs.rmSync(path.dirname(src), { recursive: true, force: true });
  });

  it('copies the files, and only them, when the destination has nothing', async () => {
    mock.method(console, 'warn', noop);
    await copyDirContents(src, dest);

    expect(fs.readdirSync(dest).sort()).toEqual(['a.sgmodule', 'b.sgmodule', 'c.js']);
    expect(fs.readFileSync(path.join(dest, 'a.sgmodule'), 'utf8')).toEqual('a from the repository');
  });

  it('has finished every copy when it resolves, however long a copy takes', async () => {
    const copyFile = fsp.copyFile.bind(fsp);
    const copies = { started: 0, finished: 0 };
    mock.method(fsp, 'copyFile', async (...args: Parameters<typeof fsp.copyFile>) => {
      copies.started++;
      await wait(40);
      await copyFile(...args);
      copies.finished++;
    });
    mock.method(console, 'warn', noop);

    await copyDirContents(src, dest);

    // a copy that was started and not waited for is a file that the index of the directory can miss
    expect(copies).toEqual({ started: 3, finished: 3 });
    expect(fs.readdirSync(dest).sort()).toEqual(['a.sgmodule', 'b.sgmodule', 'c.js']);
  });

  it('leaves a file that the destination has, which is newer than the one in the repository', async () => {
    fs.writeFileSync(path.join(dest, 'b.sgmodule'), 'b from the build');
    mock.method(console, 'warn', noop);

    await copyDirContents(src, dest);

    expect(fs.readFileSync(path.join(dest, 'b.sgmodule'), 'utf8')).toEqual('b from the build');
    expect(fs.readFileSync(path.join(dest, 'a.sgmodule'), 'utf8')).toEqual('a from the repository');
  });

  it('says so when a directory is not in the destination, and does not copy it', async () => {
    const warn = mock.method(console, 'warn', noop);
    await copyDirContents(src, dest);
    expect(warn.mock.callCount()).toEqual(1);
    expect(warn.mock.calls[0].arguments[1]).toEqual(path.join(src, 'Rules'));

    fs.mkdirSync(path.join(dest, 'Rules'));
    await copyDirContents(src, dest);
    expect(warn.mock.callCount()).toEqual(1);
  });

  it('rejects when a copy fails', async () => {
    mock.method(fsp, 'copyFile', () => Promise.reject(new Error('ENOSPC')));
    mock.method(console, 'warn', noop);
    await expect(copyDirContents(src, dest)).toBeRejectedWith('ENOSPC');
  });
});
