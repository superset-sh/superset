import semver from "semver";

export type RemoteHostStatus =
	| { status: "skip" }
	| { status: "loading" }
	| { status: "offline"; hostName: string }
	| { status: "unreachable"; hostName: string }
	| {
			status: "incompatible";
			hostName: string;
			hostVersion: string;
			minVersion: string;
	  }
	| { status: "ready" };

export type RemoteHostInfoQueryState =
	| { state: "disabled" }
	| { state: "pending" }
	| { state: "error" }
	| { state: "success"; version: string };

export interface ResolveRemoteHostStatusInput {
	workspace: { hostId: string } | null;
	machineId: string | null;
	hostsReady: boolean;
	hostRow: { name: string; isOnline: boolean } | null;
	infoQuery: RemoteHostInfoQueryState;
	minVersion: string;
}

export function resolveRemoteHostStatus(
	input: ResolveRemoteHostStatusInput,
): RemoteHostStatus {
	const { workspace, machineId, hostsReady, hostRow, infoQuery, minVersion } =
		input;

	if (!workspace) return { status: "loading" };
	if (machineId != null && workspace.hostId === machineId) {
		return { status: "skip" };
	}
	if (!hostsReady) return { status: "loading" };
	if (!hostRow) return { status: "offline", hostName: "Unknown host" };

	if (!hostRow.isOnline) {
		return { status: "offline", hostName: hostRow.name };
	}

	if (infoQuery.state === "pending" || infoQuery.state === "disabled") {
		return { status: "loading" };
	}

	if (infoQuery.state === "error") {
		// Cloud reports the host online but the relay round-trip failed.
		// Distinct from "offline" so the UI can explain the relay/channel
		// path is the broken link, not the host process itself.
		return { status: "unreachable", hostName: hostRow.name };
	}

	if (!semver.satisfies(infoQuery.version, `>=${minVersion}`)) {
		return {
			status: "incompatible",
			hostName: hostRow.name,
			hostVersion: infoQuery.version,
			minVersion,
		};
	}

	return { status: "ready" };
}
