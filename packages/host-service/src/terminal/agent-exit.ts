// Signals from a user/host-initiated stop (SIGHUP, SIGINT, SIGKILL, SIGTERM) —
// including our own dispose. Anything else (SIGSEGV, SIGABRT, SIGBUS…) is a
// crash.
const USER_INTERRUPT_SIGNALS = [1, 2, 9, 15];
// The shell-encoded `128 + signal` exit codes for those same signals, for when
// a wrapper handles the signal and re-exits with the conventional code instead
// of dying from it directly. Kept symmetric with USER_INTERRUPT_SIGNALS so both
// encodings classify the same way.
const USER_INTERRUPT_EXIT_CODES = new Set(
	USER_INTERRUPT_SIGNALS.map((signal) => 128 + signal),
);
const USER_INTERRUPT_SIGNAL_SET = new Set(USER_INTERRUPT_SIGNALS);

/**
 * Whether a pty exit looks like the agent process died abnormally (crash /
 * fatal error) rather than a clean finish or a user interrupt. Our own dispose
 * unsubscribes the daemon callbacks first, so `onExit` only fires on a genuine
 * process exit — a non-zero code or a crash signal here means the CLI itself
 * terminated unexpectedly.
 */
export function isAbnormalAgentExit(code: number, signal: number): boolean {
	if (signal > 0) return !USER_INTERRUPT_SIGNAL_SET.has(signal);
	return code !== 0 && !USER_INTERRUPT_EXIT_CODES.has(code);
}
