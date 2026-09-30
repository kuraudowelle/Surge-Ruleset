import { randomUUID } from 'node:crypto';
import { fastIpVersion } from 'foxts/fast-ip-version';
import { SHARED_DESCRIPTION } from './constants/description';
import { $$fetch } from './lib/fetch-retry';
import { RulesetOutput } from './lib/rules/ruleset';
import { SpanCategory, task } from './trace';

// Official Microsoft 365 endpoints web service. "Skype" is the service area that
// Microsoft uses for Microsoft Teams (and Skype for Business Online).
// https://learn.microsoft.com/en-us/microsoft-365/enterprise/microsoft-365-ip-web-service
const ENDPOINTS_URL = 'https://endpoints.office.com/endpoints/worldwide';
const TEAMS_SERVICE_AREA = 'Skype';

interface Endpoint {
  serviceArea: string,
  urls?: string[],
  ips?: string[]
}

function parseEndpoints(data: unknown): Endpoint[] {
  if (!Array.isArray(data)) {
    throw new TypeError('Invalid Microsoft 365 endpoints response: not an array');
  }
  return data.filter((e): e is Endpoint => e !== null && typeof e === 'object' && typeof e.serviceArea === 'string');
}

export const buildTeams = task(require.main === module, __filename)(async (span) => {
  const endpoints = await span.traceChildAsync('get Microsoft Teams endpoints', async () => {
    const resp = await $$fetch(`${ENDPOINTS_URL}?clientrequestid=${randomUUID()}`);
    return parseEndpoints(await resp.json()).filter(e => e.serviceArea === TEAMS_SERVICE_AREA);
  }, SpanCategory.Network);

  const domains = new Set<string>();
  const suffixes = new Set<string>();
  const cidr4 = new Set<string>();
  const cidr6 = new Set<string>();

  for (let i = 0, len = endpoints.length; i < len; i++) {
    const { urls, ips } = endpoints[i];

    if (urls) {
      for (let j = 0, urlLen = urls.length; j < urlLen; j++) {
        const url = urls[j];
        if (url.startsWith('*.') && !url.slice(2).includes('*')) {
          suffixes.add(url.slice(2));
        } else if (!url.includes('*')) {
          domains.add(url);
        }
      }
    }

    if (ips) {
      for (let j = 0, ipLen = ips.length; j < ipLen; j++) {
        const ip = ips[j];
        const v = fastIpVersion(ip);
        if (v === 4) {
          cidr4.add(ip);
        } else if (v === 6) {
          cidr6.add(ip);
        }
      }
    }
  }

  if (suffixes.size + domains.size === 0 || cidr4.size === 0) {
    throw new Error('Failed to fetch Microsoft Teams endpoints!');
  }

  const dataFrom = [
    '',
    'Data from:',
    ` - ${ENDPOINTS_URL} (serviceArea=${TEAMS_SERVICE_AREA}, Microsoft Teams)`
  ];

  return Promise.all([
    new RulesetOutput(span, 'teams', 'non_ip')
      .withTitle('Surge Ruleset - Microsoft Teams')
      .appendDescription(SHARED_DESCRIPTION, ...dataFrom, '', 'This file contains domains used by Microsoft Teams.')
      .appendDataSource(ENDPOINTS_URL)
      .bulkAddDomain(Array.from(domains))
      .bulkAddDomainSuffix(Array.from(suffixes))
      .write(),
    new RulesetOutput(span, 'teams', 'ip')
      .withTitle('Surge Ruleset - Microsoft Teams IP CIDR')
      .appendDescription(SHARED_DESCRIPTION, ...dataFrom, '', 'This file contains IP ranges used by Microsoft Teams (media, calling and meetings).')
      .appendDataSource(ENDPOINTS_URL)
      .bulkAddCIDR4NoResolve(Array.from(cidr4))
      .bulkAddCIDR6NoResolve(Array.from(cidr6))
      .write()
  ]);
});
