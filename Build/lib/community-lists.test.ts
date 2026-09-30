import { describe, it } from 'mocha';
import { expect } from 'earl';

import { createCommunityLists, DOMAIN_LIST_COMMUNITY_DATA_URL } from './community-lists';
import type { CommunityListsSources, TraceStep } from './community-lists';
import { parseDomainListCommunityBundle } from './domain-list-community-bundle';

const sorted = (values: string[]) => values.slice().sort();

/** The lists as their files are: they include each other */
const FILES: Record<string, string[]> = {
  microsoft: ['include:github', 'include:azure', 'microsoft.com', 'microsoft.com.cn @cn', 'full:login.microsoftonline.com'],
  github: ['include:npmjs', 'github.com', 'full:api.github.com'],
  npmjs: ['npmjs.com'],
  azure: ['azure.com', 'ads.azure.com @ads'],
  speedtest: ['ookla.com', String.raw`regexp:^speed\.example\.com$`],
  cdn: ['include:akamai', 'include:jsdelivr', 'cdnjs.com'],
  akamai: ['akamaihd.net', 'akamaized.net'],
  jsdelivr: ['jsdelivr.net']
};

/** The same lists, as the bundle has them: resolved, and with no list that includes another */
const BUNDLE = parseDomainListCommunityBundle([
  'lists:',
  '  - name: "microsoft"',
  '    length: 7',
  '    rules:',
  '      - "domain:microsoft.com"',
  '      - "domain:microsoft.com.cn:@cn"',
  '      - "full:login.microsoftonline.com"',
  '      - "domain:github.com"',
  '      - "full:api.github.com"',
  '      - "domain:npmjs.com"',
  '      - "domain:azure.com"',
  '  - name: "github"',
  '    length: 3',
  '    rules:',
  '      - "domain:github.com"',
  '      - "full:api.github.com"',
  '      - "domain:npmjs.com"',
  '  - name: "speedtest"',
  '    length: 2',
  '    rules:',
  '      - "domain:ookla.com"',
  String.raw`      - "regexp:^speed\\.example\\.com$"`,
  '  - name: "cdn"',
  '    length: 4',
  '    rules:',
  '      - "domain:akamaihd.net"',
  '      - "domain:akamaized.net"',
  '      - "domain:jsdelivr.net"',
  '      - "domain:cdnjs.com"',
  '  - name: "akamai"',
  '    length: 2',
  '    rules:',
  '      - "domain:akamaihd.net"',
  '      - "domain:akamaized.net"'
]);

function createSources(options: { bundle?: boolean, files?: boolean } = {}) {
  const bundle = options.bundle ?? true;
  const asked = { bundle: 0, lists: [] as string[] };

  const sources: CommunityListsSources = {
    loadBundle() {
      asked.bundle++;
      return Promise.resolve(bundle ? BUNDLE : null);
    },
    loadList(list) {
      asked.lists.push(list);
      if (!Object.hasOwn(FILES, list)) {
        return Promise.reject(new Error(`HTTP 404 ${list}`));
      }
      return Promise.resolve(FILES[list]);
    }
  };

  return { sources, asked };
}

describe('createCommunityLists', () => {
  it('takes the lists from the bundle, and does not ask for a file', async () => {
    const { sources, asked } = createSources();
    const { suffixes, hostnames } = await createCommunityLists(sources)(['microsoft']);

    expect(sorted(suffixes)).toEqual(sorted(['microsoft.com', 'microsoft.com.cn', 'github.com', 'npmjs.com', 'azure.com']));
    expect(sorted(hostnames)).toEqual(sorted(['login.microsoftonline.com', 'api.github.com']));
    expect(asked.lists).toEqual([]);
    expect(asked.bundle).toBeGreaterThan(0);
  });

  it('asks for the lists one by one when there is no bundle, and gets the same of them', async () => {
    const withBundle = await createCommunityLists(createSources().sources)(['microsoft', 'cdn', 'speedtest']);
    const { sources, asked } = createSources({ bundle: false });
    const withoutBundle = await createCommunityLists(sources)(['microsoft', 'cdn', 'speedtest']);

    expect(sorted(withoutBundle.suffixes)).toEqual(sorted(withBundle.suffixes));
    expect(sorted(withoutBundle.hostnames)).toEqual(sorted(withBundle.hostnames));
    expect(sorted(withoutBundle.unsupported)).toEqual(sorted(withBundle.unsupported));
    // and the ones that the lists include, which the bundle has already put in
    expect(sorted(asked.lists)).toEqual(sorted(['microsoft', 'github', 'npmjs', 'azure', 'cdn', 'akamai', 'jsdelivr', 'speedtest']));
  });

  it('asks for the file of a list that the bundle does not have, which may be behind the lists', async () => {
    const { sources, asked } = createSources();
    const { suffixes } = await createCommunityLists(sources)(['azure']);

    expect(suffixes).toEqual(['azure.com']);
    expect(asked.lists).toEqual(['azure']);
  });

  it('takes the entries with an attribute, or without it, like the resolver does', async () => {
    const resolve = createCommunityLists(createSources().sources);

    expect((await resolve([{ list: 'microsoft', must: ['cn'] }])).suffixes).toEqual(['microsoft.com.cn']);
    expect(sorted((await resolve([{ list: 'microsoft', ban: ['cn'] }])).suffixes)).toEqual(sorted(['microsoft.com', 'github.com', 'npmjs.com', 'azure.com']));
  });

  it('leaves out what a list holds of the lists that are skipped, whichever way the lists are had', async () => {
    await Promise.all([true, false].map(async (bundle) => {
      const resolve = createCommunityLists(createSources({ bundle }).sources);
      const { suffixes, hostnames } = await resolve([{ list: 'microsoft', ban: ['cn'], skip: ['github'] }]);

      expect({ bundle, suffixes: sorted(suffixes), hostnames: sorted(hostnames) }).toEqual({
        bundle,
        suffixes: sorted(['microsoft.com', 'azure.com']),
        hostnames: ['login.microsoftonline.com']
      });
    }));
  });

  it('leaves out a whole network, like Akamai out of the CDNs, and keeps the rest', async () => {
    await Promise.all([true, false].map(async (bundle) => {
      const resolve = createCommunityLists(createSources({ bundle }).sources);
      const { suffixes } = await resolve([{ list: 'cdn', skip: ['akamai'] }]);

      expect({ bundle, suffixes: sorted(suffixes) }).toEqual({ bundle, suffixes: sorted(['jsdelivr.net', 'cdnjs.com']) });
    }));
  });

  it('keeps the hostnames that select says yes to, and only those, in every part of the list', async () => {
    const { suffixes, hostnames } = await createCommunityLists(createSources().sources)([
      { list: 'microsoft', select: hostname => hostname.includes('github') }
    ]);

    expect(suffixes).toEqual(['github.com']);
    expect(hostnames).toEqual(['api.github.com']);
  });

  it('puts the lists together once, names the lists that were asked for and what it could not take', async () => {
    const { suffixes, unsupported, sources } = await createCommunityLists(createSources().sources)([
      'speedtest',
      { list: 'Microsoft', ban: ['cn'] },
      'github'
    ]);

    // github.com is in two of them
    expect(suffixes.filter(suffix => suffix === 'github.com')).toHaveLength(1);
    expect(unsupported).toEqual([String.raw`regexp:^speed\.example\.com$`]);
    expect(sources).toEqual([
      DOMAIN_LIST_COMMUNITY_DATA_URL + 'speedtest',
      DOMAIN_LIST_COMMUNITY_DATA_URL + 'microsoft',
      DOMAIN_LIST_COMMUNITY_DATA_URL + 'github'
    ]);
  });

  it('does not say what it could not take when it is an ad', async () => {
    const { unsupported } = await createCommunityLists(createSources({ bundle: false }).sources)(['azure']);

    expect(unsupported).toEqual([]);
  });

  it('says so when a list is gone, instead of making a ruleset of the rest', async () => {
    await expect(createCommunityLists(createSources({ bundle: false }).sources)(['gone'])).toBeRejectedWith('Failed to load the domain list "gone"');
  });

  it('runs every list as a step that can be timed, the skipped ones too', async () => {
    const steps: string[] = [];
    const trace: TraceStep = (name, step) => {
      steps.push(name);
      return step();
    };

    await createCommunityLists(createSources().sources)([{ list: 'microsoft', skip: ['github'] }, 'cdn'], trace);

    expect(sorted(steps)).toEqual(sorted(['get microsoft', 'get github', 'get cdn']));
  });
});
