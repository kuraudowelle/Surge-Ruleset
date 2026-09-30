import path from 'node:path';
import { extractErrorMessage } from 'foxts/extract-error-message';
import picocolors from 'picocolors';

import { SpanCategory, task } from './trace';
import type { Span } from './trace';
import { SHARED_DESCRIPTION } from './constants/description';

import { DomainsetOutput } from './lib/rules/domainset';
import { OUTPUT_SURGE_DIR } from './constants/dir';
import { DOMAIN_LIST_COMMUNITY_DATA_URL, resolveCommunityLists } from './lib/community-lists';
import type { CommunityRules } from './lib/community-lists';
import { describeHandCollected, readHandCollected } from './lib/hand-collected';
import {
  APPLE_NETWORK_QUALITY_CONFIG,
  fetchAppleNetworkQualityHostnames,
  fetchLibrespeedHostnames,
  fetchSpeedtestNetHostnames,
  readPreviousSpeedtestHostnames
} from './lib/speedtest-servers';

/** What the community keeps for the sites and the servers that test speed: Ookla, LibreSpeed, OpenSpeedTest, Cloudflare, M-Lab, universities, ... */
const SPEEDTEST_COMMUNITY_LIST = 'category-speedtest';

// The requests are paced, so they are started right away and the other builders are not held up
const getSpeedtestHostsGroupsPromise = fetchSpeedtestNetHostnames();
const getLibrespeedBackendsPromise = fetchLibrespeedHostnames();
const getAppleNetworkQualityPromise = fetchAppleNetworkQualityHostnames();

const PREVIOUS_OUTPUT = path.resolve(OUTPUT_SURGE_DIR, 'domainset/speedtest.conf');

/**
 * Never rejects either: the list keeps the domains of the previous builds, so a build that could not reach
 * the list of the community just adds nothing new.
 */
async function getCommunitySpeedtest(span: Span): Promise<CommunityRules | null> {
  try {
    return await resolveCommunityLists(span, [SPEEDTEST_COMMUNITY_LIST]);
  } catch (e) {
    console.warn(picocolors.yellow('[speedtest]'), `can not get ${SPEEDTEST_COMMUNITY_LIST},`, extractErrorMessage(e));
    return null;
  }
}

export const buildSpeedtestDomainSet = task(require.main === module, __filename)(async (span) => {
  // A file of the sources that is wrong is a mistake of whoever keeps them, and not a source that is down: it fails the build
  const handCollected = await readHandCollected('domainset', 'speedtest');
  const community = await getCommunitySpeedtest(span);

  return new DomainsetOutput(span, 'speedtest')
    .withTitle('Surge Ruleset - Speedtest Domains')
    .appendDescription(
      SHARED_DESCRIPTION,
      '',
      'This file contains common speedtest endpoints.',
      '',
      'The servers of speedtest.net and of LibreSpeed are what they publish in their lists of servers, and the endpoints of the networkQuality command of macOS are what Apple\'s configuration for it names.',
      `The sites and servers of the other tools that test speed are in the list that the community keeps (${SPEEDTEST_COMMUNITY_LIST}).`,
      'The domains of the previous builds are kept, since one build only asks for some of the regions of speedtest.net.',
      ...describeHandCollected(handCollected)
    )
    .appendDataSource([
      'https://www.speedtest.net/api/js/servers',
      'https://librespeed.org/backend-servers/servers.php',
      APPLE_NETWORK_QUALITY_CONFIG,
      DOMAIN_LIST_COMMUNITY_DATA_URL + SPEEDTEST_COMMUNITY_LIST
    ])
    .addFromDomainset(handCollected.lines)
    // this list keeps the domains of previous builds
    .addFromDomainset(readPreviousSpeedtestHostnames(PREVIOUS_OUTPUT))
    .bulkAddDomainSuffix(community?.suffixes ?? [])
    .bulkAddDomain(community?.hostnames ?? [])
    .bulkAddDomain(await span.traceChildPromise('get speedtest.net servers', getSpeedtestHostsGroupsPromise, SpanCategory.Network))
    .bulkAddDomain(await span.traceChildPromise('get librespeed backends', getLibrespeedBackendsPromise, SpanCategory.Network))
    .bulkAddDomain(await span.traceChildPromise('get networkQuality endpoints', getAppleNetworkQualityPromise, SpanCategory.Network))
    .write();
});
