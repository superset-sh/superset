/**
 * Dev-only component that exposes window.__seedPendingWorkspace()
 * for UI development. Drop it inside CollectionsProvider to get access
 * to collections.
 *
 * Usage in DevTools console:
 *   __seedPendingWorkspace("YOUR_PROJECT_ID")
 *   __seedPendingWorkspace("YOUR_PROJECT_ID", "failed")
 *   __seedPendingWorkspace("YOUR_PROJECT_ID", "succeeded")
 *   __clearPendingWorkspaces()
 */
import { useEffect } from "react";
import { createMockPendingWorkspace } from "renderer/lib/dev-seed-pending-workspace";
import { useCollections } from "../providers/CollectionsProvider";

declare global {
	interface Window {
		__seedPendingWorkspace: (
			projectId: string,
			status?: "creating" | "failed" | "succeeded",
		) => void;
		__clearPendingWorkspaces: () => void;
	}
}

export function DevSeedPendingWorkspace() {
	const collections = useCollections();

	useEffect(() => {
		window.__seedPendingWorkspace = (
			projectId: string,
			status?: "creating" | "failed" | "succeeded",
		) => {
			const mock = createMockPendingWorkspace({
				projectId,
				status,
				error:
					status === "failed"
						? "Cloud API returned no row (mock error)"
						: undefined,
			});
			collections.pendingWorkspaces.insert(mock);
			console.log("[DevSeed] Inserted pending workspace:", mock.id, {
				name: mock.name,
				status: mock.status,
			});
		};

		window.__clearPendingWorkspaces = () => {
			for (const row of collections.pendingWorkspaces.state.values()) {
				collections.pendingWorkspaces.delete(row.id);
			}
			console.log("[DevSeed] Cleared all pending workspaces");
		};

		return () => {
			// biome-ignore lint/performance/noDelete: cleanup
			delete (window as Partial<Window>).__seedPendingWorkspace;
			// biome-ignore lint/performance/noDelete: cleanup
			delete (window as Partial<Window>).__clearPendingWorkspaces;
		};
	}, [collections]);

	return null;
}
