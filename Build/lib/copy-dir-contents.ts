import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import picocolors from 'picocolors';

/**
 * Copies the files of a directory into another one, and leaves what the other one has already. It resolves when every
 * copy is done, and rejects when one of them fails: a copy that is started and not awaited is a file that the next step
 * (an index of the directory, an upload of it) can miss, or find half written.
 *
 * The copies start together after the directory is read, and not one by one as it is read: a promise that is made in the
 * loop has nothing that waits for it until the loop is over, and a copy that fails in the meantime is an unhandled rejection.
 */
export async function copyDirContents(srcDir: string, destDir: string): Promise<void> {
  const copies: Array<[from: string, to: string]> = [];

  for await (const entry of await fsp.opendir(srcDir)) {
    const src = path.join(srcDir, entry.name);
    const dest = path.join(destDir, entry.name);
    if (entry.isDirectory()) {
      // built output like Modules/Rules is already in the public directory
      if (!fs.existsSync(dest)) {
        console.warn(picocolors.red('[build public] cant copy directory'), src);
      }
    } else if (!fs.existsSync(dest)) {
      // Modules/ and Mock/ in the repo hold hand-written files next to the previously built output, so
      // anything that is already in the public directory (seeded from the repo, then refreshed by this
      // build) must not be overwritten with the committed, possibly stale, copy
      copies.push([src, dest]);
    }
  }

  await Promise.all(copies.map(([from, to]) => fsp.copyFile(from, to, fs.constants.COPYFILE_FICLONE)));
}
