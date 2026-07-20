// Protocol versioning. Increment on breaking changes.
//
// v1: framing was [u32 len][JSON]; PTY input/output bytes were base64'd
//     inside the JSON `data` field.
// v2: framing is  [u32 totalLen][u32 jsonLen][JSON][optional payload bytes];
//     OutputMessage and InputMessage drop their `data` field and carry
//     bytes via the payload tail. (See framing.ts.)
// v3: adds non-destructive snapshot/snapshot-reply messages. Snapshot bytes
//     use the binary payload tail and report whether older ring bytes evicted.
//
// We don't keep v1 around. v2 and v3 share framing and all pre-snapshot
// messages, so keeping v2 negotiable lets a new host-service reach an existing
// daemon and perform the fd-handoff upgrade without dropping live sessions.
export const CURRENT_PROTOCOL_VERSION = 3 as const;
export const SNAPSHOT_PROTOCOL_VERSION = 3 as const;
export const SUPPORTED_PROTOCOL_VERSIONS: readonly number[] = [
	2,
	CURRENT_PROTOCOL_VERSION,
];
