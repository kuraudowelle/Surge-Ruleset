import { normalizeDomain } from './normalize-domain';

// HOMEBREW_API_DEFAULT_DOMAIN="https://formulae.brew.sh/api"
// export HOMEBREW_BREW_DEFAULT_GIT_REMOTE="https://github.com/Homebrew/brew"
const rDefaultEndpoint = /^\s*(?:export\s+)?(HOMEBREW_[\dA-Z_]*_DEFAULT_[\dA-Z_]+)=["']?https?:\/\/([^\s"'/:]+)/;

/**
 * The hosts that Homebrew connects to unless it is told otherwise, which Homebrew itself
 * defines in Library/Homebrew/brew.sh (https://github.com/Homebrew/brew), by the name of the
 * setting that a mirror would replace:
 *
 *     HOMEBREW_API_DEFAULT_DOMAIN      => formulae.brew.sh
 *     HOMEBREW_BOTTLE_DEFAULT_DOMAIN   => ghcr.io
 *     HOMEBREW_BREW_DEFAULT_GIT_REMOTE => github.com
 *     HOMEBREW_CORE_DEFAULT_GIT_REMOTE => github.com
 */
export function parseHomebrewDefaultEndpoints(lines: Iterable<string>): Map<string, string> {
  const endpoints = new Map<string, string>();

  for (const line of lines) {
    const match = rDefaultEndpoint.exec(line);
    if (match === null) {
      continue;
    }

    const hostname = normalizeDomain(match[2].toLowerCase());
    if (hostname !== null) {
      endpoints.set(match[1], hostname);
    }
  }

  return endpoints;
}
