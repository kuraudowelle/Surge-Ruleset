import { describe, it } from 'mocha';
import { expect } from 'earl';
import { createFixedArray } from 'foxts/create-fixed-array';

import {
  SPEEDTEST_NET_REGIONS,
  extractLibrespeedHostnames,
  extractSpeedtestNetHostnames,
  fetchSpeedtestNetHostnames,
  pickSpeedtestNetRegions
} from './speedtest-servers';
import { ResponseError } from './fetch-retry';

const SLICE = 12 * 60 * 60 * 1000;

describe('pickSpeedtestNetRegions', () => {
  const regions = createFixedArray(10).map(i => 'r' + i);

  it('takes a slice of the regions, and the same one within a slice of time', () => {
    const now = 100 * SLICE + 12345;
    const picked = pickSpeedtestNetRegions(now, regions, 4);
    expect(picked).toHaveLength(4);
    expect(pickSpeedtestNetRegions(now + SLICE - 20000, regions, 4)).toEqual(picked);
  });

  it('continues where the previous slice ended and wraps around', () => {
    expect(pickSpeedtestNetRegions(0, regions, 4)).toEqual(['r0', 'r1', 'r2', 'r3']);
    expect(pickSpeedtestNetRegions(SLICE, regions, 4)).toEqual(['r4', 'r5', 'r6', 'r7']);
    expect(pickSpeedtestNetRegions(2 * SLICE, regions, 4)).toEqual(['r8', 'r9', 'r0', 'r1']);
  });

  it('never repeats a region within a build', () => {
    for (let slot = 0; slot < 40; slot++) {
      const picked = pickSpeedtestNetRegions(slot * SLICE, regions, 7);
      expect(new Set(picked).size).toEqual(picked.length);
    }
  });

  it('asks every region within a few builds, with the real list too', () => {
    const asked = new Set<string>();
    const start = Date.UTC(2026, 8, 29);
    // 12 regions per build, 2 builds a day: a week is plenty
    for (let slot = 0; slot < 14; slot++) {
      pickSpeedtestNetRegions(start + slot * SLICE).forEach(region => asked.add(region));
    }
    expect(asked.size).toEqual(new Set(SPEEDTEST_NET_REGIONS).size);
  });

  it('takes everything when there are fewer regions than a slice', () => {
    expect(pickSpeedtestNetRegions(SLICE, ['a', 'b'], 12)).toEqual(['a', 'b']);
  });
});

describe('extractSpeedtestNetHostnames', () => {
  it('takes the hostname of host and url', () => {
    expect(extractSpeedtestNetHostnames([
      {
        host: 'speedtest.example.com:8080',
        url: 'http://speedtest.example.com:8080/speedtest/upload.php'
      },
      {
        host: 'st.example.net:8080',
        url: 'https://upload.example.net/speedtest/upload.php'
      }
    ])).toEqual([
      'speedtest.example.com',
      'speedtest.example.com',
      'st.example.net',
      'upload.example.net'
    ]);
  });

  it('copes with the typo speedtest.net has in some urls', () => {
    expect(extractSpeedtestNetHostnames([
      { url: 'http:// t4y-toronto-ca-osts1.ser.tek4you.ca:8080/speedtest/upload.php' }
    ])).toEqual(['t4y-toronto-ca-osts1.ser.tek4you.ca']);
  });

  it('lowercases the hostnames', () => {
    expect(extractSpeedtestNetHostnames([{ host: 'SpeedTest.Example.COM:8080' }])).toEqual(['speedtest.example.com']);
  });

  it('skips servers that are listed by their IP', () => {
    expect(extractSpeedtestNetHostnames([
      { host: '203.0.113.7:8080', url: 'http://203.0.113.7:8080/speedtest/upload.php' },
      { host: '[2001:db8::1]:8080', url: 'http://[2001:db8::1]:8080/speedtest/upload.php' }
    ])).toEqual([]);
  });

  it('skips servers without host and url', () => {
    expect(extractSpeedtestNetHostnames([{}, { host: '' }, { name: 'nothing' }])).toEqual([]);
  });
});

describe('extractLibrespeedHostnames', () => {
  it('takes the hostname of the server', () => {
    expect(extractLibrespeedHostnames([
      { server: '//librespeed.example.org/' },
      { server: 'https://lg.example.net/' },
      { server: '//203.0.113.7/' },
      { server: '' },
      {}
    ])).toEqual(['librespeed.example.org', 'lg.example.net']);
  });
});

describe('fetchSpeedtestNetHostnames', () => {
  it('asks a slice of the regions and collects the hostnames', async () => {
    const asked: string[] = [];
    const hostnames = await fetchSpeedtestNetHostnames(0, (region) => {
      asked.push(region);
      return Promise.resolve([{ host: `${region.toLowerCase().replaceAll(' ', '-')}.example.com:8080` }]);
    }, 0);

    expect(asked).toEqual(pickSpeedtestNetRegions(0));
    expect(hostnames).toHaveLength(asked.length);
    expect(hostnames[0]).toEqual('hong-kong.example.com');
  });

  it('stops at the first refusal and keeps what it already has', async () => {
    const asked: string[] = [];
    const hostnames = await fetchSpeedtestNetHostnames(0, (region) => {
      asked.push(region);
      if (asked.length === 3) {
        return Promise.reject(new ResponseError({ status: 429 } as Response, 'https://www.speedtest.net/api/js/servers'));
      }
      return Promise.resolve([{ host: `s${asked.length}.example.com:8080` }]);
    }, 0);

    expect(asked).toHaveLength(3);
    expect(hostnames).toEqual(['s1.example.com', 's2.example.com']);
  });

  it('does not reject when the very first request fails', async () => {
    let calls = 0;
    const hostnames = await fetchSpeedtestNetHostnames(0, () => {
      calls++;
      return Promise.reject(new TypeError('fetch failed'));
    }, 0);

    expect(calls).toEqual(1);
    expect(hostnames).toEqual([]);
  });

  it('is fine with a region nobody has servers in', async () => {
    const hostnames = await fetchSpeedtestNetHostnames(0, region => Promise.resolve(region === 'Macau' ? [] : [{ host: 'a.example.com:80' }]), 0);
    expect(hostnames).toHaveLength(pickSpeedtestNetRegions(0).length - 1);
  });
});
