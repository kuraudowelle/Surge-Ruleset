import { OUTPUT_SURGE_DIR, PUBLIC_DIR } from './constants/dir';
import { compareAndWriteFile } from './lib/create-file';
import { SpanCategory, task } from './trace';
import path from 'node:path';
import fsp from 'node:fs/promises';
import { globSync } from 'tinyglobby';
import { appendArrayInPlace } from 'foxts/append-array-in-place';

const DEPRECATED_FILES = [
  ['non_ip/global_plus', 'This file has been merged with non_ip/global'],
  ['domainset/reject_sukka', 'This file has been merged with domainset/reject'],
  ['non_ip/apple_cdn', 'This file has been merged with domainset/apple_cdn']
];

const REMOVED_FILES = [
  'Internal/chnroutes.txt',
  'List/internal/appprofile.php',
  'Modules/sukka_unlock_abema.sgmodule',
  'Modules/sukka_exclude_reservered_ip.sgmodule',
  'List/ip/teleproto.conf',
  'List/non_ip/sogouinput.conf',
  'List/non_ip/neteasemusic.conf',
  'List/ip/neteasemusic.conf',
  'List/non_ip/domestic_cdn.conf',
  // what they held is in china_ip.conf (140.205.0.0/16, 162.14.0.0/16)
  'List/ip/domestic.conf',
  // only patterns and a few addresses, which no list of the community carries
  'List/non_ip/cdn.conf',
  'List/ip/cdn.conf',
  'List/non_ip/download.conf',
  'List/ip/download.conf',
  // it was published on its own as well: the game platforms are in domainset/download.conf, from the community's list
  'List/domainset/game-download.conf',
  'Modules/sukka_disable_netease_music_v2_update_check.sgmodule',
  'Modules/Rules/*.sgmodule',
  'Internal/mihomo_nameserver_policy/*.conf',
  'Internal/clash_*.yaml',
  'Clash',
  'sing-box',
  'Surfboard',
  'LegacyClashPremium'
];

const REMOVED_FOLDERS = [
  'List/Internal'
];

export const buildDeprecateFiles = task(require.main === module, __filename)((span) => span.traceChild('create deprecated files', SpanCategory.FsWrite).traceAsyncFn(async (childSpan) => {
  const promises: Array<Promise<unknown>> = globSync(REMOVED_FILES, { cwd: PUBLIC_DIR, absolute: true })
    .map(f => fsp.rm(f, { force: true, recursive: true }));

  appendArrayInPlace(promises, REMOVED_FOLDERS.map(folder => fsp.rm(path.join(PUBLIC_DIR, folder), { force: true, recursive: true })));

  for (let i = 0, len = DEPRECATED_FILES.length; i < len; i++) {
    const [filePath, description] = DEPRECATED_FILES[i];
    const content = [
      '#########################################',
      '# Surge Ruleset - Deprecated',
      `# ${description}`,
      '################## EOF ##################'
    ];

    promises.push(
      compareAndWriteFile(childSpan, content, path.resolve(OUTPUT_SURGE_DIR, `${filePath}.conf`))
    );
  }

  return Promise.all(promises);
}));
