// Protocol versioning. Increment on breaking changes; add to SUPPORTED list
// while we still need to interop with the previous major during rollouts.
export const CURRENT_PROTOCOL_VERSION = 1 as const;
export const SUPPORTED_PROTOCOL_VERSIONS: readonly number[] = [1];
