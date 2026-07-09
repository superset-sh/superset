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
 * Turn the `_whoowns` preflight result (see `primeRelayAffinity`) into a cause
 * for a failed terminal WS. The key case is `stream-blocked`: the host tunnel
 * is present (probe 200) yet the WS still drops — the fingerprint of a relay
 * routing problem (e.g. the cross-region 6PN path), not an offline host.
 */
export function classifyTerminalFailure(
	probe: RelayAffinityProbe | null,
	isHostUrl: boolean,
): TerminalFailureClassification {
	// Local / same-machine terminals never hit the relay; don't guess a cause.
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
