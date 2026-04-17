/**
 * Commands routed through fresh-exec when typed in a stale terminal.
 *
 * These are Go-based CLIs whose macOS TLS path goes through trustd/Security.framework
 * and therefore fails with OSStatus -26276 when inherited from a stale
 * Mach bootstrap context. Wrapping them in fresh-exec reruns them in the
 * Electron main process's fresh context.
 *
 * Keep sorted. Do NOT add interactive TUIs (vim, less, top) — those run
 * fine in stale context and wrapping them adds a pointless UDS hop.
 */
export const FRESH_EXEC_WHITELIST = [
	"gh",
	"kubectl",
	"terraform",
	"terragrunt",
	"tofu",
] as const;

export type FreshExecWhitelistCommand = (typeof FRESH_EXEC_WHITELIST)[number];
