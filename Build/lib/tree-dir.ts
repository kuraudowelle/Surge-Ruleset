import fsp from 'node:fs/promises';
import { sep } from 'node:path';

// eslint-disable-next-line sukka/no-export-const-enum -- TODO: fix this in the future
export const enum TreeFileType {
  FILE = 1,
  DIRECTORY = 2
}

interface TreeFile {
  type: TreeFileType.FILE,
  name: string,
  path: string
}

interface TreeDirectoryType {
  type: TreeFileType.DIRECTORY,
  name: string,
  path: string,
  children: TreeTypeArray
}

export type TreeType = TreeDirectoryType | TreeFile;
export type TreeTypeArray = TreeType[];

/**
 * The files and directories below a directory. It resolves when the whole tree is read: every walk of a directory waits
 * for the walks of the directories below it.
 *
 * A walk starts the walks below it after it has read its directory to the end, all together, and not one by one as it
 * reads: a promise that is made in the loop has nothing that waits for it until the loop is over, so a directory that
 * fails in the meantime is an unhandled rejection (which ends a Node process), and so is one that was started when the
 * read of the parent fails. Started together, every one of them has its handler at once, and a second failure has one too.
 */
export async function treeDir(rootPath: string): Promise<TreeTypeArray> {
  const tree: TreeTypeArray = [];

  const walk = async (dir: string, node: TreeTypeArray, dirRelativeToRoot = ''): Promise<void> => {
    const subdirectories: Array<[fullPath: string, children: TreeTypeArray, relativeToRoot: string]> = [];

    for await (const child of await fsp.opendir(dir)) {
      // Ignore hidden files
      if (child.name[0] === '.' || child.name === 'CNAME') {
        continue;
      }

      const childFullPath = child.parentPath + sep + child.name;
      const childRelativeToRoot = dirRelativeToRoot + sep + child.name;

      if (child.isDirectory()) {
        const newNode: TreeDirectoryType = {
          type: TreeFileType.DIRECTORY,
          name: child.name,
          path: childRelativeToRoot,
          children: []
        };
        node.push(newNode);
        subdirectories.push([childFullPath, newNode.children, childRelativeToRoot]);
        continue;
      }
      if (child.isFile()) {
        const newNode: TreeFile = {
          type: TreeFileType.FILE,
          name: child.name,
          path: childRelativeToRoot
        };
        node.push(newNode);
      }
    }

    await Promise.all(subdirectories.map(([fullPath, children, relativeToRoot]) => walk(fullPath, children, relativeToRoot)));
  };

  await walk(rootPath, tree);

  return tree;
}
