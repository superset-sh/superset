import { useWorkspaceHostUrl } from "@superset/workspace-client";
import type { ReactNode } from "react";
import type { HostShapedWorkspace } from "renderer/hooks/host-workspaces/useHostWorkspaces";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import { StateScreenShell } from "../../../../components/StateScreenShell";
import { WorkspaceHostUnreachableState } from "../../../../components/WorkspaceHostUnreachableState";
import { useHostReachability } from "../../../../hooks/useHostReachability";

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
	const hostUrl = useWorkspaceHostUrl();
	const { isUnreachable, isReconnecting, detail, retry } =
		useHostReachability(hostUrl);
	const { machineId } = useLocalHostService();
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
		(workspace.hostId === machineId ? "This device" : "Unknown host");

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
							detail={detail}
							isReconnecting={isReconnecting}
							onRetry={retry}
						/>
					</StateScreenShell>
				</div>
			) : null}
		</div>
	);
}
