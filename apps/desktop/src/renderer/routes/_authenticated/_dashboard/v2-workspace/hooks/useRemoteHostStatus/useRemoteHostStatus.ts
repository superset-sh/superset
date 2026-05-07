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
import semver from "semver";

export type RemoteHostStatus =
	| { status: "skip" }
	| { status: "loading" }
	| { status: "offline"; hostName: string }
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

	const infoQuery = useQuery({
		queryKey: ["remoteHostInfo", organizationId, hostId],
		queryFn: () => getHostServiceClientByUrl(hostUrl).host.info.query(),
		enabled: workspace != null && !isLocal && hostRow?.isOnline === true,
		staleTime: HOST_INFO_STALE_MS,
		retry: false,
	});

	if (!workspace) return { status: "loading" };
	if (isLocal) return { status: "skip" };
	if (!isReady) return { status: "loading" };
	// No matching v2Hosts row once the collection is ready — host was
	// deregistered while the workspace record stuck around. Surface the
	// offline screen so users have a recovery path instead of a blank div.
	if (!hostRow) return { status: "offline", hostName: "Unknown host" };

	if (!hostRow.isOnline) {
		return { status: "offline", hostName: hostRow.name };
	}

	if (infoQuery.isPending) return { status: "loading" };

	if (infoQuery.isError) {
		// Cloud reports the host online but the relay round-trip failed —
		// treat as offline; the most common cause is a stale `isOnline`
		// flag after the host crashed without a clean disconnect.
		return { status: "offline", hostName: hostRow.name };
	}

	const hostVersion = infoQuery.data.version;
	if (!semver.satisfies(hostVersion, `>=${MIN_HOST_SERVICE_VERSION}`)) {
		return {
			status: "incompatible",
			hostName: hostRow.name,
			hostVersion,
			minVersion: MIN_HOST_SERVICE_VERSION,
		};
	}

	return { status: "ready" };
}
