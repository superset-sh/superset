// Exit codes for user-initiated interrupts (128 + SIGINT/SIGTERM) — the user
// stopped the agent, not a failure.
const USER_INTERRUPT_EXIT_CODES = new Set([130, 143]);
// Signals from a user/host-initiated stop (SIGHUP, SIGINT, SIGKILL, SIGTERM) —
// including our own dispose. Anything else (SIGSEGV, SIGABRT, SIGBUS…) is a
// crash.
const USER_INTERRUPT_SIGNALS = new Set([1, 2, 9, 15]);

/**
 * Whether a pty exit looks like the agent process died abnormally (crash /
 * fatal error) rather than a clean finish or a user interrupt. Our own dispose
 * unsubscribes the daemon callbacks first, so `onExit` only fires on a genuine
 * process exit — a non-zero code or a crash signal here means the CLI itself
 * terminated unexpectedly.
 */
export function isAbnormalAgentExit(code: number, signal: number): boolean {
	if (signal > 0) return !USER_INTERRUPT_SIGNALS.has(signal);
	return code !== 0 && !USER_INTERRUPT_EXIT_CODES.has(code);
}
