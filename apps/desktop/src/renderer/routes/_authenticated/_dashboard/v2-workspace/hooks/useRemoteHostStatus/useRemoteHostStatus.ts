import type { SelectV2Workspace } from "@superset/db/schema";
import { buildHostRoutingKey } from "@superset/shared/host-routing";
import { MIN_HOST_SERVICE_VERSION } from "@superset/shared/host-version";
import { and, eq } from "@tanstack/db";
import { useLiveQuery } from "@tanstack/react-db";
import { useQuery } from "@tanstack/react-query";
import { useRelayUrl } from "renderer/hooks/useRelayUrl";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import semver from "semver";

export type RemoteHostStatus =
	| { status: "skip" }
	| { status: "loading" }
	| { status: "offline"; hostId: string; hostName: string }
	| {
			status: "incompatible";
			hostName: string;
			hostVersion: string;
			minVersion: string;
	  }
	| { status: "ready" };

const HOST_INFO_STALE_MS = 30_000;
const HOST_INFO_TIMEOUT_MS = 5_000;

async function withTimeout<T>(
	promise: Promise<T>,
	timeoutMs: number,
	message: string,
): Promise<T> {
	let timeoutId: ReturnType<typeof setTimeout> | null = null;
	const timeoutPromise = new Promise<never>((_, reject) => {
		timeoutId = setTimeout(() => reject(new Error(message)), timeoutMs);
	});

	try {
		return await Promise.race([promise, timeoutPromise]);
	} finally {
		if (timeoutId) clearTimeout(timeoutId);
	}
}

export interface RemoteHostStatusInput {
	workspaceExists: boolean;
	isLocal: boolean;
	hostId: string;
	hostName: string | null;
	infoState: "idle" | "pending" | "success" | "error";
	hostVersion: string | null;
	minVersion: string;
}

export function deriveRemoteHostStatus({
	workspaceExists,
	isLocal,
	hostId,
	hostName,
	infoState,
	hostVersion,
	minVersion,
}: RemoteHostStatusInput): RemoteHostStatus {
	if (!workspaceExists) return { status: "loading" };
	if (isLocal) return { status: "skip" };

	const resolvedHostName = hostName ?? "Unknown host";

	if (infoState === "pending" || infoState === "idle") {
		return { status: "loading" };
	}

	if (infoState === "error") {
		return {
			status: "offline",
			hostId,
			hostName: resolvedHostName,
		};
	}

	if (hostVersion && !semver.satisfies(hostVersion, `>=${minVersion}`)) {
		return {
			status: "incompatible",
			hostName: resolvedHostName,
			hostVersion,
			minVersion,
		};
	}

	return { status: "ready" };
}

export function useRemoteHostStatus(
	workspace: SelectV2Workspace | null,
): RemoteHostStatus {
	const collections = useCollections();
	const { machineId } = useLocalHostService();
	const relayUrl = useRelayUrl();
	const organizationId = workspace?.organizationId ?? "";
	const hostId = workspace?.hostId ?? "";
	const isLocal =
		workspace != null && machineId != null && workspace.hostId === machineId;
	const filterMachineId = !workspace || isLocal ? "" : hostId;

	const { data: hostRows = [] } = useLiveQuery(
		(q) =>
			q
				.from({ hosts: collections.v2Hosts })
				.where(({ hosts }) =>
					and(
						eq(hosts.organizationId, organizationId),
						eq(hosts.machineId, filterMachineId),
					),
				)
				.select(({ hosts }) => ({
					name: hosts.name,
					isOnline: hosts.isOnline,
				})),
		[collections, organizationId, filterMachineId],
	);
	const hostRow = hostRows[0] ?? null;

	const hostUrl = `${relayUrl}/hosts/${buildHostRoutingKey(
		organizationId,
		hostId,
	)}`;

	const infoQuery = useQuery({
		queryKey: ["remoteHostInfo", organizationId, hostId, hostUrl],
		queryFn: () =>
			withTimeout(
				getHostServiceClientByUrl(hostUrl).host.info.query(),
				HOST_INFO_TIMEOUT_MS,
				`Timed out checking host ${hostId}`,
			),
		enabled: workspace != null && !isLocal,
		staleTime: HOST_INFO_STALE_MS,
		retry: false,
	});

	return deriveRemoteHostStatus({
		workspaceExists: workspace != null,
		isLocal,
		hostId,
		hostName: hostRow?.name ?? null,
		infoState: infoQuery.isPending
			? "pending"
			: infoQuery.isError
				? "error"
				: infoQuery.isSuccess
					? "success"
					: "idle",
		hostVersion: infoQuery.data?.version ?? null,
		minVersion: MIN_HOST_SERVICE_VERSION,
	});
}
