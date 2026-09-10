import { msg } from "@lingui/core/macro";
import { i18n } from "@superset/i18n";
import { buildHostRoutingKey } from "@superset/shared/host-routing";
import {
	deriveHostVersionState,
	type HostInstallSource,
	MIN_HOST_SERVICE_VERSION,
} from "@superset/shared/host-version";
import { useMemo } from "react";
import { useHostServiceInfo } from "renderer/hooks/host-service/useHostServiceInfo";
import type { HostShapedWorkspace } from "renderer/hooks/host-workspaces/useHostWorkspaces";
import { useRelayUrl } from "renderer/hooks/useRelayUrl";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";

export type RemoteHostStatus =
	| { status: "skip" }
	| { status: "loading" }
	| {
			status: "incompatible";
			hostId: string;
			hostUrl: string;
			hostName: string;
			hostVersion: string;
			minVersion: string;
			installSource: HostInstallSource;
	  }
	| { status: "ready" };

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
		staleTime: 30_000,
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

	const infoQuery = useHostServiceInfo(hostUrl, workspace != null && !isLocal);

	if (!workspace) return { status: "loading" };
	if (isLocal) return { status: "skip" };

	if (infoQuery.isSuccess) {
		const hostVersion = infoQuery.data.version;
		// Only the wire floor blocks a workspace; "behind" is surfaced in
		// settings and the picker but never gates rendering.
		if (deriveHostVersionState(hostVersion, null) === "incompatible") {
			return {
				status: "incompatible",
				hostId,
				hostUrl,
				hostName:
					hostRow?.name ??
					i18n._(
						msg({
							message: "Unknown host",
						}),
					),
				hostVersion,
				minVersion: MIN_HOST_SERVICE_VERSION,
				installSource: infoQuery.data.installSource,
			};
		}
	}

	return { status: "ready" };
}
