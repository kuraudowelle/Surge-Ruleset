// @ts-check
import path from 'node:path';
import process from 'node:process';

import { Api as TgApi, TelegramClient as TgClient } from 'teleproto';
import { AuthKey as TgAuthKey } from 'teleproto/crypto/AuthKey';
import { Logger as TgLogger, LogLevel as TgLogLevel } from 'teleproto/extensions/Logger';
import { ConnectionTCPAbridged as TgConnectionTCPAbridged } from 'teleproto/network/connection';
import { MemorySession as TgMemorySession } from 'teleproto/sessions';
import type { Buffer } from 'node:buffer';
import { SpanCategory, task } from './trace';
import type { Span } from './trace';
import { SHARED_DESCRIPTION } from './constants/description';
import { OUTPUT_INTERNAL_DIR, SOURCE_DIR } from './constants/dir';
import { RulesetOutput } from './lib/rules/ruleset';
import { $$fetch } from './lib/fetch-retry';
import { createReadlineInterfaceFromResponse, fetchRemoteTextLines, readFileIntoProcessedArray } from './lib/fetch-text-by-line';
import { compareAndWriteFile } from './lib/create-file';
import { fastIpVersion } from 'foxts/fast-ip-version';
import { appendArrayInPlace } from 'foxts/append-array-in-place';
import { fetchTelegramBackupEndpoints } from './lib/fetch-telegram-backup-endpoints';
import { mtprotoAuthKeyStore } from './lib/mtproto-auth-key-store';
import { parseDomainListCommunity } from './lib/domain-list-community';
import { createCymruResolver, resolveTelegramAsns } from './lib/telegram-asn';
import {
  getUncoveredEndpointCidrs,
  mergeFallbackEndpoints,
  normalizeTelegramConfig,
  TELEGRAM_BOOTSTRAP_ENDPOINTS
} from './lib/mtproto-dc-config';
import type { MTProtoDCConfig, MTProtoEndpoint } from './lib/mtproto-dc-config';

const CIDR_URL = 'https://core.telegram.org/resources/cidr.txt';
/** v2fly's community list: geosite:telegram, and the rulesets derived from it, are generated from this file */
const DOMAIN_LIST_COMMUNITY_URL = 'https://raw.githubusercontent.com/v2fly/domain-list-community/master/data/telegram';
/** Rules that the community list does not have, and PROTOCOL,MTProto */
const DOMAIN_EXTRAS_PATH = path.join(SOURCE_DIR, 'non_ip/telegram.conf');
/** The ASNs known to be Telegram's, from which the lookup starts and to which it falls back */
const KNOWN_ASNS_PATH = path.join(SOURCE_DIR, 'ip/telegram_asn.conf');

interface TelegramPrefixes {
  timestamp: number,
  ipcidr: string[],
  ipcidr6: string[]
}

// The state stays above the tasks: run as a script, a task starts the moment it is defined.
let telegramPrefixesPromise: Promise<TelegramPrefixes> | undefined;

async function fetchTelegramPrefixes(span: Span): Promise<TelegramPrefixes> {
  return span.traceChildAsync('get telegram cidr', async (childSpan) => {
    const ipcidr: string[] = [
      // Unused secret Telegram backup CIDR, announced by AS62041
      '95.161.64.0/20'
    ];
    const ipcidr6: string[] = [];

    const date = await childSpan.traceChild('fetch from official cidr list', SpanCategory.Network).traceAsyncFn(async () => {
      const resp = await $$fetch(CIDR_URL);
      const lastModified = resp.headers.get('last-modified');

      for await (const cidr of createReadlineInterfaceFromResponse(resp, true)) {
        const v = fastIpVersion(cidr);
        if (v === 4) {
          ipcidr.push(cidr);
        } else if (v === 6) {
          ipcidr6.push(cidr);
        }
      }

      return lastModified ? new Date(lastModified) : new Date();
    });

    // https://github.com/tdlib/td/blob/master/td/ConfigManager.cpp
    const backupEndpoints = await childSpan.traceChildAsync(
      'fetch backup ip',
      innerSpan => fetchTelegramBackupEndpoints(innerSpan, { includeTestServers: true })
    );
    const backupIPs = new Set(backupEndpoints.map(endpoint => endpoint.ip));

    console.log('[telegram backup ip]', `Found ${backupIPs.size} backup IPs:`, backupIPs);

    appendArrayInPlace(ipcidr, Array.from(backupIPs, i => i + '/32'));

    // Surge's MTProto server hands the rule engine the IP address it picked from the
    // DC mapping (https://manual.nssurge.com/features/mtproto.html), so the ruleset
    // has to contain every address of the mapping that Internal/mtproto-dc-config.json
    // publishes, not only what the published ranges happen to cover.
    const dcConfig = await childSpan.traceChildAsync('get MTProto DC config', getMTProtoDCConfig);
    const mapped = getUncoveredEndpointCidrs(dcConfig, ipcidr, ipcidr6);

    console.log('[telegram cidr]', `${dcConfig.options.length} DC mapping endpoints, outside the published ranges:`, mapped);

    appendArrayInPlace(ipcidr, mapped.ipv4);
    appendArrayInPlace(ipcidr6, mapped.ipv6);

    if (ipcidr.length + ipcidr6.length === 0) {
      throw new Error('Failed to fetch data!');
    }

    return { timestamp: date.getTime(), ipcidr, ipcidr6 };
  });
}

/**
 * The IP ruleset and the ASN lookup both start from the same prefixes. The tasks run
 * in the same worker, so the downloads and the MTProto handshake happen once.
 */
function getTelegramPrefixes(span: Span) {
  if (telegramPrefixesPromise) {
    return span.traceChildAsync('reuse telegram prefixes', () => telegramPrefixesPromise!, SpanCategory.Wait);
  }
  telegramPrefixesPromise = fetchTelegramPrefixes(span);
  return telegramPrefixesPromise;
}

const buildTelegramCIDR = task(require.main === module, 'build-telegram-cidr')(async (span) => {
  const { timestamp, ipcidr, ipcidr6 } = await getTelegramPrefixes(span);

  const description = [
    ...SHARED_DESCRIPTION,
    'Data from:',
    ` - ${CIDR_URL}`,
    ' - Telegram\'s DC mapping (help.getConfig and the signed backup endpoints), which Surge\'s MTProto server picks its endpoints from'
  ];

  return new RulesetOutput(span, 'telegram', 'ip')
    .withTitle('Surge Ruleset - Telegram IP CIDR')
    .withDescription(description)
    // .withDate(date) // With extra data source, we no longer use last-modified for file date
    .appendDataSource(
      `${CIDR_URL} (last updated: ${new Date(timestamp).toISOString()})`
    )
    .bulkAddCIDR4NoResolve(ipcidr)
    .bulkAddCIDR6NoResolve(ipcidr6)
    .write();
});

const buildTelegramDomains = task(require.main === module, 'build-telegram-domains')(async (span) => {
  const lines = await span.traceChildAsync(
    'fetch domain-list-community telegram',
    () => fetchRemoteTextLines(DOMAIN_LIST_COMMUNITY_URL),
    SpanCategory.Network
  );

  const { suffixes, full, skipped } = parseDomainListCommunity(lines);
  console.log('[telegram domains]', `${suffixes.length} domains and ${full.length} hostnames from domain-list-community`, skipped.length > 0 ? { skipped } : '');

  if (suffixes.length + full.length === 0) {
    throw new Error(`${DOMAIN_LIST_COMMUNITY_URL} has no domain in it!`);
  }

  return new RulesetOutput(span, 'telegram', 'non_ip')
    .withTitle('Surge Ruleset - Telegram Domains and MTProto')
    .withDescription([
      ...SHARED_DESCRIPTION,
      '',
      'This file contains domains used by Telegram Messenger, and PROTOCOL,MTProto, which matches everything that comes in through Surge\'s MTProto proxy server (Surge iOS 5.21.0+ or Mac 6.8.0+).',
      'Those connections target a Telegram IP address, not a hostname, so the domains normally cannot match them. See https://manual.nssurge.com/features/mtproto.html'
    ])
    .appendDataSource(DOMAIN_LIST_COMMUNITY_URL)
    .addFromRuleset(readFileIntoProcessedArray(DOMAIN_EXTRAS_PATH))
    .bulkAddDomainSuffix(suffixes)
    .bulkAddDomain(full)
    .write();
});

const rKnownAsn = /^IP-ASN,(\d+)\s*(?:#.*)?$/;

async function readKnownTelegramAsns() {
  const lines = await readFileIntoProcessedArray(KNOWN_ASNS_PATH);
  const asns: string[] = [];

  for (let i = 0, len = lines.length; i < len; i++) {
    const match = rKnownAsn.exec(lines[i]);
    if (!match) {
      throw new Error(`Unexpected line in ${KNOWN_ASNS_PATH}: ${lines[i]}`);
    }
    asns.push(match[1]);
  }

  return asns;
}

const buildTelegramASN = task(require.main === module, 'build-telegram-asn')(async (span) => {
  const [{ ipcidr, ipcidr6 }, knownAsns] = await Promise.all([
    getTelegramPrefixes(span),
    readKnownTelegramAsns()
  ]);

  const { asns, discovery, error } = await span.traceChildAsync(
    'discover telegram ASNs',
    () => resolveTelegramAsns([...ipcidr, ...ipcidr6], knownAsns, createCymruResolver()),
    SpanCategory.Network
  );

  if (discovery) {
    console.log(
      '[telegram asn]',
      `${asns.length} ASNs, ${discovery.origins.length} of which announce the published prefixes:`,
      asns.map(asn => `AS${asn} ${discovery.names.get(asn)}`)
    );

    const dropped = knownAsns.filter(asn => !asns.includes(asn));
    if (dropped.length > 0) {
      console.warn('[telegram asn]', 'Known ASNs that are not registered to Telegram (any more) and were left out:', dropped.map(asn => [asn, discovery.names.get(asn) ?? null]));
    }
  } else {
    console.error('[telegram asn]', 'ASN lookup failed, using the known ASNs as they are', error);
  }

  return new RulesetOutput(span, 'telegram_asn', 'ip')
    .withTitle('Surge Ruleset - Telegram ASN')
    .withDescription([
      ...SHARED_DESCRIPTION,
      '',
      'This file contains ASN owned/used by Telegram Messenger.',
      'The ASNs are found by looking up which ASNs announce the prefixes Telegram publishes (see ip/telegram) in Team Cymru\'s IP to ASN mapping (https://team-cymru.com/community-services/ip-asn-mapping/), and are kept as long as the AS is registered under the name of Telegram.',
      'Note that unlike "ip/telegram" file which is based on officially released list by Telegram themselves. Use this file at your own risk.'
    ])
    .bulkAddIPASN(asns)
    .write();
});

const TELEGRAM_API_ID = 2040;
const OUTPUT_PATH = path.join(OUTPUT_INTERNAL_DIR, 'mtproto-dc-config.json');

/**
 * How long a connect + help.getConfig with a persisted auth key may take before
 * we give the key up. Normally 0.5-1.5s. It has to be a hard deadline: when a DC
 * has forgotten the key it answers with transport error -404, and GramJS merely
 * logs "Broken authorization key" and fires a connection-state event -- the
 * pending request promise never settles.
 */
const PERSISTED_AUTH_KEY_TIMEOUT = 5000;

class PersistedAuthKeyTimeoutError extends Error {
  constructor(dcId: number, options?: ErrorOptions) {
    super(`No help.getConfig response within ${PERSISTED_AUTH_KEY_TIMEOUT}ms using the persisted auth key for dc${dcId}`, options);
    this.name = 'PersistedAuthKeyTimeoutError';
  }
}

/**
 * One connect + help.getConfig against a DC. With a persisted auth key the
 * connect skips the DH handshake (three round trips); without one, GramJS
 * negotiates a key and we persist it for the next build.
 */
async function fetchConfig(host: string, port: number, dcId: number, persistedAuthKey: Buffer | null) {
  const session = new TgMemorySession();
  session.setDC(dcId, host, port);
  if (persistedAuthKey) {
    const authKey = new TgAuthKey();
    await authKey.setKey(persistedAuthKey);
    session.setAuthKey(authKey, dcId);
  }

  const client = new TgClient(session, TELEGRAM_API_ID, 'not-used-for-unauthenticated-rpc', {
    appVersion: '1.0',
    autoReconnect: false,
    baseLogger: new TgLogger(TgLogLevel.NONE),
    connection: TgConnectionTCPAbridged,
    connectionRetries: 1,
    deviceModel: 'Surge',
    langCode: 'en',
    reconnectRetries: 0,
    requestRetries: 1,
    securityChecks: true,
    systemLangCode: 'en',
    systemVersion: process.platform,
    timeout: 10
  });

  const work = async () => {
    const connected = await client.connect();
    if (!connected && !client.connected) {
      throw new Error('MTProto client did not connect');
    }

    const config = normalizeTelegramConfig(await client.invoke(new TgApi.help.GetConfig()));

    if (!persistedAuthKey) {
      const negotiated = client.session.authKey?.getKey();
      if (negotiated) {
        await mtprotoAuthKeyStore.save(dcId, negotiated);
      }
    }

    return config;
  };

  let timer: NodeJS.Timeout | null = null;
  try {
    if (!persistedAuthKey) {
      return await work();
    }
    return await Promise.race([
      work(),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(reject, PERSISTED_AUTH_KEY_TIMEOUT, new PersistedAuthKeyTimeoutError(dcId));
      })
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
    // destroy, not disconnect: a sender stuck on a rejected key must not keep the
    // process alive after we have moved on to a fresh handshake
    await client.destroy();
  }
}

async function fetchConfigFromEndpoint(span: Span, endpoint: MTProtoEndpoint) {
  const label = `${endpoint.ip}:${endpoint.port}`;

  const persistedAuthKey = await mtprotoAuthKeyStore.load(endpoint.dcId);
  if (persistedAuthKey) {
    try {
      return await span.traceChildAsync(
        `help.getConfig via ${label} (persisted auth key)`,
        () => fetchConfig(endpoint.ip, endpoint.port, endpoint.dcId, persistedAuthKey),
        SpanCategory.Network
      );
    } catch (error) {
      // Most likely the DC no longer knows this key, which surfaces as the
      // timeout above (see PERSISTED_AUTH_KEY_TIMEOUT). Whatever it was, a key
      // that fails once is not worth a second try: fall through to a fresh handshake.
      console.warn(`[telegram mtproto config] ${label} failed with the persisted auth key for dc${endpoint.dcId}, renegotiating`, error);
      await mtprotoAuthKeyStore.drop(endpoint.dcId);
    }
  }

  return span.traceChildAsync(
    `help.getConfig via ${label} (fresh handshake)`,
    () => fetchConfig(endpoint.ip, endpoint.port, endpoint.dcId, null),
    SpanCategory.Network
  );
}

async function fetchConfigFromBootstrapEndpoints(span: Span) {
  let lastError: unknown;

  for (let i = 0, len = TELEGRAM_BOOTSTRAP_ENDPOINTS.length; i < len; i++) {
    const endpoint = TELEGRAM_BOOTSTRAP_ENDPOINTS[i];
    console.log(`[telegram mtproto config] Fetching help.getConfig from ${endpoint.ip}:${endpoint.port}`);
    try {
      // Bootstrap order is significant, and one successful response ends the loop.
      // eslint-disable-next-line no-await-in-loop -- Bootstrap endpoints must be attempted in order.
      return await fetchConfigFromEndpoint(span, endpoint);
    } catch (error) {
      lastError = error;
      console.error(`[telegram mtproto config] ${endpoint.ip}:${endpoint.port} failed`, error);
    }
  }

  throw new AggregateError(
    lastError === undefined ? [] : [lastError],
    'All Telegram MTProto bootstrap endpoints failed'
  );
}

async function fetchMTProtoDCConfig(span: Span) {
  const config = await span.traceChildAsync(
    'fetch help.getConfig',
    fetchConfigFromBootstrapEndpoints,
    SpanCategory.Network
  );

  const backupEndpoints = await span.traceChildAsync(
    'fetch telegram backup endpoints',
    childSpan => fetchTelegramBackupEndpoints(childSpan, { includeTestServers: false })
  );

  const liveEndpoints = config.options.length;
  const mergeResult = mergeFallbackEndpoints(config, backupEndpoints);
  console.log('[telegram mtproto config]', {
    liveEndpoints,
    backupEndpoints: backupEndpoints.length,
    ...mergeResult,
    outputEndpoints: config.options.length
  });

  return config;
}

let mtprotoDCConfigPromise: Promise<MTProtoDCConfig> | undefined;

/**
 * Both tasks need the merged DC mapping: buildMTProtoDCConfig publishes it and
 * buildTelegramCIDR puts every address of it into the ruleset. They run in the
 * same worker, so the handshake and the backup lookups happen once.
 */
function getMTProtoDCConfig(span: Span) {
  if (mtprotoDCConfigPromise) {
    return span.traceChildAsync('reuse MTProto DC config', () => mtprotoDCConfigPromise!, SpanCategory.Wait);
  }
  mtprotoDCConfigPromise = fetchMTProtoDCConfig(span);
  return mtprotoDCConfigPromise;
}

export const buildMTProtoDCConfig = task(require.main === module, 'build-mtproto-dc-config')(async (span) => {
  const config = await getMTProtoDCConfig(span);

  const output = JSON.stringify(config satisfies MTProtoDCConfig, null, 2).split('\n');
  await compareAndWriteFile(span, output, OUTPUT_PATH);
});

// Start both tasks in this worker concurrently. They retain independent trace
// results while sharing the module-scoped production backup endpoint promise and
// the merged DC mapping.
export function buildTelegram() {
  return Promise.all([
    buildTelegramDomains(),
    buildTelegramCIDR(),
    buildTelegramASN(),
    buildMTProtoDCConfig()
  ]);
}
