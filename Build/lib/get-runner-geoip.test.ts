import { describe, it } from 'mocha';
import { expect } from 'earl';

import { getRunnerGeoIP, parseRunnerGeoIP } from './get-runner-geoip';

describe('parseRunnerGeoIP', () => {
  it('reads the client IP, the location and the network from the Cloudflare speed test meta', () => {
    expect(parseRunnerGeoIP({
      hostname: 'speed.cloudflare.com',
      clientIp: '20.42.10.7',
      httpProtocol: 'HTTP/1.1',
      asn: 8075,
      asOrganization: 'Microsoft Corporation',
      colo: 'AMS',
      country: 'NL',
      city: 'Amsterdam',
      region: 'North Holland',
      postalCode: '1012',
      latitude: '52.37',
      longitude: '4.89'
    })).toEqual({
      ip: '20.42.10.7',
      country: 'NL',
      region: 'North Holland',
      city: 'Amsterdam',
      asn: 8075,
      asOrg: 'Microsoft Corporation'
    });
  });

  it('keeps what is known when Cloudflare has no city or region for the address', () => {
    expect(parseRunnerGeoIP({ clientIp: '2603:1030::1', asn: '8075', country: 'US' })).toEqual({
      ip: '2603:1030::1',
      country: 'US',
      region: '',
      city: '',
      asn: 8075,
      asOrg: ''
    });
  });

  it('is null without a client IP, or when the response is not an object', () => {
    expect(parseRunnerGeoIP({ country: 'US' })).toEqual(null);
    expect(parseRunnerGeoIP({ clientIp: '' })).toEqual(null);
    expect(parseRunnerGeoIP(null)).toEqual(null);
    expect(parseRunnerGeoIP('20.42.10.7')).toEqual(null);
    expect(parseRunnerGeoIP([])).toEqual(null);
  });
});

describe('getRunnerGeoIP', () => {
  it('is null instead of throwing when the lookup fails', async () => {
    expect(await getRunnerGeoIP(() => Promise.reject(new Error('HTTP 403')))).toEqual(null);
  });

  it('is null when the answer is not what was expected', async () => {
    expect(await getRunnerGeoIP(() => Promise.resolve({ error: 'nope' }))).toEqual(null);
  });

  it('returns the parsed answer', async () => {
    expect(await getRunnerGeoIP(() => Promise.resolve({ clientIp: '1.2.3.4', country: 'US', asn: 1 }))).toEqual({
      ip: '1.2.3.4',
      country: 'US',
      region: '',
      city: '',
      asn: 1,
      asOrg: ''
    });
  });
});
