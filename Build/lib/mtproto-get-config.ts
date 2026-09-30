import type { Buffer } from 'node:buffer';
import process from 'node:process';

import { Api as TgApi, TelegramClient as TgClient } from 'teleproto';
import { AuthKey as TgAuthKey } from 'teleproto/crypto/AuthKey';
import { Logger as TgLogger, LogLevel as TgLogLevel } from 'teleproto/extensions/Logger';
import { ConnectionTCPAbridged as TgConnectionTCPAbridged } from 'teleproto/network/connection';
import { MemorySession as TgMemorySession } from 'teleproto/sessions';

import { mtprotoAuthKeyStore } from './mtproto-auth-key-store';
import type { MTProtoAuthKeyStore } from './mtproto-auth-key-store';
import { normalizeTelegramConfig } from './mtproto-dc-config';
import type { MTProtoDCConfig, MTProtoEndpoint } from './mtproto-dc-config';

const TELEGRAM_API_ID = 2040;

/**
 * How long a connect + help.getConfig with a persisted auth key may take before
 * we give the key up. Normally 0.5-1.5s. It has to be a hard deadline: when a DC
 * has forgotten the key it answers with transport error -404, and GramJS merely
 * logs "Broken authorization key" and fires a connection-state event -- the
 * pending request promise never settles.
 */
export const PERSISTED_AUTH_KEY_TIMEOUT = 5000;

/**
 * How long a connect + a fresh handshake + help.getConfig may take. The handshake is
 * three round trips and some arithmetic, a healthy DC answers within a few seconds.
 * It has to be a hard deadline too: the `timeout` of the client is the one of the TCP
 * connection, and a server that accepts the connection and then says nothing leaves
 * the handshake waiting for ever, with the build waiting for it.
 */
export const FRESH_HANDSHAKE_TIMEOUT = 20000;

export class MTProtoTimeoutError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'MTProtoTimeoutError';
  }
}

export interface FetchConfigOptions {
  /** How long the whole of it may take, the connection included. The default depends on the auth key */
  timeoutMs?: number,
  /** Where an auth key that was negotiated is kept for the next build */
  authKeyStore?: MTProtoAuthKeyStore
}

/**
 * One connect + help.getConfig against a DC. With a persisted auth key the
 * connect skips the DH handshake (three round trips); without one, GramJS
 * negotiates a key and we persist it for the next build.
 *
 * Either way it ends within the deadline, and the connection is closed when it does,
 * so that a DC that does not answer costs the deadline and not the build.
 */
export async function fetchConfig(host: string, port: number, dcId: number, persistedAuthKey: Buffer | null, options: FetchConfigOptions = {}): Promise<MTProtoDCConfig> {
  const timeoutMs = options.timeoutMs ?? (persistedAuthKey ? PERSISTED_AUTH_KEY_TIMEOUT : FRESH_HANDSHAKE_TIMEOUT);
  const authKeyStore = options.authKeyStore ?? mtprotoAuthKeyStore;

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
        await authKeyStore.save(dcId, negotiated);
      }
    }

    return config;
  };

  const timeoutError = new MTProtoTimeoutError(
    `No help.getConfig response within ${timeoutMs}ms ${persistedAuthKey ? 'using the persisted auth key' : 'from a fresh handshake'} for dc${dcId}`
  );
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      work(),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(reject, timeoutMs, timeoutError);
      })
    ]);
  } finally {
    clearTimeout(timer);
    // destroy, not disconnect: a sender stuck on a rejected key, or on a handshake that
    // gets no answer, must not keep the process alive after we have moved on
    await client.destroy();
  }
}

/**
 * Asks the endpoints one after the other, and takes the first answer. An endpoint that does
 * not answer costs its deadline (see fetchConfig), and the next one is asked.
 */
export async function fetchFromEndpoints<T>(endpoints: readonly MTProtoEndpoint[], fetchFrom: (endpoint: MTProtoEndpoint) => Promise<T>): Promise<T> {
  let lastError: unknown;

  for (let i = 0, len = endpoints.length; i < len; i++) {
    const endpoint = endpoints[i];
    console.log(`[telegram mtproto config] Fetching help.getConfig from ${endpoint.ip}:${endpoint.port}`);
    try {
      // Bootstrap order is significant, and one successful response ends the loop.
      // eslint-disable-next-line no-await-in-loop -- Bootstrap endpoints must be attempted in order.
      return await fetchFrom(endpoint);
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
