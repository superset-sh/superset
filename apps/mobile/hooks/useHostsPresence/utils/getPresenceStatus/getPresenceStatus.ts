export type HostPresenceStatus = "pending" | "ready" | "unavailable";

/**
 * "pending" has no answer yet and "unavailable" could not get one. Neither
 * says a host is offline, so callers must not render them as if it did.
 */
export function getPresenceStatus({
	hasTargets,
	hasData,
	canFetch,
	hasFailedSinceSuccess,
}: {
	hasTargets: boolean;
	hasData: boolean;
	canFetch: boolean;
	hasFailedSinceSuccess: boolean;
}): HostPresenceStatus {
	if (!hasTargets || hasData) return "ready";
	if (!canFetch || hasFailedSinceSuccess) return "unavailable";
	return "pending";
}
