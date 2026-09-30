import { describe, it } from 'mocha';
import { expect } from 'earl';

import { parseGitHubMeta } from './github-meta';

/** The order of what the API lists does not matter to a ruleset (the build sorts it) */
const sorted = (values: string[]) => values.slice().sort();

/**
 * https://api.github.com/meta as GitHub's own OpenAPI description shows it (the addresses are the
 * documentation ones), with domains as GitHub's documentation for Copilot names them:
 * https://docs.github.com/en/copilot/reference/copilot-allowlist-reference
 */
function createMeta(overrides: Record<string, unknown> = {}) {
  return {
    verifiable_password_authentication: true,
    ssh_key_fingerprints: { SHA256_RSA: 'x', SHA256_ED25519: 'y' },
    ssh_keys: ['ssh-ed25519 ABCDEFGHIJKLMNOPQRSTUVWXYZ'],
    hooks: ['192.0.2.10'],
    github_enterprise_importer: ['192.0.2.11'],
    web: ['192.30.252.0/22', '2a0a:a440::/29'],
    api: ['192.30.252.0/22', '198.51.100.0/24'],
    git: ['203.0.113.0/24'],
    packages: ['198.51.100.128/25'],
    pages: ['185.199.108.0/22'],
    importer: ['192.0.2.12'],
    actions: ['192.0.2.13/32'],
    actions_macos: ['192.0.2.14/32'],
    codespaces: ['192.0.2.15/32'],
    dependabot: ['192.0.2.16/32'],
    copilot: ['192.0.2.17/32'],
    commit_signing_keys: ['ABCDEFGHIJKLMNOPQRSTUVWXYZ'],
    domains: {
      website: ['*.github.com', '*.githubassets.com', '*.githubusercontent.com'],
      codespaces: ['*.github.dev'],
      copilot: ['*.githubcopilot.com', 'default.exp-tas.com'],
      packages: ['ghcr.io', '*.pkg.github.com'],
      storage: ['github-cloud.s3.amazonaws.com'],
      actions: ['github.com', '*.actions.githubusercontent.com', 'productionresultssa0.blob.core.windows.net'],
      actions_inbound: {
        full_domains: ['inbound.example.com'],
        wildcard_domains: ['*.inbound.example.com']
      },
      artifact_attestations: {
        trust_domain: 'trust.example.com',
        services: ['*.githubapp.com']
      }
    },
    ...overrides
  };
}

describe('parseGitHubMeta', () => {
  it('reads what GitHub documents: wildcards are domains with all their subdomains, and the others exactly that hostname', () => {
    const { suffixes, hostnames } = parseGitHubMeta(createMeta());

    expect(sorted(suffixes)).toEqual(sorted([
      'github.com',
      'githubassets.com',
      'githubusercontent.com',
      'github.dev',
      'githubcopilot.com',
      'pkg.github.com',
      'actions.githubusercontent.com',
      'githubapp.com'
    ]));
    expect(sorted(hostnames)).toEqual(sorted([
      'default.exp-tas.com',
      'ghcr.io',
      'github-cloud.s3.amazonaws.com',
      'github.com',
      'productionresultssa0.blob.core.windows.net'
    ]));
  });

  it('takes the domains that people connect to, and not the ones of actions_inbound or the trust domain of the attestations', () => {
    const { suffixes, hostnames, skipped } = parseGitHubMeta(createMeta());

    // what is there to leave out: the two lists of actions_inbound, and the trust domain
    expect(suffixes).not.toInclude('inbound.example.com');
    expect(hostnames).not.toInclude('inbound.example.com');
    expect(suffixes).not.toInclude('trust.example.com');
    expect(hostnames).not.toInclude('trust.example.com');
    // ... while the services of the attestations are taken
    expect(suffixes).toInclude('githubapp.com');
    expect(skipped).toEqual([]);
  });

  it('takes the addresses of web, api, git, pages and packages, by version, and not the ones of the other lists', () => {
    const { cidr4, cidr6 } = parseGitHubMeta(createMeta());

    expect(sorted(cidr4)).toEqual(sorted([
      '192.30.252.0/22',
      '198.51.100.0/24',
      '203.0.113.0/24',
      '198.51.100.128/25',
      '185.199.108.0/22'
    ]));
    expect(cidr6).toEqual(['2a0a:a440::/29']);
  });

  it('lower-cases, trims and deduplicates', () => {
    const { suffixes, hostnames, cidr4 } = parseGitHubMeta(createMeta({
      web: ['192.30.252.0/22', ' 192.30.252.0/22 '],
      domains: {
        website: ['*.GitHub.com', '*.github.com'],
        actions: [' GitHub.com ', 'github.com']
      }
    }));

    expect(suffixes).toEqual(['github.com']);
    expect(hostnames).toEqual(['github.com']);
    expect(cidr4.filter(cidr => cidr === '192.30.252.0/22')).toHaveLength(1);
  });

  it('keeps the wildcards on the domains of GitHub and leaves out the ones on the domains of other companies, which the API lists as well', () => {
    // The wildcards that the API had when it was first built (the CI run of the pull request), which only logged the patterns:
    // the keys that they are in here are a guess, and do not matter to what is kept
    const { suffixes, skipped } = parseGitHubMeta(createMeta({
      domains: {
        website: ['*.github.com', '*.githubassets.com', '*.githubusercontent.com', '*.github.io'],
        codespaces: ['*.github.dev', '*.githubapp.com', '*.visualstudio.com', '*.microsoft.com', '*.vscode-webview.net', '*.msecnd.net', '*.azureedge.net'],
        packages: ['*.ghcr.io'],
        copilot: ['*.githubcopilot.com'],
        actions: ['*.windows.net']
      }
    }));

    expect(sorted(suffixes)).toEqual(sorted([
      'github.com', 'githubassets.com', 'githubusercontent.com', 'github.io',
      'github.dev', 'githubapp.com', 'ghcr.io', 'githubcopilot.com'
    ]));
    // *.windows.net alone would be every storage account, virtual machine and database that anybody has on Azure
    expect(sorted(skipped)).toEqual(sorted([
      '*.visualstudio.com', '*.microsoft.com', '*.vscode-webview.net', '*.msecnd.net', '*.azureedge.net', '*.windows.net'
    ]));
  });

  it('keeps the hostnames of other companies that GitHub lists, since a hostname takes nothing but itself', () => {
    const { hostnames, suffixes } = parseGitHubMeta(createMeta({
      domains: {
        codespaces: ['*.microsoft.com'],
        actions: ['productionresultssa0.blob.core.windows.net', 'github-cloud.s3.amazonaws.com'],
        copilot: ['default.exp-tas.com']
      }
    }));

    expect(sorted(hostnames)).toEqual(sorted(['productionresultssa0.blob.core.windows.net', 'github-cloud.s3.amazonaws.com', 'default.exp-tas.com']));
    expect(suffixes).toEqual([]);
  });

  it('does not guess at patterns that are not everything below a domain, and says so', () => {
    const { suffixes, hostnames, skipped } = parseGitHubMeta(createMeta({
      domains: {
        website: ['*.github.com', 'productionresultssa*.blob.core.windows.net', '*.*.example.com', 'copilot-*.example.com']
      }
    }));

    expect(suffixes).toEqual(['github.com']);
    expect(hostnames).toEqual([]);
    expect(skipped).toEqual(['productionresultssa*.blob.core.windows.net', '*.*.example.com', 'copilot-*.example.com']);
  });

  it('does not take everything below a public suffix either, and says so', () => {
    const { suffixes, skipped } = parseGitHubMeta(createMeta({
      domains: { website: ['*.com', '*.co.uk', '*.github.com', '*.github.io'] }
    }));

    // github.io is what GitHub Pages is served from: it is a domain, not a suffix of one
    expect(suffixes).toEqual(['github.com', 'github.io']);
    expect(skipped).toEqual(['*.com', '*.co.uk']);
  });

  it('skips values that are not hostnames, and says so', () => {
    const { hostnames, cidr4, skipped } = parseGitHubMeta(createMeta({
      domains: { website: ['github.com', 'not a hostname', '1.2.3.4'] }
    }));

    expect(hostnames).toEqual(['github.com']);
    expect(cidr4).toInclude('192.30.252.0/22');
    expect(skipped).toEqual(['not a hostname', '1.2.3.4']);
  });

  it('refuses a range that is not an IP range with a prefix length, instead of publishing it or leaving it out', () => {
    // what a classifier of dots and colons takes for an address
    expect(() => parseGitHubMeta(createMeta({ web: ['192.30.252.0/22', '999.1.1.1/24'] }))).toThrow('web has "999.1.1.1/24", which is not an IP range with a prefix length');
    expect(() => parseGitHubMeta(createMeta({ api: ['1:2:3'] }))).toThrow('api has "1:2:3"');
    expect(() => parseGitHubMeta(createMeta({ git: ['10.0.0.0/33'] }))).toThrow('git has "10.0.0.0/33"');
    expect(() => parseGitHubMeta(createMeta({ pages: ['2a0a:a440::/129'] }))).toThrow('pages has');
    // a bare address is not the notation of the meta API
    expect(() => parseGitHubMeta(createMeta({ packages: ['192.0.2.1'] }))).toThrow('packages has "192.0.2.1"');
    expect(() => parseGitHubMeta(createMeta({ web: ['not an address'] }))).toThrow('web has "not an address"');
  });

  it('keeps every range that is one, IPv4 and IPv6', () => {
    const { cidr4, cidr6 } = parseGitHubMeta(createMeta({ web: ['192.30.252.0/22', '2a0a:a440::/29', '  203.0.113.0/24  '] }));

    expect(cidr4).toInclude('192.30.252.0/22', '203.0.113.0/24');
    expect(cidr6).toInclude('2a0a:a440::/29');
  });

  it('does not read the lists of addresses that it does not use, whatever they hold', () => {
    expect(parseGitHubMeta(createMeta({ hooks: ['not an address'], actions: ['999.1.1.1/24'] })).cidr4).toInclude('192.30.252.0/22');
  });

  it('goes on with the keys that are there when GitHub has added or dropped one', () => {
    const { suffixes, hostnames, cidr4, cidr6 } = parseGitHubMeta({
      web: ['192.30.252.0/22'],
      domains: { website: ['*.github.com'] }
    });

    expect(suffixes).toEqual(['github.com']);
    expect(hostnames).toEqual([]);
    expect(cidr4).toEqual(['192.30.252.0/22']);
    expect(cidr6).toEqual([]);
  });

  it('refuses a response of another shape, instead of publishing part of it', () => {
    expect(() => parseGitHubMeta(null)).toThrow('not an object');
    expect(() => parseGitHubMeta([])).toThrow('not an object');
    expect(() => parseGitHubMeta({ web: [] })).toThrow('no domains');
    expect(() => parseGitHubMeta({ domains: [] })).toThrow('no domains');
    expect(() => parseGitHubMeta(createMeta({ domains: { website: '*.github.com' } }))).toThrow('domains.website is not an array of strings');
    expect(() => parseGitHubMeta(createMeta({ domains: { actions: ['github.com', 1] } }))).toThrow('domains.actions is not an array of strings');
    expect(() => parseGitHubMeta(createMeta({ domains: { artifact_attestations: [] } }))).toThrow('artifact_attestations is not an object');
    expect(() => parseGitHubMeta(createMeta({ web: 'x' }))).toThrow('web is not an array of strings');
  });
});
