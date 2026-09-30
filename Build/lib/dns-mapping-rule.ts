/**
 * The domains of the tables of Local DNS Mapping (`Source/non_ip/domestic.ts`, `direct.ts`, `global.ts`) are written
 * in the notation of that module: `$host` is one host, `+domain` a domain and its subdomains, a plain `domain` the
 * same and its subdomains too, and `*` or `?` makes a wildcard. This turns one of them into the rules of a ruleset.
 */
export function createGetDnsMappingRule(allowWildcard: boolean) {
  const hasWildcard = (domain: string) => {
    if (domain.includes('*') || domain.includes('?')) {
      if (!allowWildcard) {
        throw new TypeError(`Wildcard domain is not supported: ${domain}`);
      }
      return true;
    }

    return false;
  };

  return (domain: string): string[] => {
    const results: string[] = [];
    if (domain[0] === '$') {
      const d = domain.slice(1);
      if (hasWildcard(domain)) {
        results.push(`DOMAIN-WILDCARD,${d}`);
      } else {
        results.push(`DOMAIN,${d}`);
      }
    } else if (domain[0] === '+') {
      const d = domain.slice(1);
      if (hasWildcard(domain)) {
        results.push(`DOMAIN-WILDCARD,*.${d}`);
      } else {
        results.push(`DOMAIN-SUFFIX,${d}`);
      }
    } else if (hasWildcard(domain)) {
      results.push(`DOMAIN-WILDCARD,${domain}`, `DOMAIN-WILDCARD,*.${domain}`);
    } else {
      results.push(`DOMAIN-SUFFIX,${domain}`);
    }

    return results;
  };
}
