import { describe, it } from 'mocha';
import { expect } from 'earl';

import { DomainListCommunityResolver, parseDomainListCommunity } from './domain-list-community';
import type { DomainListLoader } from './domain-list-community';

describe('parseDomainListCommunity', () => {
  it('reads what https://github.com/v2fly/domain-list-community/blob/master/data/telegram looks like', () => {
    expect(parseDomainListCommunity([
      'cdn-telegram.org',
      'comments.app',
      't.me',
      'telegra.ph',
      'tg.dev',
      'ton.org'
    ])).toEqual({
      suffixes: ['cdn-telegram.org', 'comments.app', 't.me', 'telegra.ph', 'tg.dev', 'ton.org'],
      full: [],
      skipped: []
    });
  });

  it('takes bare and domain: entries as suffixes and full: entries as exact hostnames', () => {
    expect(parseDomainListCommunity([
      'example.com',
      'domain:example.org',
      'full:www.example.net'
    ])).toEqual({
      suffixes: ['example.com', 'example.org'],
      full: ['www.example.net'],
      skipped: []
    });
  });

  it('ignores comments and blank lines, including a comment after an entry', () => {
    expect(parseDomainListCommunity([
      '# Telegram',
      '',
      '   ',
      't.me # short links',
      '  tx.me  '
    ])).toEqual({
      suffixes: ['t.me', 'tx.me'],
      full: [],
      skipped: []
    });
  });

  it('keeps entries with a plain attribute and skips the ones marked @ads', () => {
    expect(parseDomainListCommunity([
      'example.com @cn',
      'tracker.example.com @ads',
      'other.example.com @cn @ads'
    ])).toEqual({
      suffixes: ['example.com'],
      full: [],
      skipped: ['tracker.example.com @ads', 'other.example.com @cn @ads']
    });
  });

  it('skips what a ruleset cannot express and says so', () => {
    expect(parseDomainListCommunity([
      'keyword:telegram',
      String.raw`regexp:^t[gs]\.example\.com$`,
      'include:ton',
      'include:ton @cn',
      't.me'
    ])).toEqual({
      suffixes: ['t.me'],
      full: [],
      skipped: ['keyword:telegram', String.raw`regexp:^t[gs]\.example\.com$`, 'include:ton', 'include:ton @cn']
    });
  });

  it('lower-cases, drops a trailing dot, writes IDNs as punycode and deduplicates', () => {
    expect(parseDomainListCommunity([
      'Telegram.ORG',
      'telegram.org.',
      'domain:telegram.org',
      'bücher.example'
    ])).toEqual({
      suffixes: ['telegram.org', 'xn--bcher-kva.example'],
      full: [],
      skipped: []
    });
  });

  it('skips values that are not hostnames', () => {
    expect(parseDomainListCommunity([
      'exa mple',
      '-bad.example.com',
      'bad-.example.com',
      'a..example.com',
      'exa$mple.com',
      'domain:',
      'full:'
    ])).toEqual({
      suffixes: [],
      full: [],
      skipped: [
        'exa mple',
        '-bad.example.com',
        'bad-.example.com',
        'a..example.com',
        'exa$mple.com',
        'domain:',
        'full:'
      ]
    });
  });

  it('takes a top-level domain on its own, which Google has a few of', () => {
    expect(parseDomainListCommunity([
      '# All .youtube domains',
      'youtube',
      'domain:google',
      'xn--flw351e',
      'full:youtube'
    ])).toEqual({
      suffixes: ['youtube', 'google', 'xn--flw351e'],
      full: ['youtube'],
      skipped: []
    });
  });

  it('skips a line with something behind the entry that is not an attribute', () => {
    expect(parseDomainListCommunity([
      'example.com @cn',
      'example.org cn',
      'example.net @'
    ])).toEqual({
      suffixes: ['example.com'],
      full: [],
      skipped: ['example.org cn', 'example.net @']
    });
  });

  it('takes an entry with an affiliation as it is, the affiliation only adds it to another list', () => {
    expect(parseDomainListCommunity([
      'example.com &other-list',
      'example.org @cn &other-list &third-list'
    ])).toEqual({
      suffixes: ['example.com', 'example.org'],
      full: [],
      skipped: []
    });
  });
});

/** The order of the entries does not matter to a ruleset (the build sorts them), so it does not matter here either */
const sorted = (values: string[]) => values.slice().sort();

function createLoader(lists: Record<string, string[]>) {
  const loaded: string[] = [];
  const load: DomainListLoader = (list) => {
    loaded.push(list);
    if (!Object.hasOwn(lists, list)) {
      throw new Error(`HTTP 404 ${list}`);
    }
    return lists[list];
  };
  return { load, loaded };
}

async function resolve(lists: Record<string, string[]>, list: string) {
  const resolved = await new DomainListCommunityResolver(createLoader(lists).load).resolve(list);
  return {
    suffixes: sorted(resolved.suffixes),
    full: sorted(resolved.full),
    skipped: sorted(resolved.skipped),
    lists: resolved.lists
  };
}

describe('DomainListCommunityResolver', () => {
  it('resolves a list that includes nothing the way parseDomainListCommunity does', async () => {
    const lines = ['# reddit', 'reddit.com', 'full:www.example.com', 'ads.example.com @ads', 'keyword:reddit'];
    const parsed = parseDomainListCommunity(lines);

    expect(await resolve({ reddit: lines }, 'reddit')).toEqual({
      suffixes: sorted(parsed.suffixes),
      full: sorted(parsed.full),
      skipped: sorted(parsed.skipped),
      lists: ['reddit']
    });
  });

  it('adds what an included list holds, and what that list includes', async () => {
    expect(await resolve({
      github: ['include:github-copilot', 'github.com'],
      'github-copilot': ['include:npmjs', 'githubcopilot.com', 'full:copilot-proxy.githubusercontent.com'],
      npmjs: ['npmjs.com']
    }, 'github')).toEqual({
      suffixes: sorted(['github.com', 'githubcopilot.com', 'npmjs.com']),
      full: ['copilot-proxy.githubusercontent.com'],
      skipped: [],
      lists: ['github', 'github-copilot', 'npmjs']
    });
  });

  it('takes only the entries that have the attribute of `include:list @attribute`', async () => {
    const { suffixes, skipped } = await resolve({
      google: ['include:extra @cn', 'google.com'],
      extra: ['a.example.com @cn', 'b.example.com', 'c.example.com @!cn', 'd.example.com @cn @other', 'e.example.com @ads']
    }, 'google');

    expect(suffixes).toEqual(sorted(['google.com', 'a.example.com', 'd.example.com']));
    expect(skipped).toEqual([]);
  });

  it('takes only the entries that do not have the attribute of `include:list @-attribute`', async () => {
    const { suffixes, skipped } = await resolve({
      google: ['include:extra @-ads', 'google.com'],
      extra: ['a.example.com', 'b.example.com @cn', 'c.example.com @ads', 'd.example.com @cn @ads']
    }, 'google');

    expect(suffixes).toEqual(sorted(['google.com', 'a.example.com', 'b.example.com']));
    // left out by the inclusion, so not something that was skipped
    expect(skipped).toEqual([]);
  });

  it('asks for every attribute and for none of the banned ones at once, and takes entries without attribute only when nothing is asked for', async () => {
    const { suffixes } = await resolve({
      list: ['include:extra @cn @tv @-ads'],
      extra: [
        'plain.example.com',
        'cn.example.com @cn',
        'cn-tv.example.com @cn @tv',
        'cn-tv-ads.example.com @cn @tv @ads'
      ]
    }, 'list');
    expect(suffixes).toEqual(['cn-tv.example.com']);

    const banOnly = await resolve({
      list: ['include:extra @-ads'],
      extra: ['plain.example.com', 'ads.example.com @ads']
    }, 'list');
    expect(banOnly.suffixes).toEqual(['plain.example.com']);
  });

  it('filters what an included list includes itself, since an inclusion takes what the list has once it is resolved', async () => {
    const { suffixes } = await resolve({
      top: ['include:middle @cn'],
      middle: ['include:bottom', 'middle.example.com @cn'],
      bottom: ['bottom.example.com @cn', 'other.example.com']
    }, 'top');

    expect(suffixes).toEqual(sorted(['middle.example.com', 'bottom.example.com']));
  });

  it('leaves out the entries marked @ads, also the ones that come from an included list, and says so', async () => {
    expect(await resolve({
      google: ['include:youtube', 'google.com', 'ads.google.com @ads'],
      youtube: ['youtube.com', 'ads.youtube.com @ads']
    }, 'google')).toEqual({
      suffixes: sorted(['youtube.com', 'google.com']),
      full: [],
      skipped: sorted(['ads.google.com @ads', 'ads.youtube.com @ads']),
      lists: ['google', 'youtube']
    });
  });

  it('keeps a hostname that is listed both with and without @ads', async () => {
    const { suffixes, skipped } = await resolve({
      list: ['example.com', 'example.com @ads']
    }, 'list');

    expect(suffixes).toEqual(['example.com']);
    expect(skipped).toEqual(['example.com @ads']);
  });

  it('takes the top-level domains of a list, like the ones of google', async () => {
    const { suffixes } = await resolve({
      google: ['include:youtube', 'google', 'goog'],
      youtube: ['youtube', 'youtube.com']
    }, 'google');

    expect(suffixes).toEqual(sorted(['youtube', 'youtube.com', 'google', 'goog']));
  });

  it('says what it cannot take, in every list it went through', async () => {
    const { skipped } = await resolve({
      google: ['include:youtube', String.raw`regexp:^r+[0-9]+\.example\.com$`, 'google.com'],
      youtube: ['keyword:youtube', 'not a hostname', 'youtube.com']
    }, 'google');

    expect(skipped).toEqual(sorted([
      String.raw`regexp:^r+[0-9]+\.example\.com$`,
      'keyword:youtube',
      'not a hostname'
    ]));
  });

  it('reads the names of lists like the build does, in any case', async () => {
    const { suffixes, lists } = await resolve({
      github: ['Include:NPMJS'],
      npmjs: ['npmjs.com']
    }, 'GitHub');

    expect(suffixes).toEqual(['npmjs.com']);
    expect(lists).toEqual(['github', 'npmjs']);
  });

  it('asks for a list once, however many lists include it and however often it is resolved', async () => {
    const { load, loaded } = createLoader({
      google: ['include:youtube', 'include:blogspot', 'google.com'],
      youtube: ['include:shared', 'youtube.com'],
      blogspot: ['include:shared', 'blogspot.com'],
      shared: ['shared.example.com']
    });
    const resolver = new DomainListCommunityResolver(load);

    const [google, youtube] = await Promise.all([resolver.resolve('google'), resolver.resolve('youtube')]);
    await resolver.resolve('google');

    expect(sorted(loaded)).toEqual(['blogspot', 'google', 'shared', 'youtube']);
    expect(sorted(google.suffixes)).toEqual(sorted(['shared.example.com', 'youtube.com', 'blogspot.com', 'google.com']));
    expect(sorted(youtube.suffixes)).toEqual(sorted(['shared.example.com', 'youtube.com']));
  });

  it('gives up on lists that include each other, instead of waiting for one another', async () => {
    const lists = {
      a: ['include:b', 'a.example.com'],
      b: ['include:c', 'b.example.com'],
      c: ['include:a', 'c.example.com']
    };

    await expect(resolve(lists, 'a')).toBeRejectedWith('Circular inclusion of domain lists: a > b > c > a');

    // in parallel as well: no list must wait for a list that waits for it
    const resolver = new DomainListCommunityResolver(createLoader(lists).load);
    const results = await Promise.allSettled([resolver.resolve('a'), resolver.resolve('b'), resolver.resolve('c')]);
    expect(results.map(result => result.status)).toEqual(['rejected', 'rejected', 'rejected']);
  });

  it('gives up on a list that includes itself', async () => {
    await expect(resolve({ a: ['include:a', 'a.example.com'] }, 'a')).toBeRejectedWith('Circular inclusion of domain lists: a > a');
  });

  it('says which list could not be loaded, and which list wanted it', async () => {
    await expect(resolve({ google: ['include:gone', 'google.com'] }, 'google')).toBeRejectedWith(
      'Failed to load the domain list "gone", which "google" includes'
    );
    await expect(resolve({}, 'google')).toBeRejectedWith('Failed to load the domain list "google"');

    // the reason is in the message, and the error it comes from is its cause
    await expect(resolve({ google: ['include:gone'] }, 'google')).toBeRejectedWith('HTTP 404 gone');
    const error: unknown = await resolve({ google: ['include:gone'] }, 'google').catch((e: unknown) => e);
    expect((error as Error).cause).toEqual(new Error('HTTP 404 gone'));
  });

  it('never asks for a list by a name that is not a list name, since a name ends up in a URL', async () => {
    const { load, loaded } = createLoader({
      list: ['include:../../secret', 'include:a/b', 'include:%2e%2e', 'list.example.com']
    });

    const { suffixes, full, skipped, lists } = await new DomainListCommunityResolver(load).resolve('list');

    expect(suffixes).toEqual(['list.example.com']);
    expect(full).toEqual([]);
    expect(sorted(skipped)).toEqual(sorted(['include:../../secret', 'include:a/b', 'include:%2e%2e']));
    expect(lists).toEqual(['list']);
    expect(loaded).toEqual(['list']);

    await expect(resolve({}, '../list')).toBeRejectedWith('Invalid domain list name: ../list');
  });

  it('skips an inclusion that asks for more than attributes', async () => {
    const { suffixes, skipped, lists } = await resolve({
      list: ['include:extra &other', 'include:extra @', 'include:extra cn', 'list.example.com'],
      extra: ['extra.example.com']
    }, 'list');

    expect(suffixes).toEqual(['list.example.com']);
    expect(skipped).toEqual(sorted(['include:extra &other', 'include:extra @', 'include:extra cn']));
    expect(lists).toEqual(['list']);
  });

  it('reads what https://github.com/v2fly/domain-list-community/blob/master/data/google-gemini looks like', async () => {
    const { suffixes, full, lists } = await resolve({
      'google-gemini': ['# This list is for backward compatibility', '', 'include:google-deepmind'],
      'google-deepmind': [
        '# Google DeepMind',
        'deepmind.com',
        '# Antigravity',
        'full:antigravity-pa.googleapis.com',
        'antigravity.google',
        'antigravity-unleash.goog'
      ]
    }, 'google-gemini');

    expect(suffixes).toEqual(sorted(['deepmind.com', 'antigravity.google', 'antigravity-unleash.goog']));
    expect(full).toEqual(['antigravity-pa.googleapis.com']);
    expect(lists).toEqual(['google-gemini', 'google-deepmind']);
  });
});
