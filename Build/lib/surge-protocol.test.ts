import { describe, it } from 'mocha';
import { expect } from 'earl';

import { normalizeSurgeProtocol } from './surge-protocol';

describe('normalizeSurgeProtocol', () => {
  it('upper-cases the protocols Surge documents in upper case', () => {
    expect(normalizeSurgeProtocol('udp')).toEqual('UDP');
    expect(normalizeSurgeProtocol('Quic')).toEqual('QUIC');
    expect(normalizeSurgeProtocol('STUN')).toEqual('STUN');
  });

  it('writes MTProto the way the manual spells it, whatever the input spelling', () => {
    expect(normalizeSurgeProtocol('MTProto')).toEqual('MTProto');
    expect(normalizeSurgeProtocol('mtproto')).toEqual('MTProto');
    expect(normalizeSurgeProtocol('MTPROTO')).toEqual('MTProto');
  });
});
