import { describe, it } from 'mocha';
import { expect } from 'earl';

import { ALL, EU, HK, JP, KR, NORTH_AMERICA, TW } from '../../Source/stream';
import type { StreamService } from '../../Source/stream';

const REGIONS: Record<string, StreamService[]> = { NORTH_AMERICA, EU, HK, TW, JP, KR };

// What the build accepts as the name of a list of the community
const rListName = /^[\da-z!-]+$/;

function listNameOf(list: StreamService['lists'][number]) {
  return typeof list === 'string' ? list : list.list;
}

describe('the stream services', () => {
  it('has every service once in All, and under a name of its own', () => {
    const names = ALL.map(service => service.name);

    expect(new Set(ALL).size).toEqual(ALL.length);
    expect(new Set(names).size).toEqual(names.length);
  });

  it('has the services of a region in All as well, which is everything, and once in the region', () => {
    const all = new Set(ALL);

    Object.entries(REGIONS).forEach(([region, services]) => {
      const missing = services.reduce<string[]>((names, service) => {
        if (!all.has(service)) {
          names.push(service.name);
        }
        return names;
      }, []);

      expect({ region, missing }).toEqual({ region, missing: [] });
      expect({ region, duplicates: services.length - new Set(services).size }).toEqual({ region, duplicates: 0 });
    });
  });

  it('gives every service the lists of the community that are about it, by the name of a list', () => {
    ALL.forEach((service) => {
      expect({ service: service.name, lists: service.lists.length > 0 }).toEqual({ service: service.name, lists: true });

      service.lists.forEach((list) => {
        const name = listNameOf(list);
        expect({ service: service.name, name, valid: rListName.test(name) }).toEqual({ service: service.name, name, valid: true });
      });
    });
  });

  it('gives a service that has addresses the autonomous systems that announce them, as numbers', () => {
    const withAsns = ALL.filter(service => service.asns !== undefined);

    expect(withAsns.some(service => service.name === 'Netflix')).toEqual(true);
    withAsns.forEach((service) => {
      expect({ service: service.name, asns: service.asns!.length > 0 }).toEqual({ service: service.name, asns: true });
      service.asns!.forEach((asn) => {
        expect({ service: service.name, asn, valid: Number.isSafeInteger(asn) && asn > 0 }).toEqual({ service: service.name, asn, valid: true });
      });
    });
  });

  it('does not hold the services that have a ruleset of their own (YouTube, TikTok), nor the lists of whole companies', () => {
    const lists = new Set(ALL.flatMap(service => service.lists.map(listNameOf)));

    // each of them is a ruleset of its own, see build-service-rulesets.ts
    ['youtube', 'tiktok'].forEach(list => expect({ list, in: lists.has(list) }).toEqual({ list, in: false }));
    // a whole company is not a streaming service
    ['fox', 'naver', 'amazon', 'google', 'microsoft', 'apple'].forEach(list => expect({ list, in: lists.has(list) }).toEqual({ list, in: false }));
  });
});
