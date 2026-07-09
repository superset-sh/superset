import type { RelayAffinityProbe } from "@superset/workspace-client";

export type TerminalFailureCategory =
	| "relay-unreachable"
	| "host-offline"
	| "unauthorized"
	| "stream-blocked"
	| "unknown";

export interface TerminalFailureClassification {
	category: TerminalFailureCategory;
	/** Short, user-facing reason for the terminal not connecting. */
	message: string;
}

/**
 * Cause of a failed terminal WS from the `_whoowns` probe. `stream-blocked`
 * (host present but WS drops) is the relay-routing fingerprint, e.g. cross-region.
 */
export function classifyTerminalFailure(
	probe: RelayAffinityProbe | null,
	isHostUrl: boolean,
): TerminalFailureClassification {
	// Local terminals never hit the relay; don't guess a cause.
	if (!isHostUrl) {
		return {
			category: "unknown",
			message: "The terminal connection was lost.",
		};
	}
	if (!probe) {
		return {
			category: "relay-unreachable",
			message:
				"Couldn't reach the relay service. Check your network connection.",
		};
	}
	if (probe.status === 503) {
		return {
			category: "host-offline",
			message: "This host is offline (not connected to the relay).",
		};
	}
	if (probe.status === 401 || probe.status === 403) {
		return {
			category: "unauthorized",
			message: "You don't have access to this host.",
		};
	}
	// Bad gateway: relay couldn't reach the host now, usually transient.
	if (probe.status === 502 || probe.status === 504) {
		return {
			category: "stream-blocked",
			message:
				"The relay couldn't reach this host right now. This is usually temporary.",
		};
	}
	if (probe.status === 200) {
		const where = probe.region ? ` (region ${probe.region})` : "";
		return {
			category: "stream-blocked",
			message: `The host is online${where} but the terminal stream couldn't connect. This is usually a relay routing issue, not the host.`,
		};
	}
	return {
		category: "unknown",
		message: `The terminal connection failed (relay status ${probe.status}).`,
	};
}
