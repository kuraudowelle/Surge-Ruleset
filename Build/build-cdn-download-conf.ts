import { fetchRemoteTextByLine } from './lib/fetch-text-by-line';
import { SpanCategory, task } from './trace';
import type { Span } from './trace';
import { SHARED_DESCRIPTION } from './constants/description';
import { DomainsetOutput } from './lib/rules/domainset';
import { CRASHLYTICS_WHITELIST } from './constants/reject-data-source';
import { HostnameTrie } from 'hntrie';
import { $$fetch } from './lib/fetch-retry';
import { fastUri } from 'fast-uri';
import { resolveCommunityLists } from './lib/community-lists';
import type { CommunitySelection } from './lib/community-lists';
import { describeHandCollected, readHandCollected } from './lib/hand-collected';
import type { HandCollected } from './lib/hand-collected';
import { reportRulesetFailure } from './lib/report-failure';

const PUBLIC_SUFFIX_LIST_URL = 'https://publicsuffix.org/list/public_suffix_list.dat';
const IPFS_PUBLIC_GATEWAYS_URL = 'https://cdn.jsdelivr.net/gh/ipfs/public-gateway-checker@main/gateways.json';

/**
 * The community's list of the CDNs that are not in mainland China, less the networks that carry the content
 * of other services as well. Akamai, Cloudflare and Fastly are where AbemaTV, DAZN, Bilibili International, Fox,
 * Spotify and the like are hosted (see Source/stream.ts): a rule for the whole network would send these services,
 * which have rulesets of their own, to the policy of the CDN, and the CDN rules come first.
 */
const CDN_SELECTION: CommunitySelection = { list: 'category-cdn-!cn', ban: ['cn'], skip: ['akamai', 'cloudflare', 'fastly'] };

/**
 * What the community keeps for the downloads of games (the CDNs of Steam, Epic, Blizzard, Riot, Xbox, PlayStation,
 * Nintendo and more), for the updates that Apple documents for its devices, and for the registries of containers.
 *
 * The CDNs inside mainland China, which the list marks @cn, are left out: they are for `domestic`, and to go direct.
 */
const DOWNLOAD_SELECTIONS: CommunitySelection[] = [
  { list: 'category-game-platforms-download', ban: ['cn'] },
  { list: 'apple-update', ban: ['cn'] },
  { list: 'category-container', ban: ['cn'] }
];

/**
 * Extract OSS domain from publicsuffix list: the providers of object storage put the domains under which their
 * customers get buckets in it themselves.
 */
function getObjectStorageDomains(span: Span): Promise<string[]> {
  return span.traceChild('download public suffix list for s3', SpanCategory.Network).traceAsyncFn(
    async () => {
      const trie = new HostnameTrie();

      for await (const line of await fetchRemoteTextByLine(PUBLIC_SUFFIX_LIST_URL, true)) {
        trie.add(line);
      }

      const S3OSSDomains: string[] = [];

      trie.find('.amazonaws.com').forEach((line: string) => {
        if (
          (line.startsWith('s3-') || line.startsWith('s3.'))
          && !line.includes('cn-')
        ) {
          S3OSSDomains.push('.' + line);
        }
      });
      trie.find('.scw.cloud').forEach((line: string) => {
        if (
          (line.startsWith('s3-') || line.startsWith('s3.'))
        // && !line.includes('cn-')
        ) {
          S3OSSDomains.push('.' + line);
        }
      });
      trie.find('sakurastorage.jp').forEach((line: string) => {
        if (
          (line.startsWith('s3-') || line.startsWith('s3.'))
        ) {
          S3OSSDomains.push('.' + line);
        }
      });

      return S3OSSDomains;
    }
  );
}

function getIpfsGatewayDomains(span: Span): Promise<string[]> {
  return span.traceChild('load public ipfs gateway list', SpanCategory.Network).traceAsyncFn(
    async () => {
      const data = await (await $$fetch(IPFS_PUBLIC_GATEWAYS_URL)).json();
      if (!Array.isArray(data)) {
        throw new TypeError('Invalid IPFS gateway list format');
      }
      return data.reduce<string[]>((acc, gateway) => {
        if (typeof gateway !== 'string') {
          return acc;
        }
        const hn = fastUri.parse(gateway).host;
        if (hn) {
          acc.push(hn.trim());
        }
        return acc;
      }, []);
    }
  );
}

async function buildCdn(span: Span, handCollected: HandCollected) {
  const [community, ipfsGateways] = await Promise.all([
    resolveCommunityLists(span, [CDN_SELECTION]),
    getIpfsGatewayDomains(span)
  ]);

  return new DomainsetOutput(span, 'cdn')
    .withTitle('Surge Ruleset - CDN Domains')
    .appendDescription(SHARED_DESCRIPTION)
    .appendDescription(
      '',
      'This file contains static assets CDN domains.',
      '',
      'It is made of the list that the community keeps for the CDNs, and of the public gateways of IPFS, which the IPFS project lists.',
      'Akamai, Cloudflare and Fastly are not in it, since the services that are hosted on them have rulesets of their own, which a rule for the whole network would take their traffic away from.',
      ...describeHandCollected(handCollected)
    )
    .appendDataSource([...community.sources, IPFS_PUBLIC_GATEWAYS_URL])
    .addFromDomainset(handCollected.lines)
    .bulkAddDomainSuffix(community.suffixes)
    .bulkAddDomain(community.hostnames)
    .bulkAddDomainSuffix(ipfsGateways)
    // we have whitelisted the crashlytics domain, and we also want to put it in CDN policy
    .addFromDomainset(CRASHLYTICS_WHITELIST)
    .write();
}

async function buildDownload(span: Span, handCollected: HandCollected[]) {
  const [community, objectStorageDomains] = await Promise.all([
    resolveCommunityLists(span, DOWNLOAD_SELECTIONS),
    getObjectStorageDomains(span)
  ]);

  return new DomainsetOutput(span, 'download')
    .withTitle('Surge Ruleset - Large Files Hosting Domains')
    .appendDescription(SHARED_DESCRIPTION)
    .appendDescription(
      '',
      'This file contains domains for software updating & large file hosting.',
      '',
      'It is made of the object storage that the providers register in the Public Suffix List (S3, Scaleway, Sakura), and of the lists that the community keeps for the downloads of game platforms, for the updates of Apple devices and for the registries of containers.',
      'The CDNs that the lists have inside mainland China (@cn) are left out, they are in the domestic ruleset.',
      // the files of S3 may be large
      'The object storage is here and not with the CDNs, since what it holds may be large.',
      ...handCollected.flatMap(describeHandCollected)
    )
    .appendDataSource([...community.sources, PUBLIC_SUFFIX_LIST_URL])
    .bulkAddDomainSuffix(community.suffixes)
    .bulkAddDomain(community.hostnames)
    .addFromDomainset(objectStorageDomains)
    .addFromDomainset(handCollected.flatMap(({ lines }) => lines))
    .write();
}

/**
 * The two rulesets are made of what others publish or keep, and one of them failing to get its data must not
 * hold back the other, nor the rest of the build: it keeps the file of the last build that could write it.
 */
export const buildCdnDownloadConf = task(require.main === module, __filename)(async (span) => {
  // A file of the sources that is wrong is a mistake of whoever keeps them, and not a source that is down: it fails the build
  const [cdnHandCollected, downloadHandCollected, gameDownloadHandCollected] = await Promise.all([
    readHandCollected('domainset', 'cdn'),
    readHandCollected('domainset', 'download'),
    // a ruleset of its own as well, see Source/domainset/game-download.conf
    readHandCollected('domainset', 'game-download', { publishedOnItsOwn: true })
  ]);

  const builds = [
    { file: 'domainset/cdn', title: 'The ruleset of the CDNs was not updated', build: () => buildCdn(span, cdnHandCollected) },
    { file: 'domainset/download', title: 'The ruleset of the large file hosting was not updated', build: () => buildDownload(span, [downloadHandCollected, gameDownloadHandCollected]) }
  ];

  const results = await Promise.allSettled(builds.map(({ build }) => build()));

  const errors: unknown[] = [];
  for (let i = 0, len = results.length; i < len; i++) {
    const result = results[i];
    if (result.status === 'rejected') {
      errors.push(result.reason);
      reportRulesetFailure('cdn & download', builds[i].file, builds[i].title, result.reason);
    }
  }

  // Not one of them is no longer a list gone missing here and there: the download, or this code, is broken
  if (errors.length === builds.length) {
    throw new AggregateError(errors, 'Failed to build the CDN and the download rulesets!');
  }
});
