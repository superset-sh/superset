/**
 * Cross-cutting error shapes surfaced via the tRPC error formatter.
 * Lives here (not in a router) to avoid circular imports with `trpc/index.ts`.
 */

export interface TeardownFailureCause {
	kind: "TEARDOWN_FAILED";
	exitCode: number | null;
	/** Signal number (Unix). null when the process exited normally. */
	signal: number | null;
	timedOut: boolean;
	outputTail: string;
}

export function isTeardownFailureCause(
	value: unknown,
): value is TeardownFailureCause {
	return (
		!!value &&
		typeof value === "object" &&
		"kind" in value &&
		(value as { kind: unknown }).kind === "TEARDOWN_FAILED"
	);
}
