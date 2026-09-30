import { describe, it } from 'mocha';
import { expect } from 'earl';

import { parseDomainListCommunity } from './domain-list-community';

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
      'localhost',
      'exa mple',
      '-bad.example.com',
      'bad-.example.com',
      'a..example.com',
      'domain:',
      'full:'
    ])).toEqual({
      suffixes: [],
      full: [],
      skipped: [
        'localhost',
        'exa mple',
        '-bad.example.com',
        'bad-.example.com',
        'a..example.com',
        'domain:',
        'full:'
      ]
    });
  });
});
