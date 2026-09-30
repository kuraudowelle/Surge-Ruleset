import { appendArrayInPlace } from 'foxts/append-array-in-place';

import { GLOBAL } from '../Source/non_ip/global';
import { SHARED_DESCRIPTION } from './constants/description';
import { resolveCommunityLists } from './lib/community-lists';
import { createGetDnsMappingRule } from './lib/dns-mapping-rule';
import { describeHandCollected, readHandCollected } from './lib/hand-collected';
import { RulesetOutput } from './lib/rules/ruleset';
import { task } from './trace';

/**
 * What the community keeps for the services that are not in mainland China: the list that the tools of the community
 * send through a proxy with (`geolocation-!cn`), and the top-level domains of the other countries and regions
 * (`tld-!cn`), which are the ccTLDs and gTLDs of the places that are not China.
 */
const GLOBAL_SELECTIONS = ['geolocation-!cn', 'tld-!cn'];

export const buildGlobalRuleset = task(require.main === module, __filename)(async (span) => {
  // A file of the sources that is wrong is a mistake of whoever keeps them, and not a source that is down: it fails the build
  const handCollected = await readHandCollected('non_ip', 'global');

  const { suffixes, hostnames, unsupported, sources } = await resolveCommunityLists(span, GLOBAL_SELECTIONS);

  if (unsupported.length > 0) {
    console.log('[global]', `${GLOBAL_SELECTIONS.join(', ')}: skipped ${unsupported.length} entries that a ruleset cannot take (regexp: and the like)`);
  }
  console.log('[global]', `${GLOBAL_SELECTIONS.join(', ')}: ${suffixes.length} domains and ${hostnames.length} hostnames`);

  // A download that is not what it should be must not become a ruleset: the file of the last build stays
  if (suffixes.length + hostnames.length === 0) {
    throw new Error(`${sources.join(', ')} has nothing in it!`);
  }

  // The domains that the table of this project names (Google's, and the like) are collected by hand as well
  const getDnsMappingRule = createGetDnsMappingRule(true);
  const tableLines: string[] = [];
  Object.values(GLOBAL).forEach(({ domains }) => {
    appendArrayInPlace(tableLines, domains.flatMap(getDnsMappingRule));
  });

  return new RulesetOutput(span, 'global', 'non_ip')
    .withTitle('Surge Ruleset - General Global Services')
    .appendDescription(
      SHARED_DESCRIPTION,
      '',
      'This file contains rules for services that are NOT available inside the Mainland China.',
      '',
      `It is made of the lists that the community keeps for them (${GLOBAL_SELECTIONS.join(', ')}), which group the lists of a thousand services and of the top-level domains of other places.`,
      'Entries that the lists mark as ads (@ads) are left out.',
      '',
      'The domains of the table of this project (Source/non_ip/global.ts: Google and the like) are in it as well.',
      ...describeHandCollected(handCollected)
    )
    .appendDataSource(sources)
    .bulkAddDomainSuffix(suffixes)
    .bulkAddDomain(hostnames)
    .addFromRuleset(tableLines)
    .addFromRuleset(handCollected.lines)
    .write();
});
