import { useEffect, useMemo, useRef } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useDashboardSidebarAllPorts } from "../../providers/DashboardSidebarPortsProvider";
import { portForwardClientId } from "../../utils/portForwardClientId";
import { deriveForwardSyncInput } from "./deriveForwardSyncInput";

// A dev server restart emits remove+add within milliseconds; collapse the
// burst into one sync so the local listener is not torn down and rebuilt.
const SYNC_DEBOUNCE_MS = 200;

/**
 * Keeps the main process's port forwards equal to the remote ports of the
 * selected workspace. Selecting a local workspace, or none, stops every
 * forward.
 */
export function useRemotePortForwarding(activeWorkspaceId: string | null) {
	const { workspacePortGroups } = useDashboardSidebarAllPorts();
	const sync = electronTrpc.portForwards.sync.useMutation();
	const input = useMemo(
		() =>
			deriveForwardSyncInput({
				activeWorkspaceId,
				groups: workspacePortGroups,
			}),
		[activeWorkspaceId, workspacePortGroups],
	);
	const key = JSON.stringify(input);
	const mutate = sync.mutate;
	// The mutation handle is not referentially stable across renders; without
	// this guard a re-render with an unchanged key would issue a second,
	// identical sync.
	const lastSyncedKey = useRef<string | null>(null);
	useEffect(() => {
		if (lastSyncedKey.current === key) return;
		const timer = setTimeout(() => {
			lastSyncedKey.current = key;
			mutate({ clientId: portForwardClientId, ...JSON.parse(key) });
		}, SYNC_DEBOUNCE_MS);
		return () => clearTimeout(timer);
	}, [key, mutate]);
}
