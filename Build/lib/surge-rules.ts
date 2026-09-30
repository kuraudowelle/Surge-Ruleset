import net from 'node:net';
import { ip2bigint, parse as parseCidr } from 'fast-cidr-tools';
import { escapeRegexp } from 'fast-escape-regexp';
import { extractErrorMessage } from 'foxts/extract-error-message';

/**
 * A first-match simulation of the rules that this project publishes: which ruleset does a request match first,
 * when the rulesets stand in the order of a Rule section? Surge tries the rules from the top of the section,
 * the first that matches decides, and the ones after it are ignored (https://manual.nssurge.com/rules/overview.html).
 * Which ruleset that is depends on the order only, never on the policies, so this does not know about policies.
 *
 * What it evaluates, as the manual says (https://manual.nssurge.com/rules/):
 *
 *   DOMAIN, DOMAIN-SUFFIX, DOMAIN-KEYWORD, DOMAIN-WILDCARD   the hostname of the request. In a DOMAIN-SET a line is a
 *                                                            hostname, and a line with a dot in front of it is a suffix
 *   PROCESS-NAME                                             the name of the process: case-sensitive, `*` and `?`
 *   USER-AGENT                                               the User-Agent of the request: case-sensitive, `*` and `?`
 *   PROTOCOL                                                 the protocol, case-sensitive; TCP takes HTTP, HTTPS and
 *                                                            MTProto, UDP takes QUIC and STUN
 *   DEST-PORT, SRC-IP                                        a port, a range or a comparison; an address or a range
 *   IP-CIDR, IP-CIDR6                                        the address of the destination, when the request has one
 *   AND, OR, NOT                                             over the rules above
 *
 * What it does not evaluate. A rule of a type that it cannot evaluate never matches, and `RuleSet.unsupported` says
 * how many there are of each type, so that a test can tell whether a list has more than it can see:
 *
 *   URL-REGEX, IP-ASN, GEOIP, and every other type that is not in the list above
 *   PROCESS-NAME with a path (a value that starts with a slash)
 *
 * And what is not simulated at all, whatever the rules say:
 *
 *   extended-matching   the TLS SNI and the Host header are not a part of a request here
 *   no-resolve          a hostname is never resolved: an IP rule sees the address that the request brings, if it has one
 *   pre-matching        is a priority of the order (see firstMatch), it does not check the policy or the type of the rules
 *   FINAL, SCRIPT, and a RULE-SET inside a rule set
 *
 * A request only has what a test gives it, and a rule that needs more than that does not match: a probe without a
 * process cannot match a PROCESS-NAME rule, which is why the same hostname can match another ruleset from another process.
 */
export interface Request {
  hostname?: string,
  /** The name of the executable, like `Safari` or `aria2c` */
  process?: string,
  userAgent?: string,
  /** `HTTP`, `HTTPS`, `MTProto`, ... */
  protocol?: string,
  destPort?: number,
  srcIp?: string,
  destIp?: string
}

/** The rule types that a RuleSet can evaluate. */
export const SUPPORTED_RULE_TYPES = [
  'DOMAIN', 'DOMAIN-SUFFIX', 'DOMAIN-KEYWORD', 'DOMAIN-WILDCARD',
  'PROCESS-NAME', 'USER-AGENT',
  'PROTOCOL', 'DEST-PORT', 'SRC-IP',
  'IP-CIDR', 'IP-CIDR6',
  'AND', 'OR', 'NOT'
] as const;

type Condition = (request: Request) => boolean;

const rComparison = /^(>=|<=|>|<)(\d+)$/;
const rRange = /^(\d+)-(\d+)$/;
const rPort = /^\d+$/;

const PROTOCOL_MEMBERS = new Map([
  ['TCP', ['HTTP', 'HTTPS', 'MTProto']],
  ['UDP', ['QUIC', 'STUN']]
]);

export interface RuleSetOptions {
  /** The file is a DOMAIN-SET: a hostname on every line, and a line with a dot in front of it is a suffix */
  domainSet?: boolean
}

export interface RuleMatch {
  /** The name that the ruleset was given */
  ruleset: string,
  /** The line of the rule in the file, counted from 1 */
  line: number,
  /** The rule as it is written in the file */
  rule: string
}

export interface OrderedRuleSet {
  ruleSet: RuleSet,
  /** A rule set with `pre-matching` is matched before all the others, wherever it stands */
  preMatching?: boolean
}

export class RuleSet {
  /** Every rule type that the file uses, whether this can evaluate it or not */
  readonly types = new Set<string>();
  /** The types that this cannot evaluate, with the number of rules of each: they never match */
  readonly unsupported = new Map<string, number>();
  /** The number of rules of the file: a line of a DOMAIN-SET counts, and a comment or a blank line does not */
  readonly size: number;

  private readonly lines: string[];
  private readonly exact = new Map<string, number>();
  private readonly suffix = new Map<string, number>();
  private readonly keywords: Array<[keyword: string, line: number]> = [];
  private readonly wildcards: Array<[pattern: RegExp, line: number]> = [];
  private readonly conditions: Array<[condition: Condition, line: number]> = [];

  constructor(readonly name: string, content: string, options: RuleSetOptions = {}) {
    this.lines = content.split('\n');

    let size = 0;
    for (let i = 0, len = this.lines.length; i < len; i++) {
      const text = this.lines[i].trim();
      if (text.length === 0 || text[0] === '#') {
        continue;
      }
      const line = i + 1;
      size++;

      if (options.domainSet) {
        if (text[0] === '.') {
          this.suffix.set(text.slice(1).toLowerCase(), line);
        } else {
          this.exact.set(text.toLowerCase(), line);
        }
        continue;
      }

      try {
        this.addRule(text, line);
      } catch (error) {
        throw new SyntaxError(`${name}:${line}: ${extractErrorMessage(error, false) ?? 'unreadable'}: ${text}`, { cause: error });
      }
    }
    this.size = size;
  }

  private addRule(text: string, line: number) {
    const comma = text.indexOf(',');
    if (comma === -1) {
      throw new SyntaxError('not a rule');
    }
    const type = text.slice(0, comma);
    const rest = text.slice(comma + 1);
    this.types.add(type);

    if (type === 'AND' || type === 'OR' || type === 'NOT') {
      const condition = parseLogical(type, rest);
      if (condition === null) {
        this.unsupported.set(type, (this.unsupported.get(type) ?? 0) + 1);
      } else {
        this.conditions.push([condition, line]);
      }
      return;
    }

    const value = valueOf(rest);
    switch (type) {
      case 'DOMAIN':
        this.exact.set(value.toLowerCase(), line);
        break;
      case 'DOMAIN-SUFFIX':
        this.suffix.set(value.toLowerCase(), line);
        break;
      case 'DOMAIN-KEYWORD':
        this.keywords.push([value.toLowerCase(), line]);
        break;
      case 'DOMAIN-WILDCARD':
        this.wildcards.push([wildcardToRegExp(value.toLowerCase()), line]);
        break;
      default: {
        const condition = buildCondition(type, value);
        if (condition === null) {
          this.unsupported.set(type, (this.unsupported.get(type) ?? 0) + 1);
        } else {
          this.conditions.push([condition, line]);
        }
      }
    }
  }

  /** The first rule of the file that the request matches, or null */
  match(request: Request): { line: number, rule: string } | null {
    let first = 0;
    const found = (line: number | undefined) => {
      if (line !== undefined && (first === 0 || line < first)) {
        first = line;
      }
    };

    if (request.hostname !== undefined) {
      const hostname = request.hostname.toLowerCase();
      found(this.exact.get(hostname));
      // the domain itself and every parent of it: a DOMAIN-SUFFIX matches the domain and its subdomains
      let start = 0;
      while (start !== -1) {
        found(this.suffix.get(hostname.slice(start)));
        const dot = hostname.indexOf('.', start);
        start = dot === -1 ? -1 : dot + 1;
      }
      for (let i = 0, len = this.keywords.length; i < len; i++) {
        if (hostname.includes(this.keywords[i][0])) {
          found(this.keywords[i][1]);
        }
      }
      for (let i = 0, len = this.wildcards.length; i < len; i++) {
        if (this.wildcards[i][0].test(hostname)) {
          found(this.wildcards[i][1]);
        }
      }
    }

    for (let i = 0, len = this.conditions.length; i < len; i++) {
      if (this.conditions[i][0](request)) {
        found(this.conditions[i][1]);
      }
    }

    return first === 0 ? null : { line: first, rule: this.lines[first - 1].trim() };
  }
}

function ordered(rulesets: readonly OrderedRuleSet[]) {
  const pre: OrderedRuleSet[] = [];
  const rest: OrderedRuleSet[] = [];
  for (let i = 0, len = rulesets.length; i < len; i++) {
    (rulesets[i].preMatching ? pre : rest).push(rulesets[i]);
  }
  return pre.concat(rest);
}

/** Every ruleset that the request matches, in the order in which Surge tries them: the first is the one that decides */
export function allMatches(rulesets: readonly OrderedRuleSet[], request: Request): RuleMatch[] {
  const matches: RuleMatch[] = [];
  const tried = ordered(rulesets);
  for (let i = 0, len = tried.length; i < len; i++) {
    const hit = tried[i].ruleSet.match(request);
    if (hit !== null) {
      matches.push({ ruleset: tried[i].ruleSet.name, ...hit });
    }
  }
  return matches;
}

/** The ruleset that decides for the request, or null when nothing matches and FINAL decides */
export function firstMatch(rulesets: readonly OrderedRuleSet[], request: Request): RuleMatch | null {
  const tried = ordered(rulesets);
  for (let i = 0, len = tried.length; i < len; i++) {
    const hit = tried[i].ruleSet.match(request);
    if (hit !== null) {
      return { ruleset: tried[i].ruleSet.name, ...hit };
    }
  }
  return null;
}

/** `*` is any number of characters, dots included, and `?` is exactly one */
function wildcardToRegExp(pattern: string) {
  let source = '';
  for (let i = 0, len = pattern.length; i < len; i++) {
    const char = pattern[i];
    source += char === '*' ? '.*' : (char === '?' ? '.' : escapeRegexp(char));
  }
  return new RegExp(`^${source}$`, 's');
}

/** A rule is `TYPE,value` and may go on with options (`no-resolve`): the value is what stands before the next comma */
function valueOf(rest: string) {
  const comma = rest.indexOf(',');
  const value = (comma === -1 ? rest : rest.slice(0, comma)).trim();
  if (value.length === 0) {
    throw new SyntaxError('no value');
  }
  return value;
}

function parsePort(value: string): (port: number) => boolean {
  const compare = rComparison.exec(value);
  if (compare) {
    const limit = Number(compare[2]);
    switch (compare[1]) {
      case '>': return port => port > limit;
      case '>=': return port => port >= limit;
      case '<': return port => port < limit;
      default: return port => port <= limit;
    }
  }
  const range = rRange.exec(value);
  if (range) {
    const from = Number(range[1]);
    const to = Number(range[2]);
    return port => port >= from && port <= to;
  }
  if (rPort.test(value)) {
    const only = Number(value);
    return port => port === only;
  }
  throw new SyntaxError('not a port, a range or a comparison');
}

/** The addresses of `10.0.0.0/8`, or of a single address, as numbers */
function parseRange(value: string): [start: bigint, end: bigint, version: 4 | 6] {
  const version = net.isIP(value.includes('/') ? value.slice(0, value.indexOf('/')) : value);
  if (version === 0) {
    throw new SyntaxError('not an address or a range');
  }
  return parseCidr(value.includes('/') ? value : `${value}/${version === 4 ? 32 : 128}`);
}

function inRange(range: [start: bigint, end: bigint, version: 4 | 6], address: string | undefined) {
  if (address === undefined) {
    return false;
  }
  if (net.isIP(address) !== range[2]) {
    return false;
  }
  const number = ip2bigint(address, range[2]);
  return number >= range[0] && number <= range[1];
}

/** A condition for one rule that is not a DOMAIN-*, or null when this cannot evaluate the type */
function buildCondition(type: string, value: string): Condition | null {
  switch (type) {
    case 'DOMAIN':
      return request => request.hostname?.toLowerCase() === value.toLowerCase();
    case 'DOMAIN-SUFFIX': {
      const suffix = value.toLowerCase();
      return (request) => {
        const hostname = request.hostname?.toLowerCase();
        return hostname !== undefined && (hostname === suffix || hostname.endsWith(`.${suffix}`));
      };
    }
    case 'DOMAIN-KEYWORD':
      return request => request.hostname?.toLowerCase().includes(value.toLowerCase()) === true;
    case 'DOMAIN-WILDCARD': {
      const pattern = wildcardToRegExp(value.toLowerCase());
      return request => request.hostname !== undefined && pattern.test(request.hostname.toLowerCase());
    }
    case 'PROCESS-NAME': {
      // a path (or an app bundle) is not the name of the executable
      if (value[0] === '/') {
        return null;
      }
      const pattern = wildcardToRegExp(value);
      return request => request.process !== undefined && pattern.test(request.process);
    }
    case 'USER-AGENT': {
      const pattern = wildcardToRegExp(value);
      return request => request.userAgent !== undefined && pattern.test(request.userAgent);
    }
    case 'PROTOCOL': {
      const members = PROTOCOL_MEMBERS.get(value);
      return request => request.protocol !== undefined && (request.protocol === value || (members?.includes(request.protocol) ?? false));
    }
    case 'DEST-PORT': {
      const test = parsePort(value);
      return request => request.destPort !== undefined && test(request.destPort);
    }
    case 'SRC-IP': {
      const range = parseRange(value);
      return request => inRange(range, request.srcIp);
    }
    case 'IP-CIDR':
    case 'IP-CIDR6': {
      const range = parseRange(value);
      return request => inRange(range, request.destIp);
    }
    default:
      return null;
  }
}

/** `((A,x),(B,y))` for AND and OR, `((A,x))` for NOT: the sub-rules, each in parentheses, without a policy */
function splitSubRules(text: string): string[] {
  const trimmed = text.trim();
  if (trimmed[0] !== '(') {
    throw new SyntaxError('a logical rule needs its sub-rules in parentheses');
  }

  const groups: string[] = [];
  let depth = 0;
  let start = -1;
  let end = -1;
  for (let i = 0, len = trimmed.length; i < len; i++) {
    if (trimmed[i] === '(') {
      depth++;
      if (depth === 2) {
        start = i + 1;
      }
    } else if (trimmed[i] === ')') {
      if (depth === 2) {
        groups.push(trimmed.slice(start, i));
      }
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  if (end === -1 || groups.length === 0) {
    throw new SyntaxError('the parentheses of a logical rule do not match');
  }
  return groups;
}

/** One sub-rule, `TYPE,value` or a logical rule again, or null when it holds a type that this cannot evaluate */
function parseSubRule(text: string): Condition | null {
  const comma = text.indexOf(',');
  if (comma === -1) {
    throw new SyntaxError('not a rule');
  }
  const type = text.slice(0, comma);
  const rest = text.slice(comma + 1);
  if (type === 'AND' || type === 'OR' || type === 'NOT') {
    return parseLogical(type, rest);
  }
  return buildCondition(type, valueOf(rest));
}

function parseLogical(type: 'AND' | 'OR' | 'NOT', rest: string): Condition | null {
  const subRules = splitSubRules(rest).map(parseSubRule);
  if (subRules.includes(null)) {
    return null;
  }
  const conditions = subRules as Condition[];

  switch (type) {
    case 'AND':
      return request => conditions.every(condition => condition(request));
    case 'OR':
      return request => conditions.some(condition => condition(request));
    default:
      if (conditions.length !== 1) {
        throw new SyntaxError('NOT takes exactly one sub-rule');
      }
      return request => !conditions[0](request);
  }
}
