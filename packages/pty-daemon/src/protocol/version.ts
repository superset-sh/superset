// Protocol versioning. Increment on breaking changes.
//
// v1: framing was [u32 len][JSON]; PTY input/output bytes were base64'd
//     inside the JSON `data` field.
// v2: framing is  [u32 totalLen][u32 jsonLen][JSON][optional payload bytes];
//     OutputMessage and InputMessage drop their `data` field and carry
//     bytes via the payload tail. (See framing.ts.)
//
// We don't keep v1 around. Phase 2 auto-update converges daemon to current
// on host-service start, so the version-skew window is bounded; any
// session lost to that one upgrade is recoverable.
export const CURRENT_PROTOCOL_VERSION = 2 as const;
export const SUPPORTED_PROTOCOL_VERSIONS: readonly number[] = [2];
