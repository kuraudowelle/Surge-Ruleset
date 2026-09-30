/**
 * Surge documents the protocol values of `PROTOCOL` rules in upper case (HTTP,
 * QUIC, STUN, ...), except for the one added with its MTProto proxy server, which
 * the manual spells `PROTOCOL,MTProto` (https://manual.nssurge.com/features/mtproto.html).
 */
const SPELLINGS = new Map([
  ['MTPROTO', 'MTProto']
]);

/** Rulesets dedupe on the upper-cased value and write the spelling Surge documents. */
export function normalizeSurgeProtocol(protocol: string) {
  const upperCased = protocol.toUpperCase();
  return SPELLINGS.get(upperCased) ?? upperCased;
}
