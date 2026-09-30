import { nullthrow } from 'foxts/guard';

/**
 * What v2fly publishes of its own build, on the `release` branch of
 * https://github.com/v2fly/domain-list-community: every list in one file, with the lists that it includes already
 * in it, and with the rules that another rule covers left out. One download, instead of one for each of the
 * hundreds of lists that a list like `geolocation-!cn` includes.
 */
export const DOMAIN_LIST_COMMUNITY_BUNDLE_URL = 'https://raw.githubusercontent.com/v2fly/domain-list-community/release/dlc.dat_plain.yml';

// What the file looks like is exactly this, and a line of any other shape means that it is another file
const rListsHeader = /^lists:\s*$/;
const rListName = /^ {2}- name: "(.*)"\s*$/;
const rListLength = /^ {4}length: (\d+)\s*$/;
const rListRules = /^ {4}rules:(?:\s*\[\])?\s*$/;
const rRule = /^ {6}- "(.*)"\s*$/;
// `domain:apple.com.cn:@cn`: the attribute comes last, as `:@name`, where a list file has ` @name`
const rTrailingAttribute = /:@([\da-z!]+)$/;
// What the build of the community accepts as the name of a list, which is the name of its file
const rSupportedListName = /^[\da-z!-]+$/;

function unquote(rule: string): string {
  // a regexp has its backslashes doubled, as a double-quoted string of YAML does
  return rule.includes('\\') ? (JSON.parse(`"${rule}"`) as string) : rule;
}

/**
 * Reads the file into what the list files would hold, so that a list is read the way a list of the community is:
 *
 *     lists:
 *       - name: "category-speedtest"
 *         length: 2
 *         rules:
 *           - "domain:cnspeedtest.cn:@cn"
 *           - "full:www.speedtest.net.cdn.cloudflare.net"
 *
 * gives `category-speedtest` the lines `domain:cnspeedtest.cn @cn` and `full:www.speedtest.net.cdn.cloudflare.net`.
 *
 * The file says how many rules a list has, and this holds it to that: a download that stopped halfway is
 * refused, and not turned into a ruleset that has some of the domains.
 */
export function parseDomainListCommunityBundle(lines: Iterable<string>): Map<string, string[]> {
  const lists = new Map<string, string[]>();

  let seenHeader = false;
  let name: string | null = null;
  let expected = -1;
  let rules: string[] | null = null;

  const closeList = () => {
    if (name !== null && rules !== null && rules.length !== expected) {
      throw new Error(`Invalid domain list bundle: "${name}" says that it has ${expected} rules, and has ${rules.length}`);
    }
  };

  for (const line of lines) {
    if (line.trim().length === 0) {
      continue;
    }

    if (!seenHeader) {
      if (!rListsHeader.test(line)) {
        throw new Error('Invalid domain list bundle: it does not start with "lists:"');
      }
      seenHeader = true;
      continue;
    }

    let match: RegExpExecArray | null;
    if ((match = rListName.exec(line)) !== null) {
      closeList();
      name = match[1];
      expected = -1;
      rules = null;
      continue;
    }

    const listName = nullthrow(name, `Invalid domain list bundle: a line comes before the first list: ${line}`);

    if ((match = rListLength.exec(line)) !== null) {
      expected = Number(match[1]);
    } else if (rListRules.test(line)) {
      rules = [];
      // a list that the build could not name in a file is a list that nobody asks for
      if (rSupportedListName.test(listName)) {
        lists.set(listName, rules);
      }
    } else if (rules !== null && (match = rRule.exec(line)) !== null) {
      const rule = unquote(match[1]);
      const attribute = rTrailingAttribute.exec(rule);
      rules.push(attribute === null ? rule : `${rule.slice(0, attribute.index)} @${attribute[1]}`);
    } else {
      throw new Error(`Invalid domain list bundle: unexpected line in "${listName}": ${line}`);
    }
  }

  if (!seenHeader) {
    throw new Error('Invalid domain list bundle: it is empty');
  }
  closeList();

  return lists;
}
