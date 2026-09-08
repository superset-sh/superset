import { useLingui } from "@lingui/react/macro";
import { i18n } from "@superset/i18n";
import { useWorkspaceHostUrl } from "@superset/workspace-client";
import type { ReactNode } from "react";
import type { HostShapedWorkspace } from "renderer/hooks/host-workspaces/useHostWorkspaces";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import { useHostReachability } from "../../../../hooks/useHostReachability";
import { LOCAL_HOST_SERVICE_DETAIL } from "../../utils/localHostServiceDetail";
import { HostConnectionStrip } from "./components/HostConnectionStrip";

const HOST_LIST_STALE_MS = 30_000;

/** Keeps loaded panes accessible while reporting the shared host connection. */
export function WorkspaceHostGate({
	workspace,
	children,
}: {
	workspace: HostShapedWorkspace;
	children: ReactNode;
}) {
	const { t } = useLingui();
	const hostUrl = useWorkspaceHostUrl();
	const { machineId, hostServiceStatus } = useLocalHostService();

	const isLocalRestartInFlight =
		workspace.hostId === machineId && hostServiceStatus === "starting";
	const {
		isDegraded,
		isAccessDenied,
		isReconnecting,
		hasConnected,
		detail,
		retry,
	} = useHostReachability(hostUrl);
	const { data: hostRows = [] } = cloudTrpc.v2Host.list.useQuery(undefined, {
		staleTime: HOST_LIST_STALE_MS,
	});

	const hostRow =
		hostRows.find(
			(host) =>
				host.organizationId === workspace.organizationId &&
				host.machineId === workspace.hostId,
		) ?? null;
	const hostName =
		hostRow?.name ??
		(workspace.hostId === machineId
			? t({ message: "This device" })
			: t({
					message: "Unknown host",
				}));

	// The wrapper renders unconditionally — dropping it when the host is
	// reachable would move `children` in the tree and remount the whole
	// workspace on every reconnect.
	return (
		<div className="relative flex min-h-0 min-w-0 flex-1">
			<div className="flex min-h-0 min-w-0 flex-1">{children}</div>
			{isDegraded || isAccessDenied ? (
				<HostConnectionStrip
					hostId={workspace.hostId}
					hostName={hostName}
					isAccessDenied={isAccessDenied}
					detail={
						isLocalRestartInFlight
							? i18n._(LOCAL_HOST_SERVICE_DETAIL.starting)
							: detail
					}
					isReconnecting={isReconnecting}
					hasConnected={hasConnected}
					isLocalRestartInFlight={isLocalRestartInFlight}
					onRetry={retry}
				/>
			) : null}
		</div>
	);
}
