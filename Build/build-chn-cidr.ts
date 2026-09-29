import { exclude } from 'fast-cidr-tools';

import { fetchRemoteTextLines } from './lib/fetch-text-by-line';
import { fetchAssets } from './lib/fetch-assets';
import { SpanCategory, task } from './trace';

import { IPListOutput } from './lib/rules/ip';
import { createFileDescription } from './constants/description';

// Hong Kong segments announced by China Mobile International (CMI), which chnroutes2 collects by mistake
const HONG_KONG_CMI_CIDR4 = ['223.118.0.0/15', '223.120.0.0/15'];

const getChnCidrPromise = Promise.all([
  fetchAssets(
    'https://raw.githubusercontent.com/misakaio/chnroutes2/master/chnroutes.txt',
    ['https://cdn.jsdelivr.net/gh/misakaio/chnroutes2@master/chnroutes.txt'],
    true
  ),
  fetchRemoteTextLines('https://gaoyifan.github.io/china-operator-ip/china6.txt', true)
]);

export const buildChnCidr = task(require.main === module, __filename)(async (span) => {
  const [cidr4, cidr6] = await span.traceChildPromise('download chnroutes2', getChnCidrPromise, SpanCategory.Network);

  // Can not use SHARED_DESCRIPTION here as different license
  const description = createFileDescription('CC BY-SA 2.0');

  return Promise.all([
    new IPListOutput(span, 'china_ip')
      .withTitle('Sukka\'s Ruleset - Mainland China IPv4 CIDR')
      .withDescription(description)
      .appendDataSource('https://github.com/misakaio/chnroutes2')
      .bulkAddCIDR4(exclude(cidr4, HONG_KONG_CMI_CIDR4, true))
      .write(),
    new IPListOutput(span, 'china_ip_ipv6')
      .withTitle('Sukka\'s Ruleset - Mainland China IPv6 CIDR')
      .withDescription(description)
      .appendDataSource(
        'https://github.com/gaoyifan/china-operator-ip'
      )
      .bulkAddCIDR6(cidr6)
      .write()
  ]);
});
