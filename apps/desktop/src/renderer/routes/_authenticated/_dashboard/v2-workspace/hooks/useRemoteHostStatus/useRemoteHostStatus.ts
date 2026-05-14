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
	| {
			status: "incompatible";
			hostName: string;
			hostVersion: string;
			minVersion: string;
	  }
	| { status: "ready" };

const HOST_INFO_STALE_MS = 30_000;

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

	const { data: hostRows = [], isReady } = useLiveQuery(
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
				})),
		[collections, organizationId, filterMachineId],
	);
	const hostRow = hostRows[0] ?? null;

	const hostUrl = `${relayUrl}/hosts/${buildHostRoutingKey(
		organizationId,
		hostId,
	)}`;

	const infoQuery = useQuery({
		queryKey: ["remoteHostInfo", organizationId, hostId],
		queryFn: () => getHostServiceClientByUrl(hostUrl).host.info.query(),
		enabled: workspace != null && !isLocal,
		staleTime: HOST_INFO_STALE_MS,
		retry: false,
	});

	if (!workspace) return { status: "loading" };
	if (isLocal) return { status: "skip" };
	if (!isReady) return { status: "loading" };

	if (infoQuery.isSuccess) {
		const hostVersion = infoQuery.data.version;
		if (!semver.satisfies(hostVersion, `>=${MIN_HOST_SERVICE_VERSION}`)) {
			return {
				status: "incompatible",
				hostName: hostRow?.name ?? "Unknown host",
				hostVersion,
				minVersion: MIN_HOST_SERVICE_VERSION,
			};
		}
	}

	return { status: "ready" };
}
