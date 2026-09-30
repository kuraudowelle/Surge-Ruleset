import { describe, it } from 'mocha';
import { expect } from 'earl';

import { ALL, EU, HK, JP, KR, NORTH_AMERICA, TW } from '../../Source/stream';
import type { StreamService } from '../../Source/stream';
import { getCidrVersion } from './cidr-lines';

const REGIONS: Record<string, StreamService[]> = { NORTH_AMERICA, EU, HK, TW, JP, KR };

// What the build accepts as the name of a list of the community
const rListName = /^[\da-z!-]+$/;

// What a ruleset takes of what a person collected for a service (the addresses are `ip`, and not rules)
const RULE_TYPES = new Set(['DOMAIN', 'DOMAIN-SUFFIX', 'DOMAIN-KEYWORD', 'DOMAIN-WILDCARD', 'USER-AGENT', 'PROCESS-NAME', 'URL-REGEX']);

function listNameOf(list: NonNullable<StreamService['lists']>[number]) {
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

  it('gives every service what it is made of: lists of the community, rules that were collected by hand, or both', () => {
    ALL.forEach((service) => {
      const data = (service.lists?.length ?? 0) + (service.rules?.length ?? 0);
      expect({ service: service.name, data: data > 0 }).toEqual({ service: service.name, data: true });

      service.lists?.forEach((list) => {
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

  it('keeps what was collected by hand as rules that a ruleset takes, written as they are in the file', () => {
    ALL.forEach((service) => {
      service.rules?.forEach((rule) => {
        const [type, value] = rule.split(',', 2);
        expect({ service: service.name, rule, kind: RULE_TYPES.has(type), value: Boolean(value), trimmed: rule === rule.trim() })
          .toEqual({ service: service.name, rule, kind: true, value: true, trimmed: true });
      });
    });
  });

  it('keeps the addresses that were collected by hand as ranges of the version they are filed under', () => {
    const withIp = ALL.filter(service => service.ip !== undefined);

    expect(withIp.some(service => service.name === 'Netflix')).toEqual(true);
    withIp.forEach((service) => {
      service.ip!.v4.forEach(cidr => expect({ service: service.name, cidr, version: getCidrVersion(cidr) }).toEqual({ service: service.name, cidr, version: 4 }));
      service.ip!.v6.forEach(cidr => expect({ service: service.name, cidr, version: getCidrVersion(cidr) }).toEqual({ service: service.name, cidr, version: 6 }));
    });
  });

  it('has the services that no list of the community is about, from what was collected by hand alone, in All as well', () => {
    const byName = new Map(ALL.map(service => [service.name, service]));

    ['4gtv', 'All4', 'Paramount+', 'Peacock', 'WeTV', 'Naver TV', 'YouTube', 'YouTube Music', 'TikTok'].forEach((name) => {
      const service = byName.get(name);

      expect({ name, in: service !== undefined }).toEqual({ name, in: true });
      expect({ name, lists: service!.lists ?? [], rules: (service!.rules?.length ?? 0) > 0 }).toEqual({ name, lists: [], rules: true });
    });
  });

  it('does not take the lists of the services that have a ruleset of their own (YouTube, TikTok), nor the lists of whole companies', () => {
    const lists = new Set(ALL.flatMap(service => service.lists?.map(listNameOf) ?? []));

    // each of them is a ruleset of its own, see build-service-rulesets.ts
    ['youtube', 'tiktok'].forEach(list => expect({ list, in: lists.has(list) }).toEqual({ list, in: false }));
    // a whole company is not a streaming service
    ['fox', 'naver', 'amazon', 'google', 'microsoft', 'apple', 'cbs', 'nbcuniversal', 'tvb'].forEach(list => expect({ list, in: lists.has(list) }).toEqual({ list, in: false }));
  });
});
