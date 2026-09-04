import { msg } from "@lingui/core/macro";
import { i18n } from "@superset/i18n";
import { buildHostRoutingKey } from "@superset/shared/host-routing";
import { MIN_HOST_SERVICE_VERSION } from "@superset/shared/host-version";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import type { HostShapedWorkspace } from "renderer/hooks/host-workspaces/useHostWorkspaces";
import { useRelayUrl } from "renderer/hooks/useRelayUrl";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
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
	workspace: HostShapedWorkspace | null,
): RemoteHostStatus {
	const { machineId } = useLocalHostService();
	const relayUrl = useRelayUrl();
	const organizationId = workspace?.organizationId ?? "";
	const hostId = workspace?.hostId ?? "";
	const isLocal =
		workspace != null && machineId != null && workspace.hostId === machineId;
	const filterMachineId = !workspace || isLocal ? "" : hostId;

	const { data: hostRows = [] } = cloudTrpc.v2Host.list.useQuery(undefined, {
		staleTime: HOST_INFO_STALE_MS,
	});
	const hostRow = useMemo(
		() =>
			hostRows.find(
				(host) =>
					host.organizationId === organizationId &&
					host.machineId === filterMachineId,
			) ?? null,
		[hostRows, organizationId, filterMachineId],
	);

	const hostUrl = `${relayUrl}/hosts/${buildHostRoutingKey(
		organizationId,
		hostId,
	)}`;

	const infoQuery = useQuery({
		queryKey: ["remoteHostInfo", organizationId, hostId],
		queryFn: () => getHostServiceClientByUrl(hostUrl).host.info.query(),
		enabled: workspace != null && !isLocal,
		staleTime: HOST_INFO_STALE_MS,
	});

	if (!workspace) return { status: "loading" };
	if (isLocal) return { status: "skip" };

	if (infoQuery.isSuccess) {
		const hostVersion = infoQuery.data.version;
		if (!semver.satisfies(hostVersion, `>=${MIN_HOST_SERVICE_VERSION}`)) {
			return {
				status: "incompatible",
				hostName:
					hostRow?.name ??
					i18n._(
						msg({
							message: "Unknown host",
						}),
					),
				hostVersion,
				minVersion: MIN_HOST_SERVICE_VERSION,
			};
		}
	}

	return { status: "ready" };
}
