import net from 'node:net';
import { Buffer } from 'node:buffer';
import { afterEach, describe, it } from 'mocha';
import { expect } from 'earl';
import { noop } from 'foxts/noop';
import { wait } from 'foxts/wait';

import { FRESH_HANDSHAKE_TIMEOUT, MTProtoTimeoutError, PERSISTED_AUTH_KEY_TIMEOUT, fetchConfig, fetchFromEndpoints } from './mtproto-get-config';
import type { MTProtoAuthKeyStore } from './mtproto-auth-key-store';
import type { MTProtoEndpoint } from './mtproto-dc-config';

/** A server that accepts a connection and then says nothing, which is what leaves a handshake waiting */
class SilentServer {
  accepted = 0;
  closed = 0;
  received = 0;
  port = 0;

  private readonly sockets = new Set<net.Socket>();

  private readonly server = net.createServer((socket) => {
    this.accepted++;
    this.sockets.add(socket);
    socket.on('data', (data) => {
      this.received += data.length;
    });
    socket.on('close', () => {
      this.closed++;
      this.sockets.delete(socket);
    });
    // the client closing the connection is what these tests look for
    socket.on('error', noop);
  });

  start() {
    return new Promise<this>((resolve) => {
      this.server.listen(0, '127.0.0.1', () => {
        this.port = (this.server.address() as net.AddressInfo).port;
        resolve(this);
      });
    });
  }

  stop() {
    return new Promise<void>((resolve) => {
      this.server.close(() => resolve());
      this.sockets.forEach(socket => socket.destroy());
    });
  }

  endpoint(dcId: number): MTProtoEndpoint {
    return { dcId, ip: '127.0.0.1', port: this.port };
  }

  /** The close of a connection reaches the server a moment after the client has closed it */
  async untilClosed(closed: number) {
    for (let i = 0; i < 100 && this.closed < closed; i++) {
      // eslint-disable-next-line no-await-in-loop -- polling
      await wait(10);
    }
    return this.closed;
  }
}

const authKeyStore: MTProtoAuthKeyStore = {
  load: () => Promise.resolve(null),
  save: () => Promise.reject(new Error('nothing was negotiated, so nothing is saved')),
  drop: () => Promise.resolve()
};

async function rejection(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error('It did not reject');
}

async function quietly<T>(work: () => Promise<T>) {
  const { log, error } = console;
  console.log = noop;
  console.error = noop;
  try {
    return await work();
  } finally {
    console.log = log;
    console.error = error;
  }
}

describe('fetchConfig', () => {
  const servers: SilentServer[] = [];
  const silent = async () => {
    const server = await new SilentServer().start();
    servers.push(server);
    return server;
  };

  afterEach(async () => {
    await Promise.all(servers.splice(0).map(server => server.stop()));
  });

  it('gives up on a fresh handshake that gets no answer, within the deadline, and closes the connection', async function () {
    this.timeout(5000);
    const server = await silent();

    const started = Date.now();
    const error = await rejection(fetchConfig('127.0.0.1', server.port, 2, null, { timeoutMs: 300, authKeyStore }));
    const elapsed = Date.now() - started;

    expect(error).toBeA(MTProtoTimeoutError);
    expect((error as Error).message).toEqual('No help.getConfig response within 300ms from a fresh handshake for dc2');
    expect(elapsed).toBeGreaterThanOrEqual(250);
    expect(elapsed).toBeLessThan(3000);
    // the server took the connection, the client began the handshake, and closed the connection when it gave up
    expect(server.accepted).toEqual(1);
    expect(server.received).toBeGreaterThan(0);
    expect(await server.untilClosed(1)).toEqual(1);
  });

  it('gives up on a persisted auth key that gets no answer in the same way', async function () {
    this.timeout(5000);
    const server = await silent();

    const error = await rejection(fetchConfig('127.0.0.1', server.port, 4, Buffer.alloc(256, 7), { timeoutMs: 300, authKeyStore }));

    expect(error).toBeA(MTProtoTimeoutError);
    expect((error as Error).message).toEqual('No help.getConfig response within 300ms using the persisted auth key for dc4');
    expect(server.accepted).toEqual(1);
    expect(await server.untilClosed(1)).toEqual(1);
  });

  it('has a deadline for both, that ends the build instead of waiting for ever', () => {
    expect(PERSISTED_AUTH_KEY_TIMEOUT).toEqual(5000);
    expect(FRESH_HANDSHAKE_TIMEOUT).toBeGreaterThanOrEqual(PERSISTED_AUTH_KEY_TIMEOUT);
    expect(FRESH_HANDSHAKE_TIMEOUT).toBeLessThanOrEqual(60000);
  });

  it('does not keep a connection open for an endpoint that is not there', async function () {
    this.timeout(5000);
    const server = await silent();
    const port = server.port;
    await server.stop();
    servers.length = 0;

    const error = await rejection(fetchConfig('127.0.0.1', port, 2, null, { timeoutMs: 1500, authKeyStore }));
    expect(error).toBeA(Error);
    expect(error).not.toBeA(MTProtoTimeoutError);
  });

  it('goes on with the next endpoint when one does not answer, and closes the connection of every one', async function () {
    this.timeout(8000);
    const first = await silent();
    const second = await silent();

    const error = await quietly(() => rejection(fetchFromEndpoints(
      [first.endpoint(2), second.endpoint(4)],
      endpoint => fetchConfig(endpoint.ip, endpoint.port, endpoint.dcId, null, { timeoutMs: 300, authKeyStore })
    )));

    expect(error).toBeA(AggregateError);
    expect((error as Error).message).toEqual('All Telegram MTProto bootstrap endpoints failed');
    expect((error as AggregateError).errors).toHaveLength(1);
    expect((error as AggregateError).errors[0]).toBeA(MTProtoTimeoutError);
    expect(first.accepted).toEqual(1);
    expect(second.accepted).toEqual(1);
    expect(await first.untilClosed(1)).toEqual(1);
    expect(await second.untilClosed(1)).toEqual(1);
  });
});

describe('fetchFromEndpoints', () => {
  const endpoints: MTProtoEndpoint[] = [
    { dcId: 1, ip: '192.0.2.1', port: 443 },
    { dcId: 2, ip: '192.0.2.2', port: 443 },
    { dcId: 3, ip: '192.0.2.3', port: 443 }
  ];

  it('takes the first answer, in the order of the endpoints, and asks no more', async () => {
    const asked: number[] = [];
    const result = await quietly(() => fetchFromEndpoints(endpoints, (endpoint) => {
      asked.push(endpoint.dcId);
      return endpoint.dcId === 1 ? Promise.reject(new MTProtoTimeoutError('no answer')) : Promise.resolve(`config of dc${endpoint.dcId}`);
    }));

    expect(result).toEqual('config of dc2');
    expect(asked).toEqual([1, 2]);
  });

  it('fails with the last error when no endpoint answers', async () => {
    const asked: number[] = [];
    const error = await quietly(() => rejection(fetchFromEndpoints(endpoints, (endpoint) => {
      asked.push(endpoint.dcId);
      return Promise.reject(new Error(`dc${endpoint.dcId} failed`));
    })));

    expect(asked).toEqual([1, 2, 3]);
    expect(error).toBeA(AggregateError);
    expect((error as AggregateError).errors.map((cause: Error) => cause.message)).toEqual(['dc3 failed']);
  });

  it('fails when there is no endpoint to ask', async () => {
    const error = await quietly(() => rejection(fetchFromEndpoints([], () => Promise.resolve('never'))));
    expect(error).toBeA(AggregateError);
    expect((error as AggregateError).errors).toEqual([]);
  });
});
