import picocolors from 'picocolors';
import tldts from 'tldts-experimental';
import { fastUri } from 'fast-uri';
import { wait } from 'foxts/wait';
import { extractErrorMessage } from 'foxts/extract-error-message';
import { appendArrayInPlace } from 'foxts/append-array-in-place';

import { $$fetch, ResponseError } from './fetch-retry';

export interface SpeedTestServer {
  url: string,
  lat: string,
  lon: string,
  distance: number,
  name: string,
  country: string,
  cc: string,
  sponsor: string,
  id: string,
  preferred: number,
  https_functional: number,
  host: string
}

export interface LibreSpeedServerInfo {
  name: string,
  dlURL: string,
  ulURL: string,
  pingURL: string,
  getIpURL: string,
  server: string,
  sponsorName: string
}

const SPEEDTEST_NET_SERVERS_API = 'https://www.speedtest.net/api/js/servers';
const LIBRESPEED_SERVERS_LIST = 'https://librespeed.org/backend-servers/servers.php';

/**
 * The Speedtest API matches a term against the city, the country and the sponsor of a server, and returns
 * at most 100 servers per request (the nearest ones to the caller first). So a country is asked by its name,
 * and the countries with the most servers are asked again through their major cities.
 */
export const SPEEDTEST_NET_REGIONS = [
  // East Asia and Southeast Asia
  'Hong Kong', 'Macau', 'Taiwan', 'Taipei', 'Japan', 'Tokyo', 'South Korea', 'Seoul',
  'Singapore', 'Malaysia', 'Thailand', 'Vietnam', 'Indonesia', 'Philippines',
  // South Asia and Oceania
  'India', 'Mumbai', 'Delhi', 'Bangalore', 'Chennai',
  'Australia', 'Sydney', 'Melbourne', 'New Zealand',
  // Middle East and Russia
  'United Arab Emirates', 'Turkey', 'Istanbul', 'Israel', 'Russia', 'Ukraine',
  // Europe
  'United Kingdom', 'London', 'Ireland', 'France', 'Paris', 'Germany', 'Frankfurt', 'Berlin',
  'Netherlands', 'Amsterdam', 'Belgium', 'Switzerland', 'Austria', 'Italy', 'Milan', 'Spain', 'Madrid',
  'Portugal', 'Poland', 'Czech Republic', 'Sweden', 'Norway', 'Denmark', 'Finland', 'Romania', 'Bulgaria', 'Greece',
  // North America
  'United States', 'New York', 'Ashburn', 'Chicago', 'Dallas', 'Atlanta', 'Miami', 'Denver', 'Seattle', 'San Jose', 'Los Angeles',
  'Canada', 'Toronto', 'Vancouver', 'Montreal', 'Mexico',
  // South America and Africa
  'Brazil', 'Argentina', 'Chile', 'Colombia', 'Peru',
  'South Africa', 'Egypt', 'Nigeria', 'Kenya'
] as const;

/**
 * speedtest.net answers HTTP 429 to a caller that sends a few dozen requests within seconds, so a build asks
 * only a slice of the regions, slowly, and the next builds take the following slices. The domains of the
 * previous builds are kept by the speedtest ruleset, so the slices add up.
 */
const REGIONS_PER_BUILD = 12;
const REQUEST_INTERVAL = 1500;
const REQUEST_TIMEOUT = 30 * 1000;
// The two scheduled builds of a day land in different slices
const SLICE_DURATION = 12 * 60 * 60 * 1000;

export function pickSpeedtestNetRegions(
  now: number,
  regions: readonly string[] = SPEEDTEST_NET_REGIONS,
  perBuild = REGIONS_PER_BUILD
): string[] {
  const count = Math.min(perBuild, regions.length);
  const offset = (Math.floor(now / SLICE_DURATION) * perBuild) % regions.length;

  const picked: string[] = [];
  for (let i = 0; i < count; i++) {
    picked.push(regions[(offset + i) % regions.length]);
  }
  return picked;
}

export function extractSpeedtestNetHostnames(servers: ReadonlyArray<Partial<SpeedTestServer>>): string[] {
  const hostnames: string[] = [];

  for (let i = 0, len = servers.length; i < len; i++) {
    const server = servers[i];

    if (server.host) {
      const hn = tldts.getHostname(server.host, { detectIp: false, validateHostname: true });
      if (hn) {
        hostnames.push(hn.trim());
      }
    }
    if (server.url) {
      const hn = fastUri.parse(server.url).host;
      if (hn) {
        hostnames.push(hn.trim()); // speedtest API typo: "url":"http:// t4y-toronto-ca-osts1.ser.tek4you.ca:8080/speedtest/upload.php"
      }
    }
  }

  return hostnames;
}

export function extractLibrespeedHostnames(servers: ReadonlyArray<Partial<LibreSpeedServerInfo>>): string[] {
  const hostnames: string[] = [];

  for (let i = 0, len = servers.length; i < len; i++) {
    const server = servers[i].server;
    if (server) {
      const hn = fastUri.parse(server).host;
      if (hn) {
        hostnames.push(hn.trim());
      }
    }
  }

  return hostnames;
}

async function fetchJsonArray<T>(url: string): Promise<T[]> {
  const res = await $$fetch(url, {
    headers: {
      // say who is asking instead of sending the default user agent of scripts
      'User-Agent': 'Mozilla/5.0 (compatible; SurgeRulesetBuilder; +https://github.com/kuraudowelle/Surge)',
      Accept: 'application/json'
    },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT)
  });

  const data: unknown = await res.json();
  if (!Array.isArray(data)) {
    throw new TypeError(url + ' did not respond with a JSON array');
  }
  return data as T[];
}

type FetchRegionServers = (region: string) => Promise<Array<Partial<SpeedTestServer>>>;

const fetchSpeedtestNetServers: FetchRegionServers = (region) => fetchJsonArray<SpeedTestServer>(
  SPEEDTEST_NET_SERVERS_API + '?engine=js&limit=100&search=' + encodeURIComponent(region)
);

/**
 * Never rejects: the speedtest ruleset keeps the domains of the previous builds, so a build that could
 * not reach the API just adds nothing new.
 */
export async function fetchSpeedtestNetHostnames(
  now = Date.now(),
  fetchServers: FetchRegionServers = fetchSpeedtestNetServers,
  interval = REQUEST_INTERVAL
): Promise<string[]> {
  const regions = pickSpeedtestNetRegions(now);
  const hostnames: string[] = [];

  let fetched = 0;
  for (let i = 0, len = regions.length; i < len; i++) {
    const region = regions[i];
    if (fetched > 0) {
      // eslint-disable-next-line no-await-in-loop -- the requests are paced on purpose
      await wait(interval);
    }

    try {
      // eslint-disable-next-line no-await-in-loop -- the requests are paced on purpose
      const servers = await fetchServers(region);
      console.log(picocolors.gray('[speedtest.net]'), region, servers.length);
      appendArrayInPlace(hostnames, extractSpeedtestNetHostnames(servers));
      fetched++;
    } catch (e) {
      // Asking on after a refusal would only make the refusal longer
      console.warn(
        picocolors.yellow('[speedtest.net]'),
        `stop at "${region}" after ${fetched} of ${regions.length} regions,`,
        e instanceof ResponseError ? 'HTTP ' + e.statusCode : extractErrorMessage(e)
      );
      break;
    }
  }

  console.log(picocolors.gray('[speedtest.net]'), `${fetched} of ${regions.length} regions, ${hostnames.length} hostnames`);
  return hostnames;
}

/**
 * Never rejects either, for the same reason.
 */
export async function fetchLibrespeedHostnames(): Promise<string[]> {
  try {
    const servers = await fetchJsonArray<LibreSpeedServerInfo>(LIBRESPEED_SERVERS_LIST);
    return extractLibrespeedHostnames(servers);
  } catch (e) {
    console.warn(picocolors.yellow('[librespeed]'), 'can not get the backend servers,', extractErrorMessage(e));
    return [];
  }
}
