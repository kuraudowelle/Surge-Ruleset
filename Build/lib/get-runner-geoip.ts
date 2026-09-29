import { $$fetch } from './fetch-retry';

export interface RunnerGeoIP {
  ip: string,
  country: string,
  region: string,
  city: string,
  asn: number,
  asOrg: string
}

/** Answers with the geo data of the address the request comes from, no token needed */
const IPINFO_URL = 'https://ipinfo.io/json';

async function fetchIpinfo(): Promise<unknown> {
  const res = await $$fetch(IPINFO_URL);
  return res.json();
}

// ipinfo.io writes the network as "AS8075 Microsoft Corporation"
const rOrg = /^AS(\d+)(?: (.*))?$/;

export function parseRunnerGeoIP(info: unknown): RunnerGeoIP | null {
  if (typeof info !== 'object' || info === null) {
    return null;
  }

  const { ip, country, region, city, org } = info as Record<string, unknown>;
  if (typeof ip !== 'string' || ip === '') {
    return null;
  }

  const network = typeof org === 'string' ? rOrg.exec(org) : null;

  return {
    ip,
    country: typeof country === 'string' ? country : '',
    region: typeof region === 'string' ? region : '',
    city: typeof city === 'string' ? city : '',
    asn: network ? Number(network[1]) : 0,
    asOrg: network?.[2] ?? ''
  };
}

/**
 * Fetch the current machine's egress IP and geo info. Used to confirm that
 * each matrix shard landed on a different GitHub-hosted runner region / egress
 * IP — the premise that lets sharding spread DoH load and dodge rate limits.
 *
 * Returns `null` on any failure so it never aborts the actual domain check.
 */
export async function getRunnerGeoIP(fetchInfo: () => Promise<unknown> = fetchIpinfo): Promise<RunnerGeoIP | null> {
  try {
    return parseRunnerGeoIP(await fetchInfo());
  } catch {
    return null;
  }
}
