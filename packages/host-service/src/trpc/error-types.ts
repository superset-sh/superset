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

/**
 * Thrown by host-service procedures that require the project to already
 * be set up on this host. The renderer catches this via TRPCClientError
 * and opens the Pin & set up modal with the projectId pre-filled, then
 * retries the original mutation.
 */
export interface ProjectNotSetupCause {
	kind: "PROJECT_NOT_SETUP";
	projectId: string;
}

export function isProjectNotSetupCause(
	value: unknown,
): value is ProjectNotSetupCause {
	return (
		!!value &&
		typeof value === "object" &&
		"kind" in value &&
		(value as { kind: unknown }).kind === "PROJECT_NOT_SETUP"
	);
}
