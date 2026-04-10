/**
 * Dev-only component that exposes window helpers for UI development.
 * Drop inside CollectionsProvider.
 *
 * Usage in DevTools console:
 *   __seedPendingWorkspace("1c99c8eb-1b31-4f04-9ac4-61a2760c74b6")
 *   __seedPendingWorkspace("1c99c8eb-1b31-4f04-9ac4-61a2760c74b6", "failed")
 *   __seedPendingWorkspace("1c99c8eb-1b31-4f04-9ac4-61a2760c74b6", "succeeded")
 *   __seedAllPendingStates("1c99c8eb-1b31-4f04-9ac4-61a2760c74b6")
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
		__seedAllPendingStates: (projectId: string) => void;
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
			const mock = createMockPendingWorkspace({ projectId, status });
			collections.pendingWorkspaces.insert(mock);
			console.log("[DevSeed] Inserted:", mock.name, `(${mock.status})`);
		};

		window.__seedAllPendingStates = (projectId: string) => {
			for (const status of ["creating", "failed", "succeeded"] as const) {
				const mock = createMockPendingWorkspace({ projectId, status });
				collections.pendingWorkspaces.insert(mock);
				console.log("[DevSeed] Inserted:", mock.name, `(${mock.status})`);
			}
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
			delete (window as Partial<Window>).__seedAllPendingStates;
			// biome-ignore lint/performance/noDelete: cleanup
			delete (window as Partial<Window>).__clearPendingWorkspaces;
		};
	}, [collections]);

	return null;
}
