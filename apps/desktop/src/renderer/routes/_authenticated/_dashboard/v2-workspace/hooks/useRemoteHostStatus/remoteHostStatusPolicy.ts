import { MIN_HOST_SERVICE_VERSION } from "@superset/shared/host-version";
import semver from "semver";

export type RemoteHostStatus =
	| { status: "skip" }
	| { status: "loading" }
	| {
			status: "unavailable";
			hostName: string;
			reason: "offline" | "unreachable";
	  }
	| {
			status: "incompatible";
			hostName: string;
			hostVersion: string;
			minVersion: string;
	  }
	| { status: "ready" };

export type RemoteHostInfoStatus = "pending" | "error" | "success";

interface RemoteHostStatusPolicyInput {
	workspacePresent: boolean;
	localMachineReady: boolean;
	isLocal: boolean;
	liveQueryReady: boolean;
	hostName?: string | null;
	hostIsOnline?: boolean | null;
	hostInfoStatus: RemoteHostInfoStatus;
	hostVersion?: string | null;
}

const UNKNOWN_HOST = "Unknown host";

export function getRemoteHostStatus({
	workspacePresent,
	localMachineReady,
	isLocal,
	liveQueryReady,
	hostName,
	hostIsOnline,
	hostInfoStatus,
	hostVersion,
}: RemoteHostStatusPolicyInput): RemoteHostStatus {
	if (!workspacePresent || !localMachineReady) return { status: "loading" };
	if (isLocal) return { status: "skip" };
	if (!liveQueryReady) return { status: "loading" };

	const resolvedHostName = hostName ?? UNKNOWN_HOST;

	if (hostIsOnline === false) {
		return {
			status: "unavailable",
			hostName: resolvedHostName,
			reason: "offline",
		};
	}

	if (hostInfoStatus === "pending") return { status: "loading" };
	if (hostInfoStatus === "error" || !hostVersion) {
		return {
			status: "unavailable",
			hostName: resolvedHostName,
			reason: "unreachable",
		};
	}

	if (!semver.satisfies(hostVersion, `>=${MIN_HOST_SERVICE_VERSION}`)) {
		return {
			status: "incompatible",
			hostName: resolvedHostName,
			hostVersion,
			minVersion: MIN_HOST_SERVICE_VERSION,
		};
	}

	return { status: "ready" };
}
