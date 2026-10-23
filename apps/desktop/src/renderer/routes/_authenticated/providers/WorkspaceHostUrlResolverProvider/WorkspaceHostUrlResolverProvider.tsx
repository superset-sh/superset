import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useRef,
} from "react";
import { resolveWorkspaceHostTarget } from "renderer/hooks/host-service/useWorkspaceHostUrl";
import { useRelayUrl } from "renderer/hooks/useRelayUrl";
import { useHostWorkspaces } from "renderer/routes/_authenticated/providers/HostWorkspacesProvider";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import { useSandboxAccess } from "renderer/routes/_authenticated/providers/SandboxAccessProvider";

type ResolveWorkspaceHostUrl = (workspaceId: string | null) => string | null;

const WorkspaceHostUrlResolverContext =
	createContext<ResolveWorkspaceHostUrl | null>(null);

/**
 * Shares a function that answers "which host-service serves this workspace"
 * at the moment it is called. A sidebar row needs the URL only inside its
 * click handlers; subscribing it to the workspace list, sandbox targets and
 * relay through `useWorkspaceHostUrl` re-rendered every row on any change.
 * The function's identity never changes.
 */
export function WorkspaceHostUrlResolverProvider({
	children,
}: {
	children: ReactNode;
}) {
	const { workspaces, isReady } = useHostWorkspaces();
	const { targets: sandboxes, isReady: sandboxesReady } = useSandboxAccess();
	const { machineId, activeHostUrl } = useLocalHostService();
	const relayUrl = useRelayUrl();
	const latest = useRef<ResolveWorkspaceHostUrl>(() => null);
	latest.current = (workspaceId) => {
		const target = resolveWorkspaceHostTarget({
			workspaceId,
			workspaces,
			isReady,
			sandboxes,
			sandboxesReady,
			machineId,
			activeHostUrl,
			relayUrl,
		});
		return target.status === "ready" ? target.url : null;
	};
	const resolve = useCallback<ResolveWorkspaceHostUrl>(
		(workspaceId) => latest.current(workspaceId),
		[],
	);
	return (
		<WorkspaceHostUrlResolverContext.Provider value={resolve}>
			{children}
		</WorkspaceHostUrlResolverContext.Provider>
	);
}

export function useResolveWorkspaceHostUrl(): ResolveWorkspaceHostUrl {
	const value = useContext(WorkspaceHostUrlResolverContext);
	if (!value) {
		throw new Error(
			"useResolveWorkspaceHostUrl must be used within WorkspaceHostUrlResolverProvider",
		);
	}
	return value;
}
