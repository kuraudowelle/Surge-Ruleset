import { describe, it } from 'mocha';
import { expect } from 'earl';

import { parseHomebrewDefaultEndpoints } from './homebrew-endpoints';

describe('parseHomebrewDefaultEndpoints', () => {
  it('reads what https://github.com/Homebrew/brew/blob/master/Library/Homebrew/brew.sh looks like', () => {
    expect(parseHomebrewDefaultEndpoints([
      'setup_curl',
      '',
      'HOMEBREW_API_DEFAULT_DOMAIN="https://formulae.brew.sh/api"',
      'HOMEBREW_BOTTLE_DEFAULT_DOMAIN="https://ghcr.io/v2/homebrew/core"',
      '',
      '# TODO: bump version when new macOS is released or announced and update references in:',
      '# - https://github.com/Homebrew/install/blob/HEAD/install.sh',
      'export HOMEBREW_BREW_DEFAULT_GIT_REMOTE="https://github.com/Homebrew/brew"',
      // eslint-disable-next-line no-template-curly-in-string -- shell, not a template
      'if [[ -z "${HOMEBREW_BREW_GIT_REMOTE}" ]]',
      'then',
      // eslint-disable-next-line no-template-curly-in-string -- shell, not a template
      '  HOMEBREW_BREW_GIT_REMOTE="${HOMEBREW_BREW_DEFAULT_GIT_REMOTE}"',
      'fi',
      'export HOMEBREW_CORE_DEFAULT_GIT_REMOTE="https://github.com/Homebrew/homebrew-core"'
    ])).toEqual(new Map([
      ['HOMEBREW_API_DEFAULT_DOMAIN', 'formulae.brew.sh'],
      ['HOMEBREW_BOTTLE_DEFAULT_DOMAIN', 'ghcr.io'],
      ['HOMEBREW_BREW_DEFAULT_GIT_REMOTE', 'github.com'],
      ['HOMEBREW_CORE_DEFAULT_GIT_REMOTE', 'github.com']
    ]));
  });

  it('takes a default that is indented, exported or in single quotes, and leaves the port and the path out', () => {
    expect(parseHomebrewDefaultEndpoints([
      '  export HOMEBREW_ONE_DEFAULT_DOMAIN=\'https://One.Example.com:8443/path\'',
      '\tHOMEBREW_TWO_DEFAULT_REMOTE=http://two.example.com'
    ])).toEqual(new Map([
      ['HOMEBREW_ONE_DEFAULT_DOMAIN', 'one.example.com'],
      ['HOMEBREW_TWO_DEFAULT_REMOTE', 'two.example.com']
    ]));
  });

  it('leaves out what a user sets, what is not an address and what is not a hostname', () => {
    expect(parseHomebrewDefaultEndpoints([
      'HOMEBREW_API_DOMAIN="https://mirror.example.com/api"',
      'HOMEBREW_PIP_INDEX_URL="https://pypi.org/simple"',
      // eslint-disable-next-line no-template-curly-in-string -- shell, not a template
      'HOMEBREW_NAME_DEFAULT_DOMAIN="${HOMEBREW_MIRROR}/api"',
      'HOMEBREW_LOCAL_DEFAULT_DOMAIN="https://localhost/api"',
      '# HOMEBREW_COMMENTED_DEFAULT_DOMAIN="https://commented.example.com"',
      'echo HOMEBREW_ECHOED_DEFAULT_DOMAIN="https://echoed.example.com"'
    ])).toEqual(new Map());
  });

  it('keeps the last one when a default is set twice', () => {
    expect(parseHomebrewDefaultEndpoints([
      'HOMEBREW_API_DEFAULT_DOMAIN="https://old.example.com/api"',
      'HOMEBREW_API_DEFAULT_DOMAIN="https://new.example.com/api"'
    ])).toEqual(new Map([['HOMEBREW_API_DEFAULT_DOMAIN', 'new.example.com']]));
  });
});
