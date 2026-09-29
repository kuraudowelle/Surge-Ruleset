import { describe, it } from 'mocha';
import { expect } from 'earl';

import { getRunnerGeoIP, parseRunnerGeoIP } from './get-runner-geoip';

describe('parseRunnerGeoIP', () => {
  it('reads the address, the location and the network from the answer of ipinfo.io', () => {
    // what a GitHub runner got from https://ipinfo.io/json
    expect(parseRunnerGeoIP({
      ip: '40.81.42.133',
      city: 'Chicago',
      region: 'Illinois',
      country: 'US',
      loc: '41.8500,-87.6500',
      org: 'AS8075 Microsoft Corporation',
      postal: '60608',
      timezone: 'America/Chicago',
      readme: 'https://ipinfo.io/missingauth'
    })).toEqual({
      ip: '40.81.42.133',
      country: 'US',
      region: 'Illinois',
      city: 'Chicago',
      asn: 8075,
      asOrg: 'Microsoft Corporation'
    });
  });

  it('keeps what is known when the address has no location or no network', () => {
    expect(parseRunnerGeoIP({ ip: '10.0.0.1', bogon: true })).toEqual({
      ip: '10.0.0.1',
      country: '',
      region: '',
      city: '',
      asn: 0,
      asOrg: ''
    });
    expect(parseRunnerGeoIP({ ip: '2603:1030::1', country: 'US', org: 'not a network' })).toEqual({
      ip: '2603:1030::1',
      country: 'US',
      region: '',
      city: '',
      asn: 0,
      asOrg: ''
    });
  });

  it('is null without an address, or when the answer is not an object', () => {
    expect(parseRunnerGeoIP({ country: 'US' })).toEqual(null);
    expect(parseRunnerGeoIP({ ip: '' })).toEqual(null);
    expect(parseRunnerGeoIP({ status: 429, error: { title: 'Rate limit exceeded' } })).toEqual(null);
    expect(parseRunnerGeoIP(null)).toEqual(null);
    expect(parseRunnerGeoIP('40.81.42.133')).toEqual(null);
    expect(parseRunnerGeoIP([])).toEqual(null);
  });
});

describe('getRunnerGeoIP', () => {
  it('is null instead of throwing when the lookup fails', async () => {
    expect(await getRunnerGeoIP(() => Promise.reject(new Error('HTTP 429')))).toEqual(null);
  });

  it('is null when the answer is not what was expected', async () => {
    expect(await getRunnerGeoIP(() => Promise.resolve({ error: 'nope' }))).toEqual(null);
  });

  it('returns the parsed answer', async () => {
    expect(await getRunnerGeoIP(() => Promise.resolve({ ip: '1.2.3.4', country: 'DE', org: 'AS3320 Deutsche Telekom AG' }))).toEqual({
      ip: '1.2.3.4',
      country: 'DE',
      region: '',
      city: '',
      asn: 3320,
      asOrg: 'Deutsche Telekom AG'
    });
  });
});
