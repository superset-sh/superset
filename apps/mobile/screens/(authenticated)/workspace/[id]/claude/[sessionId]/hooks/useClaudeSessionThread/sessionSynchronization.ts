import type {
	SessionScopedState,
	SessionsApi,
} from "@superset/session-protocol";
import type { StreamStatus } from "@superset/session-protocol/client";

const BASE_RETRY_DELAY_MS = 250;
const MAX_RETRY_DELAY_MS = 10_000;

/** Exponential retry delay for failed state/history/catalog synchronization. */
export function sessionSynchronizationRetryDelayMs(
	consecutiveFailureCount: number,
): number {
	if (
		!Number.isSafeInteger(consecutiveFailureCount) ||
		consecutiveFailureCount < 1
	) {
		throw new Error("consecutiveFailureCount must be a positive integer");
	}
	return Math.min(
		BASE_RETRY_DELAY_MS * 2 ** Math.min(consecutiveFailureCount - 1, 20),
		MAX_RETRY_DELAY_MS,
	);
}

/**
 * `create` installs the host tombstone before Claude initialization. A lost or
 * failed create response must therefore recover the authoritative state with
 * `get`, otherwise the UI cannot expose an initialization failure for retry.
 */
export async function createOrRecoverSessionState(
	api: Pick<SessionsApi, "create" | "get">,
	input: Parameters<SessionsApi["create"]>[0],
): Promise<SessionScopedState> {
	try {
		return await api.create(input);
	} catch (createError) {
		try {
			const recovered = await api.get({ sessionId: input.sessionId });
			if (
				recovered.sessionId !== input.sessionId ||
				recovered.workspaceId !== input.workspaceId
			) {
				throw new Error(
					"Recovered session identity did not match create input",
				);
			}
			return recovered;
		} catch {
			throw createError;
		}
	}
}

/** Live mutations are safe only after hydration and a healthy stream attach. */
export function isSessionSynchronizationReady(input: {
	hostOnline: boolean;
	historyHydrated: boolean;
	streamStatus: StreamStatus;
}): boolean {
	return (
		input.hostOnline && input.historyHydrated && input.streamStatus === "open"
	);
}
