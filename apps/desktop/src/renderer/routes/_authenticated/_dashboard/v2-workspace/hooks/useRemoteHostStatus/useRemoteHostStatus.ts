import type { SelectV2Workspace } from "@superset/db/schema";
import { buildHostRoutingKey } from "@superset/shared/host-routing";
import {
	isHostVersionAtLeast,
	MIN_HOST_SERVICE_VERSION,
} from "@superset/shared/host-version";
import { and, eq } from "@tanstack/db";
import { useLiveQuery } from "@tanstack/react-db";
import { useHostInfo } from "renderer/hooks/host-service/useHostInfo";
import { useRelayUrl } from "renderer/hooks/useRelayUrl";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";

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
				})),
		[collections, organizationId, filterMachineId],
	);
	const hostRow = hostRows[0] ?? null;

	const hostUrl = `${relayUrl}/hosts/${buildHostRoutingKey(
		organizationId,
		hostId,
	)}`;

	const infoQuery = useHostInfo(
		{ hostUrl, organizationId, machineId: hostId },
		{ enabled: workspace != null && !isLocal },
	);

	if (!workspace) return { status: "loading" };
	if (isLocal) return { status: "skip" };

	if (infoQuery.isSuccess) {
		const hostVersion = infoQuery.data.version;
		if (!isHostVersionAtLeast(hostVersion, MIN_HOST_SERVICE_VERSION)) {
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
