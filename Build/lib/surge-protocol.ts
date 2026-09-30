/**
 * Surge compares the value of a `PROTOCOL` rule case-sensitively and documents every
 * keyword in upper case (HTTP, HTTPS, TCP, UDP, QUIC, STUN, DOH, ...) except the one
 * added with its MTProto proxy server, `MTProto`
 * (https://manual.nssurge.com/rules/protocol-and-network.html). Upper-casing that one
 * would write a value Surge does not know.
 */
const SPELLINGS = new Map([
  ['MTPROTO', 'MTProto']
]);

/** Rulesets dedupe on the upper-cased value and write the spelling Surge documents. */
export function normalizeSurgeProtocol(protocol: string) {
  const upperCased = protocol.toUpperCase();
  return SPELLINGS.get(upperCased) ?? upperCased;
}
