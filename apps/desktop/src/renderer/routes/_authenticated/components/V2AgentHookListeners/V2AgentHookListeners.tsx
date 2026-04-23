import { useLiveQuery } from "@tanstack/react-db";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { WorkspaceListener } from "./components/WorkspaceListener";

/**
 * Mounts one agent-lifecycle listener per v2 workspace so backgrounded
 * workspaces also update their sidebar status indicator and play the
 * finish sound. Sibling to `AgentHooks`; rendered at the authenticated
 * layout level.
 *
 * The listener hook calls `useWorkspaceEvent`, which resolves the
 * workspace's host URL and subscribes — multiple listeners against the
 * same host reuse one WebSocket connection, so this is O(1 socket per
 * host), not O(n sockets per workspace).
 */
export function V2AgentHookListeners() {
	const collections = useCollections();
	const { data: workspaces = [] } = useLiveQuery(
		(q) =>
			q
				.from({ v2Workspaces: collections.v2Workspaces })
				.select(({ v2Workspaces }) => ({ id: v2Workspaces.id })),
		[collections],
	);

	return (
		<>
			{workspaces.map((w) => (
				<WorkspaceListener key={w.id} workspaceId={w.id} />
			))}
		</>
	);
}
