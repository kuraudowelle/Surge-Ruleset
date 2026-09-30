import { SHARED_DESCRIPTION } from './constants/description';
import { resolveCommunityLists } from './lib/community-lists';
import { RulesetOutput } from './lib/rules/ruleset';
import { task } from './trace';

/**
 * What the community keeps for the services that are not in mainland China: the list that the tools of the community
 * send through a proxy with (`geolocation-!cn`), and the top-level domains of the other countries and regions
 * (`tld-!cn`), which are the ccTLDs and gTLDs of the places that are not China.
 */
const GLOBAL_SELECTIONS = ['geolocation-!cn', 'tld-!cn'];

export const buildGlobalRuleset = task(require.main === module, __filename)(async (span) => {
  const { suffixes, hostnames, unsupported, sources } = await resolveCommunityLists(span, GLOBAL_SELECTIONS);

  if (unsupported.length > 0) {
    console.log('[global]', `${GLOBAL_SELECTIONS.join(', ')}: skipped ${unsupported.length} entries that a ruleset cannot take (regexp: and the like)`);
  }
  console.log('[global]', `${GLOBAL_SELECTIONS.join(', ')}: ${suffixes.length} domains and ${hostnames.length} hostnames`);

  // A download that is not what it should be must not become a ruleset: the file of the last build stays
  if (suffixes.length + hostnames.length === 0) {
    throw new Error(`${sources.join(', ')} has nothing in it!`);
  }

  return new RulesetOutput(span, 'global', 'non_ip')
    .withTitle('Surge Ruleset - General Global Services')
    .appendDescription(
      SHARED_DESCRIPTION,
      '',
      'This file contains rules for services that are NOT available inside the Mainland China.',
      '',
      `It is made of the lists that the community keeps for them (${GLOBAL_SELECTIONS.join(', ')}), which group the lists of a thousand services and of the top-level domains of other places.`,
      'Entries that the lists mark as ads (@ads) are left out.'
    )
    .appendDataSource(sources)
    .bulkAddDomainSuffix(suffixes)
    .bulkAddDomain(hostnames)
    .write();
});
