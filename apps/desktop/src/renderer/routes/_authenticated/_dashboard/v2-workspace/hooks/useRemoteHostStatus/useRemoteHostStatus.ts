import type { SelectV2Workspace } from "@superset/db/schema";
import { buildHostRoutingKey } from "@superset/shared/host-routing";
import { MIN_HOST_SERVICE_VERSION } from "@superset/shared/host-version";
import { and, eq } from "@tanstack/db";
import { useLiveQuery } from "@tanstack/react-db";
import { useQuery } from "@tanstack/react-query";
import { env } from "renderer/env.renderer";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import {
	type RemoteHostInfoQueryState,
	type RemoteHostStatus,
	resolveRemoteHostStatus,
} from "./resolveRemoteHostStatus";

export type { RemoteHostStatus } from "./resolveRemoteHostStatus";

const HOST_INFO_STALE_MS = 30_000;

export function useRemoteHostStatus(
	workspace: SelectV2Workspace | null,
): RemoteHostStatus {
	const collections = useCollections();
	const { machineId } = useLocalHostService();
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
					isOnline: hosts.isOnline,
				})),
		[collections, organizationId, filterMachineId],
	);
	const hostRow = hostRows[0] ?? null;

	const hostUrl = `${env.RELAY_URL}/hosts/${buildHostRoutingKey(
		organizationId,
		hostId,
	)}`;

	const infoQueryEnabled =
		workspace != null && !isLocal && hostRow?.isOnline === true;

	const infoQuery = useQuery({
		queryKey: ["remoteHostInfo", organizationId, hostId],
		queryFn: () => getHostServiceClientByUrl(hostUrl).host.info.query(),
		enabled: infoQueryEnabled,
		staleTime: HOST_INFO_STALE_MS,
		retry: false,
	});

	const infoQueryState: RemoteHostInfoQueryState = !infoQueryEnabled
		? { state: "disabled" }
		: infoQuery.isError
			? { state: "error" }
			: infoQuery.isPending
				? { state: "pending" }
				: { state: "success", version: infoQuery.data.version };

	return resolveRemoteHostStatus({
		workspace: workspace ? { hostId: workspace.hostId } : null,
		machineId,
		hostsReady: isReady,
		hostRow,
		infoQuery: infoQueryState,
		minVersion: MIN_HOST_SERVICE_VERSION,
	});
}
