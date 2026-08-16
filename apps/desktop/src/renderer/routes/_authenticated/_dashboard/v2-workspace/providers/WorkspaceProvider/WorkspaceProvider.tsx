import { buildHostRoutingKey } from "@superset/shared/host-routing";
import {
	createContext,
	type ReactNode,
	useContext,
	useEffect,
	useRef,
} from "react";
import type { HostShapedWorkspace } from "renderer/hooks/host-workspaces/useHostWorkspaces";
import { useRelayUrl } from "renderer/hooks/useRelayUrl";
import {
	getHostServiceHeaders,
	getHostServiceWsToken,
} from "renderer/lib/host-service-auth";
import { useHostWorkspaces } from "renderer/routes/_authenticated/providers/HostWorkspacesProvider";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import { WorkspaceTrpcProvider } from "../WorkspaceTrpcProvider";
import { WorkspaceHostGate } from "./components/WorkspaceHostGate";
import { WorkspaceLocalHostPendingState } from "./components/WorkspaceLocalHostPendingState";

interface WorkspaceContextValue {
	workspace: HostShapedWorkspace;
	hostUrl: string;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function WorkspaceProvider({
	workspace,
	children,
}: {
	workspace: HostShapedWorkspace;
	children: ReactNode;
}) {
	const { machineId, activeHostUrl } = useLocalHostService();
	const relayUrl = useRelayUrl();

	// A host-service restart takes the coordinator's port away for ~5s and
	// usually brings it back on the same one. Dropping to null there would
	// unmount the whole workspace — panes, scrollback, unsaved files — and
	// leave a blank frame until it returned. Keep serving the last URL we had
	// and let WorkspaceHostGate handle the dead socket in place.
	const lastLocalHostUrlRef = useRef<string | null>(null);
	useEffect(() => {
		if (activeHostUrl) lastLocalHostUrlRef.current = activeHostUrl;
	}, [activeHostUrl]);
	const localHostUrl = activeHostUrl ?? lastLocalHostUrlRef.current;

	// The fan-out already knows how to address every host it serves — including
	// a sandbox, whose URL is brokered and derives from neither the local port
	// nor a relay routing key. Recomputing it here is how a cloud workspace
	// ended up pointed at the relay.
	const { cache } = useHostWorkspaces();
	const hostUrl =
		cache.resolveHostUrl(workspace.hostId) ??
		(workspace.hostId === machineId
			? localHostUrl
			: `${relayUrl}/hosts/${buildHostRoutingKey(
					workspace.organizationId,
					workspace.hostId,
				)}`);

	// Only before the local host service has ever reported a port — there is
	// nothing to point a client at, so this can't go through WorkspaceHostGate.
	if (!hostUrl) {
		return <WorkspaceLocalHostPendingState hostId={workspace.hostId} />;
	}

	return (
		<WorkspaceContext.Provider value={{ workspace, hostUrl }}>
			{/* Keyed on the workspace alone: the host service can come back on a
			    different port, and keying on the URL too would remount every pane
			    for what is only a transport swap. WorkspaceClientProvider already
			    rebuilds its clients when hostUrl changes. */}
			<WorkspaceTrpcProvider
				cacheKey={workspace.id}
				key={workspace.id}
				hostUrl={hostUrl}
				headers={() => getHostServiceHeaders(hostUrl)}
				wsToken={() => getHostServiceWsToken(hostUrl)}
			>
				<WorkspaceHostGate workspace={workspace}>{children}</WorkspaceHostGate>
			</WorkspaceTrpcProvider>
		</WorkspaceContext.Provider>
	);
}

export function useWorkspace(): WorkspaceContextValue {
	const ctx = useContext(WorkspaceContext);
	if (!ctx) {
		throw new Error("useWorkspace must be used within WorkspaceProvider");
	}
	return ctx;
}
