import { useLingui } from "@lingui/react/macro";
import { i18n } from "@superset/i18n";
import { useWorkspaceHostUrl } from "@superset/workspace-client";
import type { ReactNode } from "react";
import type { HostShapedWorkspace } from "renderer/hooks/host-workspaces/useHostWorkspaces";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import { StateScreenShell } from "../../../../components/StateScreenShell";
import { WorkspaceHostUnreachableState } from "../../../../components/WorkspaceHostUnreachableState";
import { useHostReachability } from "../../../../hooks/useHostReachability";
import { LOCAL_HOST_SERVICE_DETAIL } from "../../utils/localHostServiceDetail";

const HOST_LIST_STALE_MS = 30_000;

/**
 * Covers the workspace with the unreachable screen while its host is down.
 * Overlays rather than replaces: panes keep their live state (terminal
 * scrollback, unsaved editor documents, in-flight agent sessions) so a dropped
 * connection costs nothing once the host is back.
 */
export function WorkspaceHostGate({
	workspace,
	children,
}: {
	workspace: HostShapedWorkspace;
	children: ReactNode;
}) {
	const { t } = useLingui();
	const hostUrl = useWorkspaceHostUrl();
	const { isUnreachable, isReconnecting, detail, retry } =
		useHostReachability(hostUrl);
	const { machineId, hostServiceStatus } = useLocalHostService();

	// A local host that dropped because the coordinator is mid-restart is not
	// "unreachable, go restart it from the tray" — that advises the user to do
	// what is already happening. Only "starting" is overridden: a service the
	// coordinator believes is running yet stays unreachable is a real wedge,
	// and for that the default advice stands.
	const isLocalRestartInFlight =
		workspace.hostId === machineId && hostServiceStatus === "starting";
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
			{/* Covered panes stay mounted, so without `inert` they keep taking Tab
			    stops and screen-reader focus behind the takeover. */}
			<div className="flex min-h-0 min-w-0 flex-1" inert={isUnreachable}>
				{children}
			</div>
			{isUnreachable ? (
				<div className="absolute inset-0 z-50 bg-background">
					<StateScreenShell>
						<WorkspaceHostUnreachableState
							hostId={workspace.hostId}
							hostName={hostName}
							detail={
								isLocalRestartInFlight
									? i18n._(LOCAL_HOST_SERVICE_DETAIL.starting)
									: detail
							}
							isReconnecting={isReconnecting || isLocalRestartInFlight}
							onRetry={retry}
						/>
					</StateScreenShell>
				</div>
			) : null}
		</div>
	);
}
