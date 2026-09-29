import { $$fetch } from './fetch-retry';

export interface RunnerGeoIP {
  ip: string,
  country: string,
  region: string,
  city: string,
  asn: number,
  asOrg: string
}

/**
 * The network Cloudflare's own speed test shows to its visitor: the client IP and the
 * ASN and location Cloudflare knows for it (what a Worker gets in `request.cf`).
 */
const CLOUDFLARE_META_URL = 'https://speed.cloudflare.com/meta';

async function fetchCloudflareMeta(): Promise<unknown> {
  const res = await $$fetch(CLOUDFLARE_META_URL);
  return res.json();
}

export function parseRunnerGeoIP(meta: unknown): RunnerGeoIP | null {
  if (typeof meta !== 'object' || meta === null) {
    return null;
  }

  const { clientIp, country, region, city, asn, asOrganization } = meta as Record<string, unknown>;
  if (typeof clientIp !== 'string' || clientIp === '') {
    return null;
  }

  return {
    ip: clientIp,
    country: typeof country === 'string' ? country : '',
    region: typeof region === 'string' ? region : '',
    city: typeof city === 'string' ? city : '',
    asn: Number(asn) || 0,
    asOrg: typeof asOrganization === 'string' ? asOrganization : ''
  };
}

/**
 * Fetch the current machine's egress IP and geo info. Used to confirm that
 * each matrix shard landed on a different GitHub-hosted runner region / egress
 * IP — the premise that lets sharding spread DoH load and dodge rate limits.
 *
 * Returns `null` on any failure so it never aborts the actual domain check.
 */
export async function getRunnerGeoIP(fetchMeta: () => Promise<unknown> = fetchCloudflareMeta): Promise<RunnerGeoIP | null> {
  try {
    return parseRunnerGeoIP(await fetchMeta());
  } catch {
    return null;
  }
}
